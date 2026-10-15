// Box-model mobs with terrain-aware movement and Beta-era combat behavior.
import * as THREE from 'three';
import { getBlock, AIR, WATER, LAVA, LEAVES, LOG, CACTUS, ICE, ITEMS } from '../world/blocks.js';
import { WORLD_H } from '../world/chunk.js';
import { buildMobTexture, SKIN_CELLS, SKIN_W, SKIN_H, SKIN_CELL } from '../world/textures.js';
import { daylightFactor } from '../sky.js';

export const MOB_DEFS = {
  pig: { w: 0.9, h: 0.9, hp: 10, speed: 1.4, hostile: false, drops: [[319, 1, 2]] },
  cow: { w: 0.9, h: 1.3, hp: 10, speed: 1.4, hostile: false, drops: [[334, 0, 2]] },
  sheep: { w: 0.9, h: 1.3, hp: 8, speed: 1.2, hostile: false, drops: [[150, 1, 0]] },
  chicken: { w: 0.6, h: 0.7, hp: 4, speed: 1.2, hostile: false, drops: [[288, 0, 2]] },
  zombie: { w: 0.6, h: 1.8, hp: 20, speed: 1.6, hostile: true, dmg: 3, drops: [[288, 0, 2]] },
  skeleton: { w: 0.6, h: 1.8, hp: 20, speed: 1.5, hostile: true, dmg: 2, ranged: true, drops: [[262, 0, 2], [352, 0, 1]] },
  creeper: { w: 0.6, h: 1.8, hp: 20, speed: 1.5, hostile: true, creeper: true, drops: [[289, 1, 2]] },
  spider: { w: 0.9, h: 0.9, hp: 16, speed: 2.0, hostile: true, dmg: 2, drops: [[287, 0, 2]] },
};

export function rollMobDrops(mobOrType, random = Math.random) {
  const def = typeof mobOrType === 'string' ? MOB_DEFS[mobOrType] : mobOrType?.def;
  if (!def?.drops) return [];
  return def.drops.map(([id, minimum = 0, extra = 0]) => ({
    id,
    count: minimum + Math.floor(random() * (extra + 1)),
  })).filter(drop => drop.count > 0);
}

// --- model construction -----------------------------------------------------
// Every part of a mob is a box that samples the 64x32 skin sheet of its mob.
// The box faces are mapped onto the sheet cell-by-cell (front, back, left,
// right, top, bottom) so markings such as eyes or a creeper face always end
// up on the correct side, and the models are sized against the hitboxes in
// MOB_DEFS so what you see matches what you can hit.
const BOX_FACES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
// Classic per-face brightness, identical to the terrain mesher.
const FACE_SHADE = { px: 0.6, nx: 0.6, py: 1.0, ny: 0.5, pz: 0.8, nz: 0.8 };

const geoCache = new WeakMap();
function skinBox(texture, w, h, d, cells, pivotTop = false) {
  // Geometries are cached per skin sheet: two mobs that happen to use the
  // same part size still have to sample their own texture.
  let cache = geoCache.get(texture);
  if (!cache) { cache = new Map(); geoCache.set(texture, cache); }
  const key = `${w},${h},${d},${cells.key},${pivotTop ? 'p' : ''}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.getAttribute('uv');
  const colors = [];
  for (let f = 0; f < 6; f++) {
    const face = BOX_FACES[f];
    const rect = cells[face] || cells.fallback;
    if (!rect) continue;
    const u0 = rect[0] / SKIN_W;
    const u1 = (rect[0] + SKIN_CELL) / SKIN_W;
    const v0 = 1 - (rect[1] + SKIN_CELL) / SKIN_H;
    const v1 = 1 - rect[1] / SKIN_H;
    const shade = FACE_SHADE[face];
    for (let j = 0; j < 4; j++) {
      const i = f * 4 + j;
      const bu = j % 2;
      const bv = 1 - Math.floor(j / 2);
      uv.setXY(i, u0 + bu * (u1 - u0), v0 + bv * (v1 - v0));
      colors.push(shade, shade, shade, 1);
    }
  }
  uv.needsUpdate = true;
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  if (pivotTop) geo.translate(0, -h / 2, 0);
  geo.computeBoundingBox();
  cache.set(key, geo);
  return geo;
}

// cell maps: each entry points at a region of the skin sheet
const C = SKIN_CELLS;
// The models look towards local -Z, so the "-Z" side of every box carries
// the front of the skin and the "+Z" side carries its back.
// Every part also carries a `fallback` cell: faces without their own cell
// (a leg has no separate top texture, for example) reuse it instead of
// accidentally sampling the whole sheet.
const CELLS = {
  head: { key: 'head', px: C.head.right, nx: C.head.left, py: C.head.top, ny: C.head.bottom, pz: C.head.back, nz: C.head.front, fallback: C.head.front },
  body: { key: 'body', px: C.body.right, nx: C.body.left, py: C.body.top, ny: C.body.bottom, pz: C.body.back, nz: C.body.front, fallback: C.body.front },
  leg: { key: 'leg', px: C.leg.right, nx: C.leg.left, py: C.leg.left, ny: C.leg.front, pz: C.leg.back, nz: C.leg.front, fallback: C.leg.front },
  arm: { key: 'arm', px: C.arm.right, nx: C.arm.left, py: C.arm.left, ny: C.arm.front, pz: C.arm.back, nz: C.arm.front, fallback: C.arm.front },
  snout: { key: 'snout', px: C.extra.right, nx: C.extra.left, py: C.extra.front, ny: C.extra.front, pz: C.extra.back, nz: C.extra.front, fallback: C.extra.front },
  horn: { key: 'horn', px: C.extra2.right, nx: C.extra2.left, py: C.extra2.front, ny: C.extra2.front, pz: C.extra2.back, nz: C.extra2.front, fallback: C.extra2.front },
  comb: { key: 'comb', px: C.extra.right, nx: C.extra.left, py: C.extra.front, ny: C.extra.front, pz: C.extra.back, nz: C.extra.front, fallback: C.extra.front },
  beak: { key: 'beak', px: C.extra2.right, nx: C.extra2.left, py: C.extra2.front, ny: C.extra2.front, pz: C.extra2.back, nz: C.extra2.front, fallback: C.extra2.front },
};

function buildMobModel(type, texture) {
  const group = new THREE.Group();
  const parts = { legs: [], arms: [] };
  const textured = new THREE.MeshBasicMaterial({ map: texture, vertexColors: true });

  const add = (name, w, h, d, x, y, z, cells, opts = {}) => {
    const mesh = new THREE.Mesh(skinBox(texture, w, h, d, cells, !!opts.pivotTop), textured);
    mesh.position.set(x, y, z);
    mesh.name = name;
    if (opts.rot) mesh.rotation.set(opts.rot[0] || 0, opts.rot[1] || 0, opts.rot[2] || 0);
    mesh.userData.baseRotX = mesh.rotation.x;
    mesh.userData.baseRotZ = mesh.rotation.z;
    group.add(mesh);
    if (name.startsWith('leg')) parts.legs.push(mesh);
    if (name.startsWith('arm')) parts.arms.push(mesh);
    if (name === 'head') parts.head = mesh;
    return mesh;
  };

  switch (type) {
    case 'pig': {
      // 0.9 x 0.9 hitbox
      add('leg1', 0.19, 0.30, 0.19, -0.20, 0.30, -0.24, CELLS.leg, { pivotTop: true });
      add('leg2', 0.19, 0.30, 0.19, 0.20, 0.30, -0.24, CELLS.leg, { pivotTop: true });
      add('leg3', 0.19, 0.30, 0.19, -0.20, 0.30, 0.26, CELLS.leg, { pivotTop: true });
      add('leg4', 0.19, 0.30, 0.19, 0.20, 0.30, 0.26, CELLS.leg, { pivotTop: true });
      add('body', 0.62, 0.58, 0.72, 0, 0.59, 0.04, CELLS.body);
      add('head', 0.44, 0.44, 0.44, 0, 0.67, -0.46, CELLS.head);
      add('snout', 0.22, 0.17, 0.16, 0, 0.58, -0.70, CELLS.snout);
      break;
    }
    case 'cow': {
      // 0.9 x 1.3 hitbox
      add('leg1', 0.22, 0.55, 0.22, -0.24, 0.55, -0.32, CELLS.leg, { pivotTop: true });
      add('leg2', 0.22, 0.55, 0.22, 0.24, 0.55, -0.32, CELLS.leg, { pivotTop: true });
      add('leg3', 0.22, 0.55, 0.22, -0.24, 0.55, 0.34, CELLS.leg, { pivotTop: true });
      add('leg4', 0.22, 0.55, 0.22, 0.24, 0.55, 0.34, CELLS.leg, { pivotTop: true });
      add('body', 0.68, 0.60, 0.94, 0, 0.85, 0.02, CELLS.body);
      add('head', 0.46, 0.46, 0.46, 0, 1.02, -0.56, CELLS.head);
      add('horn1', 0.09, 0.16, 0.09, -0.19, 1.30, -0.58, CELLS.horn);
      add('horn2', 0.09, 0.16, 0.09, 0.19, 1.30, -0.58, CELLS.horn);
      break;
    }
    case 'sheep': {
      // 0.9 x 1.3 hitbox
      add('leg1', 0.20, 0.48, 0.20, -0.24, 0.48, -0.30, CELLS.leg, { pivotTop: true });
      add('leg2', 0.20, 0.48, 0.20, 0.24, 0.48, -0.30, CELLS.leg, { pivotTop: true });
      add('leg3', 0.20, 0.48, 0.20, -0.24, 0.48, 0.32, CELLS.leg, { pivotTop: true });
      add('leg4', 0.20, 0.48, 0.20, 0.24, 0.48, 0.32, CELLS.leg, { pivotTop: true });
      add('body', 0.72, 0.64, 0.92, 0, 0.80, 0.02, CELLS.body);
      add('head', 0.44, 0.44, 0.44, 0, 0.99, -0.54, CELLS.head);
      break;
    }
    case 'chicken': {
      // 0.6 x 0.7 hitbox
      add('leg1', 0.08, 0.16, 0.08, -0.10, 0.16, -0.02, CELLS.leg, { pivotTop: true });
      add('leg2', 0.08, 0.16, 0.08, 0.10, 0.16, -0.02, CELLS.leg, { pivotTop: true });
      add('body', 0.34, 0.40, 0.44, 0, 0.36, 0.02, CELLS.body);
      add('wing1', 0.05, 0.24, 0.32, -0.19, 0.38, 0.03, CELLS.body);
      add('wing2', 0.05, 0.24, 0.32, 0.19, 0.38, 0.03, CELLS.body);
      add('head', 0.24, 0.24, 0.24, 0, 0.60, -0.24, CELLS.head);
      add('beak', 0.14, 0.10, 0.14, 0, 0.57, -0.40, CELLS.beak);
      add('comb', 0.09, 0.12, 0.18, 0, 0.76, -0.22, CELLS.comb);
      break;
    }
    case 'zombie':
    case 'skeleton': {
      // 0.6 x 1.8 hitbox
      const skeleton = type === 'skeleton';
      add('leg1', 0.22, 0.72, 0.22, -0.15, 0.72, 0, CELLS.leg, { pivotTop: true });
      add('leg2', 0.22, 0.72, 0.22, 0.15, 0.72, 0, CELLS.leg, { pivotTop: true });
      add('body', 0.50, 0.64, 0.26, 0, 1.04, 0, CELLS.body);
      // arms held out in front, like the classic undead
      add('arm1', 0.20, 0.64, 0.20, -0.36, 1.32, 0, CELLS.arm, { pivotTop: true, rot: [1.45, 0, 0] });
      add('arm2', 0.20, 0.64, 0.20, 0.36, 1.32, 0, CELLS.arm, { pivotTop: true, rot: [1.45, 0, 0] });
      add('head', 0.46, 0.46, 0.46, 0, 1.57, 0, CELLS.head);
      if (skeleton) add('bow', 0.05, 0.62, 0.05, 0.56, 1.30, -0.20, CELLS.arm);
      break;
    }
    case 'creeper': {
      // 0.6 x 1.8 hitbox
      add('leg1', 0.20, 0.62, 0.20, -0.15, 0.62, 0, CELLS.leg, { pivotTop: true });
      add('leg2', 0.20, 0.62, 0.20, 0.15, 0.62, 0, CELLS.leg, { pivotTop: true });
      add('body', 0.50, 0.62, 0.26, 0, 0.93, 0, CELLS.body);
      add('arm1', 0.16, 0.42, 0.16, -0.33, 1.24, 0, CELLS.arm, { pivotTop: true, rot: [0.25, 0, 0] });
      add('arm2', 0.16, 0.42, 0.16, 0.33, 1.24, 0, CELLS.arm, { pivotTop: true, rot: [0.25, 0, 0] });
      add('head', 0.50, 0.50, 0.50, 0, 1.55, 0, CELLS.head);
      break;
    }
    case 'spider': {
      // 0.9 x 0.9 hitbox
      add('body', 0.64, 0.42, 0.54, 0, 0.42, 0.10, CELLS.body);
      add('head', 0.42, 0.36, 0.40, 0, 0.44, -0.36, CELLS.head);
      for (let i = 0; i < 4; i++) {
        const z = -0.26 + i * 0.24;
        add(`legL${i}`, 0.62, 0.07, 0.07, -0.46, 0.34, z, CELLS.leg, { rot: [0, 0, 0.18] });
        add(`legR${i}`, 0.62, 0.07, 0.07, 0.46, 0.34, z, CELLS.leg, { rot: [0, 0, -0.18] });
      }
      break;
    }
  }
  return { group, parts };
}

function clamp01(value) { return Math.max(0, Math.min(1, value)); }

// Sky uses the same angle: t=.5 is noon, t=0/.1 is night, and t=.25/.75 are dawn/dusk.
export function isDaylight(timeOfDay) {
  const t = ((timeOfDay % 1) + 1) % 1;
  const elevation = Math.sin((t - 0.25) * Math.PI * 2);
  return elevation > 0.04;
}

export function hasDirectSky(world, x, y, z) {
  const bx = Math.floor(x), bz = Math.floor(z);
  for (let by = Math.max(0, Math.floor(y)); by < WORLD_H; by++) {
    const block = world.getBlock(bx, by, bz);
    if (block !== AIR && getBlock(block).solid) return false;
  }
  return true;
}

export function canMobBurnInSun(mob, world, timeOfDay) {
  if (!mob || (mob.type !== 'zombie' && mob.type !== 'skeleton') || !isDaylight(timeOfDay)) return false;
  const { x, y, z } = mob.pos;
  for (const sampleY of [y + 0.1, y + mob.def.h * 0.55, y + mob.def.h - 0.05]) {
    if (world.getBlock(Math.floor(x), Math.floor(sampleY), Math.floor(z)) === WATER) return false;
  }
  return hasDirectSky(world, x, y + mob.def.h, z);
}

export function findSafeGround(world, x, z, width = 0.6, height = 1.8) {
  const bx = Math.floor(x), bz = Math.floor(z);
  const heightAt = typeof world.heightAt === 'function' ? world.heightAt(bx, bz) : WORLD_H - 1;
  const start = Math.min(WORLD_H - 2, Math.max(1, heightAt + 3));
  const minX = Math.floor(x - width / 2 + 0.001), maxX = Math.floor(x + width / 2 - 0.001);
  const minZ = Math.floor(z - width / 2 + 0.001), maxZ = Math.floor(z + width / 2 - 0.001);

  for (let supportY = start; supportY >= 0; supportY--) {
    const supportId = world.getBlock(bx, supportY, bz);
    if (!getBlock(supportId).solid || [LEAVES, LOG, CACTUS, ICE].includes(supportId)) continue;
    const feetY = supportY + 1.001;
    let room = true;
    for (let yy = Math.floor(feetY); yy <= Math.floor(feetY + height - 0.001) && room; yy++) {
      for (let zz = minZ; zz <= maxZ && room; zz++) {
        for (let xx = minX; xx <= maxX; xx++) {
          const id = world.getBlock(xx, yy, zz);
          if (getBlock(id).solid || id === WATER || id === LAVA) { room = false; break; }
        }
      }
    }
    if (room) return feetY;
  }
  return null;
}

function canOccupy(world, mob, x, y, z) {
  const half = mob.def.w / 2;
  const minX = Math.floor(x - half + 0.001), maxX = Math.floor(x + half - 0.001);
  const minY = Math.floor(y + 0.001), maxY = Math.floor(y + mob.def.h - 0.001);
  const minZ = Math.floor(z - half + 0.001), maxZ = Math.floor(z + half - 0.001);
  for (let by = minY; by <= maxY; by++) {
    for (let bz = minZ; bz <= maxZ; bz++) {
      for (let bx = minX; bx <= maxX; bx++) {
        if (getBlock(world.getBlock(bx, by, bz)).solid) return false;
      }
    }
  }
  return true;
}

function hasSupport(world, mob, x, y, z) {
  const half = mob.def.w / 2;
  const by = Math.floor(y - 0.03);
  for (let bz = Math.floor(z - half + 0.001); bz <= Math.floor(z + half - 0.001); bz++) {
    for (let bx = Math.floor(x - half + 0.001); bx <= Math.floor(x + half - 0.001); bx++) {
      if (getBlock(world.getBlock(bx, by, bz)).solid) return true;
    }
  }
  return false;
}

function safePassiveStep(world, mob, dirX, dirZ) {
  const x = mob.pos.x + dirX * 0.68;
  const z = mob.pos.z + dirZ * 0.68;
  const feetBlockY = Math.floor(mob.pos.y - 0.03);
  for (const y of [Math.floor(mob.pos.y + 0.1), Math.floor(mob.pos.y + 1.0)]) {
    if (world.getBlock(Math.floor(x), y, Math.floor(z)) === LAVA) return false;
  }
  for (const supportY of [feetBlockY, feetBlockY - 1]) {
    const support = world.getBlock(Math.floor(x), supportY, Math.floor(z));
    if (support === LAVA) return false;
    if (getBlock(support).solid) return true; // a one-block drop is manageable; deeper gaps are not
  }
  return false;
}

function hasLineOfSight(world, from, to) {
  const delta = to.clone().sub(from);
  const distance = delta.length();
  if (distance <= 0.01) return true;
  delta.multiplyScalar(1 / distance);
  for (let d = 0.2; d < distance - 0.2; d += 0.2) {
    const p = from.clone().addScaledVector(delta, d);
    if (getBlock(world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))).solid) return false;
  }
  return true;
}

export function mobAttackDamage(heldId) {
  const held = ITEMS[heldId];
  return held?.tool === 'sword' ? (held.damage || 4) : 1;
}

export class Mob {
  constructor(type, x, y, z) {
    if (!MOB_DEFS[type]) throw new Error(`Unknown mob type: ${type}`);
    this.type = type;
    this.def = MOB_DEFS[type];
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.hp = this.def.hp;
    this.onGround = false;
    this.wanderTimer = 0;
    this.moveToward = false;
    this.state = 'wander';
    this.fuse = -1;
    this.fuseSoundTimer = 0;
    this.attackTimer = 0;
    this.leapTimer = 0;
    this.strafeTimer = 0;
    this.strafeSign = Math.random() < 0.5 ? -1 : 1;
    this.hurtTime = 0;
    this.age = 0;
    this.burning = false;
    this.burnTick = 0;
    this.burnParticleTimer = 0;
    this.killed = false;
    this.dead = false;

    this.texture = new THREE.CanvasTexture(buildMobTexture(type));
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.NoColorSpace;
    const model = buildMobModel(type, this.texture);
    this.group = model.group;
    this.parts = model.parts;
    // Fit the model to the mob's hitbox so what you see matches what you hit.
    // The height is authoritative; limbs may stick out a little (a zombie's
    // arms do in beta too) but never far beyond the hitbox.
    this.group.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(this.group).getSize(new THREE.Vector3());
    let fit = this.def.h / Math.max(0.001, size.y);
    const maxWidth = this.def.w * 1.8;
    if (size.x * fit > maxWidth) fit = maxWidth / Math.max(0.001, size.x);
    if (fit > 0 && Math.abs(fit - 1) > 0.001) this.group.scale.setScalar(fit);
    this.group.position.copy(this.pos);
    this._legPhase = Math.random() * Math.PI * 2;
  }

  update(dt, world, player, mobs, effects, audio, timeOfDay = 0.5) {
    if (this.dead) return;
    dt = Math.max(0, Math.min(dt, 0.1));
    this.age += dt;
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.leapTimer = Math.max(0, this.leapTimer - dt);
    this.strafeTimer -= dt;

    const dx = player.pos.x - this.pos.x;
    const dz = player.pos.z - this.pos.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 80) { this.dead = true; return; }

    let moveX = 0, moveZ = 0;
    let facingTarget = false;
    if (this.def.hostile && !player.dead && distance < 16) {
      this.state = 'chase';
      const safeDistance = Math.max(distance, 0.0001);
      const towardX = dx / safeDistance, towardZ = dz / safeDistance;
      this.yaw = Math.atan2(towardX, towardZ);
      facingTarget = true;

      if (this.def.creeper) {
        if (this.fuse < 0 && distance <= 3) {
          this.fuse = 1.5;
          this.fuseSoundTimer = 0.48;
          if (audio) audio.fuse();
        }
        if (this.fuse > 0 && distance > 6) {
          this.fuse = -1;
          this.fuseSoundTimer = 0;
        }
        if (this.fuse < 0) { moveX = towardX; moveZ = towardZ; }
      } else if (this.def.ranged) {
        if (distance > 12) { moveX = towardX; moveZ = towardZ; }
        else if (distance < 8) { moveX = -towardX; moveZ = -towardZ; }
        else {
          if (this.strafeTimer <= 0) {
            this.strafeTimer = 2 + Math.random() * 2;
            this.strafeSign *= -1;
          }
          moveX = -towardZ * this.strafeSign;
          moveZ = towardX * this.strafeSign;
        }
        if (distance >= 8 && distance <= 12 && this.attackTimer <= 0) {
          const from = this.pos.clone().add(new THREE.Vector3(0, this.def.h * 0.78, 0));
          const to = player.pos.clone().add(new THREE.Vector3(0, 1.35, 0));
          if (hasLineOfSight(world, from, to)) {
            this.attackTimer = 2;
            if (effects?.shootArrow) effects.shootArrow(this, player);
            if (audio) audio.bow();
          }
        }
      } else {
        moveX = towardX; moveZ = towardZ;
        const verticalReach = Math.abs(player.pos.y - this.pos.y) < 2.2;
        if (distance < 1.6 && verticalReach && this.attackTimer <= 0) {
          this.attackTimer = 1;
          if (typeof player.damage === 'function') player.damage(this.def.dmg, audio);
          if (audio) audio.mobAttack();
        }
        if (this.type === 'spider' && distance < 4 && this.onGround && this.leapTimer <= 0) {
          this.vel.y = 7.2;
          this.leapTimer = 1.8;
        }
      }
    } else {
      this.state = 'wander';
      this.fuse = -1;
      this.fuseSoundTimer = 0;
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 2 + Math.random() * 4;
        this.yaw = Math.random() * Math.PI * 2;
        this.moveToward = Math.random() < 0.68;
      }
      if (this.moveToward) {
        moveX = Math.sin(this.yaw);
        moveZ = Math.cos(this.yaw);
      }
    }

    if (this.fuse > 0) {
      this.fuse -= dt;
      this.fuseSoundTimer -= dt;
      if (this.fuseSoundTimer <= 0 && this.fuse > 0) {
        if (audio) audio.fuse();
        this.fuseSoundTimer = 0.48;
      }
      if (this.fuse <= 0) {
        this.dead = true;
        if (effects?.explosion) effects.explosion(this.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 3, player);
        return;
      }
    }

    this.burning = canMobBurnInSun(this, world, timeOfDay);
    if (this.burning) {
      this.burnTick -= dt;
      this.burnParticleTimer -= dt;
      if (this.burnTick <= 0) {
        this.burnTick = 1;
        this.damage(2, audio, { silentHurt: true });
        if (this.dead) return;
      }
      if (this.burnParticleTimer <= 0) {
        this.burnParticleTimer = 0.12;
        if (effects?.mobBurn) effects.mobBurn(this);
      }
    } else {
      this.burnTick = 0;
      this.burnParticleTimer = 0;
    }

    let moveLen = Math.hypot(moveX, moveZ);
    if (moveLen > 0) { moveX /= moveLen; moveZ /= moveLen; }

    // Passive animals turn away from lava and holes deeper than one block.
    if (!this.def.hostile && moveLen > 0 && !safePassiveStep(world, this, moveX, moveZ)) {
      this.moveToward = false;
      this.wanderTimer = 0.35;
      moveX = 0; moveZ = 0; moveLen = 0;
      this.vel.x *= 0.35; this.vel.z *= 0.35;
    }

    const inWater = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.1), Math.floor(this.pos.z)) === WATER;
    const inLava = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.1), Math.floor(this.pos.z)) === LAVA;
    const aheadX = this.pos.x + moveX * 0.66;
    const aheadZ = this.pos.z + moveZ * 0.66;
    const walkingIntoWall = moveLen > 0 && !canOccupy(world, this, aheadX, this.pos.y, aheadZ);
    this.climbing = false;

    if (this.onGround && walkingIntoWall) {
      const stepY = Math.floor(this.pos.y) + 1.001;
      if (canOccupy(world, this, aheadX, stepY, aheadZ) && hasSupport(world, this, aheadX, stepY, aheadZ)) {
        this.vel.y = Math.max(this.vel.y, this.type === 'spider' ? 7.2 : 7.4);
        this.onGround = false;
      } else if (this.type === 'spider') {
        this.climbing = true;
      }
    } else if (this.type === 'spider' && walkingIntoWall) {
      this.climbing = true;
    }

    if (moveLen > 0) {
      if (!facingTarget) this.yaw = Math.atan2(moveX, moveZ);
      const chaseBoost = this.state === 'chase' ? (this.type === 'spider' ? 1.35 : 1.22) : 1;
      const accel = this.def.speed * 7 * chaseBoost;
      this.vel.x += moveX * accel * dt;
      this.vel.z += moveZ * accel * dt;
    }

    const horizontalSpeed = Math.hypot(this.vel.x, this.vel.z);
    const maxSpeed = this.def.speed * (this.state === 'chase' ? (this.type === 'spider' ? 1.65 : 1.35) : 0.8);
    if (horizontalSpeed > maxSpeed) {
      this.vel.x *= maxSpeed / horizontalSpeed;
      this.vel.z *= maxSpeed / horizontalSpeed;
    }

    if (inWater) {
      this.vel.y += 7 * dt;
      this.vel.y = Math.max(this.vel.y, 1.5);
    } else if (inLava) {
      this.vel.y += 3 * dt;
    } else if (this.climbing) {
      this.vel.y = Math.max(this.vel.y, 3.2);
    } else {
      this.vel.y -= 26 * dt;
    }
    const damping = Math.pow(inWater ? 0.84 : 0.72, dt * 20);
    this.vel.x *= damping; this.vel.z *= damping;

    this.moveAxis(world, 1, this.vel.y * dt);
    this.moveAxis(world, 0, this.vel.x * dt);
    this.moveAxis(world, 2, this.vel.z * dt);
    this.onGround = hasSupport(world, this, this.pos.x, this.pos.y, this.pos.z);

    this.group.position.copy(this.pos);
    // The models face local -Z; movement heading points along +Z at yaw zero.
    this.group.rotation.y = this.yaw + Math.PI;
    this.animate(dt);
    this.updateColor(timeOfDay);
  }

  animate(dt) {
    const walking = Math.hypot(this.vel.x, this.vel.z) > 0.05;
    if (walking) this._legPhase += dt * (this.type === 'spider' ? 11 : 8);
    const swing = walking ? Math.sin(this._legPhase) * 0.48 : 0;
    if (this.parts.legs) {
      this.parts.legs.forEach((leg, i) => {
        const base = leg.userData.baseRotX || 0;
        leg.rotation.x = base + swing * (i % 2 === 0 ? 1 : -1);
      });
    }
    if (this.parts.arms) {
      this.parts.arms.forEach((arm, i) => {
        const base = arm.userData.baseRotX || 0;
        // the undead keep their arms stretched out; only the swing changes
        arm.rotation.x = base + swing * (i % 2 === 0 ? -0.22 : 0.22);
      });
    }
    if (this.type === 'spider') {
      this.parts.legs.forEach((leg, i) => { leg.rotation.z = (leg.userData.baseRotZ || 0) + (walking ? Math.sin(this._legPhase + i) * 0.12 : 0); });
    }
  }

  updateColor(timeOfDay = 0.5) {
    const flashing = this.type === 'creeper' && this.fuse > 0 && Math.floor(this.fuse * 10) % 2 === 0;
    const tint = this.hurtTime > 0 ? 0xff5555 : flashing ? 0xffffff : null;
    // Mobs follow the same day/night curve as the sky so they are never
    // flat white in the middle of the night.
    const daylight = daylightFactor(timeOfDay);
    const brightness = 0.24 + 0.76 * daylight;
    this.group.traverse(object => {
      if (!object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material.color) continue;
        if (material.userData.baseColor === undefined) material.userData.baseColor = material.color.getHex();
        material.color.setHex(tint ?? material.userData.baseColor);
        if (!tint) material.color.multiplyScalar(brightness);
      }
    });
  }

  moveAxis(world, axis, amount) {
    if (Math.abs(amount) < 1e-9) return false;
    const previous = this.pos.getComponent(axis);
    this.pos.setComponent(axis, previous + amount);
    const half = this.def.w / 2;
    const minX = this.pos.x - half, maxX = this.pos.x + half;
    const minY = this.pos.y, maxY = this.pos.y + this.def.h;
    const minZ = this.pos.z - half, maxZ = this.pos.z + half;
    for (let by = Math.floor(minY); by <= Math.floor(maxY); by++) {
      for (let bz = Math.floor(minZ); bz <= Math.floor(maxZ); bz++) {
        for (let bx = Math.floor(minX); bx <= Math.floor(maxX); bx++) {
          if (!getBlock(world.getBlock(bx, by, bz)).solid) continue;
          if (!(maxX > bx && minX < bx + 1 && maxY > by && minY < by + 1 && maxZ > bz && minZ < bz + 1)) continue;
          if (axis === 1) {
            this.pos.y = amount > 0 ? by - this.def.h - 0.001 : by + 1.001;
            this.vel.y = 0;
          } else if (axis === 0) {
            this.pos.x = amount > 0 ? bx - half - 0.001 : bx + 1 + half + 0.001;
            this.vel.x = 0;
          } else {
            this.pos.z = amount > 0 ? bz - half - 0.001 : bz + 1 + half + 0.001;
            this.vel.z = 0;
          }
          return true;
        }
      }
    }
    return false;
  }

  damage(amount, audio, options = {}) {
    if (this.dead || amount <= 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.hurtTime = options.silentHurt ? 0.2 : 0.35;
    if (options.knockback) this.vel.add(options.knockback);
    if (!options.silentHurt && audio) audio.mobHurt();
    if (this.hp <= 0) {
      this.dead = true;
      this.killed = true;
      if (audio?.mobDeath) audio.mobDeath(this.type);
    }
    return true;
  }

  dispose() {
    const materials = new Set();
    this.group.traverse(object => {
      if (!object.material) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    for (const material of materials) material.dispose();
    this.texture.dispose();
  }
}

export class MobManager {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.mobs = [];
    this.spawnTimer = 0;
    this.attackCooldown = 0;
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  spawnInitial(player) {
    const types = ['pig', 'cow', 'sheep', 'chicken'];
    let attempts = 0, spawned = 0;
    while (spawned < 10 && attempts < 80) {
      attempts++;
      const x = player.pos.x + (Math.random() - 0.5) * 24;
      const z = player.pos.z + (Math.random() - 0.5) * 24;
      const y = findSafeGround(this.world, x, z, 0.8, 1.35);
      if (y == null || this.world.getBlock(Math.floor(x), Math.floor(y - 1), Math.floor(z)) === WATER) continue;
      const type = types[Math.floor(Math.random() * types.length)];
      this.add(type, x, y, z);
      spawned++;
    }
  }

  add(type, x, y, z) {
    const mob = new Mob(type, x, y, z);
    this.mobs.push(mob);
    this.group.add(mob.group);
    return mob;
  }

  update(dt, player, timeOfDay, effects, audio) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    const night = !isDaylight(timeOfDay);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 4;
      const hostiles = this.mobs.filter(mob => mob.def.hostile).length;
      const passives = this.mobs.filter(mob => !mob.def.hostile).length;
      if (!player.dead && this.mobs.length < 18) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 20 + Math.random() * 28;
        const x = player.pos.x + Math.cos(angle) * distance;
        const z = player.pos.z + Math.sin(angle) * distance;
        const chunk = this.world.getChunk(Math.floor(x / 16), Math.floor(z / 16));
        if (chunk?.generated) {
          const y = findSafeGround(this.world, x, z, 0.8, 1.8);
          if (y != null) {
            if (night && hostiles < 10 && Math.random() < 0.7) {
              const types = ['zombie', 'skeleton', 'creeper', 'spider'];
              this.add(types[Math.floor(Math.random() * types.length)], x, y, z);
            } else if (!night && passives < 12 && Math.random() < 0.3) {
              const types = ['pig', 'cow', 'sheep', 'chicken'];
              this.add(types[Math.floor(Math.random() * types.length)], x, y, z);
            }
          }
        }
      }
    }

    for (const mob of this.mobs) {
      mob.update(dt, this.world, player, this.mobs, effects, audio, timeOfDay);
      if (mob.dead) {
        this.group.remove(mob.group);
        if (effects?.dropMobLoot) effects.dropMobLoot(mob);
        mob.dispose();
      }
    }
    this.mobs = this.mobs.filter(mob => !mob.dead);
  }

  raycastTarget(player, maxDistance = 3.5) {
    const origin = player.camera?.position?.clone() || player.pos.clone().add(new THREE.Vector3(0, 1.62, 0));
    const direction = new THREE.Vector3(
      -Math.sin(player.yaw) * Math.cos(player.pitch || 0),
      Math.sin(player.pitch || 0),
      -Math.cos(player.yaw) * Math.cos(player.pitch || 0),
    ).normalize();
    const ray = new THREE.Ray(origin, direction);
    const hitPoint = new THREE.Vector3();
    let nearest = null;
    let nearestDistance = maxDistance;

    for (const mob of this.mobs) {
      if (mob.dead) continue;
      const half = mob.def.w / 2;
      const box = new THREE.Box3(
        new THREE.Vector3(mob.pos.x - half, mob.pos.y, mob.pos.z - half),
        new THREE.Vector3(mob.pos.x + half, mob.pos.y + mob.def.h, mob.pos.z + half),
      );
      const hit = ray.intersectBox(box, hitPoint);
      if (!hit) continue;
      const distance = origin.distanceTo(hit);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = mob;
      }
    }

    if (!nearest) return null;
    const blockHit = typeof player.raycast === 'function' ? player.raycast(this.world, maxDistance) : null;
    if (blockHit && blockHit.dist <= nearestDistance) return null;
    return nearest;
  }

  attack(player, heldId, audio, maxDistance = 3.5) {
    const target = this.raycastTarget(player, maxDistance);
    if (!target) return false;
    if (this.attackCooldown > 0) return true;
    this.attackCooldown = 0.45;
    const dx = target.pos.x - player.pos.x;
    const dz = target.pos.z - player.pos.z;
    const length = Math.hypot(dx, dz) || 1;
    const knockback = new THREE.Vector3((dx / length) * 3.4, 1.15, (dz / length) * 3.4);
    target.damage(mobAttackDamage(heldId), audio, { knockback });
    if (typeof player.useHeldOn === 'function') player.useHeldOn(AIR);
    return true;
  }

  nearestHostile(pos, range) {
    let best = null, bestDistance = range * range;
    for (const mob of this.mobs) {
      if (!mob.def.hostile || mob.dead) continue;
      const distance = mob.pos.distanceToSquared(pos);
      if (distance < bestDistance) { bestDistance = distance; best = mob; }
    }
    return best;
  }
}
