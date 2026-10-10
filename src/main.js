// AiSlopcraft — Minecraft Beta 1.7.3 clone. Main game loop.
import * as THREE from 'three';
import { World } from './world/world.js';
import { CH, WORLD_H, SEA_LEVEL } from './world/chunk.js';
import { buildChunkMesh } from './world/mesher.js';
import { buildAtlas, buildItemIcons } from './world/textures.js';
import {
  AIR, WATER, LAVA, TORCH, CRAFTING_TABLE, FURNACE, SAND, GRAVEL, LEAVES, GRASS, DIRT,
  LOG, GLASS, getBlock, breakTime, canHarvest, ITEMS, itemName, isBlock, STONE, COBBLE,
  TILES, SAPLING, TALL_GRASS, PLANKS, TNT
} from './world/blocks.js';
import { Player } from './entities/player.js';
import { MobManager } from './entities/mobs.js';
import { UI } from './ui/ui.js';
import { Audio } from './audio.js';
import { Sky } from './sky.js';
import { smeltResult } from './ui/recipes.js';

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 600);
camera.rotation.order = 'YXZ';

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- textures ----
// classic pixel look: no color management, straight passthrough
THREE.ColorManagement.enabled = false;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

const atlasCanvas = buildAtlas();
const atlasTex = new THREE.CanvasTexture(atlasCanvas);
atlasTex.magFilter = THREE.NearestFilter;
atlasTex.minFilter = THREE.NearestMipMapNearestFilter;
atlasTex.colorSpace = THREE.NoColorSpace;

const waterCanvas = document.createElement('canvas');
waterCanvas.width = 16; waterCanvas.height = 16;
{
  const ctx = waterCanvas.getContext('2d');
  const img = ctx.createImageData(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const i = (y * 16 + x) * 4;
    const v = Math.sin((x + y * 1.7) * 0.9) * 10 + Math.sin(x * 1.3 + y * 0.7) * 8;
    img.data[i] = 42 + v; img.data[i + 1] = 82 + v; img.data[i + 2] = 196 + v; img.data[i + 3] = 190;
  }
  ctx.putImageData(img, 0, 0);
}
const waterTex = new THREE.CanvasTexture(waterCanvas);
waterTex.magFilter = THREE.NearestFilter;
waterTex.minFilter = THREE.NearestFilter;
waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
waterTex.colorSpace = THREE.NoColorSpace;

// ---- lighting shader: sky light dims at night, torch light stays warm ----
const lightVert = `
  attribute vec4 color;
  varying vec4 vColor;
  varying vec2 vUv;
  void main() {
    vColor = color;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const lightFrag = `
  uniform sampler2D map;
  uniform float uSky;
  uniform vec3 uBlockTint;
  uniform float uOpacity;
  uniform float uCutout;
  varying vec4 vColor;
  varying vec2 vUv;
  void main() {
    vec4 tex = texture2D(map, vUv);
    if (uCutout > 0.5 && tex.a < 0.45) discard;
    vec3 light = vColor.rgb * uSky + vec3(vColor.a) * uBlockTint;
    light = min(light, vec3(1.35));
    gl_FragColor = vec4(tex.rgb * light, tex.a * uOpacity);
  }
`;

function makeLightMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: lightVert,
    fragmentShader: lightFrag,
    uniforms: {
      map: { value: atlasTex },
      uSky: { value: 1.0 },
      uBlockTint: { value: new THREE.Color(1.0, 0.82, 0.62) },
      uOpacity: { value: opts.opacity ?? 1.0 },
      uCutout: { value: opts.cutout ? 1.0 : 0.0 },
    },
    transparent: !!opts.transparent,
    alphaTest: 0,
    side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    depthWrite: opts.depthWrite !== false,
  });
}

const solidMat = makeLightMaterial();
const cutoutMat = makeLightMaterial({ cutout: true, doubleSide: true });
const waterMat = makeLightMaterial({
  transparent: true, opacity: 0.82, doubleSide: true, depthWrite: false,
});
waterMat.uniforms.map.value = waterTex;

// ---- game state ----
const SEED = new URLSearchParams(location.search).get('seed') || 'Beta 1.7.3';
const world = new World(SEED, scene);
const player = new Player(world, camera, canvas);
const audio = new Audio();
const sky = new Sky(scene, camera);
const mobs = new MobManager(world, scene);
const game = {
  world, player, audio, sky, mobs,
  atlasCanvas,
  itemIconsCanvas: buildItemIcons(),
  renderDistance: 6,
  started: false,
  time: 0,
  seed: SEED,
  respawn() {
    const y = world.heightAt(8, 8);
    player.respawn(y + 0.5);
    ui.setMode('game');
  },
  start() {
    if (this.started) return;
    this.started = true;
    // synchronously generate the spawn chunks so the player doesn't fall
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        world.generateChunk(dx, dz);
      }
    }
    updateChunks(true);
    processChunkQueue();
    const y = world.heightAt(8, 8);
    player.respawn(y + 0.5);
    mobs.spawnInitial(player);
  },
};
const ui = new UI(game);
game.ui = ui;

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
      chunk.dispose(scene);
      world.chunks.delete(key);
    }
  }
}

function processChunkQueue() {
  const budget = performance.now() + 10;
  while (chunkQueue.length && performance.now() < budget) {
    const [cx, cz] = chunkQueue.shift();
    const chunk = world.generateChunk(cx, cz);
    if (!chunk.meshes) {
      const built = buildChunkMesh(world, chunk, atlasTex, waterTex, game.renderDistance);
      const meshes = {};
      const s = built.makeMesh(built.solid, solidMat);
      const c = built.makeMesh(built.cutout, cutoutMat);
      const w = built.makeMesh(built.water, waterMat);
      if (s) { scene.add(s); meshes.solid = s; }
      if (c) { scene.add(c); meshes.cutout = c; }
      if (w) { scene.add(w); meshes.water = w; }
      chunk.meshes = meshes;
      chunk.dirty = false;
    }
  }
}

function rebuildDirtyChunks() {
  let n = 0;
  for (const chunk of world.chunks.values()) {
    if (chunk.dirty && chunk.generated && chunk.meshes !== undefined && n < 3) {
      const built = buildChunkMesh(world, chunk, atlasTex, waterTex, game.renderDistance);
      const meshes = {};
      const s = built.makeMesh(built.solid, solidMat);
      const c = built.makeMesh(built.cutout, cutoutMat);
      const w = built.makeMesh(built.water, waterMat);
      if (s) { scene.add(s); meshes.solid = s; }
      if (c) { scene.add(c); meshes.cutout = c; }
      if (w) { scene.add(w); meshes.water = w; }
      if (chunk.meshes) {
        for (const k of Object.keys(chunk.meshes)) {
          const m = chunk.meshes[k];
          if (m) { scene.remove(m); m.geometry.dispose(); }
        }
      }
      chunk.meshes = meshes;
      chunk.dirty = false;
      n++;
    }
  }
}

// ---- item entities (drops) ----
const itemEntities = [];
const itemGroup = new THREE.Group();
scene.add(itemGroup);

function spawnItem(x, y, z, id, count = 1) {
  // item entity: small rotating cube using block texture or item icon
  let mesh;
  if (isBlock(id)) {
    const bd = getBlock(id);
    const tile = (bd.tiles && bd.tiles[2]) || TILES.stone;
    const g = new THREE.BoxGeometry(0.28, 0.28, 0.28);
    const uvs = [];
    const [u0, v0, u1, v1] = (() => {
      const tx = tile % 16, ty = Math.floor(tile / 16);
      const s = 1 / 16, e = 0.001;
      return [tx * s + e, 1 - (ty + 1) * s + e, (tx + 1) * s - e, 1 - ty * s - e];
    })();
    const uvAttr = g.getAttribute('uv');
    for (let i = 0; i < uvAttr.count; i++) {
      uvAttr.setXY(i, u0 + (uvAttr.getX(i) < 0.5 ? 0 : 1) * (u1 - u0), v0 + (uvAttr.getY(i) < 0.5 ? 0 : 1) * (v1 - v0));
    }
    mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: atlasTex }));
  } else {
    const g = new THREE.PlaneGeometry(0.32, 0.32);
    const idx = ITEM_ICON_INDEX_LOCAL[id] ?? 0;
    const tx = idx % 16, ty = Math.floor(idx / 16);
    const s = 1 / 16;
    const uvAttr = g.getAttribute('uv');
    for (let i = 0; i < uvAttr.count; i++) {
      uvAttr.setXY(i, (tx + uvAttr.getX(i)) * s, 1 - (ty + 1) * s + uvAttr.getY(i) * s);
    }
    mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      map: game.itemIconsCanvas ? itemTexFromCanvas(game.itemIconsCanvas) : atlasTex,
      transparent: true, alphaTest: 0.4, side: THREE.DoubleSide,
    }));
  }
  mesh.position.set(x + 0.5, y + 0.3, z + 0.5);
  itemGroup.add(mesh);
  itemEntities.push({ mesh, id, count, vy: 2, age: 0, onGround: false });
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

    // pickup
    const d = it.mesh.position.distanceTo(player.pos.clone().add(new THREE.Vector3(0, 0.8, 0)));
    if (d < 1.4 && it.age > 0.4) {
      if (player.addItem(it.id, it.count)) {
        it.dead = true;
        audio.pop();
      }
    }
    if (it.age > 300) it.dead = true;
  }
  for (const it of itemEntities) {
    if (it.dead) itemGroup.remove(it.mesh);
  }
  for (let i = itemEntities.length - 1; i >= 0; i--) {
    if (itemEntities[i].dead) itemEntities.splice(i, 1);
  }
}

// ---- block breaking / placing ----
function dropBlock(x, y, z, id) {
  const bd = getBlock(id);
  if (!bd.drops) return;
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
  spawnItem(x, y, z, bd.drops, count);
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
  if (Math.random() < dt * 6) audio.dig(id);

  if (player.mining.progress >= total) {
    // break!
    world.setBlock(hit.x, hit.y, hit.z, AIR);
    if (canHarvest(id, held ? held.id : null)) dropBlock(hit.x, hit.y, hit.z, id);
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
  const hit = player.raycast(world, 5);
  const held = player.heldStack;
  if (!hit || !held) return;
  const itemDef = ITEMS[held.id];

  // food eating
  if (itemDef && itemDef.food && player.health < 20) {
    player.health = Math.min(20, player.health + itemDef.food);
    player.consumeHeld();
    audio.eat();
    ui.refresh();
    return;
  }

  if (!isBlock(held.id)) return;
  const px = hit.x + hit.face[0], py = hit.y + hit.face[1], pz = hit.z + hit.face[2];

  // don't place inside the player
  const pminX = player.pos.x - 0.35, pmaxX = player.pos.x + 0.35;
  const pminZ = player.pos.z - 0.35, pmaxZ = player.pos.z + 0.35;
  const pminY = player.pos.y, pmaxY = player.pos.y + 1.8;
  if (px + 1 > pminX && px < pmaxX && py + 1 > pminY && py < pmaxY && pz + 1 > pminZ && pz < pmaxZ) return;

  const existing = world.getBlock(px, py, pz);
  if (existing !== AIR && !getBlock(existing).liquid) return;

  world.setBlock(px, py, pz, held.id);
  player.consumeHeld();
  audio.place(held.id);
  player.stats.blocksPlaced++;
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

// ---- arrows (skeleton shots) ----
const arrows = [];
function shootArrow(fromMob, player) {
  const from = fromMob.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
  const to = player.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
  const dir = to.sub(from).normalize().multiplyScalar(18);
  const geo = new THREE.BoxGeometry(0.08, 0.08, 0.5);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x8a6a42 }));
  mesh.position.copy(from);
  scene.add(mesh);
  arrows.push({ mesh, vel: dir, age: 0 });
}

function updateArrows(dt) {
  for (const a of arrows) {
    a.age += dt;
    a.vel.y -= 12 * dt;
    a.mesh.position.addScaledVector(a.vel, dt);
    a.mesh.lookAt(a.mesh.position.clone().add(a.vel));
    // hit player
    if (a.mesh.position.distanceTo(player.pos.clone().add(new THREE.Vector3(0, 1, 0))) < 0.8) {
      player.damage(2, audio);
      a.dead = true;
      audio.arrowHit();
    }
    // hit block
    const b = world.getBlock(Math.floor(a.mesh.position.x), Math.floor(a.mesh.position.y), Math.floor(a.mesh.position.z));
    if (getBlock(b).solid) a.dead = true;
    if (a.age > 6) a.dead = true;
  }
  for (const a of arrows) if (a.dead) scene.remove(a.mesh);
  for (let i = arrows.length - 1; i >= 0; i--) if (arrows[i].dead) arrows.splice(i, 1);
}

// effects object handed to mobs
const effects = {
  explosion: (pos, radius, p) => explode(pos, radius, p),
  shootArrow: (mob, p) => shootArrow(mob, p),
  dropMobLoot: (mob) => {
    if (!mob.killed) return; // despawned or exploded — no drops
    const drops = mob.def.drops || [];
    for (const [id, min, extra] of drops) {
      const count = (min || 0) + (extra ? Math.floor(Math.random() * (extra + 1)) : 0);
      if (count > 0) {
        spawnItem(Math.floor(mob.pos.x), Math.floor(mob.pos.y), Math.floor(mob.pos.z), id, count);
      }
    }
  },
};

// ---- furnace handling ----
function updateFurnaces(dt) {
  // find furnaces near the player and smelt (simplified: process all loaded chunks' furnace edits)
  // We track furnaces in a map when placed/found: x,y,z -> {input, output, fuel, burn, cook}
  for (const [key, f] of furnaces) {
    const [x, y, z] = key.split(',').map(Number);
    // only process if chunk loaded
    if (!world.getChunk(Math.floor(x / CH), Math.floor(z / CH))) continue;

    const canSmelt = f.input && f.input.count > 0 && smeltResult(f.input.id) != null &&
      (!f.output || (f.output.id === smeltResult(f.input.id) && f.output.count < 64));

    if (f.burn > 0) {
      f.burn -= dt;
      audio.furnace();
    } else if (canSmelt && f.fuel && f.fuel.count > 0) {
      // consume fuel
      const fuelTime = FUEL_TIMES[f.fuel.id] || 0;
      if (fuelTime > 0) {
        f.burn = fuelTime;
        f.burnMax = fuelTime;
        f.fuel.count--;
        if (f.fuel.count <= 0) f.fuel = null;
      }
    }

    if (f.burn > 0 && canSmelt) {
      f.cook += dt;
      if (f.cook >= 6) {
        f.cook = 0;
        const outId = smeltResult(f.input.id);
        if (f.output) f.output.count++;
        else f.output = { id: outId, count: 1, damage: 0 };
        f.input.count--;
        if (f.input.count <= 0) f.input = null;
      }
    } else {
      f.cook = Math.max(0, f.cook - dt * 2);
    }
  }
}

const furnaces = new Map();
const FUEL_TIMES = {
  [LOG]: 15,          // log
  [PLANKS]: 15,       // planks
  [280]: 5,           // stick
  [263]: 80,          // coal (incl. charcoal)
  [47]: 15,           // bookshelf
  [58]: 15,           // crafting table
};

// make furnace blocks interactable: right-click opens furnace UI
function openFurnace(x, y, z) {
  const key = `${x},${y},${z}`;
  if (!furnaces.has(key)) furnaces.set(key, { input: null, output: null, fuel: null, burn: 0, cook: 0 });
  const f = furnaces.get(key);
  game.openFurnaceData = { key, f };
  ui.setMode('furnace');
  buildFurnaceUI(f);
}

function buildFurnaceUI(f) {
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
  }
  panel.style.display = 'flex';
  // build slots
  const main = panel.querySelector('#f-inv-main');
  const hot = panel.querySelector('#f-inv-hotbar');
  main.innerHTML = ''; hot.innerHTML = '';
  for (let i = 9; i < 36; i++) {
    const s = document.createElement('div');
    s.className = 'slot';
    s.dataset.inv = i;
    s.addEventListener('mousedown', e => { ui.slotClick(e, 'inv', i); refreshFurnace(); });
    main.appendChild(s);
  }
  for (let i = 0; i < 9; i++) {
    const s = document.createElement('div');
    s.className = 'slot';
    s.dataset.inv = i;
    s.addEventListener('mousedown', e => { ui.slotClick(e, 'inv', i); refreshFurnace(); });
    hot.appendChild(s);
  }
  // furnace slots click
  const slotHandler = (which) => (e) => {
    e.preventDefault();
    const p = player;
    const src = which === 'in' ? f.input : which === 'out' ? f.output : f.fuel;
    if (which === 'out') {
      if (f.output && !p.cursorStack) {
        p.cursorStack = f.output;
        f.output = null;
      } else if (f.output && p.cursorStack && p.cursorStack.id === f.output.id) {
        p.cursorStack.count += f.output.count;
        f.output = null;
      }
    } else {
      if (p.cursorStack && !src) {
        const target = { ...p.cursorStack, count: 1 };
        if (which === 'in') f.input = target;
        else f.fuel = target;
        if (e.button === 2) {
          p.cursorStack.count--;
        } else {
          if (which === 'in') f.input = p.cursorStack;
          else f.fuel = p.cursorStack;
          p.cursorStack = null;
        }
      } else if (!p.cursorStack && src) {
        if (e.button === 2 && src.count > 1) {
          const half = Math.ceil(src.count / 2);
          p.cursorStack = { ...src, count: half };
          src.count -= half;
        } else {
          p.cursorStack = src;
          if (which === 'in') f.input = null;
          else f.fuel = null;
        }
      } else if (p.cursorStack && src && src.id === p.cursorStack.id && src.count < 64) {
        src.count++;
        p.cursorStack.count--;
        if (p.cursorStack.count <= 0) p.cursorStack = null;
      }
    }
    refreshFurnace();
    ui.refresh();
  };
  panel.querySelector('#f-in').addEventListener('mousedown', slotHandler('in'));
  panel.querySelector('#f-out').addEventListener('mousedown', slotHandler('out'));
  panel.querySelector('#f-fuel').addEventListener('mousedown', slotHandler('fuel'));
  refreshFurnace();
}

function refreshFurnace() {
  const panel = document.getElementById('furnace-screen');
  if (!panel || panel.style.display === 'none' || !game.openFurnaceData) return;
  const f = game.openFurnaceData.f;
  ui.renderSlot(panel.querySelector('#f-in'), f.input);
  ui.renderSlot(panel.querySelector('#f-out'), f.output);
  ui.renderSlot(panel.querySelector('#f-fuel'), f.fuel);
  panel.querySelector('#f-flame').style.opacity = f.burn > 0 ? 1 : 0.25;
  const fill = panel.querySelector('#f-prog-fill');
  fill.style.width = ((f.cook / 6) * 100) + '%';
}

// ---- input: interact ----
let rightClickCooldown = 0;
const tntFuses = []; // {x, y, z, timer}
document.addEventListener('mousedown', (e) => {
  if (ui.mode !== 'game' || !player.pointerLocked) return;
  if (e.button === 2) {
    const hit = player.raycast(world, 5);
    if (hit) {
      const id = world.getBlock(hit.x, hit.y, hit.z);
      if (id === CRAFTING_TABLE) {
        ui.craftSize = 3;
        ui.setMode('crafting');
        return;
      }
      if (id === FURNACE) {
        openFurnace(hit.x, hit.y, hit.z);
        return;
      }
      // flint & steel ignites TNT (beta behavior)
      const held = player.heldStack;
      if (id === TNT && held && held.id === 259) {
        tntFuses.push({ x: hit.x, y: hit.y, z: hit.z, timer: 3.2 });
        audio.fuse();
        return;
      }
    }
    tryPlaceBlock();
    rightClickCooldown = 0.25;
  }
});

function updateTNT(dt) {
  for (const t of tntFuses) {
    t.timer -= dt;
    // flash: swap to white-ish? keep simple — flash tnt top texture via block swap
    if (t.timer <= 0) {
      t.dead = true;
      if (world.getBlock(t.x, t.y, t.z) === TNT) world.setBlock(t.x, t.y, t.z, AIR);
      explode(new THREE.Vector3(t.x + 0.5, t.y + 0.5, t.z + 0.5), 3.4, player);
    }
  }
  for (let i = tntFuses.length - 1; i >= 0; i--) if (tntFuses[i].dead) tntFuses.splice(i, 1);
}

// ---- lighting modulation (day/night) ----
// Shader uniform: sky-lit faces dim at night, torch-lit faces stay warm-bright.
function applyDayLight(dayFactor) {
  const s = 0.16 + 0.84 * dayFactor;
  solidMat.uniforms.uSky.value = s;
  cutoutMat.uniforms.uSky.value = s;
  waterMat.uniforms.uSky.value = s;
}

// ---- main loop ----
let lastT = performance.now();
let fps = 0, fpsCount = 0, fpsTimer = 0;

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.1) dt = 0.1;
  game.time += dt;

  fpsCount++; fpsTimer += dt;
  if (fpsTimer >= 1) { fps = fpsCount; fpsCount = 0; fpsTimer = 0; }

  if (game.started && ui.mode !== 'title') {
    const paused = ui.mode === 'pause' || ui.mode === 'death' || ui.mode === 'inventory' || ui.mode === 'crafting' || ui.mode === 'furnace';

    if (!paused) {
      player.update(dt, world, audio);
      if (player.leftDown && player.pointerLocked) tryBreakBlock(dt);
      else if (!player.leftDown) { player.mining.active = false; }

      mobs.update(dt, player, sky.timeOfDay, effects, audio);
      updateItems(dt);
      updateArrows(dt);
      updateFurnaces(dt);
      updateTNT(dt);

      // eating with right click hold handled in tryPlaceBlock; also allow F key? no.
    }

    updateChunks();
    processChunkQueue();
    rebuildDirtyChunks();

    const dayFactor = sky.update(dt, camera.position);
    applyDayLight(dayFactor);
    // water texture scroll (beta animated water)
    waterTex.offset.y = (game.time * 0.012) % 1;
    waterTex.offset.x = (game.time * 0.004) % 1;

    // hurt flash overlay
    const hurtOverlay = document.getElementById('hurt-overlay');
    if (hurtOverlay) {
      hurtOverlay.style.opacity = player.hurtTime > 0 ? 0.32 : 0;
    }

    // drowning overlay
    const head = world.getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y + 1.62), Math.floor(player.pos.z));
    const waterOverlay = document.getElementById('water-overlay');
    if (waterOverlay) waterOverlay.style.opacity = head === WATER ? 0.45 : 0;

    // debug
    if (ui.showDebug) {
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
    } else {
      ui.updateDebug([]);
    }

    ui.update();
    if (player.dead && ui.mode !== 'death') {
      ui.showDeath(player.stats.blocksMined * 10 + player.stats.blocksPlaced * 5);
    }
  } else {
    sky.update(dt, camera.position);
    // slow orbit for title screen
    camera.position.set(
      Math.cos(game.time * 0.08) * 12 + 8,
      world.heightAt(8, 8) + 8,
      Math.sin(game.time * 0.08) * 12 + 8
    );
    camera.lookAt(8, world.heightAt(8, 8), 8);
    if (!game.started) {
      // pregenerate spawn chunks for the title backdrop
      processChunkQueue();
      if (chunkQueue.length === 0) updateChunks(true);
    }
  }

  renderer.render(scene, camera);
}

frame();

// expose for debugging
window.game = game;
