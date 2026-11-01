// AiSlopcraft — Minecraft Beta 1.7.3 clone. Main game loop.
import * as THREE from 'three';
import { World } from './world/world.js';
import { CH, WORLD_H, SEA_LEVEL } from './world/chunk.js';
import { buildChunkMesh } from './world/mesher.js';
import { buildAtlas, buildItemIcons, buildEmissionAtlas } from './world/textures.js';
import {
  AIR, WATER, WATER_FLOW, LAVA, TORCH, CRAFTING_TABLE, FURNACE, SAND, GRAVEL, LEAVES, GRASS, DIRT,
  LOG, GLASS, getBlock, breakTime, canHarvest, ITEMS, itemName, isBlock, STONE, COBBLE,
  TILES, SAPLING, TALL_GRASS, PLANKS, TNT, WOOD_DOOR, IRON_DOOR,
  BED_BLOCK, CAKE_BLOCK, CHEST, CROPS, FARMLAND, WOOL_BASE, LEVER, RAIL, REDSTONE_WIRE, REDSTONE_TORCH, REDSTONE_REPEATER, placeableBlockForItem, FURNACE_LIT
} from './world/blocks.js';
import { Player } from './entities/player.js';
import { advanceEating } from './entities/eating.js';
import { MobManager, findSafeGround, rollMobDrops } from './entities/mobs.js';
import { UI } from './ui/ui.js';
import { Audio } from './audio.js';
import { Sky } from './sky.js';
import { createFurnaceState, tickFurnace, interactWithFurnaceSlot } from './ui/furnace.js';
import { ParticleManager } from './particles.js';
import { FirstPersonArm } from './arm.js';
import { Lighting, SHADER_STYLES, shaderStyleId } from './rendering.js';
import { loadSettings, persistSettings, sensitivityToRadians, keyLabel } from './settings.js';
import { useOnBlock, useOnMob, growCrop, cropDrops } from './interactions.js';
import { FluidSimulator } from './world/fluids.js';
import { RedstoneSimulator } from './world/redstone.js';
import { VehicleManager } from './entities/vehicles.js';
import { DIRECTIONS as STRUCTURE_DIRECTIONS, structurePartner, setDoorOpen } from './world/structures.js';

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
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

const lighting = new Lighting({ atlasTexture: atlasTex, emissionTexture: buildEmissionAtlas(atlasCanvas) });
const solidMat = lighting.createMaterial({ name: 'Terrain', voxel: true, map: atlasTex, emissionMap: true });
const cutoutMat = lighting.createMaterial({ name: 'TerrainCutout', voxel: true, map: atlasTex, emissionMap: true, cutout: true, doubleSide: true });
const waterMat = lighting.createMaterial({ name: 'Water', voxel: true, map: waterTex, water: true, transparent: true, opacity: 0.78, doubleSide: true, depthWrite: false });

// ---- game state ----
const SEED = new URLSearchParams(location.search).get('seed') || 'Beta 1.7.3';
const SAVE_KEY = `aislopcraft:world:${SEED}`;
function readSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { return null; }
}
const savedGame = readSave();
const legacySettings = { ...savedGame?.settings };
if (legacySettings.sensitivity > 0 && legacySettings.sensitivity < 1) legacySettings.sensitivity = legacySettings.sensitivity / 0.0044 * 100;
const settings = loadSettings(localStorage, legacySettings);
const world = new World(SEED, scene);
if (Array.isArray(savedGame?.edits)) {
  for (const entry of savedGame.edits) {
    if (!Array.isArray(entry) || entry.length < 2 || typeof entry[0] !== 'string') continue;
    const coordinates = entry[0].split(',').map(Number);
    if (coordinates.length === 3) world.recordEdit(...coordinates, Number(entry[1]), Number(entry[2] || 0));
  }
}
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
const game = {
  world, player, audio, sky, mobs, renderer, lighting, fluids, redstone, vehicles,
  atlasCanvas,
  itemIconsCanvas: buildItemIcons(),
  settings,
  renderDistance: settings.renderDistance,
  keepInventory: settings.keepInventory,
  shaderStyle: settings.shaderStyle,
  brightness: settings.brightness,
  applySettings() {
    const s = this.settings;
    const distanceChanged = this.renderDistance !== s.renderDistance;
    this.renderDistance = s.renderDistance;
    this.keepInventory = s.keepInventory;
    this.setShaderStyle(s.shaderStyle);
    this.setBrightness(s.brightness);
    player.sensitivity = sensitivityToRadians(s.sensitivity);
    player.invertMouse = s.invertMouse;
    player.bindings = s.keys;
    player.viewBobbing = s.viewBobbing;
    audio.setVolume(s.volume);
    if (camera.fov !== s.fov) { camera.fov = s.fov; camera.updateProjectionMatrix(); }
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2) * s.renderScale;
    if (renderer.getPixelRatio() !== pixelRatio) {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    sky.showClouds = s.clouds;
    if (this.ui?.hintEl) {
      const k = s.keys;
      this.ui.hintEl.textContent = `Click to play | ${keyLabel(k.forward)}/${keyLabel(k.left)}/${keyLabel(k.back)}/${keyLabel(k.right)} move · ${keyLabel(k.jump)} jump · ${keyLabel(k.sneak)} sneak · ${keyLabel(k.drop)} drop · ${keyLabel(k.inventory)} inventory · F3 debug · Esc pause`;
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
  onRenderDistanceChange() {
    updateChunks(true);
  },
  started: false,
  time: 0,
  seed: SEED,
  spawnBed: savedGame?.spawnBed || null,
  dropItem(stack) {
    spawnItem(player.pos.x, player.pos.y, player.pos.z, stack.id, stack.count, stack.damage || 0);
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
    // Revalidate saved beds so a removed or obstructed bed never traps respawn.
    if (this.spawnBed && [this.spawnBed.x, this.spawnBed.y, this.spawnBed.z].every(Number.isInteger)) {
      const bed = this.spawnBed;
      for (let cz = Math.floor(bed.z / CH) - 1; cz <= Math.floor(bed.z / CH) + 1; cz++)
        for (let cx = Math.floor(bed.x / CH) - 1; cx <= Math.floor(bed.x / CH) + 1; cx++) world.generateChunk(cx, cz);
      if (world.getBlock(bed.x, bed.y, bed.z) === BED_BLOCK) {
        for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const x = bed.x + dx, z = bed.z + dz;
          for (const offset of [0, 1, -1]) {
            const feet = bed.y + offset;
            const floor = world.getBlock(x, feet - 1, z);
            if (!getBlock(floor).solid || floor === LEAVES || floor === LOG) continue;
            if (!getBlock(world.getBlock(x, feet, z)).solid && !getBlock(world.getBlock(x, feet + 1, z)).solid && world.getBlock(x, feet, z) !== WATER && world.getBlock(x, feet, z) !== LAVA)
              return { x: x + 0.5, y: feet + 0.001, z: z + 0.5 };
          }
        }
        if (!getBlock(world.getBlock(bed.x, bed.y + 1, bed.z)).solid && !getBlock(world.getBlock(bed.x, bed.y + 2, bed.z)).solid)
          return { x: bed.x + 0.5, y: bed.y + 0.5635, z: bed.z + 0.5 };
      }
      this.spawnBed = null;
    }
    // Keep the spawn region generated even after the player has streamed far away.
    for (let cz = -1; cz <= 1; cz++) {
      for (let cx = -1; cx <= 1; cx++) world.generateChunk(cx, cz);
    }
    // Prefer an open, walkable spawn instead of the top of a tree canopy.
    for (let r = 0; r <= 8; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = 8.5 + dx, z = 8.5 + dz;
        const y = findSafeGround(world, x, z, 0.6, 1.8);
        if (y == null) continue;
        const bx = Math.floor(x), bz = Math.floor(z);
        const support = world.getBlock(bx, Math.floor(y - 1), bz);
        if (support === LEAVES || support === LOG || support === WATER) continue;
        let open = true;
        for (let yy = Math.floor(y); yy < Math.floor(y) + 3 && open; yy++) {
          for (let dz2 = -1; dz2 <= 1 && open; dz2++) for (let dx2 = -1; dx2 <= 1; dx2++) {
            if (getBlock(world.getBlock(bx + dx2, yy, bz + dz2)).solid) { open = false; break; }
          }
        }
        if (open) return { x, y, z };
      }
    }
    return { x: 8.5, y: world.heightAt(8, 8) + 1.001, z: 8.5 };
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
  saveAndQuit() {
    this.saveGame();
    this.started = false;
    clearFishing();
    ui.setMode('title');
  },
  saveGame() {
    const payload = { version: 1, seed: SEED, edits: [...world.edits].map(([key, id]) => [key, id, world.metaEdits.get(key) || 0]),
      settings: this.settings, spawnBed: this.spawnBed, timeOfDay: sky.timeOfDay, furnaces: [...furnaces], chests: [...chests], vehicles: vehicles.serialize(),
      items: itemEntities.filter(it => !it.dead).map(it => ({ id: it.id, count: it.count, damage: it.damage, pos: it.mesh.position.toArray(), vy: it.vy, age: it.age })),
      player: { pos: player.pos.toArray(), yaw: player.yaw, pitch: player.pitch, health: player.health, inventory: player.inventory, armor: player.armor, hotbarIndex: player.hotbarIndex, stats: player.stats } };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(payload)); return true; }
    catch (error) { console.warn('Could not save world', error); ui?.notify('Save failed — browser storage may be full'); return false; }
  },
  resetWorld() {
    try { localStorage.removeItem(SAVE_KEY); } catch {}
    location.reload();
  },
  start() {
    if (this.started) return;
    this.started = true;
    const spawn = this.prepareSpawn();
    player.respawn(spawn.y, spawn.x, spawn.z);
    const saved = readSave()?.player;
    if (saved && Array.isArray(saved.pos) && saved.pos.length === 3 && saved.pos.every(Number.isFinite)) {
      player.pos.fromArray(saved.pos); player.yaw = Number(saved.yaw) || 0; player.pitch = Number(saved.pitch) || 0;
      player.health = Math.max(1, Math.min(player.maxHealth, Number(saved.health) || player.maxHealth));
      if (Array.isArray(saved.inventory) && saved.inventory.length === 36) player.inventory = saved.inventory;
      if (Array.isArray(saved.armor) && saved.armor.length === 4) player.armor = saved.armor;
      player.hotbarIndex = Math.max(0, Math.min(8, Number(saved.hotbarIndex) || 0));
      if (saved.stats && typeof saved.stats === 'object') Object.assign(player.stats, saved.stats);
      camera.position.set(player.pos.x, player.pos.y + 1.62, player.pos.z);
    }
    updateChunks(true);
    processChunkQueue();
    if (mobs.mobs.length === 0) mobs.spawnInitial(player);
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
  },
};
const ui = new UI(game);
game.ui = ui;
game.applySettings();
if (Number.isFinite(savedGame?.timeOfDay)) sky.time = ((savedGame.timeOfDay % 1) + 1) % 1;
let saveClock = 0;
window.addEventListener('beforeunload', () => { if (game.started) game.saveGame(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.started && ui.mode === 'game') { game.saveGame(); ui.setMode('pause'); }
});

// ---- particles, first-person arm, target wireframe & crack overlay ----
const particles = new ParticleManager(scene, atlasCanvas, lighting);
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

function updateChunks(force = false) {
  const pcx = Math.floor(player.pos.x / CH);
  const pcz = Math.floor(player.pos.z / CH);
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
    if (n >= 1 || performance.now() >= budget) break;
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

function spawnItem(x, y, z, id, count = 1, damage = 0) {
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
  itemEntities.push({ mesh, id, count, damage, vy: 2, age: 0, onGround: false });
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

function updateItems(dt) {
  for (const it of itemEntities) {
    const loaded = world.getChunk(Math.floor(it.mesh.position.x / CH), Math.floor(it.mesh.position.z / CH));
    it.mesh.visible = !!loaded?.generated;
    if (!loaded?.generated) continue; // preserve drops rather than falling through unloaded terrain
    it.age += dt;
    // physics
    if (!it.onGround) it.vy -= 14 * dt;
    it.mesh.position.y += it.vy * dt;
    const bx = Math.floor(it.mesh.position.x), by = Math.floor(it.mesh.position.y - 0.14), bz = Math.floor(it.mesh.position.z);
    if (getBlock(world.getBlock(bx, by, bz)).solid && it.vy <= 0) {
      it.mesh.position.y = by + 1.15;
      it.vy = 0;
      it.onGround = true;
    }
    it.mesh.rotation.y += dt * 1.6;
    lighting.refreshObject(it.mesh, world, it.mesh.position, 0);

    // pickup
    const dx = it.mesh.position.x - player.pos.x, dy = it.mesh.position.y - player.pos.y - 0.8, dz = it.mesh.position.z - player.pos.z;
    if (!player.dead && dx * dx + dy * dy + dz * dz < 1.4 * 1.4 && it.age > 0.4) {
      const inserted = player.insertItem(it.id, it.count, it.damage || 0);
      if (inserted > 0) {
        it.count -= inserted;
        audio.pop();
        if (it.count <= 0) it.dead = true;
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
  const held = player.heldStack;
  const total = breakTime(id, held ? held.id : null);

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
    if (id === CROPS) {
      cropLocations.delete(containerKey);
      for (const stack of cropDrops(previousMeta)) spawnItem(hit.x, hit.y, hit.z, stack.id, stack.count);
    } else if (id === LEAVES && held?.id === 359) {
      spawnItem(hit.x, hit.y, hit.z, LEAVES, 1);
    } else if (canHarvest(id, held ? held.id : null)) dropBlock(hit.x, hit.y, hit.z, id);
    if (held) player.useHeldOn(id);
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

function tryPlaceBlock() {
  const held = player.heldStack;
  if (!held) return;
  const itemDef = ITEMS[held.id];
  // These items are handled once per click, never by repeated block placement.
  if ([295, 325, 326, 327, 368].includes(held.id) || itemDef?.tool === 'hoe') return;
  if (itemDef?.food) {
    if (advanceEating({id:held.id}, 0, player, audio, ui.mode === 'game').completed) ui.refresh();
    return;
  }

  const hit = player.raycast(world, 5);
  const placeId = placeableBlockForItem(held.id);
  if (!hit || !placeId) return;

  // Replaceable blocks: if hit is TALL_GRASS, SAPLING, WATER, or LAVA, place directly at hit
  const hitBlockId = world.getBlock(hit.x, hit.y, hit.z);
  const isReplaceable = (hitBlockId === TALL_GRASS || hitBlockId === SAPLING || hitBlockId === WATER || hitBlockId === LAVA);
  const px = isReplaceable ? hit.x : hit.x + hit.face[0];
  const py = isReplaceable ? hit.y : hit.y + hit.face[1];
  const pz = isReplaceable ? hit.z : hit.z + hit.face[2];

  // don't place inside the player
  const pminX = player.pos.x - 0.35, pmaxX = player.pos.x + 0.35;
  const pminZ = player.pos.z - 0.35, pmaxZ = player.pos.z + 0.35;
  const pminY = player.pos.y, pmaxY = player.pos.y + 1.8;
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
  } else if (placeId === REDSTONE_TORCH || placeId === LEVER) {
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
    if (hy >= WORLD_H || !hc?.generated || world.getBlock(hx,hy,hz) !== AIR) return;
    if (placeId === BED_BLOCK && !getBlock(world.getBlock(hx,hy-1,hz)).solid) return;
    if (hx+1 > pminX && hx < pmaxX && hy+1 > pminY && hy < pmaxY && hz+1 > pminZ && hz < pmaxZ) return;
    if (!world.setBlock(px,py,pz,placeId,meta)) return;
    if (!world.setBlock(hx,hy,hz,placeId,meta | 8)) { world.setBlock(px,py,pz,AIR); return; }
  } else if (!world.setBlock(px, py, pz, placeId, meta)) return;
  player.consumeHeld();
  audio.place(placeId);
  player.stats.blocksPlaced++;
  firstPersonArm.triggerPlaceSwing();
  ui.refresh();
}



// ---- explosions (creepers, TNT) ----
function explode(pos, radius, player) {
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
    player.damage(Math.ceil((1 - dist / (radius * 1.6)) * 12), audio);
  }
  // knockback
  const kb = player.pos.clone().sub(pos).normalize().multiplyScalar(Math.max(0, 8 - dist * 1.6));
  player.vel.add(kb);
}

// ---- arrows ----
const arrows = [];
const arrowGeometry = new THREE.BoxGeometry(0.08, 0.08, 0.5);
function createArrow(from, velocity, owner) {
  const mesh = new THREE.Mesh(arrowGeometry, new THREE.MeshBasicMaterial({ color: 0x8a6a42 }));
  lighting.prepare(mesh);
  mesh.position.copy(from);
  lighting.refreshObject(mesh, world, mesh.position, 0);
  scene.add(mesh);
  arrows.push({ mesh, vel: velocity, age: 0, owner });
}
function shootArrow(fromMob, player) {
  const from = fromMob.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
  const to = player.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
  createArrow(from, to.sub(from).normalize().multiplyScalar(18), 'mob');
}
function shootPlayerArrow() {
  const dir = new THREE.Vector3(-Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.yaw) * Math.cos(player.pitch));
  createArrow(camera.position.clone().addScaledVector(dir, 0.45), dir.multiplyScalar(22), 'player');
  audio.bow();
}
function updateArrows(dt) {
  for (const a of arrows) {
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
        if (a.owner === 'player') spawnItem(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z), 262, 1);
        audio.arrowHit();
        break;
      }
      if (a.owner === 'mob') {
        if (Math.abs(pos.x - player.pos.x) < 0.4 && Math.abs(pos.z - player.pos.z) < 0.4 && pos.y >= player.pos.y && pos.y <= player.pos.y + 1.8) {
          player.damage(2, audio); a.dead = true; audio.arrowHit();
        }
      } else {
        for (const mob of mobs.mobs) {
          if (mob.dead) continue;
          const half = mob.def.w / 2 + 0.05;
          if (Math.abs(pos.x - mob.pos.x) <= half && Math.abs(pos.z - mob.pos.z) <= half && pos.y >= mob.pos.y && pos.y <= mob.pos.y + mob.def.h) {
            const knockback = a.vel.clone().normalize().multiplyScalar(2);
            mob.damage(4, audio, { knockback }); a.dead = true; audio.arrowHit(); break;
          }
        }
      }
    }
    a.mesh.lookAt(a.mesh.position.clone().add(a.vel));
    lighting.refreshObject(a.mesh, world, a.mesh.position, 0);
    if (a.age > 6) a.dead = true;
  }
  for (const a of arrows) if (a.dead) { scene.remove(a.mesh); lighting.forget(a.mesh); a.mesh.material.dispose(); }
  for (let i = arrows.length - 1; i >= 0; i--) if (arrows[i].dead) arrows.splice(i, 1);
}

// effects object handed to mobs
const effects = {
  explosion: (pos, radius, p) => explode(pos, radius, p),
  shootArrow: (mob, p) => shootArrow(mob, p),
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
function openChestSlots(slots, key, title) {
  game.openChestData = { key, slots };
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
        <div class="furnace-row">
          <div class="slot" id="f-in"></div>
          <div class="furnace-flame" id="f-flame">🔥</div>
          <div class="slot" id="f-out"></div>
        </div>
        <div class="furnace-row">
          <div class="slot" id="f-fuel"></div>
          <div class="furnace-progress" id="f-prog"><div id="f-prog-fill"></div></div>
          <div></div>
        </div>
        <div class="inv-title">Inventory</div>
        <div class="inv-main" id="f-inv-main"></div>
        <div class="inv-hotbar" id="f-inv-hotbar"></div>
      </div>
    `;
    document.getElementById('ui').appendChild(panel);

    const main = panel.querySelector('#f-inv-main');
    const hot = panel.querySelector('#f-inv-hotbar');
    for (let i = 9; i < 36; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.inv = i;
      slot.addEventListener('mousedown', event => { ui.slotClick(event, 'inv', i); refreshFurnace(); });
      slot.addEventListener('contextmenu', event => event.preventDefault());
      main.appendChild(slot);
    }
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.inv = i;
      slot.addEventListener('mousedown', event => { ui.slotClick(event, 'inv', i); refreshFurnace(); });
      slot.addEventListener('contextmenu', event => event.preventDefault());
      hot.appendChild(slot);
    }

    const onFurnaceSlot = which => event => {
      event.preventDefault();
      const current = game.openFurnaceData?.f;
      if (!current) return;
      const result = interactWithFurnaceSlot(current, which, player.cursorStack, event.button);
      if (!result.changed) return;
      player.cursorStack = result.cursorStack;
      refreshFurnace();
      ui.refresh();
    };
    panel.querySelector('#f-in').addEventListener('mousedown', onFurnaceSlot('input'));
    panel.querySelector('#f-fuel').addEventListener('mousedown', onFurnaceSlot('fuel'));
    panel.querySelector('#f-out').addEventListener('mousedown', onFurnaceSlot('output'));
    for (const id of ['#f-in', '#f-fuel', '#f-out']) {
      panel.querySelector(id).addEventListener('contextmenu', event => event.preventDefault());
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
  if (ui.mode !== 'game' || !player.pointerLocked) return;
  if (`Mouse${e.button}` === player.bindings.attack) {
    const target = vehicles.target(player);
    if (target && vehicles.remove(target)) {
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
      if (vehicle.type === 'storage') { openChestSlots(vehicle.slots, null, 'Minecart with Chest'); return; }
      if (vehicle.type === 'powered') {
        if (player.heldStack?.id === 263) {
          player.consumeHeld(); vehicle.fuel = Math.min(3600, vehicle.fuel + 180);
          vehicle.travel = [-Math.sin(player.yaw), -Math.cos(player.yaw)];
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
          tntFuses.push({ x: hit.x, y: hit.y, z: hit.z, timer: 3.2 });
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
    if ([333,328,342,343].includes(held?.id)) {
      player.rightDown = false;
      const type = ({333:'boat',328:'minecart',342:'storage',343:'powered'})[held.id];
      if (vehicles.place(type, hit)) { player.consumeHeld(); audio.place(PLANKS); ui.refresh(); }
      else ui.notify(held.id === 333 ? 'Place boats on water' : 'Place minecarts on rails');
      return;
    }
    if (held?.id === 346) { player.rightDown = false; useFishingRod(); return; }
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

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  if (game.settings.maxFps && now - lastT < 1000 / game.settings.maxFps) return;
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.1) dt = 0.1;
  const simulationPaused = game.started && ui.mode !== 'title' &&
    ['pause', 'death', 'inventory', 'crafting', 'furnace', 'chest'].includes(ui.mode);
  if (!simulationPaused) game.time += dt;
  if (game.started && ui.mode !== 'title') {
    saveClock += dt;
    if (saveClock >= 15) { game.saveGame(); saveClock = 0; }
  }

  fpsCount++; fpsTimer += dt;
  if (fpsTimer >= 1) { fps = fpsCount; fpsCount = 0; fpsTimer = 0; }

  if (game.started && ui.mode !== 'title') {
    const paused = simulationPaused;

    if (!paused) {
      if (!vehicles.update(dt, player)) player.update(dt, world, audio);
      if (player.leftDown && player.pointerLocked) {
        if (mobs.raycastTarget(player, 3.5)) {
          mobs.attack(player, player.heldStack?.id ?? null, audio, 3.5);
          player.mining.active = false;
          player.mining.progress = 0;
        } else tryBreakBlock(dt);
      } else if (!player.leftDown) {
        player.mining.active = false;
        player.mining.progress = 0;
      }

      // D. Continuous block placement with repeat cooldown
      if (player.rightDown && player.pointerLocked) {
        placeCooldown -= dt;
        if (placeCooldown <= 0) {
          tryPlaceBlock();
          placeCooldown = 0.25;
        }
      } else {
        placeCooldown = 0;
      }

      mobs.update(dt, player, sky.timeOfDay, effects, audio);
      updateItems(dt);
      updateArrows(dt);
      fluids.tick(dt);
      redstone.update(dt);
      updateFurnaces(dt);
      updateCrops(dt);
      updateFishing(dt);
      updateTNT(dt);
      particles.update(dt, world);

    }

    // A. Target selection wireframe
    const hit = player.raycast(world, 5);
    if (hit && player.pointerLocked && ui.mode === 'game') {
      selectionWireframe.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      selectionWireframe.visible = true;
    } else {
      selectionWireframe.visible = false;
    }

    // B. Block break cracking stages (0-9)
    if (player.mining.active && player.mining.total > 0 && player.pointerLocked && ui.mode === 'game') {
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
      firstPersonArm.update(dt, isMoving, player.leftDown && player.pointerLocked, 0);
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
    const dayFactor = sky.update(paused ? 0 : dt, camera.position, game.renderDistance, { underwater });

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
      ui.updateDebug([
        `AiSlopcraft Beta 1.7.3 (clone)`,
        `${fps} fps  T: ${game.time.toFixed(0)}s  chunks: ${world.chunks.size}  q: ${chunkQueue.length}`,
        `XYZ: ${p.x.toFixed(3)} / ${p.y.toFixed(3)} / ${p.z.toFixed(3)}`,
        `Block: ${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)}`,
        `Facing: ${(Math.sin(player.yaw) * -1).toFixed(2)} ${(-Math.cos(player.yaw)).toFixed(2)} (Towards ${player.yaw > 0 ? 'positive' : 'negative'} Z)`,
        `Biome: ${biome.biome}  Time: ${(sky.timeOfDay * 24).toFixed(2)}h  Day: ${(dayFactor * 100) | 0}%`,
        `Seed: ${SEED}  Light: ${((world.getLight(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) >> 4))}/${(world.getLight(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) & 15)}`,
        `Mobs: ${mobs.mobs.length}  Items: ${itemEntities.length}`,
      ]);
    } else if (!ui.showDebug) {
      ui.updateDebug([]);
    }

    ui.update();
    if (ui.hintEl) ui.hintEl.style.display = ui.mode === 'game' && !player.pointerLocked ? 'block' : 'none';
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
      if (chunkQueue.length === 0) updateChunks(true);
    }
  }

  // One shared update drives terrain, entities, particles and the hand on both
  // the title backdrop and gameplay frames.
  lighting.update({ sky, time: game.time, style: game.shaderStyle, fog: scene.fog });
  lighting.updateShadows(renderer, scene, camera, sky, game.shaderStyle, game.time);
  renderer.render(scene, camera);
  if (game.started && ui.mode !== 'title') firstPersonArm.render(renderer);
}

frame();

// expose for debugging
window.game = game;
