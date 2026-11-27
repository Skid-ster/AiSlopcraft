/**
 * AiSlopcraft multiplayer relay + static file server.
 *
 * The legacy wire protocol is supported alongside terrain-aware rooms. Optional configuration:
 *
 *   PORT / HOST                          listen address (default 8787 / 0.0.0.0)
 *   AISLOPCRAFT_TRUST_PROXY_HOPS         verified number of proxies appending to X-Forwarded-For (1-10)
 *   AISLOPCRAFT_ALLOWED_ORIGINS          comma-separated browser Origins allowed to open a socket
 *                                        (same-origin is always allowed; empty = allow any Origin)
 *   AISLOPCRAFT_MAX_CONNECTIONS          global socket cap (default 200)
 *   AISLOPCRAFT_MAX_CONNECTIONS_PER_IP   per-client socket cap (default 0 = off; leave off unless
 *                                        trusted proxy hops are configured, or every player behind a
 *                                        shared proxy address would count as one client)
 */
import { createServer } from 'node:http';
import { OVERWORLD_TERRAIN, NETHER_TERRAIN, worldHeight } from '../src/world/world-profile.js';
import { itemStackLimit } from '../src/world/blocks.js';
import { createFurnaceState, interactWithFurnaceSlot, tickFurnace, FUEL_TIMES } from '../src/ui/furnace.js';
import { smeltResult } from '../src/ui/recipes.js';
import { cleanStack } from '../src/save.js';
import { normalizeEnchants, sameEnchants } from '../src/enchanting.js';
import { createReadStream, realpathSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { pipeline } from 'node:stream';
import { promisify } from 'node:util';
import { brotliCompress, gzip, constants as zlibConstants } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import { MAX_MESSAGE, canControl, canReachDrop, canInsertId, validEntityId, parseRelayMessage, relaySizeAllowed } from './relay-policy.js';

const scryptAsync = promisify(scrypt);
const brotliAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

/* ------------------------------------------------------------------ */
/* Constants                                                          */
/* ------------------------------------------------------------------ */

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const DEFAULT_DIST_DIR = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const SECURITY_HEADERS = Object.freeze({
  'content-security-policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self' ws: wss:; form-action 'self'",
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
  'permissions-policy': 'accelerometer=(), camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  'x-content-type-options': 'nosniff',
  'cross-origin-opener-policy': 'same-origin',
});
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.map': 'application/json; charset=utf-8', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};
const COMPRESSIBLE_EXTENSIONS = new Set(['.html', '.js', '.mjs', '.css', '.svg', '.json', '.webmanifest', '.txt', '.map', '.ttf', '.wasm']);
const MIN_COMPRESS_BYTES = 1024;
const MAX_COMPRESS_BYTES = 8 * 1024 * 1024;
const MAX_COMPRESS_CACHE_BYTES = 32 * 1024 * 1024;

const MAX_ROOMS = 5;
const MAX_PLAYERS = 5;
const MAX_EDITS = 50_000;
const MAX_CONTAINERS = 4_096;
const MAX_MOBS_SNAPSHOT = 64;
const SOFT_SOCKET_BUFFER_BYTES = 512 * 1024;
const MAX_SOCKET_BUFFER_BYTES = 4 * 1024 * 1024;
const MESSAGE_RATE_LIMIT = 600; // messages per second per socket before the socket is dropped
// Memory guard only. Set above MESSAGE_RATE_LIMIT because ws delivers every frame of a TCP chunk
// synchronously, so a legitimate client can briefly look like a burst after a network hiccup.
const MAX_QUEUED_MESSAGES = 1024;
const MIN_STATE_INTERVAL_MS = 40;
const PICKUP_RANGE = 5;
const TNT_RANGE = 7;
const ITEM_SPAWN_RANGE = 32;
const ITEM_TTL_MS = 6 * 60_000; // clients despawn items at 5 minutes
const PROJECTILE_TTL_MS = 15_000;
const UNNAMED_IDLE_MS = 10 * 60_000;
const COORD_LIMIT = 30_000_000;
const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const SHADER_STYLES = new Set(['classic', 'vibrant', 'cinematic', 'shader', 'psx']);
const MAX_SHARED_ATLAS_BYTES = 512 * 1024;
const VEHICLE_TYPES = new Set(['boat', 'minecart', 'storage', 'powered']);
const DIRECTIONS = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);

/* ------------------------------------------------------------------ */
/* Small pure helpers                                                 */
/* ------------------------------------------------------------------ */

const INVISIBLE_CHARS = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;
const cleanText = (value, max = 24) => [...String(value ?? '')
  .normalize('NFC')
  .replace(/[<>\u0000-\u001f\u007f-\u009f]/g, '')
  .replace(INVISIBLE_CHARS, '')
  .replace(/\s+/g, ' ')
  .trim()].slice(0, max).join('');

const clamp = (value, min, max, fallback = min) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);
const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const isVec3 = (value, limit = COORD_LIMIT) => Array.isArray(value) && value.length === 3
  && value.every(n => Number.isFinite(n) && Math.abs(n) <= limit);
const validRoom = value => /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(String(value ?? ''));
const safeDirection = value => Array.isArray(value) && value.length === 2
  && DIRECTIONS.some(([x, z]) => x === value[0] && z === value[1]);

const validRoomBlockEdit = (room, x, y, z, id, meta) => [x, y, z, id, meta].every(Number.isInteger)
  && y >= 0 && y < worldHeight(room.edition, room.dimension === 'nether' ? NETHER_TERRAIN : room.terrain, room.dimension || 'overworld')
  && id >= 0 && id <= 255 && meta >= 0 && meta <= 255
  && Math.abs(x) <= COORD_LIMIT && Math.abs(z) <= COORD_LIMIT
  && (room.edition !== 'classic' || (x >= -128 && x <= 127 && z >= -128 && z <= 127));

const validContainerCoordKey = (room, key) => {
  if (typeof key !== 'string' || !/^-?\d{1,9},\d{1,3},-?\d{1,9}$/.test(key)) return false;
  const [x, y, z] = key.split(',').map(Number);
  return validRoomBlockEdit(room, x, y, z, 0, 0);
};

function canStackMerge(a, b) {
  return !!a && !!b && a.id === b.id && (a.damage || 0) === (b.damage || 0)
    && sameEnchants(a.enchants, b.enchants) && itemStackLimit(a.id) > 1;
}

function interactWithSlotArray(slots, index, cursorStack, button = 0) {
  if (!Array.isArray(slots) || !Number.isInteger(index) || index < 0 || index >= slots.length) {
    return { cursorStack, changed: false };
  }
  const source = slots[index];
  const rightClick = button === 2;
  let changed = false;

  if (!cursorStack && source) {
    const amount = rightClick ? Math.ceil(source.count / 2) : source.count;
    cursorStack = { ...source, count: amount };
    source.count -= amount;
    if (source.count <= 0) slots[index] = null;
    changed = true;
  } else if (cursorStack && !source) {
    const amount = rightClick ? 1 : Math.min(itemStackLimit(cursorStack.id), cursorStack.count);
    slots[index] = { ...cursorStack, count: amount };
    cursorStack.count -= amount;
    if (cursorStack.count <= 0) cursorStack = null;
    changed = true;
  } else if (cursorStack && source && canStackMerge(cursorStack, source)) {
    const limit = itemStackLimit(source.id);
    const amount = Math.min(rightClick ? 1 : cursorStack.count, limit - source.count);
    if (amount > 0) {
      source.count += amount;
      cursorStack.count -= amount;
      if (cursorStack.count <= 0) cursorStack = null;
      changed = true;
    }
  } else if (cursorStack && source && !rightClick) {
    slots[index] = cursorStack;
    cursorStack = source;
    changed = true;
  }
  return { cursorStack, changed };
}

function insertIntoSlotArray(slots, incoming) {
  let rem = cleanStack(incoming);
  if (!rem) return { remainder: null, changed: false };
  const limit = itemStackLimit(rem.id);
  let changed = false;
  if (limit > 1) {
    for (let i = 0; i < slots.length && rem.count > 0; i++) {
      const s = slots[i];
      if (!s || !canStackMerge(s, rem) || s.count >= limit) continue;
      const move = Math.min(limit - s.count, rem.count);
      s.count += move;
      rem.count -= move;
      changed = true;
    }
  }
  for (let i = 0; i < slots.length && rem.count > 0; i++) {
    if (slots[i]) continue;
    const move = Math.min(limit, rem.count);
    slots[i] = { ...rem, count: move };
    rem.count -= move;
    changed = true;
  }
  return { remainder: rem.count > 0 ? rem : null, changed };
}

function insertIntoFurnace(furnace, incoming) {
  let rem = cleanStack(incoming);
  if (!rem) return { remainder: null, changed: false };
  const targetSlot = smeltResult(rem.id) != null ? 'input' : (FUEL_TIMES[rem.id] ? 'fuel' : 'input');
  const existing = furnace[targetSlot];
  const limit = itemStackLimit(rem.id);
  if (!existing) {
    const move = Math.min(limit, rem.count);
    furnace[targetSlot] = { ...rem, count: move };
    rem.count -= move;
    return { remainder: rem.count > 0 ? rem : null, changed: true };
  }
  if (canStackMerge(existing, rem) && existing.count < limit) {
    const move = Math.min(limit - existing.count, rem.count);
    existing.count += move;
    rem.count -= move;
    return { remainder: rem.count > 0 ? rem : null, changed: true };
  }
  return { remainder: rem, changed: false };
}

function envInt(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

/** Walks the PNG chunk list so trailing garbage / truncated files are rejected. */
function pngIsWellFormed(png) {
  let offset = 8;
  let chunks = 0;
  while (offset + 12 <= png.length && chunks++ < 4096) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('latin1', offset + 4, offset + 8);
    const next = offset + 12 + length;
    if (!/^[A-Za-z]{4}$/.test(type) || next > png.length) return false;
    if (chunks === 1 && (type !== 'IHDR' || length !== 13)) return false;
    offset = next;
    if (type === 'IEND') return offset === png.length;
  }
  return false;
}

function sanitizeVisualSettings(value) {
  if (value?.mode !== 'forced') return { mode: 'individual' };
  const visuals = { mode: 'forced', shaderStyle: SHADER_STYLES.has(value.shaderStyle) ? value.shaderStyle : 'classic', resourcePack: null };
  if (value.resourcePack == null) return visuals;
  const pack = value.resourcePack;
  const prefix = 'data:image/png;base64,';
  if (typeof pack !== 'object' || typeof pack.atlasData !== 'string' || !pack.atlasData.startsWith(prefix) || pack.atlasData.length > 700_000) {
    throw new Error('The shared texture atlas is invalid or too large (maximum 512 KB).');
  }
  const encoded = pack.atlasData.slice(prefix.length);
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('The shared texture atlas is not valid base64 PNG data.');
  const png = Buffer.from(encoded, 'base64');
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (png.length > MAX_SHARED_ATLAS_BYTES || png.length < 24 || !png.subarray(0, 8).equals(signature) || png.toString('ascii', 12, 16) !== 'IHDR' || png.readUInt32BE(16) !== 256 || png.readUInt32BE(20) !== 256) {
    throw new Error('The shared texture atlas must be a 256×256 PNG under 512 KB.');
  }
  if (!pngIsWellFormed(png)) throw new Error('The shared texture atlas is not a well-formed PNG file.');
  visuals.resourcePack = { name: cleanText(pack.name, 60) || 'Host texture pack', atlasData: pack.atlasData };
  return visuals;
}

function sanitizeItem(source, uid = source?.uid, sourceIdLimit = 120) {
  if (!validEntityId(source?.uid, sourceIdLimit)) return null;
  if (!isInt(source.id, 0, 4095) || !isInt(source.count, 1, 999) || !isVec3(source.pos)) return null;
  const enchants = normalizeEnchants(source.enchants);
  return {
    uid, id: source.id, count: source.count,
    damage: Number.isInteger(source.damage) ? Math.min(65_535, Math.max(0, source.damage)) : 0,
    ...(enchants ? { enchants } : {}),
    pos: [...source.pos], vy: clamp(source.vy, -80, 80, 0), age: clamp(source.age, 0, 300, 0),
  };
}

const PROJECTILE_KINDS = new Set(['arrow', 'snowball', 'egg', 'xp_bottle', 'fireball', 'ghast_fireball', 'blaze_bolt']);

function sanitizeProjectile(shot, isHost) {
  if (!validEntityId(shot?.uid, 100) || !['player', 'mob'].includes(shot.owner)) return null;
  if (!isVec3(shot.pos) || !isVec3(shot.vel, 80)) return null;
  if (shot.owner === 'mob' && !isHost) return null; // mobs are host-simulated
  const kind = PROJECTILE_KINDS.has(shot.kind) ? shot.kind : 'arrow';
  return {
    uid: shot.uid, owner: shot.owner, kind,
    pos: [...shot.pos], vel: [...shot.vel], age: clamp(shot.age, 0, 8, 0),
    targetId: typeof shot.targetId === 'string' ? shot.targetId.slice(0, 80) : null,
    damage: clamp(shot.damage, 0, 60, 2),
    ...(shot.flame ? { flame: true } : {}),
    ...(Number.isInteger(shot.punch) && shot.punch > 0 ? { punch: Math.min(2, shot.punch) } : {}),
  };
}
const publicProjectile = ({ sourceId, lastUpdate, ...shot }) => shot;

function sanitizeVehicle(vehicle) {
  if (!validEntityId(vehicle?.uid, 100) || !VEHICLE_TYPES.has(vehicle.type)
    || !isVec3(vehicle.pos) || !Number.isFinite(vehicle.rotation)) return null;
  const pos = [...vehicle.pos];
  const hasSlots = vehicle.type === 'storage' && Array.isArray(vehicle.slots) && vehicle.slots.length === 27
    && JSON.stringify(vehicle.slots).length <= 16_384;
  return {
    uid: vehicle.uid, type: vehicle.type, pos, rotation: vehicle.rotation % (Math.PI * 2),
    vx: clamp(vehicle.vx, -20, 20, 0), vz: clamp(vehicle.vz, -20, 20, 0),
    ...(hasSlots ? { slots: vehicle.slots } : {}),
    ...(vehicle.type === 'powered' ? { fuel: clamp(vehicle.fuel, 0, 3600, 0) } : {}),
    ...(vehicle.type !== 'boat' ? {
      nodeX: Number.isInteger(vehicle.nodeX) ? clamp(vehicle.nodeX, -COORD_LIMIT, COORD_LIMIT) : Math.floor(pos[0]),
      nodeZ: Number.isInteger(vehicle.nodeZ) ? clamp(vehicle.nodeZ, -COORD_LIMIT, COORD_LIMIT) : Math.floor(pos[2]),
      target: safeDirection(vehicle.target) ? vehicle.target : null,
      progress: clamp(vehicle.progress, 0, 0.999, 0),
      travel: safeDirection(vehicle.travel) ? vehicle.travel : [0, -1],
      cartSpeed: clamp(vehicle.cartSpeed, 0, 8, 0),
    } : {}),
  };
}

function sanitizeMobs(mobs) {
  return mobs
    .filter(mob => validEntityId(mob?.uid, 80) && typeof mob.type === 'string' && mob.type.length <= 32
      && isVec3Loose(mob.pos) && [mob.yaw, mob.hp].every(Number.isFinite))
    .map(mob => ({
      uid: mob.uid, type: mob.type, pos: mob.pos.map(value => clamp(value, -COORD_LIMIT, COORD_LIMIT)),
      yaw: mob.yaw, hp: clamp(mob.hp, 0, 1000), sheared: !!mob.sheared, fuse: Number.isFinite(mob.fuse) ? mob.fuse : -1,
    }));
}
// Mobs are clamped (not rejected) when out of range, matching the previous behaviour.
const isVec3Loose = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

/* ------------------------------------------------------------------ */
/* Networking helpers                                                 */
/* ------------------------------------------------------------------ */

function closeSocket(socket, code, reason) {
  if (socket.closing) return; // idempotent: a flooding client must not stack timers/listeners
  socket.closing = true;
  try { socket.close(code, reason); } catch { socket.terminate?.(); return; }
  // A stalled peer never completes the close handshake; make sure the socket really goes away.
  const timer = setTimeout(() => { if (socket.readyState !== WebSocket.CLOSED) socket.terminate(); }, 2000);
  timer.unref?.();
  socket.once('close', () => clearTimeout(timer));
}

function sendEncoded(socket, payload, { force = false, transient = false } = {}) {
  if (socket.readyState !== WebSocket.OPEN) return;
  if (!force && transient && socket.bufferedAmount > SOFT_SOCKET_BUFFER_BYTES) return;
  if (!force && socket.bufferedAmount > MAX_SOCKET_BUFFER_BYTES) {
    closeSocket(socket, 1013, 'Connection too slow; please rejoin.');
    return;
  }
  try { socket.send(payload); } catch { /* socket is closing */ }
}
const TRANSIENT_TYPES = new Set(['player:state', 'mob:snapshot', 'projectile:update']);
const send = (socket, message) => sendEncoded(socket, JSON.stringify(message), { transient: TRANSIENT_TYPES.has(message?.type) });
function broadcast(peers, message, exclude = null) {
  const payload = JSON.stringify(message); // encode once for every recipient
  const transient = TRANSIENT_TYPES.has(message?.type);
  for (const peer of peers) if (peer !== exclude) sendEncoded(peer, payload, { transient });
}

function allowRate(socket, key, limit, windowMs) {
  const now = Date.now();
  const current = socket.rateLimits.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    socket.rateLimits.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= limit) return false;
  current.count++;
  return true;
}

/** Fixed-window limiter keyed by an arbitrary string, with a hard cap on tracked keys. */
function createWindowLimiter({ limit, windowMs, maxEntries = 10_000 }) {
  const entries = new Map();
  const limiter = {
    allow(key, now = Date.now()) {
      let entry = entries.get(key);
      if (!entry || now - entry.startedAt >= windowMs) {
        if (!entry && entries.size >= maxEntries) {
          limiter.sweep(now);
          if (entries.size >= maxEntries) return false;
        }
        entry = { startedAt: now, count: 0 };
        entries.set(key, entry);
      }
      if (entry.count >= limit) return false;
      entry.count++;
      return true;
    },
    sweep(now = Date.now()) {
      for (const [key, entry] of entries) if (now - entry.startedAt >= windowMs) entries.delete(key);
    },
    get size() { return entries.size; },
  };
  return limiter;
}

function pruneTimes(map, now, maxAgeMs) {
  for (const [key, time] of map) if (now - time > maxAgeMs) map.delete(key);
}

/* ------------------------------------------------------------------ */
/* Passwords (async scrypt so hashing never blocks the game loop)     */
/* ------------------------------------------------------------------ */

async function passwordRecord(password) {
  if (!password) return null;
  const salt = randomBytes(16);
  return { salt, hash: await scryptAsync(password, salt, 32) };
}

async function passwordMatches(record, password) {
  if (!record) return !password;
  if (!password) return false;
  const candidate = await scryptAsync(password, record.salt, 32);
  return timingSafeEqual(record.hash, candidate);
}

/* ------------------------------------------------------------------ */
/* Client addresses                                                   */
/* ------------------------------------------------------------------ */

function normalizeIp(value) {
  const candidate = String(value ?? '').trim();
  if (isIP(candidate)) return candidate.toLowerCase();
  const bracketed = /^\[([0-9a-f:.]+)\](?::\d+)?$/i.exec(candidate);
  if (bracketed && isIP(bracketed[1]) === 6) return bracketed[1].toLowerCase();
  const ipv4WithPort = /^([0-9.]+):\d+$/.exec(candidate);
  if (ipv4WithPort && isIP(ipv4WithPort[1]) === 4) return ipv4WithPort[1];
  return null;
}

// Forwarded headers are attacker-controlled unless a known reverse-proxy
// chain is explicitly configured. The count is the number of trusted proxies
// that append their observed client address to X-Forwarded-For.
export function resolveClientAddress(request, trustedProxyHops = 0) {
  const remoteAddress = normalizeIp(request?.socket?.remoteAddress) || 'unknown';
  if (!Number.isInteger(trustedProxyHops) || trustedProxyHops < 1 || trustedProxyHops > 10) return remoteAddress;
  const header = request?.headers?.['x-forwarded-for'];
  if (typeof header !== 'string' || header.length > 4096) return remoteAddress;
  const chain = header.split(',').map(normalizeIp);
  if (chain.some(address => !address) || chain.length < trustedProxyHops) return remoteAddress;
  return chain[chain.length - trustedProxyHops];
}

function expandIPv6(address) {
  let text = address.split('%')[0];
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) {
    const [a, b, c, d] = dotted[1].split('.').map(Number);
    text = `${text.slice(0, -dotted[1].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if (halves.length === 1 ? head.length !== 8 : head.length + tail.length > 7) return null;
  const groups = halves.length === 1 ? head : [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail];
  return groups.map(group => group.padStart(4, '0'));
}

/**
 * Key used for throttling. IPv4-mapped IPv6 collapses to IPv4, and other IPv6
 * addresses collapse to their /64 so a client cannot dodge limits by rotating
 * addresses inside the prefix it was handed.
 */
export function rateLimitKey(address) {
  const text = String(address ?? 'unknown');
  if (isIP(text) !== 6) return text;
  const groups = expandIPv6(text);
  if (!groups) return text;
  if (groups.slice(0, 5).every(group => group === '0000') && groups[5] === 'ffff') {
    const high = Number.parseInt(groups[6], 16);
    const low = Number.parseInt(groups[7], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return `${groups.slice(0, 4).join(':')}::/64`;
}

/* ------------------------------------------------------------------ */
/* Static files (path-safe, ETag/304, on-the-fly br/gzip with cache)  */
/* ------------------------------------------------------------------ */

function sendJson(request, response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  response.end(request.method === 'HEAD' ? undefined : JSON.stringify(body));
}

function probeFile(root, path) {
  let real;
  try { real = realpathSync(path); } catch { return null; }
  if (real !== root && !real.startsWith(`${root}${sep}`)) return { forbidden: true };
  try {
    const stat = statSync(real);
    return stat.isFile() ? { file: real, stat } : null;
  } catch { return null; }
}

function locateFile(root, pathname) {
  const target = resolve(root, `.${pathname}`);
  let found = probeFile(root, target);
  if (!found) {
    try { if (statSync(target).isDirectory()) found = probeFile(root, resolve(target, 'index.html')); } catch { /* not a directory */ }
  }
  // Single-page-app fallback only for extension-less routes, never for missing assets.
  if (!found && !extname(pathname)) found = probeFile(root, resolve(root, 'index.html'));
  return found;
}

const etagMatches = (header, etag) => typeof header === 'string'
  && header.split(',').some(tag => tag.trim() === '*' || tag.trim().replace(/^W\//, '') === etag.replace(/^W\//, ''));

function createStaticFileServer(staticDir) {
  const cache = new Map();
  const pending = new Map();
  let cacheBytes = 0;

  function remember(key, output) {
    if (output.length > MAX_COMPRESS_CACHE_BYTES) return;
    cache.set(key, output);
    cacheBytes += output.length;
    for (const [oldKey, value] of cache) {
      if (cacheBytes <= MAX_COMPRESS_CACHE_BYTES) break;
      cache.delete(oldKey);
      cacheBytes -= value.length;
    }
  }

  function compressed(file, stat, encoding) {
    const key = `${encoding}:${file}:${stat.size}:${stat.mtimeMs}`;
    const hit = cache.get(key);
    if (hit) { cache.delete(key); cache.set(key, hit); return Promise.resolve(hit); }
    let job = pending.get(key);
    if (!job) {
      job = (async () => {
        try {
          const source = await readFile(file);
          const output = encoding === 'br'
            ? await brotliAsync(source, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5, [zlibConstants.BROTLI_PARAM_SIZE_HINT]: source.length } })
            : await gzipAsync(source, { level: 6 });
          remember(key, output);
          return output;
        } finally { pending.delete(key); }
      })();
      pending.set(key, job);
    }
    return job;
  }

  return async function serve(request, response, pathname) {
    let root = null;
    try { root = staticDir ? realpathSync(staticDir) : null; } catch { /* missing build */ }
    if (!root) return sendJson(request, response, 503, { error: 'Game build is unavailable. Build the site with npm run build.' });

    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { response.writeHead(400); response.end('Bad path'); return; }
    if (decoded.includes('\0')) { response.writeHead(400); response.end('Bad path'); return; }
    // Never serve dotfiles (.env, .git, ...) even if one ends up in the build output.
    if (decoded.split('/').some(segment => segment.startsWith('.') && segment !== '.well-known')) return sendJson(request, response, 404, { error: 'not found' });

    const found = locateFile(root, decoded);
    if (!found) return sendJson(request, response, 404, { error: 'not found' });
    if (found.forbidden) return sendJson(request, response, 403, { error: 'forbidden' });
    const { file, stat } = found;

    const extension = extname(file).toLowerCase();
    const isHashedAsset = /-[A-Za-z0-9_-]{8,}\.[^.]+$/.test(file);
    const compressible = COMPRESSIBLE_EXTENSIONS.has(extension) && stat.size >= MIN_COMPRESS_BYTES && stat.size <= MAX_COMPRESS_BYTES;
    const accepted = String(request.headers['accept-encoding'] || '').toLowerCase();
    const encoding = !compressible ? null : /\bbr\b/.test(accepted) ? 'br' : /\bgzip\b/.test(accepted) ? 'gzip' : null;
    const etag = `W/"${stat.size.toString(16)}-${Math.round(stat.mtimeMs).toString(16)}${encoding ? `-${encoding}` : ''}"`;
    const headers = {
      'content-type': MIME_TYPES[extension] || 'application/octet-stream',
      'cache-control': extension === '.html' ? 'no-cache' : isHashedAsset ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
      etag, 'last-modified': stat.mtime.toUTCString(), 'x-content-type-options': 'nosniff',
      ...(compressible ? { vary: 'Accept-Encoding' } : {}),
    };

    if (etagMatches(request.headers['if-none-match'], etag)) { response.writeHead(304, headers); response.end(); return; }

    if (encoding) {
      const body = await compressed(file, stat, encoding);
      response.writeHead(200, { ...headers, 'content-encoding': encoding, 'content-length': body.length });
      response.end(request.method === 'HEAD' ? undefined : body);
      return;
    }
    response.writeHead(200, { ...headers, 'content-length': stat.size });
    if (request.method === 'HEAD') { response.end(); return; }
    pipeline(createReadStream(file), response, () => {}); // pipeline destroys both ends on error/abort
  };
}

/* ------------------------------------------------------------------ */
/* Multiplayer server                                                 */
/* ------------------------------------------------------------------ */

export function createMultiplayerServer({
  logger = console,
  staticDir = DEFAULT_DIST_DIR,
  trustedProxyHops = Number(process.env.AISLOPCRAFT_TRUST_PROXY_HOPS) || 0,
  maxRooms = MAX_ROOMS,
  maxPlayers = MAX_PLAYERS,
  maxConnections = envInt('AISLOPCRAFT_MAX_CONNECTIONS', 200),
  maxConnectionsPerAddress = envInt('AISLOPCRAFT_MAX_CONNECTIONS_PER_IP', 0),
  allowedOrigins = String(process.env.AISLOPCRAFT_ALLOWED_ORIGINS || '').split(','),
  resumeGraceMs = 15_000,
} = {}) {
  const startedAt = Date.now();
  const rooms = new Map();
  const claimedNames = new Map();
  const connectionsByAddress = new Map();
  const originAllowList = new Set(allowedOrigins.map(origin => String(origin).trim().toLowerCase()).filter(Boolean));
  const passwordLimiter = createWindowLimiter({ limit: 12, windowMs: 60_000 }); // wrong-password guessing
  const missLimiter = createWindowLimiter({ limit: 30, windowMs: 60_000 });     // room-code enumeration
  const protectedCreateLimiter = createWindowLimiter({ limit: 30, windowMs: 60_000 }); // scrypt cost on create
  const serveStatic = createStaticFileServer(staticDir);

  /* ---------------------------- HTTP ----------------------------- */

  async function handleHttp(request, response) {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.setHeader(name, value);
    if (request.socket.encrypted || request.headers['x-forwarded-proto'] === 'https') {
      response.setHeader('strict-transport-security', 'max-age=31536000');
    }
    let url;
    try { url = new URL(request.url || '/', 'http://localhost'); } catch { return sendJson(request, response, 400, { error: 'bad request' }); }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('allow', 'GET, HEAD');
      return sendJson(request, response, 405, { error: 'method not allowed' });
    }
    if (url.pathname === '/health') {
      let ready = false;
      try { ready = Boolean(staticDir && statSync(resolve(staticDir, 'index.html')).isFile()); } catch { /* not built */ }
      return sendJson(request, response, ready ? 200 : 503, {
        service: 'aislopcraft-online', status: ready ? 'ok' : 'not_ready',
        rooms: rooms.size, maxRooms, maxPlayersPerRoom: maxPlayers,
        players: claimedNames.size, connections: wss.clients.size,
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      });
    }
    return serveStatic(request, response, url.pathname);
  }

  const http = createServer((request, response) => {
    handleHttp(request, response).catch(error => {
      logger.warn?.('HTTP handler error:', error?.message);
      if (!response.headersSent) sendJson(request, response, 500, { error: 'internal error' });
      else response.destroy();
    });
  });
  http.headersTimeout = 15_000;
  http.requestTimeout = 30_000;
  http.keepAliveTimeout = 65_000; // longer than common load-balancer idle timeouts
  http.on('clientError', (error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    else socket.destroy();
  });

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_MESSAGE, perMessageDeflate: false });
  wss.on('error', error => logger.warn?.('WebSocket server error:', error.message));

  /* ----------------------- names & lobby ------------------------- */

  const onlinePlayerList = () => [...claimedNames.values()].map(socket => socket.playerName).filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  function broadcastOnlinePlayers() {
    const payload = JSON.stringify({ type: 'players:list', players: onlinePlayerList() });
    for (const socket of wss.clients) sendEncoded(socket, payload);
  }

  function releaseName(socket) {
    if (!socket.playerName) return false;
    const key = socket.playerName.toLowerCase();
    if (claimedNames.get(key) === socket) claimedNames.delete(key);
    socket.playerName = null;
    broadcastOnlinePlayers();
    return true;
  }

  const fail = (socket, requestId, message) => send(socket, { type: 'error', requestId, message });

  function originAllowed(request) {
    if (!originAllowList.size) return true;
    const origin = request.headers.origin;
    if (!origin) return true; // non-browser clients; Origin checks only protect browsers
    try { if (new URL(origin).host === request.headers.host) return true; } catch { return false; }
    return originAllowList.has(String(origin).toLowerCase());
  }

  /* --------------------------- rooms ----------------------------- */

  function createCode() {
    for (let attempt = 0; attempt < 100; attempt++) {
      // 256 is a multiple of 32, so `% 32` has no modulo bias.
      const code = [...randomBytes(6)].map(byte => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join('');
      if (!rooms.has(code)) return code;
    }
    throw new Error('Could not allocate a room code. Try again.');
  }

  const roomSummary = room => ({
    code: room.code, name: room.name, players: room.clients.size + (room.suspended?.size || 0), maxPlayers, seed: room.seed,
    edition: room.edition || 'beta', ...(room.terrain ? { terrain: room.terrain } : {}),
    dimension: room.dimension || 'overworld',
    gameMode: room.gameMode, access: room.access, passwordProtected: Boolean(room.password), visualMode: room.visuals?.mode || 'individual',
  });

  function resetRoomState(socket) {
    socket.room = null;
    socket.resumeToken = null;
    socket.lastState = null; // never reuse a position from a previous room
    socket.vehicleTimes.clear();
    socket.projectileTimes.clear();
  }

  function clearSuspended(room) {
    if (!room.suspended) return;
    for (const entry of room.suspended.values()) {
      clearTimeout(entry.timer);
      const nameKey = entry.playerName?.toLowerCase();
      if (nameKey && claimedNames.get(nameKey)?.token === entry.token) claimedNames.delete(nameKey);
    }
    room.suspended.clear();
  }

  /** Tears a room down. `keep` stays connected (host-initiated close); everyone else is disconnected. */
  function closeRoom(room, reason, closeReason, keep = null) {
    rooms.delete(room.code);
    clearSuspended(room);
    for (const peer of room.clients) {
      send(peer, { type: 'room:closed', reason });
      resetRoomState(peer);
      if (peer !== keep) closeSocket(peer, 1000, closeReason);
    }
    room.clients.clear();
  }

  function finalizePlayerDeparture(room, clientId, playerName, wasHost, announce = true) {
    if (!wasHost && clientId && room.host) {
      for (const record of room.vehicles.values()) {
        if (record.owner !== clientId) continue;
        record.riding = false;
        record.owner = room.host.clientId;
        broadcast(room.clients, { type: 'vehicle:update', ...record });
      }
      for (const [uid, shot] of room.projectiles) {
        if (shot.sourceId !== clientId) continue;
        room.projectiles.delete(uid);
        broadcast(room.clients, { type: 'projectile:remove', uid });
      }
    }
    if (announce && room.clients.size) broadcast(room.clients, { type: 'player:left', id: clientId, name: playerName });
    if ((!room.clients.size && !(room.suspended?.size)) || wasHost) closeRoom(room, 'The host left.', 'Host left');
  }

  function leave(socket, announce = true) {
    const room = socket.room;
    if (!room) return;
    const wasHost = room.host === socket;
    const clientId = socket.clientId;
    const playerName = socket.playerName;
    room.clients.delete(socket);
    resetRoomState(socket);
    finalizePlayerDeparture(room, clientId, playerName, wasHost, announce);
  }

  function suspendSocket(socket) {
    const room = socket.room;
    const token = socket.resumeToken;
    if (!room || !token || !rooms.has(room.code) || resumeGraceMs <= 0) {
      leave(socket);
      releaseName(socket);
      return;
    }
    const wasHost = room.host === socket;
    const clientId = socket.clientId;
    const playerName = socket.playerName;
    const lastState = socket.lastState;
    room.clients.delete(socket);
    resetRoomState(socket);
    socket.playerName = null;

    const entry = {
      token, clientId, playerName, wasHost, lastState,
      timer: setTimeout(() => {
        room.suspended.delete(token);
        const key = playerName.toLowerCase();
        if (claimedNames.get(key)?.token === token) {
          claimedNames.delete(key);
          broadcastOnlinePlayers();
        }
        if (rooms.has(room.code)) {
          finalizePlayerDeparture(room, clientId, playerName, wasHost, true);
        }
      }, resumeGraceMs),
    };
    entry.timer.unref?.();
    room.suspended.set(token, entry);
    claimedNames.set(playerName.toLowerCase(), { suspended: true, token, playerName });
  }

  function pushFullRoomState(socket, room) {
    const push = message => sendEncoded(socket, JSON.stringify(message), { force: true });
    const edits = [...room.edits.entries()];
    for (let index = 0; index < edits.length; index += 160) {
      push({ type: 'world:snapshot', dimension: room.dimension, entries: edits.slice(index, index + 160), done: index + 160 >= edits.length });
    }
    if (!edits.length) push({ type: 'world:snapshot', dimension: room.dimension, entries: [], done: true });
    push({
      type: 'container:snapshot',
      dimension: room.dimension,
      chests: [...room.chests.entries()],
      furnaces: [...room.furnaces.entries()],
    });
    push({ type: 'item:snapshot', items: [...room.items.values()], done: true });
    if (room.gameState) push({ type: 'game:state', state: room.gameState });
    push({ type: 'mob:snapshot', mobs: room.mobs });
    push({ type: 'vehicle:snapshot', vehicles: [...room.vehicles.values()] });
    push({ type: 'projectile:snapshot', projectiles: [...room.projectiles.values()].map(publicProjectile) });
  }

  function join(socket, room, name, requestId, wantResume = false) {
    if (socket.room === room) return fail(socket, requestId, 'You are already in that room.');
    if (room.clients.size + (room.suspended?.size || 0) >= maxPlayers) return fail(socket, requestId, 'That room is full.');
    if (socket.room) leave(socket);
    const id = randomBytes(8).toString('hex');
    socket.room = room;
    socket.clientId = id;
    socket.playerName = name;
    socket.lastState = null;
    socket.resumeToken = wantResume ? randomBytes(18).toString('hex') : null;
    room.clients.add(socket);
    send(socket, {
      type: 'room:joined', requestId, id, code: room.code, name: room.name,
      playerName: name, role: socket === room.host ? 'host' : 'guest',
      edition: room.edition || 'beta', ...(room.terrain ? { terrain: room.terrain } : {}),
      dimension: room.dimension || 'overworld',
      ...(socket.resumeToken ? { resumeToken: socket.resumeToken } : {}),
      gameMode: room.gameMode, seed: room.seed, access: room.access, visuals: room.visuals,
      players: [...room.clients].map(peer => ({ id: peer.clientId, name: peer.playerName, role: peer === room.host ? 'host' : 'player' })),
    });
    if (socket !== room.host) {
      pushFullRoomState(socket, room);
    }
    broadcast(room.clients, { type: 'player:joined', id, name, role: socket === room.host ? 'host' : 'player' }, socket);
    for (const peer of room.clients) {
      if (peer !== socket && peer.lastState) send(socket, { type: 'player:state', id: peer.clientId, name: peer.playerName, ...peer.lastState });
    }
  }

  function handleSessionResume(socket, message, requestId) {
    if (!allowRate(socket, 'session:resume', 20, 60_000)) return fail(socket, requestId, 'Too many reconnect attempts.');
    if (socket.room) return fail(socket, requestId, 'Already in a room.');
    const code = String(message.code ?? '').trim().toUpperCase();
    const token = typeof message.resumeToken === 'string' ? message.resumeToken.trim() : '';
    const room = rooms.get(code);
    const entry = room?.suspended?.get(token);
    if (!room || !entry) return fail(socket, requestId, 'Session expired or room closed.');
    clearTimeout(entry.timer);
    room.suspended.delete(token);
    if (socket.playerName && socket.playerName.toLowerCase() !== entry.playerName.toLowerCase()) {
      releaseName(socket);
    }
    socket.playerName = entry.playerName;
    claimedNames.set(entry.playerName.toLowerCase(), socket);
    socket.room = room;
    socket.clientId = entry.clientId;
    socket.lastState = entry.lastState;
    socket.resumeToken = randomBytes(18).toString('hex');
    if (entry.wasHost) room.host = socket;
    room.clients.add(socket);
    broadcastOnlinePlayers();
    send(socket, {
      type: 'room:joined', requestId, resumed: true, id: socket.clientId, code: room.code, name: room.name,
      playerName: socket.playerName, role: socket === room.host ? 'host' : 'guest',
      edition: room.edition || 'beta', ...(room.terrain ? { terrain: room.terrain } : {}),
      dimension: room.dimension || 'overworld',
      resumeToken: socket.resumeToken,
      gameMode: room.gameMode, seed: room.seed, access: room.access, visuals: room.visuals,
      players: [...room.clients].map(peer => ({ id: peer.clientId, name: peer.playerName, role: peer === room.host ? 'host' : 'player' })),
    });
    pushFullRoomState(socket, room);
    for (const peer of room.clients) {
      if (peer !== socket && peer.lastState) send(socket, { type: 'player:state', id: peer.clientId, name: peer.playerName, ...peer.lastState });
    }
  }

  function handleClaim(socket, message, requestId) {
    if (!allowRate(socket, 'player:claim', 12, 60_000)) return fail(socket, requestId, 'Too many name checks. Wait a minute before trying again.');
    if (socket.playerName) return fail(socket, requestId, `You are already playing as ${socket.playerName}. Release your current name first to change it.`);
    const name = String(message.name ?? '').trim();
    if (!USERNAME_PATTERN.test(name)) return fail(socket, requestId, 'Use a name with 3–20 letters, numbers, or underscores.');
    const key = name.toLowerCase();
    if (claimedNames.has(key)) return fail(socket, requestId, 'That player name is already taken by someone online. Choose another name.');
    socket.playerName = name;
    claimedNames.set(key, socket);
    send(socket, { type: 'player:claimed', requestId, name });
    broadcastOnlinePlayers();
  }

  function handleRelease(socket, message, requestId) {
    if (socket.room) leave(socket);
    releaseName(socket);
    send(socket, { type: 'player:released', requestId });
  }

  function handlePlayersList(socket, message, requestId) {
    if (!allowRate(socket, 'players:list', 30, 10_000)) return fail(socket, requestId, 'The online-player list is refreshing too quickly. Try again in a moment.');
    send(socket, { type: 'players:list', requestId, players: onlinePlayerList() });
  }

  function handlePing(socket, message, requestId) {
    if (!allowRate(socket, 'ping', 120, 10_000)) return;
    send(socket, { type: 'pong', requestId, serverTime: Date.now() });
  }

  function handleRoomsList(socket, message, requestId) {
    if (!allowRate(socket, 'rooms:list', 30, 10_000)) return fail(socket, requestId, 'The room list is refreshing too quickly. Try again in a moment.');
    const terrain = message.terrain === OVERWORLD_TERRAIN ? OVERWORLD_TERRAIN : null;
    const publicRooms = [...rooms.values()]
      .filter(room => room.access === 'public' && room.clients.size < maxPlayers && (!room.terrain || room.terrain === terrain))
      .map(roomSummary).sort((a, b) => b.players - a.players || a.name.localeCompare(b.name));
    send(socket, { type: 'rooms:list', requestId, rooms: publicRooms, ...(terrain ? { terrain } : {}) });
  }

  /* ----------------------- room lifecycle ------------------------ */

  async function handleRoomCreate(socket, message, requestId) {
    if (!socket.playerName) return fail(socket, requestId, 'Choose an available player name before creating a room.');
    if (!['beta', 'classic'].includes(message.edition)) return fail(socket, requestId, 'Unsupported world edition.');
    const terrain = message.terrain ?? null;
    if (terrain !== null && (message.edition !== 'beta' || terrain !== OVERWORLD_TERRAIN)) return fail(socket, requestId, 'Unsupported world terrain.');
    if (terrain && (typeof message.seed !== 'string' || !message.seed.length || message.seed.length > 128)) return fail(socket, requestId, 'Choose a valid world seed.');
    if (message.edition === 'beta' && message.gameMode != null && !['survival', 'creative'].includes(message.gameMode)) return fail(socket, requestId, 'Choose Survival or Creative.');
    if (socket.room) return fail(socket, requestId, 'Leave your current room first.');
    if (!allowRate(socket, 'room:create', 20, 60_000)) return fail(socket, requestId, 'You are creating rooms too quickly. Wait a minute and try again.');
    const playerName = socket.playerName;
    const name = cleanText(message.name, 32) || `${playerName}’s world`;
    const password = String(message.password ?? '').slice(0, 64);
    const access = message.access === 'private' ? 'private' : 'public';
    const edition = message.edition;
    const gameMode = edition === 'classic' ? 'creative' : message.gameMode || 'survival';
    const seed = terrain ? message.seed : cleanText(message.seed, 80) || 'AiSlopcraft';
    if (password.length && password.length < 4) return fail(socket, requestId, 'Passwords must be at least four characters.');
    if (rooms.size >= maxRooms) return fail(socket, requestId, `All ${maxRooms} rooms are in use. Try again later.`);
    if (password && !protectedCreateLimiter.allow(socket.addressKey)) return fail(socket, requestId, 'Too many password-protected rooms were created recently. Wait a minute and try again.');
    try {
      const visuals = sanitizeVisualSettings(message.visuals);
      const record = await passwordRecord(password);
      // The socket or the room table may have changed while the hash was computed.
      if (socket.readyState !== WebSocket.OPEN || socket.room || !socket.playerName) return;
      if (rooms.size >= maxRooms) return fail(socket, requestId, `All ${maxRooms} rooms are in use. Try again later.`);
      const overworldDim = { edits: new Map(), chests: new Map(), furnaces: new Map() };
      const netherDim = { edits: new Map(), chests: new Map(), furnaces: new Map() };
      const room = {
        code: createCode(), name, playerName, access, edition, terrain, gameMode, seed, visuals, password: record,
        dimension: 'overworld',
        dimensions: { overworld: overworldDim, nether: netherDim },
        clients: new Set(), suspended: new Map(),
        edits: overworldDim.edits, chests: overworldDim.chests, furnaces: overworldDim.furnaces,
        vehicleContainers: new Map(),
        items: new Map(), itemTimes: new Map(),
        gameState: null, mobs: [], vehicles: new Map(), projectiles: new Map(), host: socket,
      };
      rooms.set(room.code, room);
      join(socket, room, playerName, requestId, message.resume === true);
    } catch (error) { fail(socket, requestId, error.message); }
  }

  async function handleRoomJoin(socket, message, requestId) {
    if (!['beta', 'classic'].includes(message.edition)) return fail(socket, requestId, 'Unsupported world edition.');
    const code = String(message.code ?? '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!validRoom(code) || !room) {
      // Only misses are throttled, so guessing room codes is slow but normal joins are never penalised.
      if (!missLimiter.allow(socket.addressKey)) return fail(socket, requestId, 'Too many room lookups. Wait a minute and try again.');
      return fail(socket, requestId, 'Room not found. Check the code or ask the host to reopen it.');
    }
    if (room.password && !passwordLimiter.allow(`${socket.addressKey}:${code}`)) return fail(socket, requestId, 'Too many room password attempts. Wait a minute and try again.');
    if (!(await passwordMatches(room.password, String(message.password ?? '').slice(0, 64)))) return fail(socket, requestId, 'Incorrect room password.');
    const requestedEdition = message.edition === 'classic' ? 'classic' : 'beta';
    if ((room.edition || 'beta') !== requestedEdition) return fail(socket, requestId, `This room uses the ${room.edition || 'beta'} edition. Open that edition to join.`);
    if (room.terrain && message.terrain !== room.terrain) return fail(socket, requestId, 'This room uses a newer world generator. Update your game and rejoin.');
    if (socket.readyState !== WebSocket.OPEN || !socket.playerName) return;
    if (rooms.get(code) !== room) return fail(socket, requestId, 'Room not found. Check the code or ask the host to reopen it.');
    join(socket, room, socket.playerName, requestId, message.resume === true);
  }

  function handleRoomLeave(socket, message, requestId) {
    leave(socket);
    send(socket, { type: 'room:left', requestId });
  }

  function handleRoomClose(socket, message, requestId) {
    const room = socket.room;
    if (!room || room.host !== socket) return fail(socket, requestId, 'Only the host can close this room.');
    closeRoom(room, 'The host closed the room.', 'Room closed', socket);
    send(socket, { type: 'room:left', requestId });
  }

  /* ----------------------- in-room handlers ---------------------- */

  function handlePlayerState(socket, message, requestId, room) {
    const now = Date.now();
    if (now - socket.lastStateAt < MIN_STATE_INTERVAL_MS) return;
    const state = message.state;
    if (!state || ![state.x, state.y, state.z, state.yaw, state.pitch].every(Number.isFinite)) return;
    if (Math.abs(state.x) > COORD_LIMIT || Math.abs(state.z) > COORD_LIMIT || state.y < -128 || state.y > 512) return;
    socket.lastStateAt = now;
    socket.lastState = { x: state.x, y: state.y, z: state.z, yaw: state.yaw, pitch: state.pitch, dead: !!state.dead };
    broadcast(room.clients, { type: 'player:state', id: socket.clientId, name: socket.playerName, ...socket.lastState }, socket);
  }

  function handleWorldSnapshot(socket, message, requestId, room) {
    if (room.host !== socket) return fail(socket, requestId, 'Only the host can publish the initial world snapshot.');
    if (!allowRate(socket, 'world:snapshot', 60, 15_000)) return fail(socket, requestId, 'World setup is sending too quickly. Please retry.');
    if (!Array.isArray(message.entries) || message.entries.length > 1000) return fail(socket, requestId, 'Invalid world snapshot batch.');
    const batch = new Map();
    for (const entry of message.entries) {
      if (!Array.isArray(entry) || entry.length < 2) return fail(socket, requestId, 'The world contains an invalid block edit.');
      const [key, value] = entry;
      const match = typeof key === 'string' && /^-?\d{1,9},\d{1,3},-?\d{1,9}$/.test(key);
      const id = Array.isArray(value) ? value[0] : value;
      const meta = Array.isArray(value) ? (value[1] ?? 0) : 0;
      const [x, y, z] = match ? key.split(',').map(Number) : [];
      if (!match || !validRoomBlockEdit(room, x, y, z, id, meta)) return fail(socket, requestId, 'The world contains an invalid block edit.');
      // Canonical key, so "007,5,3" and "7,5,3" cannot become two entries for one block.
      batch.set(`${x},${y},${z}`, [id, meta]);
    }
    let added = 0;
    for (const key of batch.keys()) if (!room.edits.has(key)) added++;
    if (room.edits.size + added > MAX_EDITS) return fail(socket, requestId, 'The shared world edit limit has been reached.');
    const entries = [...batch.entries()];
    for (const [key, edit] of entries) room.edits.set(key, edit);
    broadcast(room.clients, { type: 'world:snapshot', entries, done: false }, socket);
    send(socket, { type: 'world:snapshot:accepted', requestId, count: entries.length });
  }

  function spawnServerDrop(room, pos, stack) {
    const clean = cleanStack(stack);
    if (!clean || room.items.size >= 4096) return;
    const uid = `srv:${randomBytes(8).toString('hex')}`;
    const item = {
      uid, id: clean.id, count: clean.count, damage: clean.damage || 0,
      ...(clean.enchants ? { enchants: clean.enchants } : {}),
      pos: [pos[0] + (Math.random() - 0.5) * 0.4, pos[1] + 0.25, pos[2] + (Math.random() - 0.5) * 0.4],
      vy: 2.2, age: 0,
    };
    room.items.set(uid, item);
    room.itemTimes.set(uid, Date.now());
    broadcast(room.clients, { type: 'item:spawn', item });
  }

  function spillBlockContainersAt(room, key, x, y, z) {
    const pos = [x + 0.5, y + 0.2, z + 0.5];
    if (room.chests.has(key)) {
      const slots = room.chests.get(key);
      room.chests.delete(key);
      broadcast(room.clients, { type: 'container:remove', dimension: room.dimension, kind: 'chest', key });
      for (const stack of slots) if (stack) spawnServerDrop(room, pos, stack);
    }
    if (room.furnaces.has(key)) {
      const f = room.furnaces.get(key);
      room.furnaces.delete(key);
      broadcast(room.clients, { type: 'container:remove', dimension: room.dimension, kind: 'furnace', key });
      for (const stack of [f.input, f.fuel, f.output]) if (stack) spawnServerDrop(room, pos, stack);
    }
  }

  function handleWorldEdit(socket, message, requestId, room) {
    const { x, y, z, id, meta = 0 } = message.edit ?? {};
    if (!allowRate(socket, 'world:edit', 80, 1000)) return;
    if (!validRoomBlockEdit(room, x, y, z, id, meta)) return;
    const key = `${x},${y},${z}`;
    if (!room.edits.has(key) && room.edits.size >= MAX_EDITS) return fail(socket, requestId, 'The shared world edit limit has been reached.');
    room.edits.set(key, [id, meta]);
    broadcast(room.clients, { type: 'world:edit', dimension: room.dimension, edit: { x, y, z, id, meta } }, socket);
    if (id === 0) spillBlockContainersAt(room, key, x, y, z);
  }

  function handleContainerSnapshot(socket, message, requestId, room) {
    if (room.host !== socket) return fail(socket, requestId, 'Only the host can publish container snapshots.');
    if (!allowRate(socket, 'container:snapshot', 12, 15_000)) return fail(socket, requestId, 'Container setup is sending too quickly.');
    const targetDim = message.dimension === 'nether' ? 'nether' : 'overworld';
    const dim = room.dimensions[targetDim];
    if (Array.isArray(message.chests)) {
      for (const entry of message.chests.slice(0, MAX_CONTAINERS)) {
        if (!Array.isArray(entry) || !validContainerCoordKey({ ...room, dimension: targetDim }, entry[0]) || !Array.isArray(entry[1]) || entry[1].length !== 27) continue;
        dim.chests.set(entry[0], entry[1].map(cleanStack));
      }
    }
    if (Array.isArray(message.furnaces)) {
      for (const entry of message.furnaces.slice(0, MAX_CONTAINERS)) {
        if (!Array.isArray(entry) || !validContainerCoordKey({ ...room, dimension: targetDim }, entry[0]) || !entry[1] || typeof entry[1] !== 'object') continue;
        const src = entry[1];
        dim.furnaces.set(entry[0], {
          input: cleanStack(src.input), output: cleanStack(src.output), fuel: cleanStack(src.fuel),
          burn: clamp(src.burn, 0, 100_000, 0), burnMax: clamp(src.burnMax, 0, 100_000, 0),
          cook: clamp(src.cook, 0, 6, 0), storedXp: clamp(src.storedXp, 0, 10_000, 0), soundTimer: 0,
        });
      }
    }
    if (targetDim === room.dimension) {
      broadcast(room.clients, {
        type: 'container:snapshot',
        dimension: room.dimension,
        chests: [...room.chests.entries()],
        furnaces: [...room.furnaces.entries()],
      }, socket);
    }
    send(socket, { type: 'container:snapshot:accepted', requestId });
  }

  function handleContainerTx(socket, message, requestId, room) {
    if (!allowRate(socket, 'container:tx', 80, 1000)) return fail(socket, requestId, 'Too many container actions.');
    const kind = message.kind;
    const key = String(message.key ?? '');
    const mode = message.mode || 'click';
    if (!['chest', 'furnace', 'cart'].includes(kind)) return fail(socket, requestId, 'Unsupported container type.');

    if (kind === 'cart') {
      const record = room.vehicles.get(key);
      if (!record || record.vehicle.type !== 'storage') return fail(socket, requestId, 'Storage minecart is no longer available.');
      if (!room.vehicleContainers.has(key)) {
        room.vehicleContainers.set(key, Array.isArray(record.vehicle.slots) ? record.vehicle.slots.map(cleanStack) : new Array(27).fill(null));
      }
      const slots = room.vehicleContainers.get(key);
      let reply = { ok: true, kind, key };
      let changed = false;
      if (mode === 'click') {
        const res = interactWithSlotArray(slots, message.slot, cleanStack(message.cursorStack), message.button === 2 ? 2 : 0);
        changed = res.changed;
        reply.cursorStack = res.cursorStack;
      } else if (mode === 'take') {
        const idx = message.slot;
        const maxCount = isInt(message.maxCount, 1, 64) ? message.maxCount : 64;
        const src = Number.isInteger(idx) && idx >= 0 && idx < 27 ? slots[idx] : null;
        if (src) {
          const take = Math.min(maxCount, src.count);
          reply.taken = { ...src, count: take };
          src.count -= take;
          if (src.count <= 0) slots[idx] = null;
          changed = true;
        } else {
          reply.taken = null;
        }
      } else if (mode === 'insert') {
        const res = insertIntoSlotArray(slots, message.stack);
        changed = res.changed;
        reply.remainder = res.remainder;
      } else {
        return fail(socket, requestId, 'Invalid container transaction mode.');
      }
      record.vehicle.slots = slots;
      reply.state = slots;
      send(socket, { type: 'container:ack', requestId, ...reply });
      if (changed) broadcast(room.clients, { type: 'container:state', dimension: room.dimension, kind: 'cart', key, state: slots }, socket);
      return;
    }

    if (!validContainerCoordKey(room, key)) return fail(socket, requestId, 'Invalid container coordinates.');
    if (kind === 'chest') {
      if (!room.chests.has(key)) {
        if (room.chests.size >= MAX_CONTAINERS) return fail(socket, requestId, 'Shared container limit reached.');
        room.chests.set(key, new Array(27).fill(null));
      }
      const slots = room.chests.get(key);
      let reply = { ok: true, kind, key };
      let changed = false;
      if (mode === 'click') {
        const res = interactWithSlotArray(slots, message.slot, cleanStack(message.cursorStack), message.button === 2 ? 2 : 0);
        changed = res.changed;
        reply.cursorStack = res.cursorStack;
      } else if (mode === 'take') {
        const idx = message.slot;
        const maxCount = isInt(message.maxCount, 1, 64) ? message.maxCount : 64;
        const src = Number.isInteger(idx) && idx >= 0 && idx < 27 ? slots[idx] : null;
        if (src) {
          const take = Math.min(maxCount, src.count);
          reply.taken = { ...src, count: take };
          src.count -= take;
          if (src.count <= 0) slots[idx] = null;
          changed = true;
        } else {
          reply.taken = null;
        }
      } else if (mode === 'insert') {
        const res = insertIntoSlotArray(slots, message.stack);
        changed = res.changed;
        reply.remainder = res.remainder;
      } else {
        return fail(socket, requestId, 'Invalid container transaction mode.');
      }
      reply.state = slots;
      send(socket, { type: 'container:ack', requestId, ...reply });
      if (changed) broadcast(room.clients, { type: 'container:state', dimension: room.dimension, kind: 'chest', key, state: slots }, socket);
      return;
    }

    // Furnace
    if (!room.furnaces.has(key)) {
      if (room.furnaces.size >= MAX_CONTAINERS) return fail(socket, requestId, 'Shared container limit reached.');
      room.furnaces.set(key, createFurnaceState());
    }
    const furnace = room.furnaces.get(key);
    let reply = { ok: true, kind, key, xpEarned: 0 };
    let changed = false;
    if (mode === 'click') {
      const res = interactWithFurnaceSlot(furnace, message.slot, cleanStack(message.cursorStack), message.button === 2 ? 2 : 0);
      changed = res.changed;
      reply.cursorStack = res.cursorStack;
      reply.xpEarned = res.xpEarned || 0;
    } else if (mode === 'take') {
      const slotName = message.slot;
      const maxCount = isInt(message.maxCount, 1, 64) ? message.maxCount : 64;
      const src = ['input', 'fuel', 'output'].includes(slotName) ? furnace[slotName] : null;
      if (src) {
        const take = Math.min(maxCount, src.count);
        reply.taken = { ...src, count: take };
        src.count -= take;
        if (src.count <= 0) furnace[slotName] = null;
        if (slotName === 'output' && furnace.storedXp > 0) {
          const whole = Math.floor(furnace.storedXp);
          reply.xpEarned = whole + (Math.random() < (furnace.storedXp - whole) ? 1 : 0);
          furnace.storedXp = 0;
        }
        changed = true;
      } else {
        reply.taken = null;
      }
    } else if (mode === 'insert') {
      const res = insertIntoFurnace(furnace, message.stack);
      changed = res.changed;
      reply.remainder = res.remainder;
    } else {
      return fail(socket, requestId, 'Invalid container transaction mode.');
    }
    reply.state = furnace;
    send(socket, { type: 'container:ack', requestId, ...reply });
    if (changed) broadcast(room.clients, { type: 'container:state', dimension: room.dimension, kind: 'furnace', key, state: furnace }, socket);
  }

  function handleRoomDimension(socket, message, requestId, room) {
    if (room.edition === 'classic') return fail(socket, requestId, 'Dimensions are not available in Classic.');
    const targetDim = message.dimension === 'nether' ? 'nether' : 'overworld';
    if (socket !== room.host) {
      // Guest stepped into an active portal: forward travel request to host so the party switches cleanly!
      if (!allowRate(socket, 'portal:travel', 4, 5000)) return;
      if (room.host && socket.lastState) {
        send(room.host, { type: 'portal:travel', fromId: socket.clientId, dimension: targetDim, pos: [socket.lastState.x, socket.lastState.y, socket.lastState.z] });
      }
      if (requestId) send(socket, { type: 'room:dimension:queued', requestId, dimension: targetDim });
      return;
    }
    if (!allowRate(socket, 'room:dimension', 8, 5000)) return fail(socket, requestId, 'Switching dimensions too quickly.');
    const dimObj = room.dimensions[targetDim];
    room.dimension = targetDim;
    room.edits = dimObj.edits;
    room.chests = dimObj.chests;
    room.furnaces = dimObj.furnaces;
    room.mobs = [];
    room.items.clear();
    room.itemTimes.clear();
    room.projectiles.clear();
    room.vehicles.clear();
    room.vehicleContainers.clear();
    const spawn = isVec3(message.spawn) ? message.spawn.map(Number) : null;
    broadcast(room.clients, { type: 'room:dimension', dimension: targetDim, spawn }, socket);
    for (const peer of room.clients) {
      if (peer !== socket) pushFullRoomState(peer, room);
    }
    if (requestId) send(socket, { type: 'room:dimension:accepted', requestId, dimension: targetDim });
  }

  function handleGameState(socket, message, requestId, room) {
    if (room.host !== socket) return fail(socket, requestId, 'Only the host can publish shared world state.');
    if (!allowRate(socket, 'game:state', 8, 1000)) return;
    if (!message.state || typeof message.state !== 'object' || Array.isArray(message.state) || JSON.stringify(message.state).length > 96_000) return fail(socket, requestId, 'Invalid shared world state.');
    room.gameState = message.state;
    broadcast(room.clients, { type: 'game:state', state: message.state }, socket);
  }

  function handleItemSnapshot(socket, message, requestId, room) {
    if (room.host !== socket) return fail(socket, requestId, 'Only the host can publish shared item state.');
    if (!allowRate(socket, 'item:snapshot', 20, 1000)) return;
    if (!Array.isArray(message.items) || message.items.length > 4096) return fail(socket, requestId, 'Invalid shared item snapshot.');
    const now = Date.now();
    const items = new Map();
    const times = new Map();
    for (const source of message.items) {
      const item = sanitizeItem(source);
      if (!item || items.has(item.uid)) return fail(socket, requestId, 'Invalid or duplicate item in snapshot.');
      items.set(item.uid, item);
      times.set(item.uid, room.itemTimes.get(item.uid) ?? now);
    }
    room.items = items;
    room.itemTimes = times;
    broadcast(room.clients, { type: 'item:snapshot', items: [...items.values()], done: true }, socket);
  }

  function handleItemSpawn(socket, message, requestId, room) {
    if (!allowRate(socket, 'item:spawn', 24, 1000)) return;
    const item = sanitizeItem(message.item, `${socket.clientId}:${message.item?.uid}`, 80);
    if (!item) return;
    // Guests may only drop items near themselves (the host also spawns mob and explosion drops).
    if (socket !== room.host && !canReachDrop(socket.lastState, item, ITEM_SPAWN_RANGE)) return;
    if (!canInsertId(room.items, item.uid, 4096)) return fail(socket, requestId, 'Duplicate drop or shared item limit reached.');
    room.items.set(item.uid, item);
    room.itemTimes.set(item.uid, Date.now());
    broadcast(room.clients, { type: 'item:spawn', item });
  }

  function handleItemPickup(socket, message, requestId, room) {
    if (!allowRate(socket, 'item:pickup', 12, 1000)) return;
    const { uid } = message;
    if (!validEntityId(uid, 120)) return;
    const item = room.items.get(uid);
    if (!canReachDrop(socket.lastState, item, PICKUP_RANGE)) return;
    room.items.delete(uid);
    room.itemTimes.delete(uid);
    send(socket, { type: 'item:pickup', item });
    broadcast(room.clients, { type: 'item:remove', uid }, socket);
  }

  function handleProjectileUpdate(socket, message, requestId, room) {
    if (!allowRate(socket, 'projectile:update', 40, 1000)) return;
    const now = Date.now();
    const sanitized = sanitizeProjectile(message.projectile, socket === room.host);
    if (!sanitized) return;
    const existing = room.projectiles.get(sanitized.uid);
    // A room member may update only their own projectile. Without this check, a peer
    // who learns a UID from a snapshot could replace or erase another player's projectile.
    if (existing && (!canControl(socket, room.host, existing.sourceId, true) || existing.owner !== sanitized.owner)) return;
    if (now - (socket.projectileTimes.get(sanitized.uid) || 0) < 80) return;
    if (!socket.projectileTimes.has(sanitized.uid) && socket.projectileTimes.size >= 512) {
      pruneTimes(socket.projectileTimes, now, 10_000);
      if (socket.projectileTimes.size >= 512) return;
    }
    if (room.projectiles.size >= 256 && !existing) return;
    socket.projectileTimes.set(sanitized.uid, now);
    const projectile = { ...sanitized, sourceId: existing?.sourceId ?? socket.clientId, lastUpdate: now };
    room.projectiles.set(projectile.uid, projectile);
    broadcast(room.clients, { type: 'projectile:update', projectile: publicProjectile(projectile) }, socket);
  }

  function handleProjectileRemove(socket, message, requestId, room) {
    const { uid } = message;
    if (!validEntityId(uid, 100)) return;
    const projectile = room.projectiles.get(uid);
    if (!canControl(socket, room.host, projectile?.sourceId, true)) return;
    room.projectiles.delete(uid);
    for (const peer of room.clients) peer.projectileTimes.delete(uid);
    broadcast(room.clients, { type: 'projectile:remove', uid }, socket);
  }

  function handleVehicleUpdate(socket, message, requestId, room) {
    if (!allowRate(socket, 'vehicle:update', 80, 1000)) return;
    const now = Date.now();
    const safe = sanitizeVehicle(message.vehicle);
    if (!safe) return;
    const existing = room.vehicles.get(safe.uid);
    if (existing && (!canControl(socket, room.host, existing.owner) || existing.vehicle.type !== safe.type)) return;
    if (now - (socket.vehicleTimes.get(safe.uid) || 0) < 75) return;
    if (!socket.vehicleTimes.has(safe.uid) && socket.vehicleTimes.size >= 2048) {
      pruneTimes(socket.vehicleTimes, now, 10_000);
      if (socket.vehicleTimes.size >= 2048) return;
    }
    if (room.vehicles.size >= 1024 && !existing) return;
    socket.vehicleTimes.set(safe.uid, now);
    if (safe.type === 'storage') {
      if (!room.vehicleContainers.has(safe.uid)) {
        room.vehicleContainers.set(safe.uid, Array.isArray(safe.slots) ? safe.slots.map(cleanStack) : new Array(27).fill(null));
      }
      safe.slots = room.vehicleContainers.get(safe.uid);
    }
    const record = { vehicle: safe, riding: !!message.riding, owner: socket.clientId };
    room.vehicles.set(safe.uid, record);
    broadcast(room.clients, { type: 'vehicle:update', ...record }, socket);
  }

  function handleVehicleRemove(socket, message, requestId, room) {
    const { uid } = message;
    const existing = validEntityId(uid, 100) ? room.vehicles.get(uid) : null;
    if (!existing || !canControl(socket, room.host, existing.owner, true)) return;
    room.vehicles.delete(uid);
    const stored = room.vehicleContainers.get(uid);
    if (stored) {
      room.vehicleContainers.delete(uid);
      for (const stack of stored) if (stack) spawnServerDrop(room, existing.vehicle.pos, stack);
    }
    for (const peer of room.clients) peer.vehicleTimes.delete(uid);
    broadcast(room.clients, { type: 'vehicle:remove', uid }, socket);
  }

  function handleTntIgnite(socket, message, requestId, room) {
    const now = Date.now();
    const { x, y, z } = message;
    if (socket === room.host || now - socket.lastTntAt < 500 || !socket.lastState || !validRoomBlockEdit(room, x, y, z, 0, 0)
      || Math.hypot(x + 0.5 - socket.lastState.x, z + 0.5 - socket.lastState.z) > TNT_RANGE) return;
    socket.lastTntAt = now;
    send(room.host, { type: 'tnt:ignite', x, y, z });
  }

  function handlePlayerDamage(socket, message, requestId, room) {
    if (socket !== room.host || typeof message.targetId !== 'string' || !Number.isFinite(message.amount) || message.amount <= 0 || message.amount > 40) return;
    if (!allowRate(socket, 'player:damage', 60, 1000)) return;
    const source = ['mob', 'fall', 'fire', 'blast', 'projectile'].includes(message.source) ? message.source : 'mob';
    const target = [...room.clients].find(peer => peer.clientId === message.targetId);
    if (target) send(target, { type: 'player:damage', amount: message.amount, source });
  }

  function handleMobAttack(socket, message, requestId, room) {
    const now = Date.now();
    if (socket === room.host || now - socket.lastAttackAt < 350 || !socket.lastState || !validEntityId(message.uid, 80)) return;
    socket.lastAttackAt = now;
    const enchants = normalizeEnchants(message.enchants);
    send(room.host, {
      type: 'mob:attack', attacker: { id: socket.clientId, name: socket.playerName, ...socket.lastState },
      uid: message.uid, heldId: isInt(message.heldId, 0, 4095) ? message.heldId : null, ranged: !!message.ranged,
      ...(message.ranged && Number.isFinite(message.damage) ? { damage: clamp(message.damage, 0, 24, 4) } : {}),
      ...(message.ranged && isInt(message.punch, 0, 2) ? { punch: message.punch } : {}),
      ...(message.ranged && message.flame ? { flame: true } : {}),
      ...(enchants ? { enchants } : {}),
    });
  }

  function handleMobSnapshot(socket, message, requestId, room) {
    if (room.host !== socket) return fail(socket, requestId, 'Only the host can publish shared mob state.');
    if (!allowRate(socket, 'mob:snapshot', 40, 1000)) return;
    if (!Array.isArray(message.mobs) || message.mobs.length > MAX_MOBS_SNAPSHOT) return fail(socket, requestId, 'Invalid shared mob snapshot.');
    const mobs = sanitizeMobs(message.mobs);
    if (mobs.length !== message.mobs.length || new Set(mobs.map(mob => mob.uid)).size !== mobs.length) return fail(socket, requestId, 'Invalid or duplicate mob in snapshot.');
    room.mobs = mobs;
    broadcast(room.clients, { type: 'mob:snapshot', mobs: room.mobs }, socket);
  }

  function handleChat(socket, message, requestId, room) {
    const now = Date.now();
    if (now - socket.lastChatAt < 500) return;
    const text = cleanText(message.text, 240);
    if (!text) return;
    socket.lastChatAt = now;
    broadcast(room.clients, { type: 'chat', id: socket.clientId, name: socket.playerName, text });
  }

  /* --------------------------- dispatch -------------------------- */

  // Maps (not plain objects) so a hostile `type` such as "constructor" can never resolve to a handler.
  const lobbyHandlers = new Map([
    ['player:claim', handleClaim], ['player:release', handleRelease], ['players:list', handlePlayersList],
    ['ping', handlePing], ['rooms:list', handleRoomsList], ['session:resume', handleSessionResume],
  ]);
  const lifecycleHandlers = new Map([
    ['room:create', handleRoomCreate], ['room:join', handleRoomJoin], ['room:leave', handleRoomLeave], ['room:close', handleRoomClose],
  ]);
  const roomHandlers = new Map([
    ['player:state', handlePlayerState], ['world:snapshot', handleWorldSnapshot], ['world:edit', handleWorldEdit],
    ['container:snapshot', handleContainerSnapshot], ['container:tx', handleContainerTx], ['room:dimension', handleRoomDimension],
    ['game:state', handleGameState], ['item:snapshot', handleItemSnapshot], ['item:spawn', handleItemSpawn],
    ['item:pickup', handleItemPickup], ['projectile:update', handleProjectileUpdate], ['projectile:remove', handleProjectileRemove],
    ['vehicle:update', handleVehicleUpdate], ['vehicle:remove', handleVehicleRemove], ['tnt:ignite', handleTntIgnite],
    ['player:damage', handlePlayerDamage], ['mob:attack', handleMobAttack], ['mob:snapshot', handleMobSnapshot], ['chat', handleChat],
  ]);

  async function handleMessage(socket, text, size) {
    if (socket.readyState !== WebSocket.OPEN) return;
    const message = parseRelayMessage(text);
    if (!message) return;
    const { type } = message;
    const requestId = typeof message.requestId === 'string' ? message.requestId.slice(0, 80) : undefined;
    socket.lastActivity = Date.now();
    try {
      const lobby = lobbyHandlers.get(type);
      const lifecycle = lifecycleHandlers.get(type);
      const inRoom = roomHandlers.get(type);
      if (!lobby && !lifecycle && !inRoom) return; // unknown message type
      if (!relaySizeAllowed(type, size)) return fail(socket, requestId, 'That message is too large.');
      if (lobby) return lobby(socket, message, requestId);
      if (!socket.playerName) return fail(socket, requestId, 'Choose an available player name before joining a room.');
      if (lifecycle) return await lifecycle(socket, message, requestId);
      if (!socket.room) return fail(socket, requestId, 'Join a room first.');
      return inRoom(socket, message, requestId, socket.room);
    } catch (error) {
      logger.warn?.('Multiplayer handler error:', type, error?.message);
      fail(socket, requestId, 'The server could not process that request.');
    }
  }

  /* -------------------------- connections ------------------------ */

  wss.on('connection', (socket, request) => {
    socket.on('error', error => logger.warn?.('Multiplayer socket error:', error.message));
    socket.authAddress = resolveClientAddress(request, trustedProxyHops);
    socket.addressKey = rateLimitKey(socket.authAddress);
    socket.playerName = null;
    socket.room = null;
    socket.clientId = null;
    socket.lastState = null;
    socket.isAlive = true;
    socket.lastActivity = Date.now();
    socket.lastStateAt = 0;
    socket.lastChatAt = 0;
    socket.lastAttackAt = 0;
    socket.lastTntAt = 0;
    socket.vehicleTimes = new Map();
    socket.projectileTimes = new Map();
    socket.rateLimits = new Map();
    socket.queue = Promise.resolve();
    socket.queued = 0;

    if (!originAllowed(request)) return closeSocket(socket, 1008, 'Origin not allowed');
    if (wss.clients.size > maxConnections) return closeSocket(socket, 1013, 'The server is full. Try again shortly.');
    if (maxConnectionsPerAddress > 0) {
      const open = connectionsByAddress.get(socket.addressKey) || 0;
      if (open >= maxConnectionsPerAddress) return closeSocket(socket, 1013, 'Too many connections from your network.');
      connectionsByAddress.set(socket.addressKey, open + 1);
    }

    socket.on('pong', () => { socket.isAlive = true; });
    socket.on('message', (data, isBinary) => {
      if (socket.closing) return;
      socket.isAlive = true;
      if (isBinary) return closeSocket(socket, 1003, 'Text messages only');
      if (!allowRate(socket, '*', MESSAGE_RATE_LIMIT, 1000) || socket.queued >= MAX_QUEUED_MESSAGES) return closeSocket(socket, 1008, 'Too many messages');
      const text = typeof data === 'string' ? data : data.toString();
      const size = typeof data === 'string' ? Buffer.byteLength(data) : data.length;
      // Per-socket serial queue: handlers that await (password hashing) can never interleave with later messages.
      socket.queued++;
      socket.queue = socket.queue
        .then(() => handleMessage(socket, text, size))
        .catch(error => logger.warn?.('Multiplayer message error:', error?.message))
        .finally(() => { socket.queued--; });
    });
    socket.on('close', () => {
      if (socket.room && socket.resumeToken) {
        suspendSocket(socket);
      } else {
        leave(socket);
        releaseName(socket);
      }
      if (maxConnectionsPerAddress > 0) {
        const open = (connectionsByAddress.get(socket.addressKey) || 1) - 1;
        if (open > 0) connectionsByAddress.set(socket.addressKey, open);
        else connectionsByAddress.delete(socket.addressKey);
      }
    });
  });

  /* ------------------------- housekeeping ------------------------ */

  let furnaceTickSeq = 0;
  const furnaceInterval = setInterval(() => {
    furnaceTickSeq++;
    for (const room of rooms.values()) {
      for (const dimName of ['overworld', 'nether']) {
        const dim = room.dimensions[dimName];
        for (const [key, furnace] of dim.furnaces) {
          if (furnace.burn <= 0 && !furnace.input && furnace.cook <= 0) continue;
          const wasBurning = furnace.burn > 0;
          const res = tickFurnace(furnace, 0.25);
          const nowBurning = res.burning;
          if (dimName === room.dimension && room.clients.size > 0 && (res.cooked > 0 || wasBurning !== nowBurning || (nowBurning && furnaceTickSeq % 2 === 0))) {
            broadcast(room.clients, { type: 'container:state', dimension: dimName, kind: 'furnace', key, state: furnace });
          }
          if (wasBurning !== nowBurning && dimName === room.dimension) {
            const [fx, fy, fz] = key.split(',').map(Number);
            const prevEdit = dim.edits.get(key);
            const meta = Array.isArray(prevEdit) ? prevEdit[1] : 0;
            const nextBlockId = nowBurning ? 62 : 61;
            dim.edits.set(key, [nextBlockId, meta]);
            broadcast(room.clients, { type: 'world:edit', dimension: dimName, edit: { x: fx, y: fy, z: fz, id: nextBlockId, meta } });
          }
        }
      }
    }
  }, 250);
  furnaceInterval.unref?.();

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.isAlive) { socket.terminate(); continue; }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30_000);
  heartbeat.unref?.();

  const maintenance = setInterval(() => {
    const now = Date.now();
    passwordLimiter.sweep(now);
    missLimiter.sweep(now);
    protectedCreateLimiter.sweep(now);
    for (const room of rooms.values()) {
      // Expire projectiles and items whose owner stopped updating them, so abandoned
      // entries cannot fill the per-room caps or be replayed to every new joiner forever.
      for (const [uid, shot] of room.projectiles) {
        if (now - shot.lastUpdate <= PROJECTILE_TTL_MS) continue;
        room.projectiles.delete(uid);
        broadcast(room.clients, { type: 'projectile:remove', uid });
      }
      for (const [uid, since] of room.itemTimes) {
        if (now - since <= ITEM_TTL_MS) continue;
        room.itemTimes.delete(uid);
        room.items.delete(uid);
        broadcast(room.clients, { type: 'item:remove', uid });
      }
    }
    for (const socket of wss.clients) {
      if (!socket.playerName && now - socket.lastActivity > UNNAMED_IDLE_MS) closeSocket(socket, 1000, 'Idle');
    }
  }, 10_000);
  maintenance.unref?.();

  const stats = () => ({
    rooms: rooms.size, players: claimedNames.size, connections: wss.clients.size,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  });

  return {
    http, wss, rooms, stats,
    close: () => new Promise(resolveClose => {
      clearInterval(furnaceInterval);
      clearInterval(heartbeat);
      clearInterval(maintenance);
      for (const room of rooms.values()) clearSuspended(room);
      for (const socket of wss.clients) {
        if (socket.room) send(socket, { type: 'room:closed', reason: 'The server is restarting.' });
        closeSocket(socket, 1001, 'Server restarting');
      }
      const force = setTimeout(() => http.closeAllConnections?.(), 3000);
      force.unref?.();
      wss.close(() => http.close(() => { clearTimeout(force); resolveClose(); }));
      http.closeIdleConnections?.();
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Entry point                                                        */
/* ------------------------------------------------------------------ */

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const service = createMultiplayerServer();
  const port = Math.max(1, Math.min(65535, Number(process.env.PORT) || 8787));
  const host = process.env.HOST || '0.0.0.0';
  service.http.on('error', error => { console.error('HTTP server error:', error.message); process.exit(1); });
  service.http.listen(port, host, () => console.log(`AiSlopcraft online server listening on ${host}:${port}`));

  // Hosting platforms send SIGTERM on every deploy/restart: tell players and exit cleanly.
  let shuttingDown = false;
  const shutdown = (reason, code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${reason}; shutting down.`);
    setTimeout(() => process.exit(code || 1), 10_000).unref();
    service.close().then(() => process.exit(code));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', reason => console.error('Unhandled rejection:', reason));
  process.on('uncaughtException', error => { console.error('Uncaught exception:', error); shutdown('Uncaught exception', 1); });
}
