// Box-model mobs with terrain-aware movement and Beta-era combat behavior.
import * as THREE from 'three';
import { getBlock, AIR, WATER, WATER_FLOW, LAVA, LAVA_FLOW, LEAVES, LOG, CACTUS, ICE, ITEMS } from '../world/blocks.js';
import { WORLD_H } from '../world/chunk.js';
import { meleeEnchantBonuses } from '../enchanting.js';
import { getMobSkinTexture, skinBoxGeo, uvBox } from './entity-textures.js';

export const MOB_DEFS = {
  pig: { w: 0.9, h: 0.9, hp: 10, speed: 1.4, hostile: false, xp: 2, drops: [[319, 1, 2]] },
  cow: { w: 0.9, h: 1.3, hp: 10, speed: 1.4, hostile: false, xp: 2, drops: [[334, 0, 2]] },
  sheep: { w: 0.9, h: 1.3, hp: 8, speed: 1.2, hostile: false, xp: 2, drops: [[150, 1, 0]] },
  chicken: { w: 0.6, h: 0.7, hp: 4, speed: 1.2, hostile: false, xp: 2, drops: [[288, 0, 2]] },
  zombie: { w: 0.6, h: 1.8, hp: 20, speed: 1.6, hostile: true, undead: true, dmg: 3, xp: 5, drops: [[288, 0, 2]] },
  skeleton: { w: 0.6, h: 1.8, hp: 20, speed: 1.5, hostile: true, undead: true, dmg: 2, ranged: true, xp: 5, drops: [[262, 0, 2], [352, 0, 1]] },
  creeper: { w: 0.6, h: 1.8, hp: 20, speed: 1.5, hostile: true, creeper: true, xp: 5, drops: [[289, 1, 2]] },
  spider: { w: 0.9, h: 0.9, hp: 16, speed: 2.0, hostile: true, arthropod: true, dmg: 2, xp: 5, drops: [[287, 0, 2]] },
  pigman: { w: 0.6, h: 1.8, hp: 20, speed: 1.75, hostile: true, neutral: true, undead: true, fireImmune: true, dmg: 5, xp: 5, drops: [[367, 0, 2], [371, 0, 2]] },
  blaze: { w: 0.6, h: 1.8, hp: 20, speed: 1.5, hostile: true, ranged: true, hover: true, fireImmune: true, dmg: 4, xp: 10, drops: [[369, 0, 1]] },
  ghast: { w: 2.2, h: 2.2, hp: 10, speed: 1.4, hostile: true, flying: true, fireImmune: true, dmg: 6, xp: 5, drops: [[370, 0, 1], [289, 0, 2]] },
};

export function rollMobDrops(mobOrType, random = Math.random, looting = 0) {
  const def = typeof mobOrType === 'string' ? MOB_DEFS[mobOrType] : mobOrType?.def;
  const type = typeof mobOrType === 'string' ? mobOrType : mobOrType?.type;
  if (!def?.drops) return [];
  if (typeof mobOrType === 'object' && mobOrType?.type === 'sheep' && mobOrType.sheared) return [];
  const lootBonus = Math.max(0, Math.min(3, Math.floor(looting || (typeof mobOrType === 'object' ? mobOrType?.lastHitLooting : 0) || 0)));
  const out = def.drops.map(([id, minimum = 0, extra = 0]) => ({
    id,
    count: minimum + Math.floor(random() * (extra + lootBonus + 1)),
  })).filter(drop => drop.count > 0);
  if (type === 'pigman' && random() < 0.04 + lootBonus * 0.02) {
    out.push({ id: 266, count: 1 });
  }
  return out;
}

function buildMobModel(type, texture) {
  const group = new THREE.Group();
  const parts = { legs: [], arms: [] };
  const addGeo = (name, geo, w, h, x, y, z, opts = {}) => {
    const mat = new THREE.MeshBasicMaterial({
      color: opts.color ?? 0xffffff,
      map: opts.noMap ? null : (opts.map || texture),
      alphaTest: opts.alphaTest ?? 0,
      side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    if (opts.emissive) mesh.userData.emissive = true;
    if (name.startsWith('leg') || name.startsWith('arm')) {
      const joint = new THREE.Group();
      // Spider legs hinge at the body; other limbs hinge at their top.
      if (type === 'spider') {
        joint.position.set(x > 0 ? x - w / 2 : x + w / 2, y, z);
        mesh.position.x = x - joint.position.x;
      } else {
        joint.position.set(x, y + h / 2, z);
        mesh.position.y = -h / 2;
      }
      joint.add(mesh);
      group.add(joint);
      if (name.startsWith('leg')) parts.legs.push(joint);
      else parts.arms.push(joint);
    } else {
      mesh.position.set(x, y, z);
      group.add(mesh);
    }
    if (name === 'head') parts.head = mesh;
    return mesh;
  };
  const addBox = (name, w, h, d, x, y, z, u, v, pw, ph, pd, opts = {}) =>
    addGeo(name, skinBoxGeo(w, h, d, u, v, pw, ph, pd), w, h, x, y, z, opts);

  switch (type) {
    case 'pig':
      addBox('body', 0.92, 0.76, 1.34, 0, 0.56, 0, 0, 16, 10, 8, 14);
      addBox('head', 0.68, 0.68, 0.68, 0, 0.76, -0.76, 0, 0, 8, 8, 8);
      addBox('snout', 0.36, 0.26, 0.18, 0, 0.63, -1.18, 32, 0, 4, 3, 2);
      for (const [name, x, z] of [['leg1', -0.28, -0.46], ['leg2', 0.28, -0.46], ['leg3', -0.28, 0.46], ['leg4', 0.28, 0.46]]) {
        addBox(name, 0.25, 0.42, 0.25, x, 0.21, z, 0, 40, 4, 6, 4);
      }
      break;

    case 'cow':
      addBox('body', 0.95, 0.80, 1.35, 0, 0.66, 0, 0, 15, 10, 8, 14);
      addBox('head', 0.62, 0.62, 0.54, 0, 0.88, -0.78, 0, 0, 8, 8, 6);
      addBox('muzzle', 0.42, 0.23, 0.14, 0, 0.72, -1.11, 32, 0, 6, 3, 2);
      addBox('horn1', 0.10, 0.24, 0.10, -0.25, 1.22, -0.80, 48, 0, 2, 4, 2);
      addBox('horn2', 0.10, 0.24, 0.10, 0.25, 1.22, -0.80, 48, 0, 2, 4, 2);
      for (const [name, x, z] of [['leg1', -0.28, -0.44], ['leg2', 0.28, -0.44], ['leg3', -0.28, 0.44], ['leg4', 0.28, 0.44]]) {
        addBox(name, 0.24, 0.58, 0.24, x, 0.29, z, 0, 39, 4, 9, 4);
      }
      break;

    case 'sheep':
      addBox('body', 0.98, 0.82, 1.36, 0, 0.66, 0, 0, 16, 10, 8, 14);
      addBox('head', 0.60, 0.60, 0.60, 0, 0.86, -0.78, 0, 0, 7, 7, 7);
      for (const [name, x, z] of [['leg1', -0.28, -0.44], ['leg2', 0.28, -0.44], ['leg3', -0.28, 0.44], ['leg4', 0.28, 0.44]]) {
        addBox(name, 0.25, 0.58, 0.25, x, 0.29, z, 0, 40, 4, 9, 4);
      }
      break;

    case 'chicken':
      addBox('body', 0.48, 0.48, 0.62, 0, 0.36, 0, 0, 12, 6, 6, 8);
      addBox('head', 0.34, 0.44, 0.34, 0, 0.70, -0.36, 0, 0, 4, 6, 4);
      addBox('comb', 0.10, 0.16, 0.22, 0, 0.98, -0.36, 20, 0, 2, 2, 3);
      addBox('beak', 0.24, 0.13, 0.20, 0, 0.65, -0.60, 42, 0, 4, 2, 3);
      addBox('wattle', 0.12, 0.15, 0.10, 0, 0.52, -0.56, 32, 0, 2, 2, 2);
      addBox('wing1', 0.11, 0.32, 0.44, -0.29, 0.39, 0, 30, 12, 2, 4, 6);
      addBox('wing2', 0.11, 0.32, 0.44, 0.29, 0.39, 0, 30, 12, 2, 4, 6);
      addBox('leg1', 0.10, 0.28, 0.10, -0.12, 0.14, 0, 0, 28, 2, 5, 2);
      addBox('leg2', 0.10, 0.28, 0.10, 0.12, 0.14, 0, 0, 28, 2, 5, 2);
      break;

    case 'creeper':
      for (const [name, x, z] of [['leg1', -0.18, -0.22], ['leg2', 0.18, -0.22], ['leg3', -0.18, 0.22], ['leg4', 0.18, 0.22]]) {
        addBox(name, 0.25, 0.52, 0.25, x, 0.26, z, 0, 32, 4, 6, 4);
      }
      addBox('body', 0.52, 0.78, 0.30, 0, 0.91, 0, 0, 16, 8, 12, 4);
      addBox('head', 0.56, 0.56, 0.56, 0, 1.58, 0, 0, 0, 8, 8, 8);
      break;

    case 'zombie':
      addBox('leg1', 0.25, 0.72, 0.25, -0.14, 0.36, 0, 0, 16, 4, 12, 4);
      addBox('leg2', 0.25, 0.72, 0.25, 0.14, 0.36, 0, 0, 16, 4, 12, 4);
      addBox('body', 0.54, 0.72, 0.28, 0, 1.08, 0, 16, 16, 8, 12, 4);
      addBox('arm1', 0.24, 0.72, 0.24, -0.39, 1.08, -0.18, 40, 16, 4, 12, 4);
      addBox('arm2', 0.24, 0.72, 0.24, 0.39, 1.08, -0.18, 40, 16, 4, 12, 4);
      addBox('head', 0.50, 0.50, 0.50, 0, 1.69, 0, 0, 0, 8, 8, 8);
      // Classic zombie outstretched arms pose!
      parts.arms.forEach(arm => { arm.rotation.x = Math.PI * 0.42; });
      break;

    case 'skeleton':
      addBox('leg1', 0.15, 0.72, 0.15, -0.14, 0.36, 0, 40, 16, 2, 12, 2);
      addBox('leg2', 0.15, 0.72, 0.15, 0.14, 0.36, 0, 40, 16, 2, 12, 2);
      addBox('body', 0.52, 0.72, 0.26, 0, 1.08, 0, 16, 16, 8, 12, 4, { alphaTest: 0.5, doubleSide: true });
      addBox('arm1', 0.15, 0.72, 0.15, -0.35, 1.08, 0, 40, 16, 2, 12, 2);
      addBox('arm2', 0.15, 0.72, 0.15, 0.35, 1.08, 0, 40, 16, 2, 12, 2);
      addBox('head', 0.50, 0.50, 0.50, 0, 1.69, 0, 0, 0, 8, 8, 8);
      addBox('bow', 0.08, 0.76, 0.12, 0.42, 1.05, -0.26, 52, 16, 2, 12, 2);
      break;

    case 'spider': {
      addBox('body', 0.90, 0.54, 1.02, 0, 0.46, 0.24, 0, 16, 10, 8, 12);
      addBox('head', 0.58, 0.52, 0.58, 0, 0.46, -0.54, 0, 0, 8, 8, 8);
      const eyeGeo = uvBox(0.11, 0.10, 0.025, { all: [48, 0, 4, 4] });
      addGeo('eye1', eyeGeo, 0.11, 0.10, -0.15, 0.52, -0.84, { emissive: true });
      addGeo('eye2', eyeGeo, 0.11, 0.10, 0.15, 0.52, -0.84, { emissive: true });
      const smallEyeGeo = uvBox(0.06, 0.06, 0.025, { all: [48, 0, 4, 4] });
      addGeo('eye3', smallEyeGeo, 0.06, 0.06, -0.25, 0.46, -0.84, { emissive: true });
      addGeo('eye4', smallEyeGeo, 0.06, 0.06, 0.25, 0.46, -0.84, { emissive: true });
      for (let i = 0; i < 4; i++) {
        const z = -0.38 + i * 0.28;
        addBox(`legL${i}`, 0.72, 0.11, 0.11, -0.64, 0.34, z, 0, 38, 12, 2, 2);
        addBox(`legR${i}`, 0.72, 0.11, 0.11, 0.64, 0.34, z, 0, 38, 12, 2, 2);
      }
      break;
    }

    case 'pigman':
      addBox('leg1', 0.25, 0.72, 0.25, -0.14, 0.36, 0, 0, 16, 4, 12, 4);
      addBox('leg2', 0.25, 0.72, 0.25, 0.14, 0.36, 0, 0, 16, 4, 12, 4);
      addBox('body', 0.54, 0.72, 0.28, 0, 1.08, 0, 16, 16, 8, 12, 4);
      addBox('arm1', 0.24, 0.72, 0.24, -0.39, 1.08, 0, 40, 16, 4, 12, 4);
      addBox('arm2', 0.24, 0.72, 0.24, 0.39, 1.08, 0, 40, 16, 4, 12, 4);
      addBox('head', 0.50, 0.50, 0.50, 0, 1.69, 0, 0, 0, 8, 8, 8);
      addBox('sword', 0.07, 0.72, 0.14, -0.41, 0.94, -0.34, 56, 16, 1, 11, 2);
      break;

    case 'blaze': {
      addBox('head', 0.52, 0.52, 0.52, 0, 1.48, 0, 0, 0, 8, 8, 8, { emissive: true });
      const orbit = new THREE.Group();
      orbit.position.set(0, 0.95, 0);
      const rodGeo = skinBoxGeo(0.12, 0.56, 0.12, 32, 0, 2, 8, 2);
      const rodMat = new THREE.MeshBasicMaterial({ map: texture });
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const r = i < 4 ? 0.46 : 0.32;
        const ry = i < 4 ? 0.18 : -0.28;
        const rod = new THREE.Mesh(rodGeo, rodMat);
        rod.userData.emissive = true;
        rod.position.set(Math.cos(angle) * r, ry, Math.sin(angle) * r);
        orbit.add(rod);
      }
      group.add(orbit);
      parts.orbit = orbit;
      break;
    }

    case 'ghast':
      parts.body = addBox('body', 2.0, 1.9, 2.0, 0, 1.22, 0, 0, 0, 16, 16, 16);
      for (let i = 0; i < 9; i++) {
        const tx = ((i % 3) - 1) * 0.58;
        const tz = (Math.floor(i / 3) - 1) * 0.58;
        addBox(`leg${i}`, 0.18, 0.82 + (i % 2) * 0.22, 0.18, tx, 0.16, tz, 0, 34, 2, 11, 2);
      }
      break;
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
  for (let by = Math.max(0, Math.floor(y)); by < (world.height ?? WORLD_H); by++) {
    const block = world.getBlock(bx, by, bz);
    if (block !== AIR && getBlock(block).solid) return false;
  }
  return true;
}

export function canMobBurnInSun(mob, world, timeOfDay) {
  if (!mob || (mob.type !== 'zombie' && mob.type !== 'skeleton') || !isDaylight(timeOfDay)) return false;
  const { x, y, z } = mob.pos;
  for (const sampleY of [y + 0.1, y + mob.def.h * 0.55, y + mob.def.h - 0.05]) {
    const b = world.getBlock(Math.floor(x), Math.floor(sampleY), Math.floor(z));
    if (b === WATER || b === WATER_FLOW) return false;
  }
  return hasDirectSky(world, x, y + mob.def.h, z);
}

export function findSafeGround(world, x, z, width = 0.6, height = 1.8, hostile = null) {
  const bx = Math.floor(x), bz = Math.floor(z);
  const worldHeight = world.height ?? WORLD_H;
  const heightAt = typeof world.heightAt === 'function' ? world.heightAt(bx, bz) : worldHeight - 1;
  const start = Math.min(worldHeight - 1, Math.max(1, heightAt + 3), hostile ? Math.floor(hostile.y) + 12 : Infinity);
  const bottom = hostile ? Math.max(0, Math.floor(hostile.y) - 12) : 0;
  const minX = Math.floor(x - width / 2 + 0.001), maxX = Math.floor(x + width / 2 - 0.001);
  const minZ = Math.floor(z - width / 2 + 0.001), maxZ = Math.floor(z + width / 2 - 0.001);

  for (let supportY = start; supportY >= bottom; supportY--) {
    const supportId = world.getBlock(bx, supportY, bz);
    if (!getBlock(supportId).solid || [LEAVES, LOG, CACTUS, ICE].includes(supportId)) continue;
    const feetY = supportY + 1.001;
    if (hostile) {
      const light = world.getLight?.(bx, supportY + 1, bz) ?? 0xf0;
      if (Math.max(light & 15, (light >> 4) - (hostile.night ? 11 : 0)) > 7) continue;
    }
    let room = true;
    for (let yy = Math.floor(feetY); yy <= Math.floor(feetY + height - 0.001) && room; yy++) {
      for (let zz = minZ; zz <= maxZ && room; zz++) {
        for (let xx = minX; xx <= maxX; xx++) {
          const id = world.getBlock(xx, yy, zz);
          if (getBlock(id).solid || id === WATER || id === WATER_FLOW || id === LAVA || id === LAVA_FLOW) { room = false; break; }
        }
      }
    }
    if (room) return feetY;
  }
  return null;
}

function isSolidForMob(world, x, y, z) {
  if (typeof world.isSolidAt === 'function') return world.isSolidAt(x, y, z);
  return getBlock(world.getBlock(x, y, z)).solid;
}

function canOccupy(world, mob, x, y, z) {
  const half = mob.def.w / 2;
  const minX = Math.floor(x - half + 0.001), maxX = Math.floor(x + half - 0.001);
  const minY = Math.floor(y + 0.001), maxY = Math.floor(y + mob.def.h - 0.001);
  const minZ = Math.floor(z - half + 0.001), maxZ = Math.floor(z + half - 0.001);
  for (let by = minY; by <= maxY; by++) {
    for (let bz = minZ; bz <= maxZ; bz++) {
      for (let bx = minX; bx <= maxX; bx++) {
        if (isSolidForMob(world, bx, by, bz)) return false;
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
      if (isSolidForMob(world, bx, by, bz)) return true;
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
    this.networkId = null;
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
    this.fireSeconds = 0;
    this.aggroTimer = 0;
    this.lastHitLooting = 0;
    this.burnTick = 0;
    this.burnParticleTimer = 0;
    this.lavaTick = 0;
    this.panicTimer = 0;
    this.sheared = false;
    this.woolTimer = 0;
    this.fallStart = null;
    this.killed = false;
    this.dead = false;

    // Cached per-species 64×64 pixel-art DataTexture shared by all mobs of this type.
    this.texture = getMobSkinTexture(type);
    const model = buildMobModel(type, this.texture);
    this.group = model.group;
    this.parts = model.parts;
    // Correct the vertical proportions of the legacy box models to match their hitboxes.
    if (type === 'zombie' || type === 'skeleton' || type === 'pigman') this.group.scale.y = 0.95;
    else if (type === 'creeper') this.group.scale.y = 1.02;
    else if (type === 'cow' || type === 'sheep') this.group.scale.y = 0.95;
    else if (type === 'chicken') this.group.scale.y = 0.78;
    this.group.position.copy(this.pos);
    this._legPhase = Math.random() * Math.PI * 2;
  }

  update(dt, world, player, mobs, effects, audio, timeOfDay = 0.5, difficulty = 2) {
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
    if (distance > 96) { this.dead = true; return; }
    if (this.aggroTimer > 0) this.aggroTimer = Math.max(0, this.aggroTimer - dt);

    let moveX = 0, moveZ = 0;
    let facingTarget = false;
    const detectRange = this.def.flying ? 36 : (this.def.hover ? 24 : 16);
    const isAngry = this.def.hostile && (!this.def.neutral || this.aggroTimer > 0);
    if (isAngry && !player.dead && distance < detectRange) {
      this.state = 'chase';
      const safeDistance = Math.max(distance, 0.0001);
      const towardX = dx / safeDistance, towardZ = dz / safeDistance;
      this.yaw = Math.atan2(towardX, towardZ);
      facingTarget = true;

      if (this.def.flying) {
        if (distance > 20) { moveX = towardX; moveZ = towardZ; }
        else if (distance < 11) { moveX = -towardX; moveZ = -towardZ; }
        else {
          if (this.strafeTimer <= 0) {
            this.strafeTimer = 2.5 + Math.random() * 2;
            this.strafeSign *= -1;
          }
          moveX = -towardZ * this.strafeSign;
          moveZ = towardX * this.strafeSign;
        }
        const dyGoal = (player.pos.y + 4.5) - this.pos.y;
        this.vel.y += Math.max(-4, Math.min(4, dyGoal)) * dt * 2.2;
        this.vel.y *= 0.92;
        if (distance <= 34 && this.attackTimer <= 0) {
          const from = this.pos.clone().add(new THREE.Vector3(0, 1.0, 0));
          const to = player.pos.clone().add(new THREE.Vector3(0, 1.35, 0));
          if (hasLineOfSight(world, from, to)) {
            this.attackTimer = 3.2;
            const mult = [0, 0.5, 1, 1.5][Math.max(0, Math.min(3, difficulty))];
            if (effects?.shootFireball) effects.shootFireball(this, player, 6 * mult, true);
            if (audio?.fuse) audio.fuse();
          }
        }
      } else if (this.def.creeper) {
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
        const maxRanged = this.def.hover ? 20 : 12;
        const minRanged = this.def.hover ? 3 : 8;
        if (distance >= minRanged && distance <= maxRanged && this.attackTimer <= 0) {
          const from = this.pos.clone().add(new THREE.Vector3(0, this.def.h * 0.78, 0));
          const to = player.pos.clone().add(new THREE.Vector3(0, 1.35, 0));
          if (hasLineOfSight(world, from, to)) {
            this.attackTimer = this.def.hover ? 2.4 : 2;
            const mult = [0, 0.5, 1, 1.5][Math.max(0, Math.min(3, difficulty))];
            if (this.def.hover) {
              if (effects?.shootFireball) effects.shootFireball(this, player, 4 * mult, false);
              if (audio?.fuse) audio.fuse();
            } else {
              if (effects?.shootArrow) effects.shootArrow(this, player, 2 * mult);
              if (audio) audio.bow();
            }
          }
        }
      } else {
        moveX = towardX; moveZ = towardZ;
        const verticalReach = Math.abs(player.pos.y - this.pos.y) < 2.2;
        if (distance < 1.6 && verticalReach && this.attackTimer <= 0) {
          this.attackTimer = 1;
          if (typeof player.damage === 'function') player.damage(this.def.dmg * [0, 0.5, 1, 1.5][Math.max(0, Math.min(3, difficulty))], audio);
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
        if (effects?.explosion) effects.explosion(this.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 3, player, [0, 0.5, 1, 1.5][Math.max(0, Math.min(3, difficulty))]);
        return;
      }
    }

    if (this.fireSeconds > 0 && !this.def.fireImmune) {
      this.fireSeconds = Math.max(0, this.fireSeconds - dt);
    } else if (this.def.fireImmune) {
      this.fireSeconds = 0;
    }
    this.burning = (!this.def.fireImmune && this.fireSeconds > 0) || canMobBurnInSun(this, world, timeOfDay);
    if (this.burning) {
      this.burnTick -= dt;
      this.burnParticleTimer -= dt;
      if (this.burnTick <= 0) {
        this.burnTick = 1;
        this.damage(this.fireSeconds > 0 ? 1 : 2, audio, { silentHurt: true });
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
      const chaseBoost = this.state === 'chase' ? (this.type === 'spider' ? 1.35 : 1.22) : (this.panicTimer > 0 ? 1.45 : 1);
      const accel = this.def.speed * 7 * chaseBoost;
      this.vel.x += moveX * accel * dt;
      this.vel.z += moveZ * accel * dt;
    }

    const horizontalSpeed = Math.hypot(this.vel.x, this.vel.z);
    const maxSpeed = this.def.speed * (this.state === 'chase' ? (this.type === 'spider' ? 1.65 : 1.35) : (this.panicTimer > 0 ? 1.5 : 0.8));
    if (horizontalSpeed > maxSpeed) {
      this.vel.x *= maxSpeed / horizontalSpeed;
      this.vel.z *= maxSpeed / horizontalSpeed;
    }

    if (this.def.flying) {
      if (this.state !== 'chase') {
        this.vel.y += Math.sin(this.age * 1.4) * 2.5 * dt;
        this.vel.y *= 0.9;
      }
    } else if (this.def.hover && this.state === 'chase') {
      const hoverTarget = player.pos.y + 1.2;
      if (this.pos.y < hoverTarget) this.vel.y = Math.min(3.4, this.vel.y + 18 * dt);
      else this.vel.y = Math.max(-1.8, this.vel.y - 8 * dt);
    } else if (inWater) {
      this.vel.y += 7 * dt;
      this.vel.y = Math.max(this.vel.y, 1.5);
    } else if (inLava) {
      this.vel.y += 3 * dt;
    } else if (this.climbing) {
      this.vel.y = Math.max(this.vel.y, 3.2);
    } else if ((this.type === 'chicken' || this.def.hover) && this.vel.y < -2.4) {
      // Beta chickens & hovering blazes descend slowly!
      this.vel.y = Math.max(-2.4, this.vel.y - 6 * dt);
    } else {
      this.vel.y -= 26 * dt;
    }
    const damping = Math.pow(inWater ? 0.84 : 0.72, dt * 20);
    this.vel.x *= damping; this.vel.z *= damping;

    this.moveAxis(world, 1, this.vel.y * dt);
    this.moveAxis(world, 0, this.vel.x * dt);
    this.moveAxis(world, 2, this.vel.z * dt);
    this.onGround = hasSupport(world, this, this.pos.x, this.pos.y, this.pos.z);

    // Fall & lava damage on mobs
    if (this.onGround) {
      if (this.fallStart != null && this.type !== 'chicken' && !this.def.hover && !this.def.flying && !inWater) {
        const dist = this.fallStart - this.pos.y;
        if (dist > 3.5) {
          this.damage(Math.floor(dist - 3), audio);
          if (this.dead) return;
        }
      }
      this.fallStart = null;
    } else if (this.vel.y < -0.5 && this.fallStart == null && !inWater && !this.def.hover && !this.def.flying) {
      this.fallStart = this.pos.y;
    }
    if (inWater) this.fallStart = null;

    if (inLava && !this.def.fireImmune) {
      this.lavaTick -= dt;
      if (this.lavaTick <= 0) {
        this.lavaTick = 0.5;
        this.damage(4, audio);
        if (this.dead) return;
      }
    } else {
      this.lavaTick = 0;
    }

    if (this.sheared) {
      this.woolTimer -= dt;
      if (this.woolTimer <= 0) this.setSheared(false);
    }
    if (this.panicTimer > 0) this.panicTimer = Math.max(0, this.panicTimer - dt);

    this.group.position.copy(this.pos);
    // The models face local -Z; movement heading points along +Z at yaw zero.
    this.group.rotation.y = this.yaw + Math.PI;
    this.animate(dt);
    this.updateColor(timeOfDay);
  }

  setSheared(sheared) {
    this.sheared = !!sheared;
    if (this.sheared) this.woolTimer = 50;
    const body = this.group.getObjectByName('body');
    if (body) body.scale.set(this.sheared ? 0.84 : 1, this.sheared ? 0.84 : 1, this.sheared ? 0.94 : 1);
    const targetMap = getMobSkinTexture(this.sheared ? 'sheep_sheared' : 'sheep');
    for (const part of [body, ...this.parts.legs.map(leg => leg.children[0])]) {
      if (!part?.material) continue;
      if (part.material.uniforms?.map) part.material.uniforms.map.value = targetMap;
      else part.material.map = targetMap;
    }
  }

  animate(dt) {
    const walking = Math.hypot(this.vel.x, this.vel.z) > 0.05;
    if (walking) this._legPhase += dt * (this.type === 'spider' ? 11 : 8);
    const swing = walking ? Math.sin(this._legPhase) * 0.48 : 0;
    if (this.parts.legs) {
      this.parts.legs.forEach((leg, i) => { leg.rotation.x = swing * (i % 2 === 0 ? 1 : -1); });
    }
    if (this.parts.arms) {
      const basePitch = this.type === 'zombie' ? Math.PI * 0.42 : 0;
      this.parts.arms.forEach((arm, i) => { arm.rotation.x = basePitch + swing * (i % 2 === 0 ? -0.35 : 0.35); });
    }
    if (this.type === 'spider') {
      this.parts.legs.forEach((leg, i) => { leg.rotation.z = walking ? Math.sin(this._legPhase + i) * 0.12 : 0; });
    }
    if (this.parts.orbit) {
      this.parts.orbit.rotation.y += dt * 2.8;
    }
    if (this.type === 'ghast') {
      if (this.parts.legs) {
        this.parts.legs.forEach((tentacle, i) => {
          tentacle.rotation.x = 0.18 + Math.sin(this.age * 2.6 + i * 0.8) * 0.22;
        });
      }
      if (this.parts.body?.material) {
        const shooting = this.state === 'chase' && this.attackTimer > 0 && this.attackTimer < 0.75;
        const tex = getMobSkinTexture(shooting ? 'ghast_shooting' : 'ghast');
        if (this.parts.body.material.uniforms?.map) this.parts.body.material.uniforms.map.value = tex;
        else this.parts.body.material.map = tex;
      }
    }
  }

  updateColor(timeOfDay = 0.5) {
    const flashing = this.type === 'creeper' && this.fuse > 0 && Math.floor(this.fuse * 10) % 2 === 0;
    let tint = this.hurtTime > 0 ? 0xff5555 : flashing ? 0xffffff : null;
    // Simple day/night shading for mobs (no scene lights): darken at night.
    const daylight = timeOfDay > 0.22 && timeOfDay < 0.78;
    const brightness = daylight ? 1 : 0.5;
    this.group.traverse(object => {
      if (!object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material.uniforms?.uTint) {
          const base = material.userData.baseTint || new THREE.Color(1, 1, 1);
          material.uniforms.uTint.value.copy(base);
          if (tint) material.uniforms.uTint.value.lerp(new THREE.Color(tint), 0.72);
        } else if (material.color) {
          if (material.userData.baseColor === undefined) material.userData.baseColor = material.color.getHex();
          material.color.setHex(tint ?? material.userData.baseColor);
          if (!tint) material.color.multiplyScalar(brightness);
        }
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
          if (!isSolidForMob(world, bx, by, bz)) continue;
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

  ignite(seconds = 4) {
    if (this.def.fireImmune || seconds <= 0) return;
    this.fireSeconds = Math.max(this.fireSeconds || 0, seconds);
  }

  damage(amount, audio, options = {}) {
    if (this.dead || (amount <= 0 && !options.knockback)) return false;
    this.hp = Math.max(0, this.hp - Math.max(0, amount));
    this.hurtTime = options.silentHurt ? 0.2 : 0.35;
    if (options.knockback) this.vel.add(options.knockback);
    if (options.looting !== undefined) this.lastHitLooting = options.looting;
    if (options.fireSeconds > 0) this.ignite(options.fireSeconds);
    if (this.def.neutral && !options.silentHurt) {
      this.aggroTimer = 30;
      if (Array.isArray(options.pack)) {
        for (const ally of options.pack) {
          if (ally.type === this.type && !ally.dead && ally.pos.distanceToSquared(this.pos) <= 576) {
            ally.aggroTimer = Math.max(ally.aggroTimer || 0, 25);
          }
        }
      }
    }
    if (!this.def.hostile) {
      this.panicTimer = 3.0;
      this.moveToward = true;
      this.wanderTimer = 0.6;
      this.yaw = Math.random() * Math.PI * 2;
    }
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
  }
}

export class MobManager {
  constructor(world, scene, lighting = null) {
    this.world = world;
    this.scene = scene;
    this.lighting = lighting;
    this.mobs = [];
    this.spawnTimer = 0;
    this.attackCooldown = 0;
    this.difficulty = 2;
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  clear() {
    for (const mob of this.mobs) {
      this.group.remove(mob.group);
      this.lighting?.forget(mob.group);
      mob.dispose();
    }
    this.mobs.length = 0;
  }

  spawnInitial(player) {
    if (this.world.dimension === 'nether') {
      let attempts = 0, spawned = 0;
      while (spawned < 6 && attempts < 60) {
        attempts++;
        const x = player.pos.x + (Math.random() - 0.5) * 32;
        const z = player.pos.z + (Math.random() - 0.5) * 32;
        const y = findSafeGround(this.world, x, z, 0.8, 1.9);
        if (y == null) continue;
        this.add('pigman', x, y, z);
        spawned++;
      }
      return;
    }
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
    this.lighting?.prepare(mob.group);
    this.lighting?.refreshObject(mob.group, this.world, mob.pos, mob.def.h * 0.65);
    this.mobs.push(mob);
    this.group.add(mob.group);
    return mob;
  }

  update(dt, player, timeOfDay, effects, audio, remoteTargets = [], difficulty = this.difficulty) {
    this.difficulty = Math.max(0, Math.min(3, Math.round(difficulty)));
    dt = Math.min(Math.max(dt, 0), 0.1);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    const night = !isDaylight(timeOfDay);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 4;
      const hostiles = this.mobs.filter(mob => mob.def.hostile).length;
      const passives = this.mobs.filter(mob => !mob.def.hostile).length;
      if (!player.dead && this.mobs.length < 28) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 20 + Math.random() * 28;
        const x = player.pos.x + Math.cos(angle) * distance;
        const z = player.pos.z + Math.sin(angle) * distance;
        const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
        const chunk = this.world.getChunk(cx, cz);
        if (chunk?.generated) {
          if (this.world.dimension === 'nether') {
            if (this.difficulty > 0 && hostiles < 16) {
              const inFortress = !!this.world.gen?.isFortressZone?.(cx, cz);
              if (Math.random() < 0.16) {
                const gy = Math.max(42, Math.min(96, player.pos.y + 6 + Math.random() * 10));
                const ghastProbe = { def: MOB_DEFS.ghast };
                if (canOccupy(this.world, ghastProbe, x, gy, z)) this.add('ghast', x, gy, z);
              } else {
                const ny = findSafeGround(this.world, x, z, 0.8, 1.95);
                if (ny != null) {
                  const type = (inFortress && Math.random() < 0.58) || Math.random() < 0.12 ? 'blaze' : 'pigman';
                  this.add(type, x, ny, z);
                }
              }
            }
          } else {
            const hostileY = this.difficulty > 0 && hostiles < 14 && Math.random() < 0.7
              ? findSafeGround(this.world, x, z, 0.9, 1.95, { y: player.pos.y, night }) : null;
            if (hostileY != null) {
              const types = ['zombie', 'skeleton', 'creeper', 'spider'];
              this.add(types[Math.floor(Math.random() * types.length)], x, hostileY, z);
            } else if (!night && passives < 12 && Math.random() < 0.3) {
              const y = findSafeGround(this.world, x, z, 0.8, 1.8);
              const types = ['pig', 'cow', 'sheep', 'chicken'];
              if (y != null) this.add(types[Math.floor(Math.random() * types.length)], x, y, z);
            }
          }
        }
      }
    }

    const targets = [player, ...remoteTargets].filter(target => target && !target.dead && target.pos);
    for (const mob of this.mobs) {
      if (this.difficulty === 0 && mob.def.hostile) {
        mob.dead = true;
        this.group.remove(mob.group);
        this.lighting?.forget(mob.group);
        mob.dispose();
        continue;
      }
      let target = player;
      let distance = player.pos.distanceToSquared(mob.pos);
      for (const candidate of targets) {
        const nextDistance = candidate.pos.distanceToSquared(mob.pos);
        if (nextDistance < distance) { target = candidate; distance = nextDistance; }
      }
      mob.update(dt, this.world, target, this.mobs, effects, audio, timeOfDay, this.difficulty);
      this.lighting?.refreshObject(mob.group, this.world, mob.pos, mob.def.h * 0.65);
      if (mob.dead) {
        this.group.remove(mob.group);
        if (effects?.dropMobLoot) effects.dropMobLoot(mob);
        this.lighting?.forget(mob.group);
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
    const blockHit = typeof player.raycast === 'function' ? player.raycast(this.world, maxDistance, { solidOnly: true }) : null;
    if (blockHit && blockHit.dist <= nearestDistance) return null;
    return nearest;
  }

  applyNetworkSnapshot(snapshot, effects = null) {
    if (!Array.isArray(snapshot)) return;
    const incoming = new Set();
    for (const state of snapshot) {
      if (!state || typeof state.uid !== 'string' || !MOB_DEFS[state.type] || !Array.isArray(state.pos) || state.pos.length !== 3 || !state.pos.every(Number.isFinite)) continue;
      incoming.add(state.uid);
      let mob = this.mobs.find(candidate => candidate.networkId === state.uid);
      if (!mob) {
        mob = this.add(state.type, ...state.pos);
        mob.networkId = state.uid;
      }
      mob.pos.set(...state.pos);
      mob.group.position.copy(mob.pos);
      mob.yaw = Number.isFinite(state.yaw) ? state.yaw : mob.yaw;
      mob.group.rotation.y = mob.yaw + Math.PI;
      mob.hp = Number.isFinite(state.hp) ? Math.max(0, state.hp) : mob.hp;
      if (mob.type === 'sheep' && mob.sheared !== !!state.sheared) mob.setSheared(!!state.sheared);
      else mob.sheared = !!state.sheared;
      mob.fuse = Number.isFinite(state.fuse) ? state.fuse : -1;
    }
    for (const mob of [...this.mobs]) {
      if (mob.networkId && !incoming.has(mob.networkId)) {
        this.group.remove(mob.group);
        this.lighting?.forget(mob.group);
        mob.dispose();
        this.mobs.splice(this.mobs.indexOf(mob), 1);
      }
    }
  }

  attack(player, heldId, audio, maxDistance = 3.5, networkAttack = null) {
    const target = this.raycastTarget(player, maxDistance);
    if (!target) return false;
    if (this.attackCooldown > 0) return true;
    this.attackCooldown = 0.45;
    const heldStack = player.heldStack && player.heldStack.id === heldId
      ? player.heldStack
      : (heldId ? { id: heldId } : null);
    if (networkAttack && target.networkId) {
      networkAttack(target.networkId, heldId, heldStack?.enchants || null);
      if (typeof player.useHeldOn === 'function') player.useHeldOn(AIR);
      return true;
    }
    const dx = target.pos.x - player.pos.x;
    const dz = target.pos.z - player.pos.z;
    const length = Math.hypot(dx, dz) || 1;
    const isCrit = player.onGround === false && (player.vel?.y ?? 0) < -0.1 && !player.inWater && !player.onLadder;
    const ench = meleeEnchantBonuses(heldStack, target.type);
    const kbScale = (player.sprinting ? 1.35 : 1.0) + ench.knockback * 0.85;
    const knockback = new THREE.Vector3((dx / length) * 3.4 * kbScale, 1.15 + ench.knockback * 0.2, (dz / length) * 3.4 * kbScale);
    const baseDmg = isCrit ? Math.ceil(mobAttackDamage(heldId) * 1.5) : mobAttackDamage(heldId);
    const dmg = Math.max(1, Math.round(baseDmg + ench.bonusDamage));
    target.damage(dmg, audio, {
      knockback,
      looting: ench.looting,
      fireSeconds: ench.fireSeconds,
      pack: this.mobs,
    });
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
