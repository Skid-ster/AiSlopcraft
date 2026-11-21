import { createServer } from 'node:http';
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import { AccountStore } from './accounts.js';

const DEFAULT_DATA_DIR = resolve(process.env.AISLOPCRAFT_DATA_DIR || join(process.env.HOME || process.cwd(), '.aislopcraft'));
const DEFAULT_ACCOUNT_FILE = resolve(DEFAULT_DATA_DIR, 'accounts.json');
const AUTH_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_AUTH_ATTEMPTS_PER_WINDOW = 100;
const DEFAULT_DIST_DIR = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

const MAX_ROOMS = 5;
const MAX_PLAYERS = 5;
const MAX_EDITS = 50_000;
const MAX_MESSAGE = 1024 * 1024;
const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const cleanText = (value, max = 24) => String(value ?? '').replace(/[<>\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
const SHADER_STYLES = new Set(['classic', 'vibrant', 'cinematic', 'shader', 'psx']);
const MAX_SHARED_ATLAS_BYTES = 512 * 1024;
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
  visuals.resourcePack = { name: cleanText(pack.name, 60) || 'Host texture pack', atlasData: pack.atlasData };
  return visuals;
}
const validRoom = value => /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(String(value ?? ''));
const MAX_SOCKET_BUFFER_BYTES = 2 * 1024 * 1024;
function sendEncoded(socket, payload) {
  if (socket.readyState !== WebSocket.OPEN) return;
  if (socket.bufferedAmount > MAX_SOCKET_BUFFER_BYTES) {
    socket.close(1013, 'Connection too slow; please rejoin.');
    return;
  }
  socket.send(payload);
}
const send = (socket, message) => sendEncoded(socket, JSON.stringify(message));
function broadcast(peers, message, exclude = null) {
  const payload = JSON.stringify(message);
  for (const peer of peers) if (peer !== exclude) sendEncoded(peer, payload);
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
const roomSummary = room => ({
  code: room.code, name: room.name, players: room.clients.size, maxPlayers: MAX_PLAYERS,
  gameMode: room.gameMode, access: room.access, passwordProtected: Boolean(room.password), visualMode: room.visuals?.mode || 'individual',
});

function createCode(rooms) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const bytes = randomBytes(6);
    const code = [...bytes].map(byte => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join('');
    if (!rooms.has(code)) return code;
  }
  throw new Error('Could not allocate a room code. Try again.');
}

function passwordRecord(password) {
  if (!password) return null;
  const salt = randomBytes(16);
  return { salt, hash: scryptSync(password, salt, 32) };
}

function passwordMatches(record, password) {
  if (!record) return !password;
  if (!password) return false;
  const candidate = scryptSync(password, record.salt, 32);
  return timingSafeEqual(record.hash, candidate);
}

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

export function createMultiplayerServer({ logger = console, staticDir = DEFAULT_DIST_DIR, accountFile = DEFAULT_ACCOUNT_FILE,
  trustedProxyHops = Number(process.env.AISLOPCRAFT_TRUST_PROXY_HOPS) || 0 } = {}) {
  const rooms = new Map();
  const accounts = new AccountStore(accountFile);
  const authAttempts = new Map();
  const roomPasswordAttempts = new Map();
  const http = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://localhost');
    const json = (status, body) => {
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify(body));
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('allow', 'GET, HEAD');
      json(405, { error: 'method not allowed' });
      return;
    }
    if (url.pathname === '/health') {
      let ready = false;
      try { ready = Boolean(staticDir && statSync(resolve(staticDir, 'index.html')).isFile()); } catch {}
      json(ready ? 200 : 503, {
        service: 'aislopcraft-online', status: ready ? 'ok' : 'not_ready',
        rooms: rooms.size, maxRooms: MAX_ROOMS, maxPlayersPerRoom: MAX_PLAYERS,
      });
      return;
    }
    if (!staticDir || !existsSync(staticDir)) {
      json(503, { error: 'Game build is unavailable. Build the site with npm run build.' });
      return;
    }

    let pathname;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { response.writeHead(400); response.end('Bad path'); return; }
    if (pathname.includes('\0')) { response.writeHead(400); response.end('Bad path'); return; }

    let root;
    let file = resolve(staticDir, `.${pathname}`);
    try {
      root = realpathSync(staticDir);
      if (existsSync(file) && statSync(file).isDirectory()) file = resolve(file, 'index.html');
      if (!existsSync(file) && !extname(pathname)) file = resolve(root, 'index.html');
      if (!existsSync(file)) { json(404, { error: 'not found' }); return; }
      file = realpathSync(file);
      const inRoot = file === root || file.startsWith(`${root}${sep}`);
      if (!inRoot) { json(403, { error: 'forbidden' }); return; }
      if (!statSync(file).isFile()) { json(404, { error: 'not found' }); return; }
    } catch {
      json(404, { error: 'not found' });
      return;
    }

    const extension = extname(file).toLowerCase();
    const isHashedAsset = /-[A-Za-z0-9_-]{8,}\.[^.]+$/.test(file);
    response.writeHead(200, {
      'content-type': MIME_TYPES[extension] || 'application/octet-stream',
      'cache-control': extension === '.html' ? 'no-cache' : isHashedAsset ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
    });
    if (request.method === 'HEAD') { response.end(); return; }
    const stream = createReadStream(file);
    stream.on('error', () => { if (!response.headersSent) response.writeHead(500); response.end(); });
    stream.pipe(response);
  });
  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_MESSAGE, perMessageDeflate: false });

  function leave(socket, announce = true) {
    const room = socket.room;
    if (!room) return;
    if (room.host !== socket && socket.clientId) {
      for (const [uid, record] of room.vehicles) {
        if (record.owner !== socket.clientId || !record.riding) continue;
        record.riding = false; record.owner = room.host.clientId;
        for (const peer of room.clients) if (peer !== socket) send(peer, { type: 'vehicle:update', ...record });
      }
      for (const [uid, shot] of room.projectiles) {
        if (shot.sourceId !== socket.clientId) continue;
        room.projectiles.delete(uid);
        for (const peer of room.clients) if (peer !== socket) send(peer, { type: 'projectile:remove', uid });
      }
    }
    room.clients.delete(socket);
    socket.room = null;
    if (announce && room.clients.size) {
      for (const peer of room.clients) send(peer, { type: 'player:left', id: socket.clientId, name: socket.playerName });
    }
    if (!room.clients.size || room.host === socket) {
      for (const peer of room.clients) {
        send(peer, { type: 'room:closed', reason: 'The host left.' });
        peer.room = null;
        peer.close(1000, 'Host left');
      }
      rooms.delete(room.code);
    }
  }

  function fail(socket, requestId, message) {
    send(socket, { type: 'error', requestId, message });
  }

  function allowRoomPasswordAttempt(address, code) {
    const now = Date.now();
    const key = `${address}:${code}`;
    if (roomPasswordAttempts.size >= 10_000 && !roomPasswordAttempts.has(key)) {
      for (const [entry, attempt] of roomPasswordAttempts) if (now - attempt.startedAt >= 60_000) roomPasswordAttempts.delete(entry);
      if (roomPasswordAttempts.size >= 10_000) return false;
    }
    let attempt = roomPasswordAttempts.get(key);
    if (!attempt || now - attempt.startedAt >= 60_000) {
      attempt = { startedAt: now, count: 0 };
      roomPasswordAttempts.set(key, attempt);
    }
    if (attempt.count >= 12) return false;
    attempt.count++;
    return true;
  }

  function sendRoomSnapshot(socket) {
    const publicRooms = [...rooms.values()]
      .filter(room => room.access === 'public' && room.clients.size < MAX_PLAYERS)
      .map(roomSummary).sort((a, b) => b.players - a.players || a.name.localeCompare(b.name));
    send(socket, { type: 'rooms:list', requestId: socket.pendingRequestId, rooms: publicRooms });
    socket.pendingRequestId = null;
  }

  function join(socket, room, name, requestId) {
    if (room.clients.size >= MAX_PLAYERS) return fail(socket, requestId, 'That room is full.');
    if (socket.room) leave(socket);
    const id = randomBytes(8).toString('hex');
    socket.room = room;
    socket.clientId = id;
    socket.playerName = name;
    room.clients.add(socket);
    send(socket, {
      type: 'room:joined', requestId, id, code: room.code, name: room.name,
      playerName: name, role: socket === room.host ? 'host' : 'guest',
      gameMode: room.gameMode, seed: room.seed, access: room.access, visuals: room.visuals,
      players: [...room.clients].map(peer => ({ id: peer.clientId, name: peer.playerName, role: peer === room.host ? 'host' : 'player' })),
    });
    if (socket !== room.host) {
      const edits = [...room.edits.entries()];
      for (let index = 0; index < edits.length; index += 160) {
        send(socket, { type: 'world:snapshot', entries: edits.slice(index, index + 160), done: index + 160 >= edits.length });
      }
      if (!edits.length) send(socket, { type: 'world:snapshot', entries: [], done: true });
      const items = [...room.items.values()];
      send(socket, { type: 'item:snapshot', items, done: true });
      if (room.gameState) send(socket, { type: 'game:state', state: room.gameState });
      send(socket, { type: 'mob:snapshot', mobs: room.mobs });
      send(socket, { type: 'vehicle:snapshot', vehicles: [...room.vehicles.values()] });
      send(socket, { type: 'projectile:snapshot', projectiles: [...room.projectiles.values()].map(({ sourceId, ...shot }) => shot) });
    }
    for (const peer of room.clients) {
      if (peer === socket) continue;
      send(peer, { type: 'player:joined', id, name, role: socket === room.host ? 'host' : 'player' });
      if (peer.lastState) send(socket, { type: 'player:state', id: peer.clientId, name: peer.playerName, ...peer.lastState });
    }
  }

  function allowAuthAttempt(address) {
    const now = Date.now();
    if (authAttempts.size >= 10_000 && !authAttempts.has(address)) {
      for (const [key, attempt] of authAttempts) if (now - attempt.startedAt >= AUTH_ATTEMPT_WINDOW_MS) authAttempts.delete(key);
      if (authAttempts.size >= 10_000) return false;
    }
    let attempt = authAttempts.get(address);
    if (!attempt || now - attempt.startedAt >= AUTH_ATTEMPT_WINDOW_MS) {
      attempt = { startedAt: now, count: 0 };
      authAttempts.set(address, attempt);
    }
    if (attempt.count >= MAX_AUTH_ATTEMPTS_PER_WINDOW) return false;
    attempt.count++;
    return true;
  }

  wss.on('connection', (socket, request) => {
    socket.authAddress = resolveClientAddress(request, trustedProxyHops);
    socket.account = null;
    socket.sessionDigest = null;
    socket.isAlive = true;
    socket.lastStateAt = 0;
    socket.lastChatAt = 0;
    socket.lastAttackAt = 0;
    socket.lastTntAt = 0;
    socket.vehicleTimes = new Map();
    socket.projectileTimes = new Map();
    socket.rateLimits = new Map();
    socket.authPending = false;
    socket.on('pong', () => { socket.isAlive = true; });
    socket.on('message', async buffer => {
      if (buffer.length > MAX_MESSAGE) { socket.close(1009, 'Message too large'); return; }
      let message;
      try { message = JSON.parse(buffer.toString()); } catch { return; }
      if (!message || typeof message.type !== 'string') return;
      const requestId = typeof message.requestId === 'string' ? message.requestId.slice(0, 80) : undefined;

      if (message.type === 'auth:signup' || message.type === 'auth:login') {
        if (socket.account || socket.authPending) return fail(socket, requestId, 'You are already signed in or signing in on this connection.');
        if (!allowAuthAttempt(socket.authAddress)) return fail(socket, requestId, 'Too many sign-in attempts. Please wait 15 minutes and try again.');
        socket.authPending = true;
        try {
          const result = message.type === 'auth:signup'
            ? await accounts.signup(message.username, message.password)
            : await accounts.login(message.username, message.password);
          socket.account = result.account;
          socket.sessionDigest = result.sessionDigest;
          send(socket, { type: 'auth:success', requestId, account: result.account, token: result.token });
        } catch (error) { fail(socket, requestId, error.message); }
        finally { socket.authPending = false; }
        return;
      }
      if (message.type === 'auth:resume') {
        if (socket.account) return fail(socket, requestId, 'You are already signed in on this connection.');
        try {
          const result = accounts.resume(message.token);
          socket.account = result.account;
          socket.sessionDigest = result.sessionDigest;
          send(socket, { type: 'auth:success', requestId, account: result.account });
        } catch (error) { fail(socket, requestId, error.message); }
        return;
      }
      if (message.type === 'auth:logout') {
        if (!socket.account) return fail(socket, requestId, 'You are not signed in.');
        if (socket.room) return fail(socket, requestId, 'Leave your multiplayer room before signing out.');
        accounts.logout(socket.sessionDigest);
        socket.account = null;
        socket.sessionDigest = null;
        send(socket, { type: 'auth:logged-out', requestId });
        return;
      }
      if (!socket.account) return fail(socket, requestId, 'Sign up or log in before using multiplayer.');
      if (message.type === 'ping') {
        send(socket, { type: 'pong', requestId, serverTime: Date.now() });
        return;
      }

      if (message.type === 'rooms:list') {
        socket.pendingRequestId = requestId;
        sendRoomSnapshot(socket);
      } else if (message.type === 'room:create') {
        if (socket.room) return fail(socket, requestId, 'Leave your current room first.');
        const playerName = socket.account.username;
        const name = cleanText(message.name, 32) || `${playerName}’s world`;
        const password = String(message.password ?? '').slice(0, 64);
        const access = message.access === 'private' ? 'private' : 'public';
        const gameMode = message.gameMode === 'creative' ? 'creative' : 'survival';
        const seed = cleanText(message.seed, 80) || 'Beta 1.7.3';
        if (!playerName) return fail(socket, requestId, 'Choose a player name.');
        if (password.length && password.length < 4) return fail(socket, requestId, 'Passwords must be at least four characters.');
        if (rooms.size >= MAX_ROOMS) return fail(socket, requestId, `All ${MAX_ROOMS} rooms are in use. Try again later.`);
        try {
          const room = {
            code: createCode(rooms), name, playerName, access, gameMode, seed,
            visuals: sanitizeVisualSettings(message.visuals),
            password: passwordRecord(password), clients: new Set(), edits: new Map(), items: new Map(),
            gameState: null, mobs: [], vehicles: new Map(), projectiles: new Map(), host: socket,
          };
          rooms.set(room.code, room);
          join(socket, room, playerName, requestId);
        } catch (error) { fail(socket, requestId, error.message); }
      } else if (message.type === 'room:join') {
        const code = String(message.code ?? '').trim().toUpperCase();
        const room = rooms.get(code);
        const playerName = socket.account.username;
        if (!validRoom(code) || !room) return fail(socket, requestId, 'Room not found. Check the code or ask the host to reopen it.');
        if (room.password && !allowRoomPasswordAttempt(socket.authAddress, code)) return fail(socket, requestId, 'Too many room password attempts. Wait a minute and try again.');
        if (!passwordMatches(room.password, String(message.password ?? '').slice(0, 64))) return fail(socket, requestId, 'Incorrect room password.');
        join(socket, room, playerName, requestId);
      } else if (message.type === 'room:leave') {
        leave(socket);
        send(socket, { type: 'room:left', requestId });
      } else if (message.type === 'room:close') {
        if (!socket.room || socket.room.host !== socket) return fail(socket, requestId, 'Only the host can close this room.');
        const room = socket.room;
        for (const peer of room.clients) {
          send(peer, { type: 'room:closed', reason: 'The host closed the room.' });
          peer.room = null;
          if (peer !== socket) peer.close(1000, 'Room closed');
        }
        rooms.delete(room.code);
        socket.room = null;
        send(socket, { type: 'room:left', requestId });
      } else if (!socket.room) {
        fail(socket, requestId, 'Join a room first.');
      } else if (message.type === 'player:state') {
        const now = Date.now();
        if (now - socket.lastStateAt < 40) return;
        const state = message.state;
        if (!state || ![state.x, state.y, state.z, state.yaw, state.pitch].every(Number.isFinite)) return;
        if (Math.abs(state.x) > 30_000_000 || Math.abs(state.z) > 30_000_000 || state.y < -128 || state.y > 512) return;
        socket.lastStateAt = now;
        socket.lastState = { x: state.x, y: state.y, z: state.z, yaw: state.yaw, pitch: state.pitch, dead: !!state.dead };
        broadcast(socket.room.clients, { type: 'player:state', id: socket.clientId, name: socket.playerName, ...socket.lastState }, socket);
      } else if (message.type === 'world:snapshot') {
        if (socket.room.host !== socket) return fail(socket, requestId, 'Only the host can publish the initial world snapshot.');
        if (!allowRate(socket, 'world:snapshot', 60, 15_000)) return fail(socket, requestId, 'World setup is sending too quickly. Please retry.');
        if (!Array.isArray(message.entries) || message.entries.length > 1000) return fail(socket, requestId, 'Invalid world snapshot batch.');
        const batch = [];
        const batchKeys = new Set();
        for (const entry of message.entries) {
          if (!Array.isArray(entry) || entry.length < 2) return fail(socket, requestId, 'The world contains an invalid block edit.');
          const [key, value] = entry;
          const match = typeof key === 'string' && /^-?\d{1,9},\d{1,3},-?\d{1,9}$/.exec(key);
          const id = Array.isArray(value) ? value[0] : value;
          const meta = Array.isArray(value) ? (value[1] ?? 0) : 0;
          const [x, y, z] = match ? key.split(',').map(Number) : [];
          if (!match || ![x, y, z, id, meta].every(Number.isInteger) || y < 0 || y >= 128 || id < 0 || id > 255 || meta < 0 || meta > 255 || Math.abs(x) > 30_000_000 || Math.abs(z) > 30_000_000) {
            return fail(socket, requestId, 'The world contains an invalid block edit.');
          }
          batch.push([key, [id, meta]]);
          batchKeys.add(key);
        }
        const newKeys = [...batchKeys].filter(key => !socket.room.edits.has(key));
        if (socket.room.edits.size + newKeys.length > MAX_EDITS) return fail(socket, requestId, 'The shared world edit limit has been reached.');
        for (const [key, edit] of batch) socket.room.edits.set(key, edit);
        broadcast(socket.room.clients, { type: 'world:snapshot', entries: batch, done: false }, socket);
        send(socket, { type: 'world:snapshot:accepted', requestId, count: batch.length });
      } else if (message.type === 'world:edit') {
        const edit = message.edit;
        if (!allowRate(socket, 'world:edit', 80, 1000)) return;
        if (!edit || ![edit.x, edit.y, edit.z, edit.id, edit.meta ?? 0].every(Number.isInteger)) return;
        if (edit.y < 0 || edit.y >= 128 || edit.id < 0 || edit.id > 255 || Math.abs(edit.x) > 30_000_000 || Math.abs(edit.z) > 30_000_000) return;
        const key = `${edit.x},${edit.y},${edit.z}`;
        if (!socket.room.edits.has(key) && socket.room.edits.size >= MAX_EDITS) return fail(socket, requestId, 'The shared world edit limit has been reached.');
        socket.room.edits.set(key, [edit.id, edit.meta || 0]);
        broadcast(socket.room.clients, { type: 'world:edit', edit }, socket);
      } else if (message.type === 'game:state') {
        if (!allowRate(socket, 'game:state', 8, 1000)) return;
        if (!message.state || typeof message.state !== 'object' || Array.isArray(message.state) || JSON.stringify(message.state).length > 96_000) return fail(socket, requestId, 'Invalid shared world state.');
        socket.room.gameState = message.state;
        broadcast(socket.room.clients, { type: 'game:state', state: message.state }, socket);
      } else if (message.type === 'item:snapshot') {
        if (socket.room.host !== socket) return fail(socket, requestId, 'Only the host can publish shared item state.');
        if (!Array.isArray(message.items) || message.items.length > 4096) return fail(socket, requestId, 'Invalid shared item snapshot.');
        const items = new Map();
        for (const item of message.items) {
          if (!item || typeof item.uid !== 'string' || item.uid.length > 80 || !Number.isInteger(item.id) || item.id < 0 || item.id > 4095 || !Number.isInteger(item.count) || item.count < 1 || item.count > 999 || !Array.isArray(item.pos) || item.pos.length !== 3 || !item.pos.every(Number.isFinite) || item.pos.some(value => Math.abs(value) > 30_000_000)) continue;
          items.set(item.uid, { uid: item.uid, id: item.id, count: item.count, damage: Number.isInteger(item.damage) ? Math.max(0, item.damage) : 0, pos: item.pos, vy: Number.isFinite(item.vy) ? Math.max(-80, Math.min(80, item.vy)) : 0, age: Number.isFinite(item.age) ? Math.max(0, Math.min(300, item.age)) : 0 });
        }
        socket.room.items = items;
        for (const peer of socket.room.clients) if (peer !== socket) send(peer, { type: 'item:snapshot', items: [...items.values()], done: true });
      } else if (message.type === 'item:spawn') {
        if (!allowRate(socket, 'item:spawn', 24, 1000)) return;
        const source = message.item;
        if (!source || typeof source.uid !== 'string' || source.uid.length > 80 || !Number.isInteger(source.id) || source.id < 0 || source.id > 4095 || !Number.isInteger(source.count) || source.count < 1 || source.count > 999 || !Array.isArray(source.pos) || source.pos.length !== 3 || !source.pos.every(Number.isFinite) || source.pos.some(value => Math.abs(value) > 30_000_000)) return;
        if (socket.room.items.size >= 4096) return fail(socket, requestId, 'The shared item limit has been reached.');
        const uid = `${socket.clientId}:${source.uid}`;
        const item = { uid, id: source.id, count: source.count, damage: Number.isInteger(source.damage) ? Math.max(0, source.damage) : 0, pos: source.pos, vy: Number.isFinite(source.vy) ? Math.max(-80, Math.min(80, source.vy)) : 0, age: Number.isFinite(source.age) ? Math.max(0, Math.min(300, source.age)) : 0 };
        socket.room.items.set(uid, item);
        for (const peer of socket.room.clients) send(peer, { type: 'item:spawn', item });
      } else if (message.type === 'item:pickup') {
        if (!allowRate(socket, 'item:pickup', 12, 1000)) return;
        const item = socket.room.items.get(String(message.uid ?? ''));
        if (!item || !socket.lastState || Math.hypot(item.pos[0] - socket.lastState.x, item.pos[1] - socket.lastState.y, item.pos[2] - socket.lastState.z) > 5) return;
        socket.room.items.delete(item.uid);
        send(socket, { type: 'item:pickup', item });
        for (const peer of socket.room.clients) if (peer !== socket) send(peer, { type: 'item:remove', uid: item.uid });
      } else if (message.type === 'projectile:update') {
        if (!allowRate(socket, 'projectile:update', 40, 1000)) return;
        const now = Date.now();
        const shot = message.projectile;
        if (!shot || typeof shot.uid !== 'string' || shot.uid.length > 100 || !['player','mob'].includes(shot.owner) || !Array.isArray(shot.pos) || shot.pos.length !== 3 || !shot.pos.every(Number.isFinite) || shot.pos.some(value => Math.abs(value) > 30_000_000) || !Array.isArray(shot.vel) || shot.vel.length !== 3 || !shot.vel.every(Number.isFinite) || shot.vel.some(value => Math.abs(value) > 80)) return;
        const existing = socket.room.projectiles.get(shot.uid);
        // A room member may update only their own projectile. Without this
        // check, a peer who learns a UID from a snapshot can replace or erase
        // another player's projectile and desynchronize the shared simulation.
        if (existing && existing.sourceId !== socket.clientId && socket !== socket.room.host) return;
        if (now - (socket.projectileTimes.get(shot.uid) || 0) < 80) return;
        if (!socket.projectileTimes.has(shot.uid) && socket.projectileTimes.size >= 512) return;
        socket.projectileTimes.set(shot.uid, now);
        if (socket.room.projectiles.size >= 256 && !existing) return;
        const projectile = { uid: shot.uid, owner: shot.owner, pos: shot.pos, vel: shot.vel, age: Number.isFinite(shot.age) ? Math.max(0, Math.min(6, shot.age)) : 0, targetId: typeof shot.targetId === 'string' ? shot.targetId.slice(0, 80) : null, damage: Number.isFinite(shot.damage) ? Math.max(0, Math.min(40, shot.damage)) : 2, sourceId: existing?.sourceId ?? socket.clientId };
        socket.room.projectiles.set(projectile.uid, projectile);
        const { sourceId, ...publicProjectile } = projectile;
        for (const peer of socket.room.clients) if (peer !== socket) send(peer, { type: 'projectile:update', projectile: publicProjectile });
      } else if (message.type === 'projectile:remove') {
        const uid = typeof message.uid === 'string' ? message.uid.slice(0, 100) : '';
        const projectile = socket.room.projectiles.get(uid);
        if (projectile && (projectile.sourceId === socket.clientId || socket === socket.room.host)) {
          socket.room.projectiles.delete(uid);
          for (const peer of socket.room.clients) peer.projectileTimes.delete(uid);
          broadcast(socket.room.clients, { type: 'projectile:remove', uid }, socket);
        }
      } else if (message.type === 'vehicle:update') {
        if (!allowRate(socket, 'vehicle:update', 80, 1000)) return;
        const now = Date.now();
        const vehicle = message.vehicle;
        if (!vehicle || typeof vehicle.uid !== 'string' || vehicle.uid.length > 100 || !['boat','minecart','storage','powered'].includes(vehicle.type) || !Array.isArray(vehicle.pos) || vehicle.pos.length !== 3 || !vehicle.pos.every(Number.isFinite) || vehicle.pos.some(value => Math.abs(value) > 30_000_000) || !Number.isFinite(vehicle.rotation)) return;
        if (now - (socket.vehicleTimes.get(vehicle.uid) || 0) < 75) return;
        if (!socket.vehicleTimes.has(vehicle.uid) && socket.vehicleTimes.size >= 2048) return;
        socket.vehicleTimes.set(vehicle.uid, now);
        if (socket.room.vehicles.size >= 1024 && !socket.room.vehicles.has(vehicle.uid)) return;
        const directions = [[1,0],[-1,0],[0,1],[0,-1]];
        const safeDirection = value => Array.isArray(value) && value.length === 2 && directions.some(([x,z]) => x === value[0] && z === value[1]);
        const safeVehicle = { uid: vehicle.uid, type: vehicle.type, pos: vehicle.pos, rotation: vehicle.rotation % (Math.PI * 2),
          vx: Number.isFinite(vehicle.vx) ? Math.max(-20, Math.min(20, vehicle.vx)) : 0,
          vz: Number.isFinite(vehicle.vz) ? Math.max(-20, Math.min(20, vehicle.vz)) : 0,
          ...(vehicle.type === 'storage' && Array.isArray(vehicle.slots) && vehicle.slots.length === 27 ? { slots: vehicle.slots } : {}),
          ...(vehicle.type === 'powered' ? { fuel: Number.isFinite(vehicle.fuel) ? Math.max(0, Math.min(3600, vehicle.fuel)) : 0 } : {}),
          ...(vehicle.type !== 'boat' ? {
            nodeX: Number.isInteger(vehicle.nodeX) ? Math.max(-30_000_000, Math.min(30_000_000, vehicle.nodeX)) : Math.floor(vehicle.pos[0]),
            nodeZ: Number.isInteger(vehicle.nodeZ) ? Math.max(-30_000_000, Math.min(30_000_000, vehicle.nodeZ)) : Math.floor(vehicle.pos[2]),
            target: safeDirection(vehicle.target) ? vehicle.target : null,
            progress: Number.isFinite(vehicle.progress) ? Math.max(0, Math.min(.999, vehicle.progress)) : 0,
            travel: safeDirection(vehicle.travel) ? vehicle.travel : [0,-1],
            cartSpeed: Number.isFinite(vehicle.cartSpeed) ? Math.max(0, Math.min(8, vehicle.cartSpeed)) : 0,
          } : {}) };
        socket.room.vehicles.set(vehicle.uid, { vehicle: safeVehicle, riding: !!message.riding, owner: socket.clientId });
        for (const peer of socket.room.clients) if (peer !== socket) send(peer, { type: 'vehicle:update', ...socket.room.vehicles.get(vehicle.uid) });
      } else if (message.type === 'vehicle:remove') {
        const uid = typeof message.uid === 'string' ? message.uid.slice(0, 100) : '';
        if (uid && socket.room.vehicles.delete(uid)) {
          for (const peer of socket.room.clients) peer.vehicleTimes.delete(uid);
          broadcast(socket.room.clients, { type: 'vehicle:remove', uid }, socket);
        }
      } else if (message.type === 'tnt:ignite') {
        const now = Date.now();
        const { x, y, z } = message;
        if (socket === socket.room.host || now - socket.lastTntAt < 500 || !socket.lastState || ![x, y, z].every(Number.isInteger) || y < 0 || y >= 128 || Math.hypot(x + 0.5 - socket.lastState.x, z + 0.5 - socket.lastState.z) > 7) return;
        socket.lastTntAt = now;
        send(socket.room.host, { type: 'tnt:ignite', x, y, z });
      } else if (message.type === 'player:damage') {
        if (socket !== socket.room.host || typeof message.targetId !== 'string' || !Number.isFinite(message.amount) || message.amount <= 0 || message.amount > 40) return;
        const target = [...socket.room.clients].find(peer => peer.clientId === message.targetId);
        if (target) send(target, { type: 'player:damage', amount: message.amount });
      } else if (message.type === 'mob:attack') {
        const now = Date.now();
        if (socket === socket.room.host || now - socket.lastAttackAt < 350 || !socket.lastState || typeof message.uid !== 'string' || message.uid.length > 80) return;
        socket.lastAttackAt = now;
        send(socket.room.host, { type: 'mob:attack', attacker: { id: socket.clientId, name: socket.playerName, ...socket.lastState }, uid: message.uid, heldId: Number.isInteger(message.heldId) ? message.heldId : null, ranged: !!message.ranged });
      } else if (message.type === 'mob:snapshot') {
        if (socket.room.host !== socket) return fail(socket, requestId, 'Only the host can publish shared mob state.');
        if (!Array.isArray(message.mobs) || message.mobs.length > 18) return fail(socket, requestId, 'Invalid shared mob snapshot.');
        socket.room.mobs = message.mobs.filter(mob => mob && typeof mob.uid === 'string' && mob.uid.length <= 80 && typeof mob.type === 'string' && Array.isArray(mob.pos) && mob.pos.length === 3 && mob.pos.every(Number.isFinite) && [mob.yaw, mob.hp].every(Number.isFinite)).map(mob => ({ uid: mob.uid, type: mob.type, pos: mob.pos.map(value => Math.max(-30_000_000, Math.min(30_000_000, value))), yaw: mob.yaw, hp: Math.max(0, Math.min(1000, mob.hp)), sheared: !!mob.sheared, fuse: Number.isFinite(mob.fuse) ? mob.fuse : -1 }));
        for (const peer of socket.room.clients) if (peer !== socket) send(peer, { type: 'mob:snapshot', mobs: socket.room.mobs });
      } else if (message.type === 'chat') {
        const now = Date.now();
        if (now - socket.lastChatAt < 500) return;
        const text = cleanText(message.text, 240);
        if (!text) return;
        socket.lastChatAt = now;
        for (const peer of socket.room.clients) send(peer, { type: 'chat', id: socket.clientId, name: socket.playerName, text });
      }
    });
    socket.on('close', () => leave(socket));
    socket.on('error', error => logger.warn?.('Multiplayer socket error:', error.message));
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.isAlive) { socket.terminate(); continue; }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30_000);
  heartbeat.unref?.();

  return { http, wss, rooms, close: () => new Promise(resolve => {
    clearInterval(heartbeat);
    for (const socket of wss.clients) socket.close();
    wss.close(() => http.close(() => resolve()));
  }) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const service = createMultiplayerServer();
  const port = Math.max(1, Math.min(65535, Number(process.env.PORT) || 8787));
  const host = process.env.HOST || '0.0.0.0';
  service.http.listen(port, host, () => console.log(`AiSlopcraft online server listening on ${host}:${port}`));
}
