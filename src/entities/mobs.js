// Mobs: pigs, cows, sheep, chickens + hostile zombies, skeletons, creepers, spiders.
// Classic box-model look, simple wander/chase AI, creeper explosions.
import * as THREE from 'three';
import { getBlock, AIR, WATER, LEAVES } from '../world/blocks.js';
import { WORLD_H } from '../world/chunk.js';
import { buildMobTexture } from '../world/textures.js';

const MOB_DEFS = {
  pig: { w: 0.9, h: 0.9, hp: 10, speed: 1.4, hostile: false, drops: [[319, 1, 2]], color: 0xe8909c },
  cow: { w: 0.9, h: 1.3, hp: 10, speed: 1.4, hostile: false, drops: [[334, 0, 1], [319, 0, 0]], color: 0x7a5232 },
  sheep: { w: 0.9, h: 1.3, hp: 8, speed: 1.2, hostile: false, drops: [[150, 1, 1]], color: 0xe8e8e8 },
  chicken: { w: 0.6, h: 0.7, hp: 4, speed: 1.2, hostile: false, drops: [[288, 0, 1]], color: 0xe8e8e8 },
  zombie: { w: 0.6, h: 1.8, hp: 20, speed: 1.6, hostile: true, dmg: 3, drops: [[289, 0, 1]], color: 0x3e7a3e },
  skeleton: { w: 0.6, h: 1.8, hp: 20, speed: 1.5, hostile: true, dmg: 2, ranged: true, drops: [[262, 0, 2], [352, 0, 1]], color: 0xb6b6b6 },
  creeper: { w: 0.6, h: 1.8, hp: 20, speed: 1.5, hostile: true, creeper: true, drops: [[289, 1, 2]], color: 0x52b648 },
  spider: { w: 1.2, h: 0.9, hp: 16, speed: 2.0, hostile: true, dmg: 2, drops: [[287, 0, 2]], color: 0x2a2020 },
};

const boxGeoCache = {};

function boxGeo(w, h, d) {
  const k = `${w},${h},${d}`;
  if (!boxGeoCache[k]) boxGeoCache[k] = new THREE.BoxGeometry(w, h, d);
  return boxGeoCache[k];
}

function buildMobModel(type, texture) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.5 });
  const matSolid = new THREE.MeshBasicMaterial({ map: texture });
  const parts = {};

  const part = (name, w, h, d, x, y, z, useSolid = true) => {
    const m = new THREE.Mesh(boxGeo(w, h, d), useSolid ? matSolid : mat);
    m.position.set(x, y, z);
    group.add(m);
    parts[name] = m;
    return m;
  };

  switch (type) {
    case 'pig':
      part('body', 1.0, 0.8, 1.6, 0, 0.55, 0);
      part('head', 0.8, 0.8, 0.8, 0, 0.75, -1.0);
      part('snout', 0.4, 0.3, 0.3, 0, 0.62, -1.45);
      part('leg1', 0.3, 0.5, 0.3, -0.3, 0.15, -0.5);
      part('leg2', 0.3, 0.5, 0.3, 0.3, 0.15, -0.5);
      part('leg3', 0.3, 0.5, 0.3, -0.3, 0.15, 0.5);
      part('leg4', 0.3, 0.5, 0.3, 0.3, 0.15, 0.5);
      break;
    case 'cow':
    case 'sheep': {
      const c = type === 'cow' ? 0x7a5232 : 0xe8e8e8;
      const m = new THREE.MeshLambertMaterial({ color: c });
      const simple = (w, h, d, x, y, z, col) => {
        const mm = new THREE.Mesh(boxGeo(w, h, d), new THREE.MeshBasicMaterial({ color: col }));
        mm.position.set(x, y, z);
        group.add(mm);
        return mm;
      };
      simple(1.0, 0.9, 1.7, 0, 0.85, 0, c);
      simple(0.8, 0.8, 0.8, 0, 1.1, -1.1, type === 'cow' ? 0x8a6242 : 0xd2b48e);
      simple(0.3, 0.6, 0.3, -0.3, 0.3, -0.55, c);
      simple(0.3, 0.6, 0.3, 0.3, 0.3, -0.55, c);
      simple(0.3, 0.6, 0.3, -0.3, 0.3, 0.55, c);
      simple(0.3, 0.6, 0.3, 0.3, 0.3, 0.55, c);
      if (type === 'cow') {
        simple(0.15, 0.3, 0.15, -0.3, 1.55, -1.15, 0xd8d8d8);
        simple(0.15, 0.3, 0.15, 0.3, 1.55, -1.15, 0xd8d8d8);
      }
      parts.head = group.children[1];
      break;
    }
    case 'chicken': {
      const simple = (w, h, d, x, y, z, col) => {
        const mm = new THREE.Mesh(boxGeo(w, h, d), new THREE.MeshBasicMaterial({ color: col }));
        mm.position.set(x, y, z);
        group.add(mm);
        return mm;
      };
      simple(0.5, 0.6, 0.8, 0, 0.45, 0, 0xe8e8e8);
      simple(0.4, 0.5, 0.4, 0, 0.85, -0.55, 0xe8e8e8);
      simple(0.25, 0.15, 0.35, 0, 0.8, -0.85, 0xe8902a);
      simple(0.15, 0.35, 0.15, -0.15, 0.17, 0, 0xe8902a);
      simple(0.15, 0.35, 0.15, 0.15, 0.17, 0, 0xe8902a);
      parts.head = group.children[1];
      break;
    }
    case 'creeper': {
      const simple = (w, h, d, x, y, z, col) => {
        const mm = new THREE.Mesh(boxGeo(w, h, d), new THREE.MeshBasicMaterial({ color: col }));
        mm.position.set(x, y, z);
        group.add(mm);
        return mm;
      };
      simple(0.5, 1.2, 0.35, -0.2, 0.6, 0.25, 0x52b648);
      simple(0.5, 1.2, 0.35, 0.2, 0.6, 0.25, 0x52b648);
      simple(0.5, 1.2, 0.35, -0.2, 0.6, -0.25, 0x52b648);
      simple(0.5, 1.2, 0.35, 0.2, 0.6, -0.25, 0x52b648);
      simple(0.8, 1.2, 0.45, 0, 1.8, 0, 0x52b648);
      simple(0.8, 0.8, 0.8, 0, 2.75, 0, 0x52b648);
      // face
      const faceMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      const f1 = new THREE.Mesh(boxGeo(0.18, 0.28, 0.02), faceMat);
      f1.position.set(-0.18, 2.85, -0.42); group.add(f1);
      const f2 = f1.clone(); f2.position.x = 0.18; group.add(f2);
      const mouth = new THREE.Mesh(boxGeo(0.42, 0.28, 0.02), faceMat);
      mouth.position.set(0, 2.55, -0.42); group.add(mouth);
      parts.head = group.children[5];
      break;
    }
    case 'zombie':
    case 'skeleton': {
      const c = type === 'zombie' ? 0x3e7a3e : 0xb6b6b6;
      const shirt = type === 'zombie' ? 0x2a4878 : 0xb6b6b6;
      const pants = type === 'zombie' ? 0x2a4878 : 0x9a9a9a;
      const simple = (w, h, d, x, y, z, col) => {
        const mm = new THREE.Mesh(boxGeo(w, h, d), new THREE.MeshBasicMaterial({ color: col }));
        mm.position.set(x, y, z);
        group.add(mm);
        return mm;
      };
      simple(0.25, 1.35, 0.25, -0.22, 0.68, 0, pants);
      simple(0.25, 1.35, 0.25, 0.22, 0.68, 0, pants);
      simple(0.55, 1.35, 0.3, 0, 2.05, 0, shirt);
      simple(0.22, 1.35, 0.22, -0.45, 2.05, 0, c);
      simple(0.22, 1.35, 0.22, 0.45, 2.05, 0, c);
      simple(0.55, 0.55, 0.55, 0, 3.05, 0, c);
      if (type === 'skeleton') {
        const bow = new THREE.Mesh(boxGeo(0.08, 1.1, 0.08), new THREE.MeshBasicMaterial({ color: 0x6b4c2a }));
        bow.position.set(0.6, 2.0, -0.3);
        group.add(bow);
      }
      parts.head = group.children[5];
      break;
    }
    case 'spider': {
      const simple = (w, h, d, x, y, z, col) => {
        const mm = new THREE.Mesh(boxGeo(w, h, d), new THREE.MeshBasicMaterial({ color: col }));
        mm.position.set(x, y, z);
        group.add(mm);
        return mm;
      };
      simple(1.2, 0.7, 1.6, 0, 0.55, 0, 0x2a2020);
      simple(0.8, 0.6, 0.8, 0, 0.65, -1.1, 0x352828);
      // red eyes
      simple(0.15, 0.15, 0.02, -0.18, 0.8, -1.52, 0xcc2222);
      simple(0.15, 0.15, 0.02, 0.18, 0.8, -1.52, 0xcc2222);
      // legs
      for (let i = 0; i < 4; i++) {
        const z = -0.6 + i * 0.42;
        simple(0.9, 0.1, 0.1, -0.85, 0.5, z, 0x2a2020);
        simple(0.9, 0.1, 0.1, 0.85, 0.5, z, 0x2a2020);
      }
      parts.head = group.children[1];
      break;
    }
  }
  return { group, parts };
}

export class Mob {
  constructor(type, x, y, z) {
    this.type = type;
    this.def = MOB_DEFS[type];
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.hp = this.def.hp;
    this.onGround = false;
    this.wanderTimer = 0;
    this.moveToward = false;
    this.state = 'wander'; // wander | chase | fuse
    this.fuse = -1;
    this.attackTimer = 0;
    this.hurtTime = 0;
    this.age = 0;
    this.burning = false;

    const tex = new THREE.CanvasTexture(buildMobTexture(type));
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    const model = buildMobModel(type, tex);
    this.group = model.group;
    this.parts = model.parts;
    this.group.position.copy(this.pos);
    // scale creepers etc: models built at roughly correct scale already
    if (type === 'chicken') this.group.scale.setScalar(1);
    this._legPhase = Math.random() * Math.PI * 2;
  }

  update(dt, world, player, mobs, effects, audio) {
    this.age += dt;
    if (this.hurtTime > 0) this.hurtTime -= dt;
    const def = this.def;

    // despawn far away or at day for hostiles
    const dxp = player.pos.x - this.pos.x, dzp = player.pos.z - this.pos.z;
    const distP = Math.hypot(dxp, dzp);
    if (distP > 72) { this.dead = true; return; }

    // AI
    if (def.hostile && !player.dead) {
      const aggroRange = (this.type === 'creeper') ? 12 : 18;
      if (distP < aggroRange && (this.type === 'creeper' ? distP < 12 : distP < 16)) {
        this.state = 'chase';
      } else this.state = 'wander';

      if (this.state === 'chase') {
        this.yaw = Math.atan2(dxp, dzp);
        this.moveToward = true;

        if (this.def.creeper && distP < 2.2) {
          if (this.fuse < 0) {
            this.fuse = 1.6;
            if (audio) audio.fuse();
          }
        } else if (this.def.creeper && this.fuse > 0 && distP > 3.2) {
          this.fuse = -1; // cancel
        }

        // melee attack
        this.attackTimer -= dt;
        if (distP < 1.6 && this.attackTimer <= 0 && !this.def.creeper && !this.def.ranged) {
          this.attackTimer = 1.0;
          player.damage(def.dmg, audio);
          if (audio) audio.mobAttack();
        }
        if (this.def.ranged && distP > 4 && distP < 16 && this.attackTimer <= 0) {
          this.attackTimer = 2.4;
          if (effects) effects.shootArrow(this, player);
          if (audio) audio.bow();
        }
      }
    }

    // creeper fuse
    if (this.fuse > 0) {
      this.fuse -= dt;
      if (this.fuse <= 0) {
        this.dead = true;
        if (effects) effects.explosion(this.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 3, player);
        return;
      }
    }

    // wandering
    if (this.state === 'wander') {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 2 + Math.random() * 4;
        this.yaw = Math.random() * Math.PI * 2;
        this.moveToward = Math.random() < 0.65;
      }
    }

    // sustained movement toward facing direction
    if (this.moveToward) {
      const chaseBoost = this.state === 'chase' ? 1.5 : 1.0;
      const accel = def.speed * 7 * chaseBoost;
      this.vel.x += Math.sin(this.yaw) * accel * dt;
      this.vel.z += Math.cos(this.yaw) * accel * dt;
    }
    // clamp horizontal speed
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const maxS = def.speed * (this.state === 'chase' ? 1.45 : 0.8);
    if (hs > maxS) {
      this.vel.x *= maxS / hs;
      this.vel.z *= maxS / hs;
    }

    // physics
    const feet = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.1), Math.floor(this.pos.z));
    const inWater = feet === WATER;
    if (inWater) {
      this.vel.y += 8 * dt;
    } else {
      this.vel.y -= 26 * dt;
    }
    const damp = Math.pow(0.72, dt * 20);
    this.vel.x *= damp; this.vel.z *= damp;

    // move with collision (simple)
    this.moveAxis(world, 1, this.vel.y * dt);
    this.moveAxis(world, 0, this.vel.x * dt);
    this.moveAxis(world, 2, this.vel.z * dt);
    this.onGround = this.checkGround(world);

    // jump if walking into a wall
    if (this.onGround && (Math.abs(this.vel.x) > 0.02 || Math.abs(this.vel.z) > 0.02)) {
      const ahead = new THREE.Vector3(this.pos.x + Math.sign(this.vel.x) * 0.6, this.pos.y + 0.2, this.pos.z + Math.sign(this.vel.z) * 0.6);
      const b = world.getBlock(Math.floor(ahead.x), Math.floor(ahead.y), Math.floor(ahead.z));
      if (getBlock(b).solid) this.vel.y = 7.4;
    }

    // model update
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    const walking = Math.hypot(this.vel.x, this.vel.z) > 0.05;
    if (walking) this._legPhase += dt * 8;
    const swing = walking ? Math.sin(this._legPhase) * 0.6 : 0;
    if (this.parts) {
      const legKeys = ['leg1', 'leg2', 'leg3', 'leg4'];
      legKeys.forEach((k, i) => {
        if (this.parts[k]) this.parts[k].rotation.x = swing * (i % 2 === 0 ? 1 : -1);
      });
    }
    // limb animation for humanoid/zombie
    const children = this.group.children;
    if (this.type === 'zombie' || this.type === 'skeleton') {
      if (children[0]) children[0].rotation.x = swing * 0.8;
      if (children[1]) children[1].rotation.x = -swing * 0.8;
      if (children[3]) children[3].rotation.x = -swing * 0.5;
      if (children[4]) children[4].rotation.x = swing * 0.5;
    }
    if (this.type === 'spider' && children.length > 4) {
      for (let i = 4; i < children.length; i++) {
        children[i].rotation.z = walking ? Math.sin(this._legPhase + i) * 0.15 : 0;
      }
    }

    // hurt flash
    this.group.traverse(o => {
      if (o.material && o.material.color !== undefined) {
        if (!o.userData.baseCol) o.userData.baseCol = o.material.color.getHex();
        o.material.color.setHex(this.hurtTime > 0 ? 0xff6666 : o.userData.baseCol);
      }
    });
  }

  moveAxis(world, axis, amount) {
    if (amount === 0) return;
    const pos = this.pos;
    const old = pos.getComponent(axis);
    pos.setComponent(axis, old + amount);
    const w = this.def.w / 2, h = this.def.h;
    const minX = pos.x - w, maxX = pos.x + w;
    const minY = pos.y, maxY = pos.y + h;
    const minZ = pos.z - w, maxZ = pos.z + w;
    for (let y = Math.floor(minY); y <= Math.floor(maxY); y++) {
      for (let z = Math.floor(minZ); z <= Math.floor(maxZ); z++) {
        for (let x = Math.floor(minX); x <= Math.floor(maxX); x++) {
          const b = world.getBlock(x, y, z);
          if (!getBlock(b).solid) continue;
          if (maxX > x && minX < x + 1 && maxY > y && minY < y + 1 && maxZ > z && minZ < z + 1) {
            if (axis === 1) {
              if (amount > 0) { pos.y = y - h - 0.001; this.vel.y = 0; }
              else { pos.y = y + 1.001; this.vel.y = 0; }
            } else if (axis === 0) {
              pos.x = amount > 0 ? x - w - 0.001 : x + 1 + w + 0.001;
              this.vel.x = 0;
            } else {
              pos.z = amount > 0 ? z - w - 0.001 : z + 1 + w + 0.001;
              this.vel.z = 0;
            }
            return;
          }
        }
      }
    }
  }

  checkGround(world) {
    const y = Math.floor(this.pos.y - 0.02);
    const w = this.def.w / 2;
    for (let z = Math.floor(this.pos.z - w); z <= Math.floor(this.pos.z + w); z++) {
      for (let x = Math.floor(this.pos.x - w); x <= Math.floor(this.pos.x + w); x++) {
        if (getBlock(world.getBlock(x, y, z)).solid) return true;
      }
    }
    return false;
  }

  damage(amount, audio) {
    this.hp -= amount;
    this.hurtTime = 0.35;
    this.killed = true;
    if (audio) audio.mobHurt();
    if (this.hp <= 0) this.dead = true;
  }
}

export class MobManager {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.mobs = [];
    this.spawnTimer = 0;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.arrows = [];
  }

  spawnInitial(player) {
    // a few passive mobs near spawn
    for (let i = 0; i < 10; i++) {
      const x = player.pos.x + (Math.random() - 0.5) * 48;
      const z = player.pos.z + (Math.random() - 0.5) * 48;
      const y = this.world.heightAt(Math.floor(x), Math.floor(z));
      if (y <= 63) continue;
      const types = ['pig', 'cow', 'sheep', 'chicken'];
      this.add(types[Math.floor(Math.random() * types.length)], x, y, z);
    }
  }

  add(type, x, y, z) {
    const mob = new Mob(type, x, y, z);
    this.mobs.push(mob);
    this.group.add(mob.group);
    return mob;
  }

  update(dt, player, timeOfDay, effects, audio) {
    const isNight = timeOfDay > 0.52 && timeOfDay < 0.98;

    // natural spawning
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 4;
      const hostileCount = this.mobs.filter(m => m.def.hostile).length;
      const passiveCount = this.mobs.filter(m => !m.def.hostile).length;
      const cap = 18;
      if (this.mobs.length < cap) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 20 + Math.random() * 32;
        const x = player.pos.x + Math.cos(angle) * dist;
        const z = player.pos.z + Math.sin(angle) * dist;
        const y = this.world.heightAt(Math.floor(x), Math.floor(z));
        const block = this.world.getBlock(Math.floor(x), y - 1, Math.floor(z));
        if (y > 1 && y < 110 && block !== 0) {
          if (isNight && hostileCount < 10 && Math.random() < 0.7) {
            const types = ['zombie', 'skeleton', 'creeper', 'spider'];
            this.add(types[Math.floor(Math.random() * types.length)], x, y, z);
          } else if (!isNight && passiveCount < 12 && Math.random() < 0.3) {
            const types = ['pig', 'cow', 'sheep', 'chicken'];
            this.add(types[Math.floor(Math.random() * types.length)], x, y, z);
          }
        }
      }
    }

    for (const mob of this.mobs) {
      mob.update(dt, this.world, player, this.mobs, effects, audio);
      if (mob.dead) {
        this.group.remove(mob.group);
        // drops
        if (effects) effects.dropMobLoot(mob);
      }
    }
    this.mobs = this.mobs.filter(m => !m.dead);
  }

  nearestHostile(pos, range) {
    let best = null, bestD = range * range;
    for (const m of this.mobs) {
      if (!m.def.hostile) continue;
      const d = m.pos.distanceToSquared(pos);
      if (d < bestD) { bestD = d; best = m; }
    }
    return best;
  }
}
