// Box-model mobs with terrain-aware movement and Beta-era combat behavior.
import * as THREE from 'three';
import { getBlock, AIR, WATER, LAVA, LEAVES, LOG, CACTUS, ICE, ITEMS } from '../world/blocks.js';
import { WORLD_H } from '../world/chunk.js';
import { buildMobTexture } from '../world/textures.js';

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

const boxGeoCache = new Map();
function boxGeo(w, h, d) {
  const key = `${w},${h},${d}`;
  if (!boxGeoCache.has(key)) boxGeoCache.set(key, new THREE.BoxGeometry(w, h, d));
  return boxGeoCache.get(key);
}

function buildMobModel(type, texture) {
  const group = new THREE.Group();
  const parts = { legs: [], arms: [] };
  const textured = new THREE.MeshBasicMaterial({ map: texture });
  const add = (name, w, h, d, x, y, z, color = 0xffffff, material = null) => {
    const mat = material || new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(boxGeo(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.name = name;
    group.add(mesh);
    if (name.startsWith('leg')) parts.legs.push(mesh);
    if (name.startsWith('arm')) parts.arms.push(mesh);
    if (name === 'head') parts.head = mesh;
    return mesh;
  };

  switch (type) {
    case 'pig':
      add('body', 1.0, 0.8, 1.4, 0, 0.55, 0, 0xffffff, textured);
      add('head', 0.72, 0.72, 0.72, 0, 0.76, -0.78, 0xffffff, textured);
      add('snout', 0.38, 0.28, 0.24, 0, 0.61, -1.23, 0xd88b91);
      add('leg1', 0.25, 0.42, 0.25, -0.3, 0.2, -0.48, 0xc97880);
      add('leg2', 0.25, 0.42, 0.25, 0.3, 0.2, -0.48, 0xc97880);
      add('leg3', 0.25, 0.42, 0.25, -0.3, 0.2, 0.48, 0xc97880);
      add('leg4', 0.25, 0.42, 0.25, 0.3, 0.2, 0.48, 0xc97880);
      break;
    case 'cow':
    case 'sheep': {
      const coat = type === 'cow' ? 0x7a5232 : 0xe8e8e8;
      const face = type === 'cow' ? 0x8a6242 : 0xd2b48e;
      add('body', 0.95, 0.8, 1.35, 0, 0.65, 0, coat);
      add('head', 0.62, 0.62, 0.62, 0, 0.86, -0.78, face);
      for (const [name, x, z] of [['leg1', -0.28, -0.43], ['leg2', 0.28, -0.43], ['leg3', -0.28, 0.43], ['leg4', 0.28, 0.43]]) {
        add(name, 0.24, 0.58, 0.24, x, 0.29, z, coat);
      }
      if (type === 'cow') {
        add('horn1', 0.1, 0.22, 0.1, -0.22, 1.22, -0.82, 0xe2d7bc);
        add('horn2', 0.1, 0.22, 0.1, 0.22, 1.22, -0.82, 0xe2d7bc);
      }
      break;
    }
    case 'chicken':
      add('body', 0.48, 0.5, 0.62, 0, 0.34, 0, 0xe8e8e8);
      add('head', 0.34, 0.38, 0.34, 0, 0.69, -0.38, 0xf0f0f0);
      add('beak', 0.22, 0.12, 0.2, 0, 0.61, -0.62, 0xe8902a);
      add('comb', 0.16, 0.12, 0.12, 0, 0.92, -0.4, 0xc93432);
      add('leg1', 0.1, 0.26, 0.1, -0.12, 0.13, 0, 0xe8902a);
      add('leg2', 0.1, 0.26, 0.1, 0.12, 0.13, 0, 0xe8902a);
      break;
    case 'creeper': {
      const green = 0x52b648;
      for (const [name, x, z] of [['leg1', -0.18, -0.2], ['leg2', 0.18, -0.2], ['leg3', -0.18, 0.2], ['leg4', 0.18, 0.2]]) {
        add(name, 0.24, 0.64, 0.24, x, 0.32, z, green);
      }
      add('body', 0.56, 0.66, 0.48, 0, 0.96, 0, green);
      add('head', 0.62, 0.62, 0.62, 0, 1.61, -0.02, green);
      const face = new THREE.MeshBasicMaterial({ color: 0x111111 });
      add('eye1', 0.13, 0.18, 0.025, -0.14, 1.68, -0.34, 0xffffff, face);
      add('eye2', 0.13, 0.18, 0.025, 0.14, 1.68, -0.34, 0xffffff, face);
      add('mouth', 0.28, 0.16, 0.025, 0, 1.43, -0.34, 0xffffff, face);
      break;
    }
    case 'zombie':
    case 'skeleton': {
      const zombie = type === 'zombie';
      const skin = zombie ? 0x3e7a3e : 0xb6b6b6;
      const shirt = zombie ? 0x2a4878 : 0xa6a6a6;
      const pants = zombie ? 0x263d65 : 0x898989;
      add('leg1', 0.25, 0.68, 0.25, -0.16, 0.34, 0, pants);
      add('leg2', 0.25, 0.68, 0.25, 0.16, 0.34, 0, pants);
      add('body', 0.55, 0.72, 0.3, 0, 1.06, 0, shirt);
      add('arm1', 0.22, 0.72, 0.22, -0.4, 1.06, 0, skin);
      add('arm2', 0.22, 0.72, 0.22, 0.4, 1.06, 0, skin);
      add('head', 0.48, 0.48, 0.48, 0, 1.68, 0, skin);
      if (!zombie) add('bow', 0.06, 0.8, 0.06, 0.57, 1.05, -0.24, 0x6b4c2a);
      break;
    }
    case 'spider': {
      const dark = 0x2a2020;
      add('body', 0.95, 0.42, 1.1, 0, 0.42, 0, dark);
      add('head', 0.62, 0.42, 0.62, 0, 0.48, -0.72, 0x352828);
      add('eye1', 0.12, 0.12, 0.025, -0.15, 0.52, -1.04, 0xcc2222);
      add('eye2', 0.12, 0.12, 0.025, 0.15, 0.52, -1.04, 0xcc2222);
      for (let i = 0; i < 4; i++) {
        const z = -0.48 + i * 0.32;
        add(`legL${i}`, 0.7, 0.08, 0.08, -0.64, 0.34, z, dark);
        add(`legR${i}`, 0.7, 0.08, 0.08, 0.64, 0.34, z, dark);
        parts.legs.push(group.children[group.children.length - 2], group.children[group.children.length - 1]);
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
    const model = buildMobModel(type, this.texture);
    this.group = model.group;
    this.parts = model.parts;
    // Correct the vertical proportions of the legacy box models to match their hitboxes.
    if (type === 'zombie' || type === 'skeleton') this.group.scale.y = 0.95;
    else if (type === 'creeper') this.group.scale.y = 1.02;
    else if (type === 'cow' || type === 'sheep') this.group.scale.y = 0.95;
    else if (type === 'chicken') this.group.scale.y = 0.78;
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
    this.updateColor();
  }

  animate(dt) {
    const walking = Math.hypot(this.vel.x, this.vel.z) > 0.05;
    if (walking) this._legPhase += dt * (this.type === 'spider' ? 11 : 8);
    const swing = walking ? Math.sin(this._legPhase) * 0.48 : 0;
    if (this.parts.legs) {
      this.parts.legs.forEach((leg, i) => { leg.rotation.x = swing * (i % 2 === 0 ? 1 : -1); });
    }
    if (this.parts.arms) {
      this.parts.arms.forEach((arm, i) => { arm.rotation.x = swing * (i % 2 === 0 ? -0.7 : 0.7); });
    }
    if (this.type === 'spider') {
      this.parts.legs.forEach((leg, i) => { leg.rotation.z = walking ? Math.sin(this._legPhase + i) * 0.12 : 0; });
    }
  }

  updateColor() {
    const flashing = this.type === 'creeper' && this.fuse > 0 && Math.floor(this.fuse * 10) % 2 === 0;
    let tint = this.hurtTime > 0 ? 0xff5555 : flashing ? 0xffffff : null;
    this.group.traverse(object => {
      if (!object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material.color) continue;
        if (material.userData.baseColor === undefined) material.userData.baseColor = material.color.getHex();
        material.color.setHex(tint ?? material.userData.baseColor);
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
