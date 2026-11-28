// Portable world-save file format and defensive validation for browser storage/imports.
import { BETA_HEIGHT, OVERWORLD_TERRAIN, worldHeight } from './world/world-profile.js';
import { cloneEnchants } from './enchanting.js';

export const WORLD_SAVE_FORMAT = 'aislopcraft-world-save';
export const WORLD_SAVE_VERSION = 2;
export const MAX_WORLD_SAVE_BYTES = 16 * 1024 * 1024;

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validPosition = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
  && value.every(axis => Math.abs(axis) <= 30_000_000);
const validCoordKey = key => typeof key === 'string' && /^-?\d+,\d+,-?\d+$/.test(key)
  && key.split(',').map(Number).every(Number.isSafeInteger);

export function cleanStack(stack) {
  if (stack == null) return null;
  if (!isObject(stack) || !Number.isInteger(stack.id) || stack.id < 0 || stack.id > 65535
      || !Number.isInteger(stack.count) || stack.count < 1 || stack.count > 64) return null;
  const enchants = cloneEnchants(stack.enchants);
  return {
    id: stack.id,
    count: stack.count,
    damage: Number.isInteger(stack.damage) ? Math.max(0, Math.min(65535, stack.damage)) : 0,
    ...(enchants ? { enchants } : {}),
  };
}

function cleanSlots(slots, expected) {
  if (!Array.isArray(slots) || slots.length !== expected) return null;
  return slots.map(cleanStack);
}

function cleanDimensionPayload(raw, maxHeight = BETA_HEIGHT) {
  if (!isObject(raw)) return null;
  const edits = [];
  if (Array.isArray(raw.edits)) {
    for (const edit of raw.edits.slice(0, 200_000)) {
      if (!Array.isArray(edit) || edit.length < 2 || !validCoordKey(edit[0])
          || !Number.isInteger(edit[1]) || edit[1] < 0 || edit[1] > 255) continue;
      const [x, y, z] = edit[0].split(',').map(Number);
      if (y < 0 || y >= maxHeight) continue;
      edits.push([`${x},${y},${z}`, edit[1], Number.isInteger(edit[2]) ? Math.max(0, Math.min(255, edit[2])) : 0]);
    }
  }
  const chests = [];
  if (Array.isArray(raw.chests)) for (const entry of raw.chests.slice(0, 20_000)) {
    if (!Array.isArray(entry) || !validCoordKey(entry[0])) continue;
    const slots = cleanSlots(entry[1], 27);
    if (slots) chests.push([entry[0], slots]);
  }
  const furnaces = [];
  if (Array.isArray(raw.furnaces)) for (const entry of raw.furnaces.slice(0, 20_000)) {
    if (!Array.isArray(entry) || !validCoordKey(entry[0]) || !isObject(entry[1])) continue;
    const furnace = entry[1];
    furnaces.push([entry[0], {
      input: cleanStack(furnace.input), output: cleanStack(furnace.output), fuel: cleanStack(furnace.fuel),
      burn: Number.isFinite(furnace.burn) ? Math.max(0, Math.min(100_000, furnace.burn)) : 0,
      burnMax: Number.isFinite(furnace.burnMax) ? Math.max(0, Math.min(100_000, furnace.burnMax)) : 0,
      cook: Number.isFinite(furnace.cook) ? Math.max(0, Math.min(6, furnace.cook)) : 0,
      storedXp: Number.isFinite(furnace.storedXp) ? Math.max(0, Math.min(10_000, furnace.storedXp)) : 0,
      soundTimer: Number.isFinite(furnace.soundTimer) ? Math.max(0, Math.min(10, furnace.soundTimer)) : 0,
    }]);
  }
  const vehicles = [];
  if (Array.isArray(raw.vehicles)) for (const vehicle of raw.vehicles.slice(0, 1024)) {
    if (!isObject(vehicle) || !['boat', 'minecart', 'storage', 'powered'].includes(vehicle.type) || !validPosition(vehicle.pos)) continue;
    const safeVehicle = {
      uid: typeof vehicle.uid === 'string' && vehicle.uid.length <= 100 ? vehicle.uid : null,
      type: vehicle.type, pos: vehicle.pos.map(Number),
      rotation: Number.isFinite(vehicle.rotation) ? vehicle.rotation : 0,
      vx: Number.isFinite(vehicle.vx) ? Math.max(-20, Math.min(20, vehicle.vx)) : 0,
      vz: Number.isFinite(vehicle.vz) ? Math.max(-20, Math.min(20, vehicle.vz)) : 0,
    };
    if (vehicle.type === 'storage') safeVehicle.slots = cleanSlots(vehicle.slots, 27) || Array(27).fill(null);
    if (vehicle.type === 'powered') safeVehicle.fuel = Number.isFinite(vehicle.fuel) ? Math.max(0, Math.min(3600, vehicle.fuel)) : 0;
    if (vehicle.type !== 'boat') {
      if (Number.isInteger(vehicle.nodeX)) safeVehicle.nodeX = vehicle.nodeX;
      if (Number.isInteger(vehicle.nodeZ)) safeVehicle.nodeZ = vehicle.nodeZ;
      if (Array.isArray(vehicle.target) && vehicle.target.length === 2 && vehicle.target.every(Number.isInteger)) safeVehicle.target = vehicle.target.slice();
      if (Number.isFinite(vehicle.progress)) safeVehicle.progress = Math.max(0, Math.min(0.999, vehicle.progress));
      if (Array.isArray(vehicle.travel) && vehicle.travel.length === 2 && vehicle.travel.every(Number.isFinite)) safeVehicle.travel = vehicle.travel.slice();
      if (Number.isFinite(vehicle.cartSpeed)) safeVehicle.cartSpeed = Math.max(0, Math.min(8, vehicle.cartSpeed));
    }
    vehicles.push(safeVehicle);
  }
  const items = [];
  if (Array.isArray(raw.items)) for (const item of raw.items.slice(0, 4096)) {
    const stack = cleanStack(item);
    if (!stack || !validPosition(item.pos)) continue;
    items.push({ ...stack, pos: item.pos.map(Number), vy: Number.isFinite(item.vy) ? Math.max(-100, Math.min(100, item.vy)) : 0,
      age: Number.isFinite(item.age) ? Math.max(0, Math.min(1_000_000, item.age)) : 0 });
  }
  return { edits, chests, furnaces, vehicles, items };
}

export function normalizeWorldSave(value) {
  if (!isObject(value) || ![1, WORLD_SAVE_VERSION].includes(value.version)
      || typeof value.seed !== 'string' || value.seed.length < 1 || value.seed.length > 128) return null;
  const terrain = value.terrain ?? null;
  const edition = value.edition === 'classic' ? 'classic' : 'beta';
  const modern = value.version === WORLD_SAVE_VERSION;
  if (modern ? (terrain !== OVERWORLD_TERRAIN || edition === 'classic') : terrain !== null) return null;
  // Keep the v1 normalizer's behavior even for legacy Classic backups.
  const height = terrain ? worldHeight(edition, terrain) : BETA_HEIGHT;
  if (!Array.isArray(value.edits) || value.edits.length > 200_000) return null;
  const edits = [];
  for (const edit of value.edits) {
    if (!Array.isArray(edit) || edit.length < 2 || !validCoordKey(edit[0])
        || !Number.isInteger(edit[1]) || edit[1] < 0 || edit[1] > (modern ? 255 : 65535)) {
      if (modern) return null;
      continue;
    }
    const [x, y, z] = edit[0].split(',').map(Number);
    if (y < 0 || y >= height) {
      if (modern) return null;
      continue;
    }
    if (modern && edit[2] !== undefined && (!Number.isInteger(edit[2]) || edit[2] < 0 || edit[2] > 255)) return null;
    edits.push([`${x},${y},${z}`, edit[1], Number.isInteger(edit[2]) ? Math.max(0, Math.min(255, edit[2])) : 0]);
  }
  const player = isObject(value.player) ? value.player : null;
  if (!player || !validPosition(player.pos)) return null;
  const inventory = cleanSlots(player.inventory, 36);
  const armor = cleanSlots(player.armor, 4);
  if (!inventory || !armor) return null;
  const chests = [];
  if (Array.isArray(value.chests)) for (const entry of value.chests.slice(0, 20_000)) {
    if (!Array.isArray(entry) || !validCoordKey(entry[0])) continue;
    const slots = cleanSlots(entry[1], 27);
    if (slots) chests.push([entry[0], slots]);
  }
  const furnaces = [];
  if (Array.isArray(value.furnaces)) for (const entry of value.furnaces.slice(0, 20_000)) {
    if (!Array.isArray(entry) || !validCoordKey(entry[0]) || !isObject(entry[1])) continue;
    const furnace = entry[1];
    furnaces.push([entry[0], {
      input: cleanStack(furnace.input), output: cleanStack(furnace.output), fuel: cleanStack(furnace.fuel),
      burn: Number.isFinite(furnace.burn) ? Math.max(0, Math.min(100_000, furnace.burn)) : 0,
      burnMax: Number.isFinite(furnace.burnMax) ? Math.max(0, Math.min(100_000, furnace.burnMax)) : 0,
      cook: Number.isFinite(furnace.cook) ? Math.max(0, Math.min(6, furnace.cook)) : 0,
      storedXp: Number.isFinite(furnace.storedXp) ? Math.max(0, Math.min(10_000, furnace.storedXp)) : 0,
      soundTimer: Number.isFinite(furnace.soundTimer) ? Math.max(0, Math.min(10, furnace.soundTimer)) : 0,
    }]);
  }
  const vehicles = [];
  if (Array.isArray(value.vehicles)) for (const vehicle of value.vehicles.slice(0, 1024)) {
    if (!isObject(vehicle) || !['boat', 'minecart', 'storage', 'powered'].includes(vehicle.type) || !validPosition(vehicle.pos)) continue;
    const safeVehicle = {
      uid: typeof vehicle.uid === 'string' && vehicle.uid.length <= 100 ? vehicle.uid : null,
      type: vehicle.type, pos: vehicle.pos.map(Number),
      rotation: Number.isFinite(vehicle.rotation) ? vehicle.rotation : 0,
      vx: Number.isFinite(vehicle.vx) ? Math.max(-20, Math.min(20, vehicle.vx)) : 0,
      vz: Number.isFinite(vehicle.vz) ? Math.max(-20, Math.min(20, vehicle.vz)) : 0,
    };
    if (vehicle.type === 'storage') safeVehicle.slots = cleanSlots(vehicle.slots, 27) || Array(27).fill(null);
    if (vehicle.type === 'powered') safeVehicle.fuel = Number.isFinite(vehicle.fuel) ? Math.max(0, Math.min(3600, vehicle.fuel)) : 0;
    if (vehicle.type !== 'boat') {
      if (Number.isInteger(vehicle.nodeX)) safeVehicle.nodeX = vehicle.nodeX;
      if (Number.isInteger(vehicle.nodeZ)) safeVehicle.nodeZ = vehicle.nodeZ;
      if (Array.isArray(vehicle.target) && vehicle.target.length === 2 && vehicle.target.every(Number.isInteger)) safeVehicle.target = vehicle.target.slice();
      if (Number.isFinite(vehicle.progress)) safeVehicle.progress = Math.max(0, Math.min(0.999, vehicle.progress));
      if (Array.isArray(vehicle.travel) && vehicle.travel.length === 2 && vehicle.travel.every(Number.isFinite)) safeVehicle.travel = vehicle.travel.slice();
      if (Number.isFinite(vehicle.cartSpeed)) safeVehicle.cartSpeed = Math.max(0, Math.min(8, vehicle.cartSpeed));
    }
    vehicles.push(safeVehicle);
  }
  const items = [];
  if (Array.isArray(value.items)) for (const item of value.items.slice(0, 4096)) {
    const stack = cleanStack(item);
    if (!stack || !validPosition(item.pos)) continue;
    items.push({ ...stack, pos: item.pos.map(Number), vy: Number.isFinite(item.vy) ? Math.max(-100, Math.min(100, item.vy)) : 0,
      age: Number.isFinite(item.age) ? Math.max(0, Math.min(1_000_000, item.age)) : 0 });
  }
  const normalizedPlayer = {
    pos: player.pos.map(Number), yaw: Number.isFinite(player.yaw) ? player.yaw : 0,
    pitch: Number.isFinite(player.pitch) ? Math.max(-Math.PI / 2, Math.min(Math.PI / 2, player.pitch)) : 0,
    health: Number.isFinite(player.health) ? Math.max(1, Math.min(20, player.health)) : 20,
    hunger: Number.isFinite(player.hunger) ? Math.max(0, Math.min(20, Math.floor(player.hunger))) : 20,
    saturation: Number.isFinite(player.saturation) ? Math.max(0, Math.min(20, player.saturation)) : 5,
    exhaustion: Number.isFinite(player.exhaustion) ? Math.max(0, Math.min(40, player.exhaustion)) : 0,
    inventory, armor, hotbarIndex: Number.isInteger(player.hotbarIndex) ? Math.max(0, Math.min(8, player.hotbarIndex)) : 0,
    xpTotal: Number.isFinite(player.xpTotal) ? Math.max(0, Math.min(10_000_000, Math.floor(player.xpTotal))) : 0,
    xpSeed: Number.isInteger(player.xpSeed) ? (player.xpSeed >>> 0) : 0x51a7c9e3,
    stats: isObject(player.stats) ? Object.fromEntries(Object.entries(player.stats).filter(([, n]) => Number.isFinite(n)).slice(0, 100)) : {},
  };
  normalizedPlayer.saturation = Math.min(normalizedPlayer.hunger, normalizedPlayer.saturation);
  const worldId = typeof value.worldId === 'string' && value.worldId.length > 0 && value.worldId.length <= 128 ? value.worldId : value.seed;
  const dimension = edition !== 'classic' && value.dimension === 'nether' ? 'nether' : 'overworld';
  const nether = edition !== 'classic' && isObject(value.nether) ? cleanDimensionPayload(value.nether, BETA_HEIGHT) : null;
  return {
    version: value.version, worldId, seed: value.seed,
    worldName: typeof value.worldName === 'string' && value.worldName.trim() ? value.worldName.trim().slice(0, 48) : value.seed,
    edition,
    ...(terrain ? { terrain } : {}),
    ...(dimension === 'nether' ? { dimension } : {}),
    ...(nether ? { nether } : {}),
    gameMode: edition === 'classic' ? 'classic' : value.gameMode === 'creative' ? 'creative' : 'survival',
    edits,
    settings: isObject(value.settings)
      ? {
          ...value.settings,
          ...('shaderStyle' in value.settings
            ? { shaderStyle: value.settings.shaderStyle === 'shader' ? 'shader' : 'classic' }
            : {}),
        }
      : {},
    spawnBed: isObject(value.spawnBed) && [value.spawnBed.x, value.spawnBed.y, value.spawnBed.z].every(Number.isInteger)
      ? { x: value.spawnBed.x, y: value.spawnBed.y, z: value.spawnBed.z } : null,
    timeOfDay: Number.isFinite(value.timeOfDay) ? ((value.timeOfDay % 1) + 1) % 1 : 0,
    furnaces, chests,
    vehicles,
    items, player: normalizedPlayer,
  };
}

export function encodeWorldSave(value) {
  const world = normalizeWorldSave(value);
  if (!world) throw new Error('This world save is incomplete or invalid.');
  const text = JSON.stringify({ format: WORLD_SAVE_FORMAT, version: world.version, exportedAt: new Date().toISOString(), world });
  if (new TextEncoder().encode(text).byteLength > MAX_WORLD_SAVE_BYTES) throw new Error('World save is too large to export (maximum 16 MB).');
  return text;
}

export function decodeWorldSave(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_WORLD_SAVE_BYTES) {
    throw new Error('Save file is too large (maximum 16 MB).');
  }
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('This is not a valid JSON world-save file.'); }
  if (!isObject(parsed) || parsed.format !== WORLD_SAVE_FORMAT || ![1, WORLD_SAVE_VERSION].includes(parsed.version) || parsed.world?.version !== parsed.version) {
    throw new Error('Unsupported save file. Choose an AiSlopcraft world-save JSON file.');
  }
  const world = normalizeWorldSave(parsed.world);
  if (!world) throw new Error('The save file is missing required world or player data.');
  return world;
}
