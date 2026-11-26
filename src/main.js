// AiSlopcraft — Beta-era survival and Classic creative sandbox. Main game loop.
import * as THREE from 'three';
import { World } from './world/world.js';
import { applySavedEdits, selectSpawn } from './world/world-loader.js';
import { CLASSIC_BLOCKS, isClassicBlock } from './classic.js';
import { CH, SEA_LEVEL } from './world/chunk.js';
import { OVERWORLD_TERRAIN } from './world/world-profile.js';
import { buildChunkMesh } from './world/mesher.js';
import { buildAtlas, buildItemIcons, buildEmissionAtlas } from './world/textures.js';
import { extractBlockSprites, paintBlockSprites } from './world/resource-pack.js';
import {
  AIR, WATER, WATER_FLOW, LAVA, LAVA_FLOW, TORCH, CRAFTING_TABLE, FURNACE, SAND, GRAVEL, LEAVES, GRASS, DIRT,
  LOG, GLASS, BRICK, getBlock, breakTime, canHarvest, ITEMS, itemName, isBlock, itemStackLimit, STONE, COBBLE,
  TILES, SAPLING, TALL_GRASS, PLANKS, TNT, WOOD_DOOR, IRON_DOOR, JUKEBOX, STONE_SLAB, DOUBLE_STONE_SLAB,
  BED_BLOCK, CAKE_BLOCK, CHEST, CROPS, FARMLAND, WOOL_BASE, LEVER, RAIL, REDSTONE_WIRE, REDSTONE_TORCH, REDSTONE_REPEATER, placeableBlockForItem, FURNACE_LIT
} from './world/blocks.js';
import { Player } from './entities/player.js';
import { createRemoteAvatarModel, disposeRemoteAvatarModel } from './entities/remote-avatar.js';
import { advanceEating, EAT_DURATION } from './entities/eating.js';
import { MobManager, rollMobDrops, mobAttackDamage } from './entities/mobs.js';
import { UI } from './ui/ui.js';
import { showGraphicsStartupError } from './ui/startup-error.js';
import { Audio } from './audio.js';
import { Sky } from './sky.js';
import { createFurnaceState, tickFurnace, interactWithFurnaceSlot, FUEL_TIMES } from './ui/furnace.js';
import { smeltResult } from './ui/recipes.js';
import { ParticleManager } from './particles.js';
import { FirstPersonArm } from './arm.js';
import { Lighting, PSXPostProcess, SHADER_STYLES, shaderStyleId } from './rendering.js';
import { loadSettings, persistSettings, sensitivityToRadians, keyLabel } from './settings.js';
import { decodeWorldSave, encodeWorldSave, MAX_WORLD_SAVE_BYTES, WORLD_SAVE_VERSION } from './save.js';
import { createWorldSaveStore } from './save-manager.js';
import { useOnBlock, useOnMob, growCrop, cropDrops } from './interactions.js';
import { FluidSimulator } from './world/fluids.js';
import { RedstoneSimulator } from './world/redstone.js';
import { VehicleManager } from './entities/vehicles.js';
import { DIRECTIONS as STRUCTURE_DIRECTIONS, structurePartner, setDoorOpen } from './world/structures.js';

const canvas = document.getElementById('game-canvas');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (error) {
  console.error('Could not initialize WebGL graphics:', error);
  showGraphicsStartupError(document, () => window.location.reload());
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
THREE.ColorManagement.enabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 600);
camera.rotation.order = 'YXZ';
camera.layers.enable(1); // voxel shadow casters

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- textures and shared lighting ----
const atlasCanvas = buildAtlas();
const defaultAtlas = document.createElement('canvas');
defaultAtlas.width = defaultAtlas.height = 256;
defaultAtlas.getContext('2d').drawImage(atlasCanvas, 0, 0);
const atlasTex = new THREE.CanvasTexture(atlasCanvas);
atlasTex.magFilter = THREE.NearestFilter;
atlasTex.minFilter = THREE.NearestFilter;
atlasTex.generateMipmaps = false;
atlasTex.colorSpace = THREE.SRGBColorSpace;

const waterCanvas = document.createElement('canvas');
waterCanvas.width = 16; waterCanvas.height = 16;
{
  const ctx = waterCanvas.getContext('2d');
  const img = ctx.createImageData(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const i = (y * 16 + x) * 4;
    const v = Math.sin((x + y * 1.7) * 0.9) * 10 + Math.sin(x * 1.3 + y * 0.7) * 8;
    img.data[i] = 42 + v; img.data[i + 1] = 82 + v; img.data[i + 2] = 196 + v; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
const waterTex = new THREE.CanvasTexture(waterCanvas);
waterTex.magFilter = THREE.NearestFilter;
waterTex.minFilter = THREE.NearestFilter;
waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
waterTex.colorSpace = THREE.SRGBColorSpace;
// Keep the standalone water renderer in sync with the corresponding atlas tile.
const waterX = TILES.water % 16 * 16, waterY = Math.floor(TILES.water / 16) * 16;
defaultAtlas.getContext('2d').clearRect(waterX, waterY, 16, 16);
defaultAtlas.getContext('2d').drawImage(waterCanvas, waterX, waterY);

const lighting = new Lighting({ atlasTexture: atlasTex, emissionTexture: buildEmissionAtlas(atlasCanvas) });
const psxPostProcess = new PSXPostProcess(0.25);
const renderBufferSize = new THREE.Vector2();
let atlasGeneration = 0;
const RESOURCE_PACKS_KEY = 'aislopcraft:resource-packs';
const ACTIVE_RESOURCE_PACK_KEY = 'aislopcraft:active-resource-pack';
const resourcePackMemory = new Map();
let memoryActiveResourcePackId = null;
let memoryResourcePackSelectionSet = false;
let multiplayerVisualRestore = null;
function storedResourcePacks() {
  try {
    const value = JSON.parse(localStorage.getItem(RESOURCE_PACKS_KEY) || '[]');
    return Array.isArray(value) ? value.filter(pack => pack && typeof pack.id === 'string' && typeof pack.name === 'string') : [];
  } catch { return []; }
}
function hasLegacyResourcePack() {
  try { return !!localStorage.getItem('aislopcraft:block-atlas'); } catch { return false; }
}
function resourcePackState() {
  const packs = storedResourcePacks();
  if (hasLegacyResourcePack() && !packs.some(pack => pack.id === 'legacy')) packs.unshift({ id: 'legacy', name: 'Previously imported textures', count: 0 });
  for (const pack of resourcePackMemory.values()) if (!packs.some(item => item.id === pack.id)) packs.push(pack);
  let activeId = null, explicitlyDefault = false;
  try {
    const storedActive = localStorage.getItem(ACTIVE_RESOURCE_PACK_KEY);
    explicitlyDefault = storedActive === '__default__';
    activeId = explicitlyDefault ? null : storedActive;
  } catch {}
  if (memoryResourcePackSelectionSet) {
    activeId = memoryActiveResourcePackId;
    explicitlyDefault = activeId === null;
  }
  if (!activeId && !explicitlyDefault && hasLegacyResourcePack()) activeId = 'legacy';
  if (!packs.some(pack => pack.id === activeId)) activeId = null;
  return { packs, activeId };
}
function refreshAtlas() {
  atlasTex.needsUpdate = true;
  waterCanvas.getContext('2d').clearRect(0, 0, 16, 16);
  waterCanvas.getContext('2d').drawImage(atlasCanvas, waterX, waterY, 16, 16, 0, 0, 16, 16);
  waterTex.needsUpdate = true;
  const updated = buildEmissionAtlas(atlasCanvas);
  const emission = lighting.emissionTexture;
  emission.image.getContext('2d').drawImage(updated.image, 0, 0);
  emission.needsUpdate = true;
  updated.dispose();
}
async function applyTransientAtlas(atlasData) {
  if (typeof atlasData !== 'string' || !atlasData.startsWith('data:image/png;base64,') || atlasData.length > 700_000) throw new Error('The host texture atlas is missing or too large to share.');
  const generation = ++atlasGeneration;
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('Could not decode the host texture atlas.'));
    image.src = atlasData;
  });
  if (generation !== atlasGeneration) return false;
  if (image.width !== 256 || image.height !== 256) throw new Error('The host texture atlas has invalid dimensions.');
  atlasCanvas.getContext('2d').clearRect(0, 0, 256, 256);
  atlasCanvas.getContext('2d').drawImage(image, 0, 0);
  refreshAtlas();
  return true;
}
function applyTransientDefaultAtlas() {
  atlasGeneration++;
  atlasCanvas.getContext('2d').clearRect(0, 0, 256, 256);
  atlasCanvas.getContext('2d').drawImage(defaultAtlas, 0, 0);
  refreshAtlas();
}

const solidMat = lighting.createMaterial({ name: 'Terrain', voxel: true, map: atlasTex, emissionMap: true });
const cutoutMat = lighting.createMaterial({ name: 'TerrainCutout', voxel: true, map: atlasTex, emissionMap: true, cutout: true, doubleSide: true });
const waterMat = lighting.createMaterial({ name: 'Water', voxel: true, map: waterTex, water: true, transparent: true, opacity: 0.78, doubleSide: true, depthWrite: false });

// ---- game state ----
const WORLD_PARAMS = new URLSearchParams(location.search);
const SEED = WORLD_PARAMS.get('seed') || 'Beta 1.7.3';
const WORLD_ID = WORLD_PARAMS.get('id') || SEED;
const WORLD_NAME = WORLD_PARAMS.get('world') || SEED;
const REQUESTED_EDITION = WORLD_PARAMS.get('edition') === 'classic' ? 'classic' : null;
const IS_ROOM_LINK = Boolean(WORLD_PARAMS.get('room'));
const REQUESTED_TERRAIN = WORLD_PARAMS.get('terrain');
const worldSaves = createWorldSaveStore(localStorage);
const requestedVersion = WORLD_PARAMS.get('saveVersion');
const selectedSaveVersion = requestedVersion === String(WORLD_SAVE_VERSION) ? WORLD_SAVE_VERSION
  : requestedVersion === '1' || REQUESTED_TERRAIN === 'legacy' || REQUESTED_EDITION === 'classic' ? 1 : undefined;
const storedSave = IS_ROOM_LINK ? null : worldSaves.read(WORLD_ID, selectedSaveVersion);
const savedGame = storedSave?.seed === SEED ? storedSave : null;
let saveConflict = false;
try { saveConflict = !IS_ROOM_LINK && !savedGame && worldSaves.has(WORLD_ID); } catch { /* play without local storage */ }
const EDITION = savedGame?.edition || REQUESTED_EDITION || 'beta';
const unsupportedTerrain = !savedGame && REQUESTED_TERRAIN != null && !['legacy', OVERWORLD_TERRAIN].includes(REQUESTED_TERRAIN);
const TERRAIN = EDITION === 'classic' ? null : savedGame ? savedGame.terrain ?? null
  : REQUESTED_TERRAIN === OVERWORLD_TERRAIN || (!IS_ROOM_LINK && !REQUESTED_TERRAIN) ? OVERWORLD_TERRAIN : null;
function setTerrainParam(url, terrain) {
  url.searchParams.set('terrain', terrain || 'legacy');
}
const START_GAME_MODE = EDITION === 'classic' ? 'classic' : WORLD_PARAMS.get('mode') === 'creative' ? 'creative' : 'survival';
const legacySettings = { ...savedGame?.settings };
if (legacySettings.sensitivity > 0 && legacySettings.sensitivity < 1) legacySettings.sensitivity = legacySettings.sensitivity / 0.0044 * 100;
const settings = loadSettings(localStorage, legacySettings);
const world = new World(SEED, scene, EDITION, TERRAIN);
applySavedEdits(world, savedGame?.edits);
const fluids = new FluidSimulator(world);
world.onChunkLoad((cx, cz) => fluids.chunkLoaded(cx, cz));
world.onChunkUnload((cx, cz) => fluids.chunkLoaded(cx, cz));
const redstone = new RedstoneSimulator(world, { ignite: (x, y, z) => {
  if (!tntFuses.some(t => t.x === x && t.y === y && t.z === z)) { tntFuses.push({ x, y, z, timer: 3.2 }); audio.fuse(); }
} });
const player = new Player(world, camera, canvas);
const audio = new Audio();
const sky = new Sky(scene, camera);
const mobs = new MobManager(world, scene, lighting);
const vehicles = new VehicleManager(world, scene, lighting);
vehicles.load(savedGame?.vehicles);
const remotePlayers = new Map();
let applyingNetworkEdit = false;
let networkStateTimer = 0;
let networkItemTimer = 0;
let networkVehicleTimer = 0;
let sharedStateTimer = 0;
const game = {
  world, player, audio, sky, mobs, renderer, lighting, fluids, redstone, vehicles,
  edition: EDITION,
  onlineSession: IS_ROOM_LINK,
  hasLocalSave: Boolean(savedGame) || saveConflict,
  atlasCanvas,
  worldName: savedGame?.worldName || WORLD_NAME,
  getResourcePackState() { return resourcePackState(); },
  listSavedWorlds() { return worldSaves.list(); },

  selectClassicBlock(id) {
    if (this.edition !== 'classic' || !isClassicBlock(id)) return false;
    player.inventory[player.hotbarIndex] = { id, count: 64, damage: 0 };
    ui?.refresh?.();
    return true;
  },
  openEditionHome(edition = 'beta', multiplayer = false) {
    const classic = edition === 'classic';
    const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const url = new URL(location.href);
    url.searchParams.set('id', `menu-${token}`);
    url.searchParams.set('seed', `menu-${classic ? 'classic' : 'beta'}-${token}`);
    url.searchParams.set('world', classic ? 'Classic Edition' : 'AiSlopcraft');
    if (classic) url.searchParams.set('edition', 'classic'); else url.searchParams.delete('edition');
    setTerrainParam(url, classic ? null : OVERWORLD_TERRAIN);
    url.searchParams.delete('saveVersion');
    url.searchParams.delete('mode'); url.searchParams.delete('room'); url.searchParams.delete('relay'); url.searchParams.delete('launch');
    if (multiplayer) url.searchParams.set('multiplayer', '1'); else url.searchParams.delete('multiplayer');
    location.assign(url.href);
  },
  openRoomHome(room) {
    const token = `room-${String(room.code || 'invite').slice(0, 12)}`;
    const url = new URL(location.href);
    url.searchParams.set('id', token);
    url.searchParams.set('seed', String(room.seed));
    url.searchParams.set('world', String(room.name || 'Shared Classic World'));
    url.searchParams.set('edition', room.edition === 'classic' ? 'classic' : 'beta');
    setTerrainParam(url, room.terrain);
    url.searchParams.delete('saveVersion');
    url.searchParams.set('room', String(room.code || ''));
    url.searchParams.delete('mode');
    url.searchParams.delete('launch');
    url.searchParams.delete('multiplayer');
    const relay = this.multiplayerClient?.relayUrl;
    if (relay) url.searchParams.set('relay', relay);
    location.assign(url.href);
  },
  openLocalWorld(seed, name, gameMode = 'survival', worldId = seed, edition = 'beta', terrain = OVERWORLD_TERRAIN) {
    const url = new URL(location.href);
    url.searchParams.set('id', String(worldId));
    url.searchParams.set('seed', String(seed));
    url.searchParams.set('world', String(name || seed));
    url.searchParams.set('mode', gameMode === 'creative' ? 'creative' : gameMode === 'classic' ? 'classic' : 'survival');
    if (edition === 'classic') url.searchParams.set('edition', 'classic'); else url.searchParams.delete('edition');
    setTerrainParam(url, edition === 'classic' ? null : terrain);
    url.searchParams.set('saveVersion', String(edition !== 'classic' && terrain ? WORLD_SAVE_VERSION : 1));
    url.searchParams.delete('room');
    url.searchParams.delete('multiplayer');
    url.searchParams.set('launch', '1');
    location.assign(url.href);
  },
  newLocalWorldId(prefix) {
    const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let id = `${prefix}-${token}`;
    for (let suffix = 1; worldSaves.has(id); suffix++) id = `${prefix}-${token}-${suffix}`;
    return id;
  },
  renameLocalWorld(worldId, name, terrain) {
    worldSaves.rename(worldId, name, terrain ? WORLD_SAVE_VERSION : 1);
  },
  deleteLocalWorld(worldId, terrain) {
    worldSaves.remove(worldId, terrain ? WORLD_SAVE_VERSION : 1);
    return true;
  },
  recreateLocalWorld(_worldId, seed, name, gameMode = 'survival', edition = 'beta', terrain = null) {
    this.openLocalWorld(seed, `${name.slice(0, 42)} Copy`, gameMode, this.newLocalWorldId('world'), edition, terrain);
  },
  getResourcePackForSharing(requestedId = resourcePackState().activeId) {
    if (requestedId == null) return null;
    const { packs } = resourcePackState();
    const pack = packs.find(item => item.id === requestedId);
    if (!pack) throw new Error('That texture pack is no longer installed. Reopen the multiplayer screen and choose another pack.');
    let atlasData = resourcePackMemory.get(requestedId)?.atlasData;
    try { atlasData ||= requestedId === 'legacy' ? localStorage.getItem('aislopcraft:block-atlas') : localStorage.getItem(`aislopcraft:resource-pack:${requestedId}`); } catch {}
    if (!atlasData || atlasData.length > 700_000) throw new Error('The selected texture pack is too large to share in a multiplayer room. Choose another pack or use built-in textures.');
    return { name: pack.name || 'Host texture pack', atlasData };
  },
  async applyMultiplayerVisuals(visuals) {
    await this.clearMultiplayerVisuals();
    if (visuals?.mode !== 'forced') return true;
    multiplayerVisualRestore = { shaderStyle: this.shaderStyle, atlasData: atlasCanvas.toDataURL('image/png') };
    const style = SHADER_STYLES.includes(visuals.shaderStyle) ? visuals.shaderStyle : 'classic';
    try {
      if (visuals.resourcePack?.atlasData) await applyTransientAtlas(visuals.resourcePack.atlasData);
      else applyTransientDefaultAtlas();
      this.setShaderStyle(style);
      this.ui?._iconCache?.clear();
      return true;
    } catch (error) {
      await this.clearMultiplayerVisuals();
      throw error;
    }
  },
  async clearMultiplayerVisuals() {
    if (!multiplayerVisualRestore) return false;
    const restore = multiplayerVisualRestore;
    multiplayerVisualRestore = null;
    this.setShaderStyle(restore.shaderStyle);
    try { await applyTransientAtlas(restore.atlasData); }
    catch { applyTransientDefaultAtlas(); }
    this.ui?._iconCache?.clear();
    return true;
  },
  async importResourcePack(file) {
    if (file.size > 32 * 1024 * 1024) throw new Error('Pack is too large (maximum 32 MB).');
    const generation = ++atlasGeneration;
    const sprites = extractBlockSprites(new Uint8Array(await file.arrayBuffer()));
    const staged = document.createElement('canvas'); staged.width = staged.height = 256;
    staged.getContext('2d').drawImage(defaultAtlas, 0, 0);
    const count = await paintBlockSprites(staged, sprites);
    if (generation !== atlasGeneration) throw new Error('Import cancelled.');
    const id = `pack-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    const name = String(file.name || 'Java 1.7 resource pack').replace(/\.[^.]+$/, '').slice(0, 60) || 'Java 1.7 resource pack';
    const pack = { id, name, count };
    const atlasData = staged.toDataURL('image/png');
    resourcePackMemory.set(id, { ...pack, atlasData });
    memoryActiveResourcePackId = id;
    memoryResourcePackSelectionSet = true;
    let saved = true;
    try {
      const list = storedResourcePacks().filter(item => item.id !== id);
      list.push(pack);
      localStorage.setItem(`aislopcraft:resource-pack:${id}`, atlasData);
      localStorage.setItem(RESOURCE_PACKS_KEY, JSON.stringify(list));
      localStorage.setItem(ACTIVE_RESOURCE_PACK_KEY, id);
    } catch { saved = false; }
    atlasCanvas.getContext('2d').clearRect(0, 0, 256, 256);
    atlasCanvas.getContext('2d').drawImage(staged, 0, 0);
    refreshAtlas();
    return { ...pack, saved };
  },
  async useResourcePack(id) {
    const pack = resourcePackState().packs.find(item => item.id === id);
    if (!pack) throw new Error('That texture pack is no longer installed.');
    let atlasData = resourcePackMemory.get(id)?.atlasData;
    try { atlasData ||= id === 'legacy' ? localStorage.getItem('aislopcraft:block-atlas') : localStorage.getItem(`aislopcraft:resource-pack:${id}`); } catch {}
    if (!atlasData?.startsWith('data:image/png;base64,') || atlasData.length > 2_000_000) throw new Error('Saved texture pack data is missing or invalid.');
    const generation = ++atlasGeneration;
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Could not read the saved texture pack.'));
      image.src = atlasData;
    });
    if (generation !== atlasGeneration) return false;
    if (image.width !== 256 || image.height !== 256) throw new Error('Saved texture pack has invalid dimensions.');
    atlasCanvas.getContext('2d').clearRect(0, 0, 256, 256);
    atlasCanvas.getContext('2d').drawImage(image, 0, 0);
    refreshAtlas();
    memoryActiveResourcePackId = id;
    memoryResourcePackSelectionSet = true;
    try { localStorage.setItem(ACTIVE_RESOURCE_PACK_KEY, id); } catch {}
    return true;
  },
  useDefaultResourcePack() {
    memoryActiveResourcePackId = null;
    memoryResourcePackSelectionSet = true;
    atlasGeneration++;
    atlasCanvas.getContext('2d').clearRect(0, 0, 256, 256);
    atlasCanvas.getContext('2d').drawImage(defaultAtlas, 0, 0);
    refreshAtlas();
    try { localStorage.setItem(ACTIVE_RESOURCE_PACK_KEY, '__default__'); } catch {}
    return true;
  },
  async deleteResourcePack(id) {
    atlasGeneration++;
    const wasActive = resourcePackState().activeId === id;
    resourcePackMemory.delete(id);
    if (id === 'legacy') {
      try { localStorage.removeItem('aislopcraft:block-atlas'); } catch {}
    } else {
      try { localStorage.removeItem(`aislopcraft:resource-pack:${id}`); } catch {}
    }
    const list = storedResourcePacks().filter(pack => pack.id !== id);
    try { localStorage.setItem(RESOURCE_PACKS_KEY, JSON.stringify(list)); } catch {}
    if (wasActive) this.useDefaultResourcePack();
    return resourcePackState();
  },
  async restoreResourcePack() {
    const { activeId } = resourcePackState();
    if (!activeId) return false;
    try { return await this.useResourcePack(activeId); } catch {
      this.useDefaultResourcePack();
      return false;
    }
  },
  resetResourcePack() { return this.useDefaultResourcePack(); },
  itemIconsCanvas: buildItemIcons(),
  settings,
  renderDistance: settings.renderDistance,
  keepInventory: settings.keepInventory,
  shaderStyle: settings.shaderStyle,
  brightness: settings.brightness,
  applySettings() {
    const s = this.settings;
    const distanceChanged = this.renderDistance !== s.renderDistance;
    const smoothChanged = world.smoothLighting !== s.smoothLighting;
    world.smoothLighting = s.smoothLighting;
    this.renderDistance = s.renderDistance;
    this.keepInventory = s.keepInventory;
    mobs.difficulty = s.difficulty;
    this.setShaderStyle(this.networkRoom?.visuals?.mode === 'forced' ? this.networkRoom.visuals.shaderStyle : s.shaderStyle);
    this.setBrightness(s.brightness);
    player.sensitivity = sensitivityToRadians(s.sensitivity);
    player.invertMouse = s.invertMouse;
    player.bindings = s.keys;
    player.viewBobbing = s.viewBobbing;
    audio.setVolume(s.volume);
    if (camera.fov !== s.fov) { camera.fov = s.fov; camera.updateProjectionMatrix(); }
    const effectiveScale = Math.max(0.35, s.renderScale * (s.graphics === 'fast' ? 0.75 : 1));
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2) * effectiveScale;
    particles.setQuality(s.particles);
    if (renderer.getPixelRatio() !== pixelRatio) {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    sky.showClouds = s.clouds;
    if (this.ui?.hintEl) {
      const k = s.keys;
      this.ui.hintEl.textContent = this.edition === 'classic'
        ? `Click to play · WASD move · Space jump · double-tap Space to fly · left-click break · right-click place · B blocks · middle-click pick · Esc pause`
        : `Click to play | ${keyLabel(k.forward)}/${keyLabel(k.left)}/${keyLabel(k.back)}/${keyLabel(k.right)} move · ${keyLabel(k.jump)} jump · ${keyLabel(k.sneak)} sneak · ${keyLabel(k.drop)} drop · ${keyLabel(k.inventory)} inventory · F3 debug · Esc pause`;
    }
    if (smoothChanged) {
      for (const chunk of world.chunks.values()) {
        if (chunk.generated && chunk.meshes) chunk.dirty = true;
      }
    }
    if (distanceChanged && this.started) this.onRenderDistanceChange();
  },
  setBrightness(value) {
    this.brightness = Math.max(0.5, Math.min(1.5, Number(value) || 1));
    lighting.shared.uBrightness.value = this.brightness;
  },
  setShaderStyle(style) {
    if (!SHADER_STYLES.includes(style)) return;
    this.shaderStyle = style;
    lighting.shared.uShaderStyle.value = shaderStyleId(style);
  },
  applyNetworkEdits(entries) {
    if (!Array.isArray(entries)) return;
    applyingNetworkEdit = true;
    try {
      for (const entry of entries) {
        let key, id, meta;
        if (Array.isArray(entry) && typeof entry[0] === 'string') {
          [key] = entry;
          if (Array.isArray(entry[1])) [id, meta] = entry[1];
          else [key, id, meta] = entry;
        } else if (entry && Number.isInteger(entry.x)) {
          key = `${entry.x},${entry.y},${entry.z}`; id = entry.id; meta = entry.meta || 0;
        }
        if (typeof key !== 'string' || !Number.isInteger(id) || !Number.isInteger(meta ?? 0)) continue;
        const [x,y,z] = key.split(',').map(Number);
        if (!world.recordEdit(x,y,z,id,meta || 0)) continue;
        if (world.getChunk(Math.floor(x / CH), Math.floor(z / CH))?.generated) world.setBlock(x,y,z,id,meta || 0);
      }
    } finally { applyingNetworkEdit = false; }
  },
  setMultiplayerRoom(room, client) {
    this.networkOffs?.forEach(off => off());
    this.networkOffs = [];
    this.networkRoom = { ...room };
    this.onlineSession = true;
    this.hasJoinedRoom = true;
    this.multiplayerClient = client;
    player.flying = false;
    player.gameMode = this.edition === 'classic' ? 'classic' : room.gameMode === 'creative' ? 'creative' : 'survival';
    for (const peer of room.players || []) if (peer.id !== room.id) createRemoteAvatar(peer.id, peer.name);
    const on = (type, handler) => this.networkOffs.push(client.on(type, handler));
    on('player:joined', message => {
      if (!this.networkRoom) return;
      this.networkRoom.players = [...(this.networkRoom.players || []).filter(peer => peer.id !== message.id), { id: message.id, name: message.name, role: message.role || 'player' }];
      createRemoteAvatar(message.id, message.name);
      ui?.notify?.(`${message.name} joined the world.`);
      ui?.updateNetworkPanel?.();
    });
    on('player:left', message => {
      if (this.networkRoom) this.networkRoom.players = (this.networkRoom.players || []).filter(peer => peer.id !== message.id);
      removeRemoteAvatar(message.id);
      ui?.notify?.(`${message.name} left the world.`);
      ui?.updateNetworkPanel?.();
    });
    on('player:state', message => updateRemoteAvatar(message));
    on('player:damage', message => { if (Number.isFinite(message.amount) && message.amount > 0) player.damage(message.amount, audio); });
    on('world:snapshot', message => this.applyNetworkEdits(message.entries));
    on('world:edit', message => this.applyNetworkEdits([message.edit]));
    on('item:snapshot', message => applyNetworkItems(message.items));
    on('item:spawn', message => upsertNetworkItem(message.item));
    on('item:remove', message => removeNetworkItem(message.uid));
    on('item:pickup', message => {
      removeNetworkItem(message.item?.uid);
      const stack = message.item;
      if (stack) {
        const inserted = player.insertItem(stack.id, stack.count, stack.damage || 0);
        if (inserted < stack.count) spawnItem(player.pos.x, player.pos.y, player.pos.z, stack.id, stack.count - inserted, stack.damage || 0);
        audio.pop(); ui?.refresh?.();
      }
    });
    on('mob:snapshot', message => { if (room.role !== 'host') mobs.applyNetworkSnapshot(message.mobs); });
    on('vehicle:snapshot', message => { if (room.role !== 'host') vehicles.applyNetworkSnapshot(message.vehicles); });
    on('vehicle:update', message => vehicles.applyNetworkUpdate(message.vehicle, message.riding));
    on('vehicle:remove', message => vehicles.removeNetworkVehicle(message.uid));
    on('projectile:snapshot', message => applyNetworkProjectiles(message.projectiles));
    on('projectile:update', message => upsertNetworkProjectile(message.projectile));
    on('projectile:remove', message => removeNetworkProjectile(message.uid));
    on('mob:attack', message => {
      if (room.role !== 'host' || !message.attacker || ![message.attacker.x, message.attacker.y, message.attacker.z, message.attacker.yaw, message.attacker.pitch].every(Number.isFinite)) return;
      const attacker = message.attacker;
      const fakePlayer = { pos: new THREE.Vector3(attacker.x, attacker.y, attacker.z), yaw: attacker.yaw, pitch: attacker.pitch,
        camera: { position: new THREE.Vector3(attacker.x, attacker.y + 1.62, attacker.z) },
        _solidBlockAt: (...args) => player._solidBlockAt(...args),
        raycast: (sharedWorld, distance, options) => Player.prototype.raycast.call(fakePlayer, sharedWorld, distance, options) };
      const ranged = !!message.ranged;
      const target = mobs.raycastTarget(fakePlayer, ranged ? 24 : 3.5);
      if (!target || target.networkId !== message.uid || Math.hypot(target.pos.x - attacker.x, target.pos.z - attacker.z) > (ranged ? 24 : 4)) return;
      const dx = target.pos.x - attacker.x, dz = target.pos.z - attacker.z, length = Math.hypot(dx, dz) || 1;
      target.damage(ranged ? 4 : mobAttackDamage(message.heldId), audio, { knockback: new THREE.Vector3(dx / length * (ranged ? 2 : 3.4), ranged ? 0.7 : 1.15, dz / length * (ranged ? 2 : 3.4)) });
    });
    on('game:state', message => applySharedGameState(message.state));
    on('tnt:ignite', message => {
      if (room.role === 'host' && Number.isInteger(message.x) && Number.isInteger(message.y) && Number.isInteger(message.z) && world.getBlock(message.x, message.y, message.z) === TNT && !tntFuses.some(fuse => fuse.x === message.x && fuse.y === message.y && fuse.z === message.z)) {
        tntFuses.push({ x: message.x, y: message.y, z: message.z, timer: 3.2 }); audio.fuse();
      }
    });
    on('chat', message => ui?.appendNetworkChat?.(message.name, message.text));
    const disconnectRoom = message => {
      if (!this.networkRoom) return;
      const closedName = this.networkRoom.name;
      this.networkRoom = null;
      this.networkOffs?.forEach(off => off()); this.networkOffs = [];
      void this.clearMultiplayerVisuals();
      player.gameMode = 'survival';
      for (const id of [...remotePlayers.keys()]) removeRemoteAvatar(id);
      ui?.updateNetworkPanel?.();
      ui?.notify?.(message?.reason || `Disconnected from ${closedName}.`);
      if (this.started || this.loading) this.openEditionHome('beta', true);
    };
    on('room:closed', disconnectRoom);
    on('disconnected', disconnectRoom);
    ui?.updateNetworkPanel?.();
  },
  async leaveMultiplayer() {
    const client = this.multiplayerClient;
    if (!client || !this.networkRoom) return;
    const host = this.networkRoom.role === 'host';
    if (!host && vehicles.mounted) this.publishVehicleState(vehicles.mounted, false);
    if (host) await client.closeRoom(); else await client.leave();
    client.disconnect(false);
    this.networkRoom = null;
    this.multiplayerClient = null;
    await this.clearMultiplayerVisuals();
    player.gameMode = 'survival';
    for (const id of [...remotePlayers.keys()]) removeRemoteAvatar(id);
    ui?.updateNetworkPanel?.();
    if (this.started || this.loading) this.openEditionHome();
  },
  onRenderDistanceChange() {
    updateChunks(true);
  },
  started: false,
  time: 0,
  seed: SEED,
  multiplayerRelay: new URLSearchParams(location.search).get('relay') || '',
  spawnBed: savedGame?.spawnBed || null,
  dropItem(stack) {
    spawnItem(player.pos.x, player.pos.y, player.pos.z, stack.id, stack.count, stack.damage || 0);
  },
  publishVehicleState(vehicle, riding = false) {
    if (!this.networkRoom || !this.multiplayerClient || !vehicle) return;
    const state = vehicles.serialize().find(item => item.uid === vehicle.networkId);
    if (state) this.multiplayerClient.send('vehicle:update', { vehicle: state, riding });
  },
  syncSharedState() {
    if (this.networkRoom?.role !== 'host' || !this.multiplayerClient) return;
    this.multiplayerClient.send('game:state', { state: { timeOfDay: sky.timeOfDay, chests: [...chests], furnaces: [...furnaces] } });
    if (game.openChestData?.vehicle) this.publishVehicleState(game.openChestData.vehicle, false);
  },
  dropHeld(all = false) {
    const stack = player.heldStack;
    if (!stack) return;
    const count = all ? stack.count : 1;
    this.dropItem({ ...stack, count });
    stack.count -= count;
    if (stack.count <= 0) player.inventory[player.hotbarIndex] = null;
    ui.refresh();
  },
  prepareSpawn() {
    const { position, bed } = selectSpawn(world, this.spawnBed);
    this.spawnBed = bed;
    return position;
  },
  respawn() {
    vehicles.dismount(player, true);
    const spawn = this.prepareSpawn();
    player.respawn(spawn.y, spawn.x, spawn.z);
    mobs.attackCooldown = 0;
    updateChunks(true);
    processChunkQueue();
    ui.setMode('game');
  },
  saveSettings() {
    persistSettings(localStorage, this.settings);
  },
  refreshContainers() {
    refreshChest();
    refreshFurnace();
  },
  async saveAndQuit() {
    if (this.networkRoom) { await this.leaveMultiplayer(); return true; }
    else if (!this.saveGame()) return false;
    const url = new URL(location.href);
    url.searchParams.delete('launch');
    history.replaceState(null, '', url);
    this.started = false;
    lastCX = null;
    lastCZ = null;
    clearFishing();
    ui.setMode('title');
    return true;
  },
  captureWorldSave() {
    return { version: world.terrain ? WORLD_SAVE_VERSION : 1, ...(world.terrain ? { terrain: world.terrain } : {}), worldId: WORLD_ID, seed: SEED, worldName: this.worldName, edition: this.edition, gameMode: player.gameMode,
      edits: [...world.edits].map(([key, id]) => [key, id, world.metaEdits.get(key) || 0]),
      settings: this.settings, spawnBed: this.spawnBed, timeOfDay: sky.timeOfDay, furnaces: [...furnaces], chests: [...chests], vehicles: vehicles.serialize(),
      items: itemEntities.filter(it => !it.dead).map(it => ({ id: it.id, count: it.count, damage: it.damage, pos: it.mesh.position.toArray(), vy: it.vy, age: it.age })),
      player: { pos: player.pos.toArray(), yaw: player.yaw, pitch: player.pitch, health: player.health, hunger: player.hunger, saturation: player.saturation, exhaustion: player.exhaustion, inventory: player.inventory, armor: player.armor, hotbarIndex: player.hotbarIndex, stats: player.stats } };
  },
  saveGame() {
    // Multiplayer rooms are temporary; never overwrite a local world with room state.
    if (this.onlineSession || this.networkRoom || saveConflict || unsupportedTerrain) return false;
    try {
      worldSaves.write(this.captureWorldSave(), { createOnly: !this.hasLocalSave });
      this.hasLocalSave = true;
      return true;
    } catch (error) { console.warn('Could not save world', error); ui?.notify('Save failed — browser storage may be full'); return false; }
  },
  exportWorldSave(requestedWorldId = WORLD_ID, terrain = undefined) {
    if ((this.onlineSession || this.networkRoom) && requestedWorldId === WORLD_ID) throw new Error('Leave the multiplayer room before exporting a local world save.');
    const version = terrain === undefined ? savedGame?.version ?? selectedSaveVersion : terrain ? WORLD_SAVE_VERSION : 1;
    // Download current progress directly, even if the browser will not store it.
    const save = this.started && requestedWorldId === WORLD_ID && (terrain === undefined || terrain === world.terrain)
      ? this.captureWorldSave()
      : worldSaves.read(requestedWorldId, version);
    if (!save || save.worldId !== requestedWorldId) throw new Error('There is no saved world for that selection yet.');
    const blob = new Blob([encodeWorldSave(save)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const slug = (save.worldName || save.seed).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'world';
    link.href = href; link.download = `aislopcraft-${slug}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    return true;
  },
  async importWorldSaveFile(file) {
    if (!file || file.size > MAX_WORLD_SAVE_BYTES) throw new Error('Save file is too large (maximum 16 MB).');
    let save = decodeWorldSave(await file.text());
    try {
      if (worldSaves.has(save.worldId)) save = { ...save, worldId: this.newLocalWorldId('import') };
      worldSaves.write(save, { createOnly: true });
    } catch (error) {
      if (error.name === 'QuotaExceededError') throw new Error('Browser storage is full. Free some space and try again. Existing saves were not changed.');
      throw error;
    }
    persistSettings(localStorage, save.settings);
    this.openLocalWorld(save.seed, save.worldName, save.gameMode, save.worldId, save.edition, save.terrain ?? null);
    return true;
  },
  resetWorld() {
    if (this.onlineSession || saveConflict || unsupportedTerrain) return;
    try {
      const id = this.newLocalWorldId('world');
      worldSaves.remove(WORLD_ID, world.terrain ? WORLD_SAVE_VERSION : 1);
      this.started = false; // Do not resurrect the deleted save in beforeunload.
      this.openLocalWorld(SEED, this.worldName, savedGame?.gameMode ?? player.gameMode, id, EDITION, world.terrain);
    } catch (error) { ui.notify(error.message); }
  },
  start() {
    if (this.started || this.loading) return;
    if (!this.networkRoom && (saveConflict || unsupportedTerrain || this.onlineSession)) {
      ui.setMode('title');
      ui.notify('This world cannot be opened from this link. Your existing saves were not changed.');
      return;
    }
    this.loading = true;
    ui.showLoading(true);
    // Give the loading screen a frame to paint before synchronous spawn setup.
    requestAnimationFrame(() => setTimeout(() => {
      try {
        this.started = true;
        const spawn = this.prepareSpawn();
        player.respawn(spawn.y, spawn.x, spawn.z);
        const saved = savedGame?.player;
        if (saved && Array.isArray(saved.pos) && saved.pos.length === 3 && saved.pos.every(Number.isFinite)) {
          player.pos.fromArray(saved.pos); player.yaw = Number(saved.yaw) || 0; player.pitch = Number(saved.pitch) || 0;
          player.health = Math.max(1, Math.min(player.maxHealth, Number(saved.health) || player.maxHealth));
          player.hunger = saved.hunger;
          player.saturation = saved.saturation;
          player.exhaustion = saved.exhaustion;
          if (Array.isArray(saved.inventory) && saved.inventory.length === 36) player.inventory = saved.inventory;
          if (Array.isArray(saved.armor) && saved.armor.length === 4) player.armor = saved.armor;
          player.hotbarIndex = Math.max(0, Math.min(8, Number(saved.hotbarIndex) || 0));
          if (saved.stats && typeof saved.stats === 'object') Object.assign(player.stats, saved.stats);
          camera.position.set(player.pos.x, player.pos.y + 1.62, player.pos.z);
        }
        player.gameMode = this.edition === 'classic' ? 'classic' : this.networkRoom?.gameMode || savedGame?.gameMode || START_GAME_MODE;
        if (player.gameMode === 'creative' && (!saved || this.networkRoom)) {
          const palette = [STONE, DIRT, GRASS, COBBLE, PLANKS, SAND, GLASS, LOG, TORCH, LEAVES, BRICK, WOOL_BASE];
          for (let i = 0; i < palette.length; i++) if (!player.inventory[i]) player.inventory[i] = { id: palette[i], count: 1, damage: 0 };
        }
        if (this.edition === 'classic') {
          player.flying = false;
          player.health = player.maxHealth;
          player.dead = false;
          player.armor.fill(null);
          for (let i = 0; i < 9; i++) {
            if (!player.inventory[i] || !isClassicBlock(player.inventory[i].id)) player.inventory[i] = { id: CLASSIC_BLOCKS[i], count: 64, damage: 0 };
          }
        }
        updateChunks(true);
        processChunkQueue();
        if (this.edition !== 'classic' && mobs.mobs.length === 0 && this.networkRoom?.role !== 'guest') mobs.spawnInitial(player);
        if (!loadedItems) {
          loadedItems = true;
          if (Array.isArray(savedGame?.items)) for (const item of savedGame.items.slice(0, 4096)) {
            if (!item || !Number.isInteger(item.id) || !Number.isFinite(item.count) || item.count <= 0 || !Array.isArray(item.pos) || item.pos.length !== 3 || !item.pos.every(Number.isFinite)) continue;
            spawnItem(item.pos[0] - 0.5, item.pos[1] - 0.3, item.pos[2] - 0.5, item.id, item.count, item.damage || 0);
            const entity = itemEntities[itemEntities.length - 1];
            entity.vy = Number.isFinite(item.vy) ? item.vy : 0;
            entity.age = Number.isFinite(item.age) ? Math.max(0, item.age) : 0;
          }
        }
      } catch (error) {
        this.started = false;
        ui.setMode('title');
        document.querySelector('.title-sub').textContent = 'Could not load world. Please retry.';
        console.error('World loading failed:', error);
      } finally {
        this.loading = false;
        ui.showLoading(false);
      }
    }, 0));
  },
};
function createRemoteAvatar(id, name) {
  if (remotePlayers.has(id)) return remotePlayers.get(id);
  const avatar = createRemoteAvatarModel(id, name, lighting);
  scene.add(avatar.root);
  avatar.root.visible = false;
  remotePlayers.set(id, avatar);
  return avatar;
}

function updateRemoteAvatar(message) {
  const avatar = createRemoteAvatar(message.id, message.name);
  if (![message.x, message.y, message.z, message.yaw, message.pitch].every(Number.isFinite)) return;
  avatar.target.set(message.x, message.y, message.z);
  if (!avatar.initialized) {
    avatar.root.position.copy(avatar.target);
    avatar.initialized = true;
  }
  avatar.yaw = message.yaw;
  avatar.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, message.pitch));
  avatar.dead = !!message.dead;
  avatar.root.visible = true;
}

function remoteMobTargets() {
  return [...remotePlayers.entries()].map(([id, avatar]) => ({
    id, pos: avatar.target.clone(), vel: new THREE.Vector3(), dead: !!avatar.dead,
    damage: amount => game.multiplayerClient?.send('player:damage', { targetId: id, amount }),
  }));
}

function removeRemoteAvatar(id) {
  const avatar = remotePlayers.get(id);
  if (!avatar) return;
  scene.remove(avatar.root);
  disposeRemoteAvatarModel(avatar, lighting);
  remotePlayers.delete(id);
}

world.onBlockChange((x,y,z,previousId,id,previousMeta,meta) => {
  if (!applyingNetworkEdit && game.networkRoom) {
    game.multiplayerClient?.send('world:edit', { edit: { x,y,z,id,meta:meta || 0 } });
  }
});

const ui = new UI(game);
game.ui = ui;
const graphicsStatus = document.createElement('div');
graphicsStatus.className = 'graphics-status';
graphicsStatus.setAttribute('role', 'status');
graphicsStatus.hidden = true;
document.body.append(graphicsStatus);
let graphicsLost = false;
let graphicsStatusTimer;
// Listen on the canvas: WebGL context events do not bubble.
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  graphicsLost = true;
  clearTimeout(graphicsStatusTimer);
  if (ui.mode === 'game') ui.setMode('pause');
  graphicsStatus.hidden = false;
  graphicsStatus.textContent = 'Graphics connection lost. Waiting for WebGL to recover. Local worlds can still be backed up from the game menu.';
});
canvas.addEventListener('webglcontextrestored', () => {
  graphicsLost = false;
  lighting.lastShadowTime = -Infinity;
  if (ui.mode === 'game') ui.setMode('pause');
  graphicsStatus.textContent = 'Graphics restored. You can continue playing.';
  graphicsStatusTimer = setTimeout(() => { graphicsStatus.hidden = true; }, 5000);
});
if (WORLD_PARAMS.get('launch') === '1') {
  ui.setMode('game');
  game.start();
}
// Restore the selected local 1.7.x texture pack; packs are never uploaded.
void game.restoreResourcePack().then(() => ui._iconCache.clear());
if (Number.isFinite(savedGame?.timeOfDay)) sky.time = ((savedGame.timeOfDay % 1) + 1) % 1;
let saveClock = 0;
window.addEventListener('beforeunload', () => { if (game.started && !game.networkRoom) game.saveGame(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.started && ui.mode === 'game') {
    if (!game.networkRoom) game.saveGame();
    ui.setMode('pause');
  }
});

// ---- particles, first-person arm, target wireframe & crack overlay ----
const particles = new ParticleManager(scene, atlasCanvas, lighting);
game.applySettings();
const firstPersonArm = new FirstPersonArm(camera, atlasTex, game.itemIconsCanvas, undefined, lighting);

// A. Target selection wireframe
const selectionWireframe = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2, transparent: true, opacity: 0.45 })
);
selectionWireframe.visible = false;
scene.add(selectionWireframe);

// B. Block crack overlay mesh (cracks 0-9)
const crackGeometry = new THREE.BoxGeometry(1.003, 1.003, 1.003);
const crackMaterial = new THREE.MeshBasicMaterial({
  map: atlasTex,
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});
const crackOverlayMesh = new THREE.Mesh(crackGeometry, crackMaterial);
crackOverlayMesh.visible = false;
scene.add(crackOverlayMesh);

let currentCrackTile = -1;
// Preserve the original BoxGeometry UVs (0/1) so repeated stage changes remap
// from a stable source instead of from already-remapped coordinates.
const crackBaseUVs = crackGeometry.getAttribute('uv').array.slice();
function updateCrackOverlayUV(stage) {
  const tile = TILES.destroy0 + stage;
  if (tile === currentCrackTile) return;
  currentCrackTile = tile;

  const tx = tile % 16, ty = Math.floor(tile / 16);
  const s = 1 / 16;
  const e = 0.0002;
  const u0 = tx * s + e, v0 = 1 - (ty + 1) * s + e;
  const u1 = (tx + 1) * s - e, v1 = 1 - ty * s - e;

  const uvAttr = crackGeometry.getAttribute('uv');
  for (let i = 0; i < uvAttr.count; i++) {
    const bx = crackBaseUVs[i * 2];
    const by = crackBaseUVs[i * 2 + 1];
    uvAttr.setXY(
      i,
      u0 + (bx < 0.5 ? 0 : 1) * (u1 - u0),
      v0 + (by < 0.5 ? 0 : 1) * (v1 - v0)
    );
  }
  uvAttr.needsUpdate = true;
}

// ---- chunk streaming ----
const chunkQueue = [];
let lastCX = null, lastCZ = null;

function updateChunks(force = false, targetX = player.pos.x, targetZ = player.pos.z) {
  const pcx = Math.floor(targetX / CH);
  const pcz = Math.floor(targetZ / CH);
  if (!force && pcx === lastCX && pcz === lastCZ) return;
  lastCX = pcx; lastCZ = pcz;

  const rd = game.renderDistance;
  const needed = [];
  for (let dz = -rd; dz <= rd; dz++) {
    for (let dx = -rd; dx <= rd; dx++) {
      if (dx * dx + dz * dz > (rd + 0.5) * (rd + 0.5)) continue;
      needed.push([pcx + dx, pcz + dz, dx * dx + dz * dz]);
    }
  }
  needed.sort((a, b) => a[2] - b[2]);
  chunkQueue.length = 0;
  for (const [cx, cz] of needed) {
    if (world.edition === 'classic' && (cx < -8 || cx > 7 || cz < -8 || cz > 7)) continue;
    const c = world.getChunk(cx, cz);
    if (!c || !c.meshes) chunkQueue.push([cx, cz]);
  }
  // unload far chunks
  for (const [key, chunk] of world.chunks) {
    const ddx = chunk.cx - pcx, ddz = chunk.cz - pcz;
    if (ddx * ddx + ddz * ddz > (rd + 3) * (rd + 3)) {
      world.unloadChunk(chunk.cx, chunk.cz);
    }
  }
}

function processChunkQueue(budget = performance.now() + 4) {
  while (chunkQueue.length && performance.now() < budget) {
    const [cx, cz] = chunkQueue.shift();
    const chunk = world.generateChunk(cx, cz);
    if (!chunk.meshes) {
      const built = buildChunkMesh(world, chunk, atlasTex, waterTex, game.renderDistance);
      const meshes = {};
      const s = built.makeMesh(built.solid, solidMat);
      const c = built.makeMesh(built.cutout, cutoutMat);
      const w = built.makeMesh(built.water, waterMat);
      if (s) { s.layers.enable(1); scene.add(s); meshes.solid = s; }
      if (c) { c.layers.enable(1); scene.add(c); meshes.cutout = c; }
      if (w) { scene.add(w); meshes.water = w; }
      chunk.meshes = meshes;
      chunk.dirty = false;
    }
  }
}

function rebuildDirtyChunks(budget = performance.now() + 4) {
  let n = 0;
  for (const chunk of world.chunks.values()) {
    if (n >= 4 || performance.now() >= budget) break;
    if (chunk.dirty && chunk.generated && chunk.meshes) {
      const built = buildChunkMesh(world, chunk, atlasTex, waterTex, game.renderDistance);
      const meshes = {};
      const s = built.makeMesh(built.solid, solidMat);
      const c = built.makeMesh(built.cutout, cutoutMat);
      const w = built.makeMesh(built.water, waterMat);
      if (s) { s.layers.enable(1); scene.add(s); meshes.solid = s; }
      if (c) { c.layers.enable(1); scene.add(c); meshes.cutout = c; }
      if (w) { scene.add(w); meshes.water = w; }
      // buildChunkMesh already removed/disposed the previous meshes.
      chunk.meshes = meshes;
      chunk.dirty = false;
      n++;
    }
  }
}

// ---- item entities (drops) ----
const itemEntities = [];
const dropGeometryCache = new Map();
let loadedItems = false;
const itemGroup = new THREE.Group();
scene.add(itemGroup);

function spawnItem(x, y, z, id, count = 1, damage = 0, uid = null) {
  // Geometry/UVs are immutable per item ID. Materials remain per entity so
  // local light uniforms can differ without one dropped item affecting another.
  let geometry = dropGeometryCache.get(id);
  const block = isBlock(id);
  if (!geometry) {
    geometry = block ? new THREE.BoxGeometry(0.28, 0.28, 0.28) : new THREE.PlaneGeometry(0.32, 0.32);
    const uv = geometry.getAttribute('uv');
    if (block) {
      const tile = getBlock(id).tiles?.[2] ?? TILES.stone;
      const tx = tile % 16, ty = Math.floor(tile / 16), unit = 1 / 16, e = 0.001;
      const u0 = tx * unit + e, v0 = 1 - (ty + 1) * unit + e, u1 = (tx + 1) * unit - e, v1 = 1 - ty * unit - e;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (uv.getX(i) < 0.5 ? 0 : 1) * (u1 - u0), v0 + (uv.getY(i) < 0.5 ? 0 : 1) * (v1 - v0));
    } else {
      const idx = ITEM_ICON_INDEX_LOCAL[id] ?? 0, tx = idx % 16, ty = Math.floor(idx / 16), unit = 1 / 16;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (tx + uv.getX(i)) * unit, 1 - (ty + 1) * unit + uv.getY(i) * unit);
    }
    dropGeometryCache.set(id, geometry);
  }
  const material = block ? new THREE.MeshBasicMaterial({ map: atlasTex }) : new THREE.MeshBasicMaterial({
    map: game.itemIconsCanvas ? itemTexFromCanvas(game.itemIconsCanvas) : atlasTex,
    transparent: true, alphaTest: 0.4, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  lighting.prepare(mesh, { emissionMap: block });
  mesh.position.set(x + 0.5, y + 0.3, z + 0.5);
  lighting.refreshObject(mesh, world, mesh.position, 0);
  itemGroup.add(mesh);
  const sourceUid = uid || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const entity = { mesh, id, count, damage, vy: 2, age: 0, onGround: false, uid: sourceUid };
  itemEntities.push(entity);
  if (!uid && game.networkRoom?.role === 'guest') {
    entity.uid = `${game.networkRoom.id}:${sourceUid}`;
    game.multiplayerClient?.send('item:spawn', { item: { uid: sourceUid, id, count, damage: damage || 0, pos: mesh.position.toArray(), vy: entity.vy, age: entity.age } });
  }
  return entity;
}

let _itemTex = null;
function itemTexFromCanvas(canvas) {
  if (!_itemTex) {
    _itemTex = new THREE.CanvasTexture(canvas);
    _itemTex.magFilter = THREE.NearestFilter;
    _itemTex.minFilter = THREE.NearestFilter;
    _itemTex.colorSpace = THREE.SRGBColorSpace;
  }
  return _itemTex;
}

// reuse ui icon map
import { ITEM_ICON_INDEX } from './ui/ui.js';
const ITEM_ICON_INDEX_LOCAL = ITEM_ICON_INDEX;

function removeNetworkItem(uid) {
  if (typeof uid !== 'string') return;
  const index = itemEntities.findIndex(item => item.uid === uid);
  if (index < 0) return;
  const [item] = itemEntities.splice(index, 1);
  itemGroup.remove(item.mesh); lighting.forget(item.mesh);
  item.mesh.material?.dispose?.();
}

function upsertNetworkItem(item) {
  if (!item || typeof item.uid !== 'string' || !Number.isInteger(item.id) || !Number.isFinite(item.count) || !Array.isArray(item.pos) || item.pos.length !== 3 || !item.pos.every(Number.isFinite)) return;
  let entity = itemEntities.find(candidate => candidate.uid === item.uid);
  if (!entity) entity = spawnItem(item.pos[0] - 0.5, item.pos[1] - 0.3, item.pos[2] - 0.5, item.id, item.count, item.damage || 0, item.uid);
  entity.count = item.count; entity.mesh.position.fromArray(item.pos);
  entity.vy = Number.isFinite(item.vy) ? item.vy : 0;
  entity.age = Number.isFinite(item.age) ? item.age : 0;
}

function applyNetworkItems(items) {
  if (!Array.isArray(items)) return;
  const seen = new Set();
  for (const item of items) {
    if (!item || typeof item.uid !== 'string' || !Number.isInteger(item.id) || !Number.isFinite(item.count) || !Array.isArray(item.pos) || item.pos.length !== 3 || !item.pos.every(Number.isFinite)) continue;
    seen.add(item.uid);
    upsertNetworkItem(item);
  }
  for (const item of [...itemEntities]) if (!seen.has(item.uid)) removeNetworkItem(item.uid);
}

function applySharedGameState(state) {
  if (!state || typeof state !== 'object') return;
  if (Array.isArray(state.chests)) {
    chests.clear();
    for (const [key, slots] of state.chests) if (typeof key === 'string' && Array.isArray(slots) && slots.length === 27) chests.set(key, slots);
  }
  if (Array.isArray(state.furnaces)) {
    furnaces.clear();
    for (const [key, furnace] of state.furnaces) if (typeof key === 'string' && furnace && typeof furnace === 'object') furnaces.set(key, furnace);
  }
  if (Number.isFinite(state.timeOfDay)) sky.time = ((state.timeOfDay % 1) + 1) % 1;
  if (ui?.mode === 'chest') refreshChest();
  if (ui?.mode === 'furnace') refreshFurnace();
}

function updateItems(dt, allowPickup) {
  const networked = !!game.networkRoom;
  const networkGuest = networked && game.networkRoom.role !== 'host';
  for (let idx = 0; idx < itemEntities.length; idx++) {
    const it = itemEntities[idx];
    if (it.dead) continue;
    const loaded = world.getChunk(Math.floor(it.mesh.position.x / CH), Math.floor(it.mesh.position.z / CH));
    it.mesh.visible = !!loaded?.generated;
    if (!loaded?.generated) continue; // preserve drops rather than falling through unloaded terrain
    if (!networkGuest) {
      it.age += dt;
      const inBlock = world.getBlock(Math.floor(it.mesh.position.x), Math.floor(it.mesh.position.y), Math.floor(it.mesh.position.z));
      if (inBlock === LAVA || inBlock === LAVA_FLOW) {
        audio.fizz?.();
        particles.spawnEffect(it.mesh.position.clone(), { color: 0x777777, life: 0.45, scale: 0.6, vy: 1.2, gravity: -0.2 });
        it.dead = true;
        continue;
      }
      const bx = Math.floor(it.mesh.position.x), by = Math.floor(it.mesh.position.y - 0.14), bz = Math.floor(it.mesh.position.z);
      const supportSolid = getBlock(world.getBlock(bx, by, bz)).solid;
      if (!supportSolid) it.onGround = false;
      if (!it.onGround) {
        it.vy -= 14 * dt;
        it.mesh.position.y += it.vy * dt;
        const nby = Math.floor(it.mesh.position.y - 0.14);
        if (getBlock(world.getBlock(bx, nby, bz)).solid && it.vy <= 0) {
          it.mesh.position.y = nby + 1.15;
          it.vy = 0;
          it.onGround = true;
        }
      }
      // Merge nearby matching stacks on the ground
      if (it.age > 0.25) {
        const limit = itemStackLimit(it.id);
        if (it.count < limit) {
          for (let j = idx + 1; j < itemEntities.length; j++) {
            const other = itemEntities[j];
            if (other.dead || other.id !== it.id || (other.damage || 0) !== (it.damage || 0) || other.age <= 0.25) continue;
            if (other.count >= limit) continue;
            if (it.mesh.position.distanceToSquared(other.mesh.position) > 1.56) continue;
            const take = Math.min(other.count, limit - it.count);
            if (take > 0) {
              it.count += take;
              other.count -= take;
              if (other.count <= 0) other.dead = true;
              if (it.count >= limit) break;
            }
          }
        }
      }
      it.mesh.rotation.y += dt * 1.6;
    }
    lighting.refreshObject(it.mesh, world, it.mesh.position, 0);

    // pickup
    const dx = it.mesh.position.x - player.pos.x, dy = it.mesh.position.y - player.pos.y - 0.8, dz = it.mesh.position.z - player.pos.z;
    if (allowPickup && !player.dead && dx * dx + dy * dy + dz * dz < 1.4 * 1.4 && it.age > 0.4 && !it.pendingPickup) {
      if (networked) {
        it.pendingPickup = game.multiplayerClient?.send('item:pickup', { uid: it.uid }) || false;
      } else {
        const inserted = player.insertItem(it.id, it.count, it.damage || 0);
        if (inserted > 0) {
          it.count -= inserted;
          audio.pop();
          if (it.count <= 0) it.dead = true;
        }
      }
    }
    if (it.age > 300) it.dead = true;
  }
  for (const it of itemEntities) {
    if (it.dead) {
      itemGroup.remove(it.mesh);
      lighting.forget(it.mesh);
      if (Array.isArray(it.mesh.material)) it.mesh.material.forEach(material => material.dispose());
      else it.mesh.material?.dispose();
    }
  }
  for (let i = itemEntities.length - 1; i >= 0; i--) {
    if (itemEntities[i].dead) itemEntities.splice(i, 1);
  }
}

// ---- block breaking / placing ----
function releaseContainer(x, y, z, id) {
  const key = `${x},${y},${z}`;
  const stacks = id === CHEST ? chests.get(key) : (id === FURNACE || id === FURNACE_LIT) && furnaces.has(key) ? Object.values(furnaces.get(key)).filter(v => v && typeof v === 'object' && Number.isFinite(v.id)) : null;
  if (stacks) for (const stack of stacks) if (stack?.count > 0) spawnItem(x, y, z, stack.id, stack.count, stack.damage || 0);
  if (id === CHEST) chests.delete(key);
  if (id === FURNACE || id === FURNACE_LIT) furnaces.delete(key);
}
function dropBlock(x, y, z, id) {
  const bd = getBlock(id);
  const count = bd.dropCount || 1;
  // leaves drop apples/saplings rarely
  if (id === LEAVES) {
    const r = Math.random();
    if (r < 0.05) spawnItem(x, y, z, 260, 1); // apple
    else if (r < 0.12) spawnItem(x, y, z, SAPLING, 1);
    return;
  }
  if (id === GRASS) { spawnItem(x, y, z, DIRT, 1); return; }
  if (id === STONE) { spawnItem(x, y, z, COBBLE, 1); return; }
  if (id === TALL_GRASS) {
    if (Math.random() < 0.3) spawnItem(x, y, z, 295, 1); // seeds
    return;
  }
  if (bd.drops) spawnItem(x, y, z, bd.drops, count);
}

function tryBreakBlock(dt) {
  const hit = player.raycast(world, 5);
  if (!hit) {
    player.mining.active = false;
    player.mining.progress = 0;
    return;
  }
  const id = world.getBlock(hit.x, hit.y, hit.z);
  if (game.networkRoom?.role === 'guest' && (id === CHEST || id === FURNACE || id === FURNACE_LIT)) {
    player.leftDown = false;
    player.mining.active = false;
    player.mining.progress = 0;
    ui.notify('Only the host can use or mine chests and furnaces in multiplayer.');
    return;
  }
  const held = player.heldStack;
  const total = player.gameMode === 'creative' ? 0 : player.gameMode === 'classic' ? id === BEDROCK ? Infinity : 0 : breakTime(id, held ? held.id : null);

  if (!player.mining.active || player.mining.x !== hit.x || player.mining.y !== hit.y || player.mining.z !== hit.z) {
    player.mining.active = true;
    player.mining.x = hit.x; player.mining.y = hit.y; player.mining.z = hit.z;
    player.mining.progress = 0;
    player.mining.total = total;
  }
  player.mining.progress += dt;
  if (Math.random() < dt * 6) {
    audio.dig(id);
    particles.spawnDig(hit, id);
  }

  if (player.mining.progress >= total) {
    // break!
    particles.spawnBreak(hit.x, hit.y, hit.z, id);
    const previousMeta = world.getMeta(hit.x, hit.y, hit.z);
    const partner = structurePartner(world, hit.x, hit.y, hit.z, id);
    if (partner) world.setBlock(partner.x, partner.y, partner.z, AIR);
    const containerKey = `${hit.x},${hit.y},${hit.z}`;
    releaseContainer(hit.x, hit.y, hit.z, id);
    world.setBlock(hit.x, hit.y, hit.z, AIR);
    if (player.gameMode !== 'creative' && player.gameMode !== 'classic') {
      if (id === CROPS) {
        cropLocations.delete(containerKey);
        for (const stack of cropDrops(previousMeta)) spawnItem(hit.x, hit.y, hit.z, stack.id, stack.count);
      } else if (id === LEAVES && held?.id === 359) {
        spawnItem(hit.x, hit.y, hit.z, LEAVES, 1);
      } else if (canHarvest(id, held ? held.id : null)) dropBlock(hit.x, hit.y, hit.z, id);
      if (held) player.useHeldOn(id);
    }
    audio.breakBlock(id);
    player.stats.blocksMined++;
    player.mining.active = false;
    player.mining.progress = 0;

    // gravity blocks (sand/gravel) fall
    const above = world.getBlock(hit.x, hit.y + 1, hit.z);
    if (above === SAND || above === GRAVEL) {
      world.setBlock(hit.x, hit.y + 1, hit.z, AIR);
      spawnItem(hit.x, hit.y + 1, hit.z, above, 1);
    }
  }
}

let eating = null;
function tryPlaceBlock() {
  const held = player.heldStack;
  if (!held) return;
  const itemDef = ITEMS[held.id];
  // These items are handled once per click, never by repeated block placement.
  if ([295, 325, 326, 327, 368].includes(held.id) || itemDef?.tool === 'hoe') return;
  if (itemDef?.food) {
    if (!eating || eating.id !== held.id) eating = { id: held.id, elapsed: 0 };
    return;
  }

  const hit = player.raycast(world, 5);
  const placeId = placeableBlockForItem(held.id);
  if (!hit || !placeId) return;

  // Replaceable blocks: if hit is TALL_GRASS, SAPLING, WATER, or LAVA, place directly at hit
  const hitBlockId = world.getBlock(hit.x, hit.y, hit.z);
  const pminX = player.pos.x - 0.35, pmaxX = player.pos.x + 0.35;
  const pminZ = player.pos.z - 0.35, pmaxZ = player.pos.z + 0.35;
  const pminY = player.pos.y, pmaxY = player.pos.y + 1.8;

  // Stack stone slab on top of an existing slab to form a full double slab
  if (placeId === STONE_SLAB && hitBlockId === STONE_SLAB && hit.face[1] === 1) {
    if (hit.x + 1 > pminX && hit.x < pmaxX && hit.y + 1 > pminY && hit.y + 0.5 < pmaxY && hit.z + 1 > pminZ && hit.z < pmaxZ) return;
    if (!world.setBlock(hit.x, hit.y, hit.z, DOUBLE_STONE_SLAB, 0)) return;
    if (player.gameMode !== 'creative' && player.gameMode !== 'classic') player.consumeHeld();
    audio.place(DOUBLE_STONE_SLAB);
    player.stats.blocksPlaced++;
    firstPersonArm.triggerPlaceSwing();
    ui.refresh();
    return;
  }

  const isReplaceable = (hitBlockId === TALL_GRASS || hitBlockId === SAPLING || hitBlockId === WATER || hitBlockId === LAVA);
  const px = isReplaceable ? hit.x : hit.x + hit.face[0];
  const py = isReplaceable ? hit.y : hit.y + hit.face[1];
  const pz = isReplaceable ? hit.z : hit.z + hit.face[2];

  // don't place inside the player
  if (px + 1 > pminX && px < pmaxX && py + 1 > pminY && py < pmaxY && pz + 1 > pminZ && pz < pmaxZ) return;

  const existing = world.getBlock(px, py, pz);
  if ([BED_BLOCK, CAKE_BLOCK, WOOD_DOOR, IRON_DOOR].includes(placeId) && !getBlock(world.getBlock(px, py - 1, pz)).solid) return;
  if (placeId === SAPLING && ![GRASS, DIRT].includes(world.getBlock(px, py - 1, pz))) return;
  if ([REDSTONE_WIRE, REDSTONE_REPEATER, RAIL].includes(placeId) && !getBlock(world.getBlock(px, py - 1, pz)).solid) return;
  if (existing !== AIR && !getBlock(existing).liquid && !isReplaceable) return;

  // Orient interactable blocks toward the player; item forms map to their block IDs.
  let meta = 0;
  if (placeId === WOOD_DOOR || placeId === IRON_DOOR || placeId === BED_BLOCK) {
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    meta = Math.abs(fz) >= Math.abs(fx) ? (fz > 0 ? 1 : 0) : (fx > 0 ? 3 : 2);
  } else if (placeId === TORCH || placeId === REDSTONE_TORCH || placeId === LEVER) {
    const [dx,dy,dz] = hit.face;
    if (dy < 0) return;
    meta = dx > 0 ? 1 : dx < 0 ? 2 : dz > 0 ? 3 : dz < 0 ? 4 : 0;
    if (!getBlock(world.getBlock(px-dx,py-dy,pz-dz)).solid) return;
  } else if (placeId === FURNACE || placeId === CRAFTING_TABLE || placeId === REDSTONE_REPEATER) {
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    meta = Math.abs(fz) >= Math.abs(fx) ? (fz > 0 ? 1 : 0) : (fx > 0 ? 3 : 2);
  }
  const paired = placeId === WOOD_DOOR || placeId === IRON_DOOR || placeId === BED_BLOCK;
  if (paired) {
    const [dx, , dz] = STRUCTURE_DIRECTIONS[meta & 3];
    const hx = px + (placeId === BED_BLOCK ? dx : 0), hy = py + (placeId === BED_BLOCK ? 0 : 1), hz = pz + (placeId === BED_BLOCK ? dz : 0);
    const hc = world.getChunk(Math.floor(hx / CH), Math.floor(hz / CH));
    if (hy >= world.height || !hc?.generated || world.getBlock(hx,hy,hz) !== AIR) return;
    if (placeId === BED_BLOCK && !getBlock(world.getBlock(hx,hy-1,hz)).solid) return;
    if (hx+1 > pminX && hx < pmaxX && hy+1 > pminY && hy < pmaxY && hz+1 > pminZ && hz < pmaxZ) return;
    if (!world.setBlock(px,py,pz,placeId,meta)) return;
    if (!world.setBlock(hx,hy,hz,placeId,meta | 8)) { world.setBlock(px,py,pz,AIR); return; }
  } else if (!world.setBlock(px, py, pz, placeId, meta)) return;
  if (player.gameMode !== 'creative' && player.gameMode !== 'classic') player.consumeHeld();
  audio.place(placeId);
  player.stats.blocksPlaced++;
  firstPersonArm.triggerPlaceSwing();
  ui.refresh();
}



// ---- explosions (creepers, TNT) ----
function explode(pos, radius, player, damageMultiplier = 1) {
  audio.explosion();
  const r2 = radius * radius;
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2 * (0.72 + Math.random() * 0.5)) continue;
        const x = Math.floor(pos.x + dx), y = Math.floor(pos.y + dy), z = Math.floor(pos.z + dz);
        const b = world.getBlock(x, y, z);
        if (b === AIR || b === 7) continue; // no bedrock
        const bd = getBlock(b);
        if (bd.hardness < 0) continue;
        if (Math.random() < 0.62) {
          releaseContainer(x, y, z, b);
          const partner = structurePartner(world, x, y, z, b);
          if (partner) world.setBlock(partner.x, partner.y, partner.z, AIR);
          world.setBlock(x, y, z, AIR);
          if (Math.random() < 0.18) dropBlock(x, y, z, b);
        }
      }
    }
  }
  // damage player
  const dist = player.pos.distanceTo(pos);
  if (dist < radius * 1.6) {
    player.damage(Math.ceil((1 - dist / (radius * 1.6)) * 12 * damageMultiplier), audio);
  }
  // knockback
  const kb = player.pos.clone().sub(pos).normalize().multiplyScalar(Math.max(0, 8 - dist * 1.6));
  player.vel.add(kb);
}

// ---- arrows & throwables ----
const arrows = [];
const arrowGeometry = new THREE.BoxGeometry(0.08, 0.08, 0.5);
const throwableGeometry = new THREE.BoxGeometry(0.18, 0.18, 0.18);
function createArrow(from, velocity, owner, targetId = null, uid = null, networkRemote = false, damage = 2, kind = 'arrow') {
  const geo = kind === 'arrow' ? arrowGeometry : throwableGeometry;
  const color = kind === 'snowball' ? 0xf2f8ff : kind === 'egg' ? 0xefe2be : 0x8a6a42;
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
  lighting.prepare(mesh);
  mesh.position.copy(from);
  lighting.refreshObject(mesh, world, mesh.position, 0);
  scene.add(mesh);
  const entry = { mesh, vel: velocity, age: 0, owner, targetId, kind,
    uid: uid || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, networkRemote, networkTimer: 0, damage };
  arrows.push(entry);
  return entry;
}
function shootArrow(fromMob, player, damage = 2) {
  const from = fromMob.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
  const to = player.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
  createArrow(from, to.sub(from).normalize().multiplyScalar(18), 'mob', player.id || null, null, false, damage);
}
function shootPlayerArrow() {
  const dir = new THREE.Vector3(-Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.yaw) * Math.cos(player.pitch));
  createArrow(camera.position.clone().addScaledVector(dir, 0.45), dir.multiplyScalar(22), 'player');
  audio.bow();
}
function shootThrowable(itemId) {
  const kind = itemId === 332 ? 'snowball' : 'egg';
  const dir = new THREE.Vector3(-Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.yaw) * Math.cos(player.pitch));
  createArrow(camera.position.clone().addScaledVector(dir, 0.45), dir.multiplyScalar(17), 'player', null, null, false, 0, kind);
  audio.bow();
}
function upsertNetworkProjectile(shot) {
  if (!shot || typeof shot.uid !== 'string' || !Array.isArray(shot.pos) || shot.pos.length !== 3 || !shot.pos.every(Number.isFinite) || !Array.isArray(shot.vel) || shot.vel.length !== 3 || !shot.vel.every(Number.isFinite)) return;
  let arrow = arrows.find(candidate => candidate.uid === shot.uid);
  if (!arrow) arrow = createArrow(new THREE.Vector3(...shot.pos), new THREE.Vector3(...shot.vel), shot.owner === 'mob' ? 'mob' : 'player', shot.targetId, shot.uid, true);
  arrow.mesh.position.fromArray(shot.pos);
  arrow.vel.fromArray(shot.vel);
  arrow.age = Number.isFinite(shot.age) ? Math.max(0, shot.age) : arrow.age;
  arrow.damage = Number.isFinite(shot.damage) ? Math.max(0, Math.min(40, shot.damage)) : arrow.damage;
  arrow.targetId = typeof shot.targetId === 'string' ? shot.targetId : null;
}
function applyNetworkProjectiles(projectiles) {
  if (!Array.isArray(projectiles)) return;
  const seen = new Set();
  for (const shot of projectiles) { upsertNetworkProjectile(shot); if (typeof shot?.uid === 'string') seen.add(shot.uid); }
  for (const arrow of [...arrows]) if (arrow.networkRemote && !seen.has(arrow.uid)) removeNetworkProjectile(arrow.uid);
}
function removeNetworkProjectile(uid) {
  const index = arrows.findIndex(arrow => arrow.uid === uid && arrow.networkRemote);
  if (index < 0) return;
  const [arrow] = arrows.splice(index, 1);
  scene.remove(arrow.mesh); lighting.forget(arrow.mesh); arrow.mesh.material.dispose();
}
function updateArrows(dt) {
  for (const a of arrows) {
    if (a.networkRemote) {
      a.age += dt; a.vel.y -= 12 * dt; a.mesh.position.addScaledVector(a.vel, dt);
      a.mesh.lookAt(a.mesh.position.clone().add(a.vel)); lighting.refreshObject(a.mesh, world, a.mesh.position, 0);
      if (a.age > 6) a.dead = true;
      continue;
    }
    a.age += dt;
    a.vel.y -= 12 * dt;
    // Small steps prevent fast projectiles tunnelling through thin targets/blocks.
    const steps = Math.max(1, Math.ceil(a.vel.length() * dt / 0.15));
    const step = dt / steps;
    for (let i = 0; i < steps && !a.dead; i++) {
      a.mesh.position.addScaledVector(a.vel, step);
      const pos = a.mesh.position;
      const block = world.getBlock(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
      if (getBlock(block).solid) {
        a.dead = true;
        if (a.owner === 'player') {
          if (a.kind === 'arrow') spawnItem(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z), 262, 1);
          else {
            particles.spawnEffect(pos.clone(), { color: a.kind === 'snowball' ? 0xffffff : 0xf2e4c4, life: 0.35, scale: 0.55, vy: 1.4 });
            if (a.kind === 'egg' && !game.networkRoom && Math.random() < 0.125) mobs.add('chicken', pos.x, Math.floor(pos.y) + 1.05, pos.z);
          }
        }
        audio.arrowHit();
        break;
      }
      if (a.owner === 'mob') {
        const remoteTarget = a.targetId ? remotePlayers.get(a.targetId)?.target : null;
        if (remoteTarget) {
          if (Math.abs(pos.x - remoteTarget.x) < 0.4 && Math.abs(pos.z - remoteTarget.z) < 0.4 && pos.y >= remoteTarget.y && pos.y <= remoteTarget.y + 1.8) {
            game.multiplayerClient?.send('player:damage', { targetId: a.targetId, amount: a.damage });
            a.dead = true; audio.arrowHit();
          }
        } else if (!a.targetId && Math.abs(pos.x - player.pos.x) < 0.4 && Math.abs(pos.z - player.pos.z) < 0.4 && pos.y >= player.pos.y && pos.y <= player.pos.y + 1.8) {
          player.damage(a.damage, audio); a.dead = true; audio.arrowHit();
        }
      } else {
        for (const mob of mobs.mobs) {
          if (mob.dead) continue;
          const half = mob.def.w / 2 + 0.05;
          if (Math.abs(pos.x - mob.pos.x) <= half && Math.abs(pos.z - mob.pos.z) <= half && pos.y >= mob.pos.y && pos.y <= mob.pos.y + mob.def.h) {
            if (game.networkRoom?.role === 'guest') {
              game.multiplayerClient?.send('mob:attack', { uid: mob.networkId, heldId: null, ranged: true });
            } else {
              const knockback = a.vel.clone().normalize().multiplyScalar(a.kind === 'arrow' ? 2 : 1.4);
              mob.damage(a.kind === 'arrow' ? 4 : 0, audio, { knockback });
            }
            if (a.kind !== 'arrow') particles.spawnEffect(pos.clone(), { color: a.kind === 'snowball' ? 0xffffff : 0xf2e4c4, life: 0.35, scale: 0.55, vy: 1.4 });
            a.dead = true; audio.arrowHit(); break;
          }
        }
      }
    }
    a.mesh.lookAt(a.mesh.position.clone().add(a.vel));
    lighting.refreshObject(a.mesh, world, a.mesh.position, 0);
    if (a.age > 6) a.dead = true;
  }
  for (const a of arrows) {
    if (!a.networkRemote && game.networkRoom && game.multiplayerClient) {
      if (a.dead) game.multiplayerClient.send('projectile:remove', { uid: a.uid });
      else {
        a.networkTimer -= dt;
        if (a.networkTimer <= 0) {
          game.multiplayerClient.send('projectile:update', { projectile: { uid: a.uid, owner: a.owner, pos: a.mesh.position.toArray(), vel: a.vel.toArray(), age: a.age, targetId: a.targetId, damage: a.damage } });
          a.networkTimer = 0.12;
        }
      }
    }
    if (a.dead) { scene.remove(a.mesh); lighting.forget(a.mesh); a.mesh.material.dispose(); }
  }
  for (let i = arrows.length - 1; i >= 0; i--) if (arrows[i].dead) arrows.splice(i, 1);
}

// effects object handed to mobs
const effects = {
  explosion: (pos, radius, p, damageMultiplier = 1) => explode(pos, radius, p, damageMultiplier),
  shootArrow: (mob, p, damage) => shootArrow(mob, p, damage),
  mobBurn: (mob) => {
    const pos = new THREE.Vector3(mob.pos.x, mob.pos.y + 0.45, mob.pos.z);
    particles.spawnEffect(pos, { color: Math.random() < 0.5 ? 0xff8a1c : 0xffd247, life: 0.35, scale: 0.7, vy: 1.5, gravity: -0.2 });
    if (Math.random() < 0.45) particles.spawnEffect(pos, { color: 0x777777, life: 0.6, scale: 0.55, vy: 0.9, gravity: -0.15 });
  },
  dropMobLoot: (mob) => {
    if (!mob.killed) return; // despawned or exploded — no drops
    for (const { id, count } of rollMobDrops(mob)) {
      spawnItem(Math.floor(mob.pos.x), Math.floor(mob.pos.y), Math.floor(mob.pos.z), id, count);
    }
  },
};

// ---- furnace handling ----
const furnaces = new Map(Array.isArray(savedGame?.furnaces) ? savedGame.furnaces.filter(e => Array.isArray(e) && typeof e[0] === 'string' && e[1] && typeof e[1] === 'object') : []);
const chests = new Map(Array.isArray(savedGame?.chests) ? savedGame.chests.filter(e => Array.isArray(e) && typeof e[0] === 'string' && Array.isArray(e[1]) && e[1].length === 27) : []);

function refreshChest() {
  const panel = document.getElementById('chest-screen');
  if (!panel || ui.mode !== 'chest') return;
  panel.querySelectorAll('[data-chest]').forEach(slot => ui.renderSlot(slot, game.openChestData.slots[+slot.dataset.chest]));
  panel.querySelectorAll('[data-inv]').forEach(slot => ui.renderSlot(slot, player.inventory[+slot.dataset.inv]));
}
function openChest(x, y, z) {
  const key = `${x},${y},${z}`;
  if (!chests.has(key)) chests.set(key, new Array(27).fill(null));
  openChestSlots(chests.get(key), key, 'Chest');
}
function openChestSlots(slots, key, title, vehicle = null) {
  game.openChestData = { key, slots, vehicle };
  let panel = document.getElementById('chest-screen');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'chest-screen'; panel.className = 'screen panel-screen';
    panel.innerHTML = `<div class="panel furnace-panel"><div class="inv-title">Chest</div><div class="inv-main" id="chest-slots"></div><div class="inv-title">Inventory</div><div class="inv-main" id="chest-inv"></div><div class="inv-hotbar" id="chest-hotbar"></div></div>`;
    document.getElementById('ui').appendChild(panel);
    ui.bindBackdropDrop(panel);
    const add = (parent, type, index) => {
      const slot = document.createElement('div'); slot.className = 'slot'; slot.dataset[type] = index;
      slot.addEventListener('mousedown', event => { ui.slotClick(event, type === 'chest' ? 'chest' : 'inv', index); refreshChest(); });
      slot.addEventListener('contextmenu', event => event.preventDefault());
      ui.bindSlotHover(slot, () => type === 'chest' ? game.openChestData?.slots[index] : player.inventory[index]);
      panel.querySelector(parent).appendChild(slot);
    };
    for (let i = 0; i < 27; i++) add('#chest-slots', 'chest', i);
    for (let i = 9; i < 36; i++) add('#chest-inv', 'inv', i);
    for (let i = 0; i < 9; i++) add('#chest-hotbar', 'inv', i);
  }
  panel.querySelector('.inv-title').textContent = title;
  ui.setMode('chest');
  refreshChest();
}

function updateFurnaces(dt) {
  for (const [key, furnace] of furnaces) {
    const [x, y, z] = key.split(',').map(Number);
    const chunk = world.getChunk(Math.floor(x / CH), Math.floor(z / CH));
    const current = world.getBlock(x, y, z);
    if (!chunk?.generated || (current !== FURNACE && current !== FURNACE_LIT)) continue;

    const state = tickFurnace(furnace, dt);
    const desired = state.burning ? FURNACE_LIT : FURNACE;
    if (current !== desired) world.setBlock(x, y, z, desired, world.getMeta(x, y, z));
    furnace.soundTimer = Math.max(0, (furnace.soundTimer || 0) - dt);
    if (state.burning && furnace.soundTimer <= 0) {
      audio.furnace();
      furnace.soundTimer = 0.75;
    }
  }
  if (ui.mode === 'furnace') refreshFurnace();
}

function openFurnace(x, y, z) {
  const key = `${x},${y},${z}`;
  if (!furnaces.has(key)) furnaces.set(key, createFurnaceState());
  game.openFurnaceData = { key, f: furnaces.get(key) };
  ui.setMode('furnace');
  buildFurnaceUI();
}

function buildFurnaceUI() {
  let panel = document.getElementById('furnace-screen');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'screen panel-screen';
    panel.id = 'furnace-screen';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="panel furnace-panel">
        <div class="inv-title">Furnace</div>
        <div class="furnace-layout">
          <div class="furnace-col">
            <div class="slot" id="f-in"></div>
            <div class="furnace-flame" id="f-flame" aria-hidden="true"></div>
            <div class="slot" id="f-fuel"></div>
          </div>
          <div class="furnace-progress" id="f-prog"><div id="f-prog-fill"></div></div>
          <div class="slot craft-out" id="f-out"></div>
        </div>
        <div class="inv-title">Inventory</div>
        <div class="inv-main" id="f-inv-main"></div>
        <div class="inv-hotbar" id="f-inv-hotbar"></div>
      </div>
    `;
    document.getElementById('ui').appendChild(panel);
    ui.bindBackdropDrop(panel);

    const onInvSlot = index => event => {
      event.preventDefault();
      const current = game.openFurnaceData?.f;
      if (event.shiftKey && current) {
        const stack = player.inventory[index];
        if (!stack) return;
        const targetKey = smeltResult(stack.id) != null ? 'input' : FUEL_TIMES[stack.id] ? 'fuel' : null;
        if (targetKey) {
          const dest = current[targetKey];
          const limit = itemStackLimit(stack.id);
          if (!dest) {
            current[targetKey] = { ...stack };
            player.inventory[index] = null;
          } else if (dest.id === stack.id && (dest.damage || 0) === (stack.damage || 0) && dest.count < limit) {
            const take = Math.min(stack.count, limit - dest.count);
            dest.count += take;
            stack.count -= take;
            if (stack.count <= 0) player.inventory[index] = null;
          }
          refreshFurnace();
          ui.refresh();
          game.syncSharedState();
          return;
        }
      }
      ui.slotClick(event, 'inv', index);
      refreshFurnace();
    };

    const main = panel.querySelector('#f-inv-main');
    const hot = panel.querySelector('#f-inv-hotbar');
    for (let i = 9; i < 36; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.inv = i;
      slot.addEventListener('mousedown', onInvSlot(i));
      slot.addEventListener('contextmenu', event => event.preventDefault());
      ui.bindSlotHover(slot, () => player.inventory[i]);
      main.appendChild(slot);
    }
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.inv = i;
      slot.addEventListener('mousedown', onInvSlot(i));
      slot.addEventListener('contextmenu', event => event.preventDefault());
      ui.bindSlotHover(slot, () => player.inventory[i]);
      hot.appendChild(slot);
    }

    const onFurnaceSlot = which => event => {
      event.preventDefault();
      const current = game.openFurnaceData?.f;
      if (!current) return;
      if (event.shiftKey && current[which]) {
        const src = current[which];
        const inserted = player.insertItem(src.id, src.count, src.damage || 0);
        if (inserted > 0) {
          src.count -= inserted;
          if (src.count <= 0) current[which] = null;
          if (which === 'output') audio.pop();
          refreshFurnace();
          ui.refresh();
          game.syncSharedState();
        }
        return;
      }
      const result = interactWithFurnaceSlot(current, which, player.cursorStack, event.button);
      if (!result.changed) return;
      player.cursorStack = result.cursorStack;
      refreshFurnace();
      ui.refresh();
      game.syncSharedState();
    };
    const fIn = panel.querySelector('#f-in');
    const fFuel = panel.querySelector('#f-fuel');
    const fOut = panel.querySelector('#f-out');
    fIn.addEventListener('mousedown', onFurnaceSlot('input'));
    fFuel.addEventListener('mousedown', onFurnaceSlot('fuel'));
    fOut.addEventListener('mousedown', onFurnaceSlot('output'));
    ui.bindSlotHover(fIn, () => game.openFurnaceData?.f?.input);
    ui.bindSlotHover(fFuel, () => game.openFurnaceData?.f?.fuel);
    ui.bindSlotHover(fOut, () => game.openFurnaceData?.f?.output);
    for (const el of [fIn, fFuel, fOut]) {
      el.addEventListener('contextmenu', event => event.preventDefault());
    }
  }
  panel.style.display = 'flex';
  refreshFurnace();
}

function refreshFurnace() {
  const panel = document.getElementById('furnace-screen');
  const furnace = game.openFurnaceData?.f;
  if (!panel || panel.style.display === 'none' || !furnace) return;
  ui.renderSlot(panel.querySelector('#f-in'), furnace.input);
  ui.renderSlot(panel.querySelector('#f-out'), furnace.output);
  ui.renderSlot(panel.querySelector('#f-fuel'), furnace.fuel);
  panel.querySelector('#f-flame').style.opacity = furnace.burn > 0 ? 1 : 0.25;
  panel.querySelector('#f-prog-fill').style.width = `${Math.min(100, Math.max(0, furnace.cook / 6 * 100))}%`;
  panel.querySelectorAll('[data-inv]').forEach(slot => ui.renderSlot(slot, player.inventory[+slot.dataset.inv]));
}

// A lightweight bobber and line keep fishing visible without another simulation system.
let fishing = null;
function clearFishing() {
  if (!fishing) return;
  scene.remove(fishing.bobber, fishing.line);
  fishing.bobber.geometry.dispose(); fishing.bobber.material.dispose();
  fishing.line.geometry.dispose(); fishing.line.material.dispose();
  fishing = null;
}
function useFishingRod() {
  if (fishing) {
    if (fishing.ready) {
      const inserted = player.insertItem(349, 1);
      if (!inserted) game.dropItem({ id: 349, count: 1 });
      ui.notify('Caught a fish!'); audio.pop();
    }
    player.useHeldOn(AIR);
    clearFishing(); ui.refresh(); return;
  }
  const hit = player.raycast(world, 20, { includeLiquids: true });
  if (!hit || (hit.block !== WATER && hit.block !== WATER_FLOW)) { ui.notify('Aim at water to cast'); return; }
  const bobber = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: 0xed5147 }));
  bobber.position.set(hit.x + 0.5, hit.y + 0.95, hit.z + 0.5);
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([camera.position, bobber.position]);
  const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: 0xd8d8d8 }));
  scene.add(bobber, line);
  fishing = { bobber, line, x: hit.x, y: hit.y, z: hit.z, time: 8 + Math.random() * 10, ready: false };
  audio.bow();
}
function updateFishing(dt) {
  if (!fishing) return;
  if (player.heldStack?.id !== 346 || (world.getBlock(fishing.x, fishing.y, fishing.z) !== WATER && world.getBlock(fishing.x, fishing.y, fishing.z) !== WATER_FLOW)) { clearFishing(); return; }
  fishing.time -= dt;
  if (fishing.time <= 0 && !fishing.ready) {
    fishing.ready = true; fishing.time = -4;
    ui.notify('A bite! Reel in now'); audio.pop();
  } else if (fishing.ready && fishing.time <= -8) {
    fishing.ready = false; fishing.time = 8 + Math.random() * 10;
  }
  fishing.bobber.position.y = fishing.y + 0.95 + Math.sin(game.time * 4) * 0.04 - (fishing.ready ? 0.12 : 0);
  fishing.line.geometry.setFromPoints([camera.position, fishing.bobber.position]);
}

// Plant growth is updated at low frequency, without scanning every block each frame.
const cropLocations = new Set([...world.edits].filter(([, id]) => id === CROPS).map(([key]) => key));
let cropClock = 0;
function updateCrops(dt) {
  cropClock += dt;
  if (cropClock < 1) return;
  cropClock %= 1;
  for (const key of cropLocations) {
    const [x, y, z] = key.split(',').map(Number);
    const chunk = world.getChunk(Math.floor(x / CH), Math.floor(z / CH));
    if (!chunk?.generated) continue;
    if (world.getBlock(x, y, z) !== CROPS) { cropLocations.delete(key); continue; }
    if (world.getBlock(x, y - 1, z) !== FARMLAND) {
      world.setBlock(x, y, z, AIR);
      spawnItem(x, y, z, 295, 1);
      cropLocations.delete(key);
    } else growCrop(world, x, y, z);
  }
}

// ---- input: interact ----
let placeCooldown = 0;
const tntFuses = []; // {x, y, z, timer}
document.addEventListener('mousedown', (e) => {
  if (ui.mode !== 'game' || !player.controlsActive) return;
  if (`Mouse${e.button}` === player.bindings.attack) {
    const target = vehicles.target(player);
    if (target?.type === 'storage' && game.networkRoom) {
      player.leftDown = false;
      ui.notify('Storage minecarts are unavailable in multiplayer.');
      return;
    }
    if (target && vehicles.remove(target)) {
      game.multiplayerClient?.send('vehicle:remove', { uid: target.networkId });
      const x = target.group.position.x - 0.5, y = target.group.position.y, z = target.group.position.z - 0.5;
      spawnItem(x, y, z, ({boat:333,minecart:328,storage:342,powered:343})[target.type], 1);
      if (target.slots) for (const stack of target.slots) if (stack?.count > 0) spawnItem(x,y,z,stack.id,stack.count,stack.damage || 0);
      player.leftDown = false; audio.pop(); return;
    }
  }
  if (`Mouse${e.button}` === player.bindings.use) {
    const vehicle = vehicles.target(player);
    if (vehicle) {
      player.rightDown = false;
      if (vehicle.type === 'storage' && game.networkRoom) {
        ui.notify('Storage minecarts are unavailable in multiplayer.');
        return;
      }
      if (vehicle.type === 'storage') { openChestSlots(vehicle.slots, null, 'Minecart with Chest', vehicle); return; }
      if (vehicle.type === 'powered') {
        if (player.heldStack?.id === 263) {
          player.consumeHeld(); vehicle.fuel = Math.min(3600, vehicle.fuel + 180);
          vehicle.travel = [-Math.sin(player.yaw), -Math.cos(player.yaw)];
          if (game.networkRoom?.role === 'guest') game.publishVehicleState(vehicle, false);
          ui.refresh(); audio.pop(); ui.notify('Powered minecart fueled');
        } else ui.notify('Use coal to fuel the minecart');
        return;
      }
      if (vehicles.mount(vehicle, player)) { ui.notify('Sneak to dismount'); return; }
    }
    const held = player.heldStack;
    const mob = mobs.raycastTarget(player, 4);
    if (mob && useOnMob(player, mob, { drop: (id, count) => spawnItem(mob.pos.x - 0.5, mob.pos.y, mob.pos.z - 0.5, id, count) })) {
      player.rightDown = false; audio.pop(); ui.refresh(); firstPersonArm.triggerPlaceSwing(); return;
    }
    const hit = player.raycast(world, 5, { includeLiquids: held?.id === 325 || held?.id === 333 });
    if (hit) {
      const id = world.getBlock(hit.x, hit.y, hit.z);
      if (game.networkRoom?.role === 'guest' && (id === CHEST || id === FURNACE || id === FURNACE_LIT)) {
        player.rightDown = false;
        ui.notify('Only the host can use or mine chests and furnaces in multiplayer.');
        return;
      }
      if (id === CHEST) { openChest(hit.x, hit.y, hit.z); return; }
      if (id === CRAFTING_TABLE) {
        ui.craftSize = 3; ui.setMode('crafting'); return;
      }
      if (id === FURNACE || id === FURNACE_LIT) { openFurnace(hit.x, hit.y, hit.z); return; }
      if (id === REDSTONE_REPEATER) {
        const meta = world.getMeta(hit.x, hit.y, hit.z);
        world.setMeta(hit.x, hit.y, hit.z, (meta & ~24) | ((((meta >> 3) + 1) & 3) << 3));
        player.rightDown = false; audio.click(); return;
      }
      if (id === LEVER) {
        world.setMeta(hit.x, hit.y, hit.z, world.getMeta(hit.x, hit.y, hit.z) ^ 8);
        player.rightDown = false; audio.click(); return;
      }
      if (id === JUKEBOX) {
        player.rightDown = false; audio.jukebox?.(); ui.notify('Now playing: Music Disc'); return;
      }
      if (id === WOOD_DOOR) {
        const meta = world.getMeta(hit.x, hit.y, hit.z);
        if (!(meta & 16)) setDoorOpen(world, hit.x, hit.y, hit.z, !(meta & 4));
        player.rightDown = false; audio.door((meta & 4) === 0); return;
      }
      if (id === BED_BLOCK) {
        player.rightDown = false;
        if (sky.timeOfDay >= 0.22 && sky.timeOfDay < 0.78) ui.notify('You can only sleep at night');
        else if (mobs.nearestHostile(player.pos, 8)) ui.notify('Monsters are nearby');
        else {
          game.spawnBed = { x: hit.x, y: hit.y, z: hit.z };
          sky.time = 0.25;
          ui.notify('Respawn point set');
          game.saveGame();
        }
        return;
      }
      if (id === TNT && held?.id === 259) {
        player.rightDown = false;
        if (!tntFuses.some(t => t.x === hit.x && t.y === hit.y && t.z === hit.z)) {
          if (game.networkRoom?.role === 'guest') game.multiplayerClient?.send('tnt:ignite', { x: hit.x, y: hit.y, z: hit.z });
          else tntFuses.push({ x: hit.x, y: hit.y, z: hit.z, timer: 3.2 });
          player.useHeldOn(TNT); audio.fuse();
        }
        return;
      }
      if (useOnBlock(world, player, hit, { drop: (item, count) => spawnItem(player.pos.x - 0.5, player.pos.y, player.pos.z - 0.5, item, count) })) {
        if (world.getBlock(hit.x, hit.y + 1, hit.z) === CROPS) cropLocations.add(`${hit.x},${hit.y + 1},${hit.z}`);
        player.rightDown = false; audio.pop(); firstPersonArm.triggerPlaceSwing(); ui.refresh();
        return;
      }
    }
    if (held?.id === 342 && game.networkRoom) {
      player.rightDown = false;
      ui.notify('Storage minecarts are unavailable in multiplayer.');
      return;
    }
    if ([333,328,342,343].includes(held?.id)) {
      player.rightDown = false;
      const type = ({333:'boat',328:'minecart',342:'storage',343:'powered'})[held.id];
      const placedVehicle = vehicles.place(type, hit);
      if (placedVehicle) {
        if (game.networkRoom?.role === 'guest') game.publishVehicleState(placedVehicle, false);
        player.consumeHeld(); audio.place(PLANKS); ui.refresh();
      }
      else ui.notify(held.id === 333 ? 'Place boats on water' : 'Place minecarts on rails');
      return;
    }
    if (held?.id === 346) { player.rightDown = false; useFishingRod(); return; }
    if (held?.id === 332 || held?.id === 344) {
      player.rightDown = false;
      const throwId = held.id;
      if (player.gameMode !== 'creative' && player.gameMode !== 'classic') player.consumeHeld();
      shootThrowable(throwId);
      firstPersonArm.triggerPlaceSwing();
      ui.refresh();
      return;
    }
    if (held?.id === 261) {
      player.rightDown = false;
      if (player.hasItem(262)) {
        player.consumeItemId(262, 1);
        player.useHeldOn(AIR);
        shootPlayerArrow();
        firstPersonArm.triggerPlaceSwing();
        ui.refresh();
      }
      return;
    }
    tryPlaceBlock();
    placeCooldown = 0.25;
  }
});

function updateTNT(dt) {
  for (const t of tntFuses) {
    t.timer -= dt;
    // flash: swap to white-ish? keep simple — flash tnt top texture via block swap
    if (t.timer <= 0) {
      t.dead = true;
      if (world.getBlock(t.x, t.y, t.z) === TNT) {
        world.setBlock(t.x, t.y, t.z, AIR);
        explode(new THREE.Vector3(t.x + 0.5, t.y + 0.5, t.z + 0.5), 3.4, player);
      }
    }
  }
  for (let i = tntFuses.length - 1; i >= 0; i--) if (tntFuses[i].dead) tntFuses.splice(i, 1);
}

// ---- main loop ----
let lastT = performance.now();
let fps = 0, fpsCount = 0, fpsTimer = 0, lastDebugUpdate = 0;
let prioritizeDirty = false;
let sprintFovOffset = 0;
let eatChewTimer = 0;

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  if (graphicsLost) { lastT = now; return; }
  if (game.settings.maxFps && now - lastT < 1000 / game.settings.maxFps) return;
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.1) dt = 0.1;
  const simulationPaused = game.started && ui.mode !== 'title' &&
    ['pause', 'death', 'creative', 'inventory', 'crafting', 'furnace', 'chest'].includes(ui.mode);
  const networked = Boolean(game.networkRoom);
  if (!simulationPaused || networked) game.time += dt;
  if (game.started && ui.mode !== 'title' && !game.networkRoom) {
    saveClock += dt;
    if (saveClock >= 15) { game.saveGame(); saveClock = 0; }
  }

  fpsCount++; fpsTimer += dt;
  if (fpsTimer >= 1) { fps = fpsCount; fpsCount = 0; fpsTimer = 0; }

  if (game.started && ui.mode !== 'title') {
    const paused = simulationPaused;
    if (paused) eating = null;

    if (!paused) {
      const mountedBeforeVehicleUpdate = vehicles.mounted;
      const ridingVehicle = vehicles.update(dt, player);
      if (!ridingVehicle) player.update(dt, world, audio);
      if (player.pos.y < -32 && !player.dead) {
        if (player.gameMode === 'survival') player.damage(40, audio, true);
        else game.respawn();
      }
      player.updateHunger(dt, game.settings.difficulty, audio);
      if (game.networkRoom?.role === 'guest') {
        if (mountedBeforeVehicleUpdate && !vehicles.mounted) game.publishVehicleState(mountedBeforeVehicleUpdate, false);
        else if (vehicles.mounted) {
          networkVehicleTimer -= dt;
          if (networkVehicleTimer <= 0) { game.publishVehicleState(vehicles.mounted, true); networkVehicleTimer = 0.15; }
        }
      }
      if (player.leftDown && player.controlsActive) {
        if (mobs.raycastTarget(player, 3.5)) {
          mobs.attack(player, player.heldStack?.id ?? null, audio, 3.5, game.networkRoom?.role === 'guest'
            ? (uid, heldId) => game.multiplayerClient?.send('mob:attack', { uid, heldId })
            : null);
          player.mining.active = false;
          player.mining.progress = 0;
        } else tryBreakBlock(dt);
      } else if (!player.leftDown) {
        player.mining.active = false;
        player.mining.progress = 0;
      }

      // D. Continuous block placement with repeat cooldown
      if (player.rightDown && player.controlsActive) {
        placeCooldown -= dt;
        if (placeCooldown <= 0) {
          tryPlaceBlock();
          placeCooldown = 0.25;
        }
      } else {
        placeCooldown = 0;
      }
      const eatingStep = advanceEating(eating, dt, player, audio, ui.mode === 'game');
      eating = eatingStep.eating;
      if (eating) {
        eatChewTimer += dt;
        if (eatChewTimer >= 0.25) { eatChewTimer %= 0.25; audio.chew?.(); }
      } else {
        eatChewTimer = 0;
      }
      if (eatingStep.completed) ui.refresh();
    }

    // Smooth sprint FOV boost (relaxes cleanly when paused or stopped)
    const targetSprintFov = !paused && player.sprinting ? 8 : 0;
    sprintFovOffset += (targetSprintFov - sprintFovOffset) * Math.min(1, dt * 10);
    const nextFov = game.settings.fov + sprintFovOffset;
    if (Math.abs(camera.fov - nextFov) > 0.02) {
      camera.fov = nextFov;
      camera.updateProjectionMatrix();
    }

    // Local menus block input, not the clock and world simulation of a shared room.
    if (!paused || networked) {
      const hostSimulates = !networked || game.networkRoom.role === 'host';
      if (hostSimulates && game.edition !== 'classic') mobs.update(dt, player, sky.timeOfDay, effects, audio, networked ? remoteMobTargets() : [], game.settings.difficulty);
      updateItems(dt, !paused);
      updateArrows(dt);
      if (hostSimulates) {
        fluids.tick(dt);
        redstone.update(dt);
        updateFurnaces(dt);
        updateCrops(dt);
        updateTNT(dt);
      }
      if (!paused) updateFishing(dt);
      particles.update(dt, world);
      if (networked && game.multiplayerClient) {
        networkStateTimer -= dt;
        if (networkStateTimer <= 0) {
          game.multiplayerClient.send('player:state', { state: {
            x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw, pitch: player.pitch, dead: player.dead,
          } });
          if (game.networkRoom.role === 'host') {
            const mobStates = mobs.mobs.map(mob => {
              mob.networkId ||= globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
              return { uid: mob.networkId, type: mob.type, pos: mob.pos.toArray(), yaw: mob.yaw, hp: mob.hp, sheared: mob.sheared, fuse: mob.fuse };
            });
            game.multiplayerClient.send('mob:snapshot', { mobs: mobStates });
          }
          networkStateTimer = 0.12;
        }
      }
      if (networked && game.networkRoom.role === 'host' && game.multiplayerClient) {
        networkVehicleTimer -= dt;
        if (networkVehicleTimer <= 0) {
          for (const vehicle of vehicles.vehicles) if (!vehicle.remoteDriven) game.publishVehicleState(vehicle, vehicle === vehicles.mounted);
          networkVehicleTimer = 0.2;
        }
        networkItemTimer -= dt;
        if (networkItemTimer <= 0) {
          const itemStates = itemEntities.filter(item => !item.dead).map(item => ({ uid: item.uid, id: item.id, count: item.count, damage: item.damage, pos: item.mesh.position.toArray(), vy: item.vy, age: item.age }));
          game.multiplayerClient.send('item:snapshot', { items: itemStates });
          networkItemTimer = 0.4;
        }
      }
      if (networked && hostSimulates && game.multiplayerClient) {
        sharedStateTimer -= dt;
        if (sharedStateTimer <= 0) {
          game.multiplayerClient.send('game:state', { state: { timeOfDay: sky.timeOfDay, chests: [...chests], furnaces: [...furnaces] } });
          sharedStateTimer = 1.25;
        }
      }

    }

    // A. Target selection wireframe
    const hit = player.raycast(world, 5);
    if (hit && player.controlsActive && ui.mode === 'game') {
      selectionWireframe.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      selectionWireframe.visible = true;
    } else {
      selectionWireframe.visible = false;
    }

    // B. Block break cracking stages (0-9)
    if (player.mining.active && player.mining.total > 0 && player.controlsActive && ui.mode === 'game') {
      const stage = Math.min(9, Math.floor((player.mining.progress / player.mining.total) * 10));
      updateCrackOverlayUV(stage);
      crackOverlayMesh.position.set(player.mining.x + 0.5, player.mining.y + 0.5, player.mining.z + 0.5);
      crackOverlayMesh.visible = true;
    } else {
      crackOverlayMesh.visible = false;
    }

    // E. First-person arm animation & held item update
    if (ui.mode === 'game') {
      firstPersonArm.root.visible = true;
      firstPersonArm.setHeldItem(player.heldStack);
      const isMoving = player.onGround && Math.hypot(player.vel.x, player.vel.z) > 0.5;
      const eatingProgress = eating ? Math.min(1, eating.elapsed / EAT_DURATION) : 0;
      firstPersonArm.update(dt, isMoving, player.leftDown && player.controlsActive, eatingProgress);
      lighting.refreshObject(firstPersonArm.root, world, player.pos, 1.62);
    } else {
      firstPersonArm.root.visible = false;
    }

    updateChunks();
    // Share a frame budget between streaming and lighting/block remeshes. A
    // single rebuild can still exceed it, but we avoid starting another one
    // afterwards; alternating priority keeps edits responsive while loading.
    const chunkBudget = performance.now() + 4;
    if (prioritizeDirty) { rebuildDirtyChunks(chunkBudget); processChunkQueue(chunkBudget); }
    else { processChunkQueue(chunkBudget); rebuildDirtyChunks(chunkBudget); }
    prioritizeDirty = !prioritizeDirty;

    const head = world.getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y + 1.62), Math.floor(player.pos.z));
    const underwater = head === WATER || head === WATER_FLOW;
    const dayFactor = sky.update(paused && !networked ? 0 : dt, camera.position, game.renderDistance, { underwater });

    // hurt flash overlay
    const hurtOverlay = document.getElementById('hurt-overlay');
    if (hurtOverlay) {
      hurtOverlay.style.opacity = player.hurtTime > 0 ? 0.32 : 0;
    }

    // Underwater tint and shortened fog accompany the oxygen bubbles in the HUD.
    const waterOverlay = document.getElementById('water-overlay');
    if (waterOverlay) waterOverlay.style.opacity = underwater ? 0.32 : 0;

    // debug
    if (ui.showDebug && now - lastDebugUpdate >= 250) {
      lastDebugUpdate = now;
      const p = player.pos;
      const biome = world.gen.columnInfo(Math.floor(p.x), Math.floor(p.z));
      const dirX = -Math.sin(player.yaw), dirZ = -Math.cos(player.yaw);
      const cardinal = Math.abs(dirZ) >= Math.abs(dirX)
        ? (dirZ < 0 ? 'north (-Z)' : 'south (+Z)')
        : (dirX < 0 ? 'west (-X)' : 'east (+X)');
      ui.updateDebug([
        `AiSlopcraft · 1.7.10-inspired`,
        `${fps} fps  T: ${game.time.toFixed(0)}s  chunks: ${world.chunks.size}  q: ${chunkQueue.length}`,
        `XYZ: ${p.x.toFixed(3)} / ${p.y.toFixed(3)} / ${p.z.toFixed(3)}`,
        `Block: ${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)}`,
        `Facing: ${cardinal} (${dirX.toFixed(2)}, ${dirZ.toFixed(2)})`,
        `Biome: ${biome.biome}  Time: ${(sky.timeOfDay * 24).toFixed(2)}h  Day: ${(dayFactor * 100) | 0}%`,
        `Seed: ${SEED}  Light: ${((world.getLight(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) >> 4))}/${(world.getLight(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) & 15)}`,
        `Mobs: ${mobs.mobs.length}  Items: ${itemEntities.length}`,
      ]);
    } else if (!ui.showDebug) {
      ui.updateDebug([]);
    }

    ui.update();
    if (ui.hintEl) ui.hintEl.style.display = ui.mode === 'game' && !player.pointerLocked && !player.touchSupported ? 'block' : 'none';
    if (player.dead && ui.mode !== 'death') {
      vehicles.dismount(player, true);
      if (!game.keepInventory) {
        for (const stack of [...player.inventory, ...player.armor, player.cursorStack]) if (stack) game.dropItem(stack);
        player.inventory.fill(null); player.armor.fill(null); player.cursorStack = null;
      }
      ui.showDeath(player.stats.blocksMined * 10 + player.stats.blocksPlaced * 5);
    }
  } else {
    // slow orbit for title screen
    camera.position.set(
      Math.cos(game.time * 0.08) * 12 + 8,
      world.heightAt(8, 8) + 8,
      Math.sin(game.time * 0.08) * 12 + 8
    );
    camera.lookAt(8, world.heightAt(8, 8), 8);
    sky.update(dt, camera.position, game.renderDistance);
    if (!game.started) {
      // pregenerate spawn chunks for the title backdrop
      processChunkQueue();
      if (chunkQueue.length === 0) updateChunks(false, 8, 8);
    }
  }

  for (const avatar of remotePlayers.values()) {
    const previousX = avatar.root.position.x, previousZ = avatar.root.position.z;
    avatar.root.position.lerp(avatar.target, 1 - Math.exp(-dt * 14));
    const speed = Math.hypot(avatar.root.position.x - previousX, avatar.root.position.z - previousZ) / Math.max(dt, 0.001);
    const walking = Math.min(1, speed / 1.8);
    avatar.walkBlend += (walking - avatar.walkBlend) * (1 - Math.exp(-dt * 12));
    avatar.walkPhase += dt * (8 + speed * 1.8);
    const swing = Math.sin(avatar.walkPhase) * 0.62 * avatar.walkBlend;
    avatar.leftLeg.rotation.x = swing;
    avatar.rightLeg.rotation.x = -swing;
    avatar.leftArm.rotation.x = -swing;
    avatar.rightArm.rotation.x = swing;
    avatar.root.rotation.y = avatar.yaw;
    avatar.head.rotation.x = avatar.pitch;
    lighting.refreshObject(avatar.root, world, avatar.root.position, 1.2);
  }
  ui.updateNetworkPanel();

  // One shared update drives terrain, entities, particles and the hand on both
  // the title backdrop and gameplay frames.
  lighting.update({ sky, time: game.time, style: game.shaderStyle, fog: scene.fog });
  renderer.getDrawingBufferSize(renderBufferSize);
  if (game.shaderStyle === 'psx') psxPostProcess.setSize(renderBufferSize.x, renderBufferSize.y);
  // Vertex snapping follows the full viewport grid; the later post pass handles
  // the independent low-resolution image scale.
  lighting.shared.uScreenSize.value.copy(renderBufferSize);
  lighting.updateShadows(renderer, scene, camera, sky, game.shaderStyle, game.time, false, game.settings.graphics !== 'fast');
  const drawArm = game.started && ui.mode !== 'title' ? targetRenderer => firstPersonArm.render(targetRenderer) : null;
  if (game.shaderStyle === 'psx') psxPostProcess.render(renderer, scene, camera, drawArm);
  else { renderer.render(scene, camera); drawArm?.(renderer); }
}

frame();

// expose for debugging
window.game = game;
