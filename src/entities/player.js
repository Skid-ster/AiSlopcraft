import { DEFAULT_KEYS } from '../settings.js';
import { itemStackLimit } from '../world/blocks.js';
// Player physics + controls. Beta 1.7.3 feel: no sprint, 4.317 b/s walk,
// 1.25-block jump, fall damage, sneak edge-guard, ladders, cobwebs, ice, swimming, armor.
import * as THREE from 'three';
import {
  getBlock, AIR, WATER, WATER_FLOW, LAVA, LAVA_FLOW, ITEMS,
  LADDER, COBWEB, CACTUS, ICE, SLOW_SAND, WOOD_DOOR, IRON_DOOR, CAKE_BLOCK,
} from '../world/blocks.js';

const W = 0.6;          // player width
const H = 1.8;          // player height
const EYE = 1.62;       // eye height

function isLiquidWater(id) { return id === WATER || id === WATER_FLOW; }
function isLiquidLava(id) { return id === LAVA || id === LAVA_FLOW; }

function rayBoxIntersect(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ, maxDist) {
  let tMin = 0;
  let tMax = maxDist;
  let hitAxis = -1;
  let hitSign = 0;

  const axes = [
    [ox, dx, minX, maxX, 0],
    [oy, dy, minY, maxY, 1],
    [oz, dz, minZ, maxZ, 2],
  ];

  for (const [o, d, bMin, bMax, axis] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < bMin || o > bMax) return null;
    } else {
      const inv = 1 / d;
      let t1 = (bMin - o) * inv;
      let t2 = (bMax - o) * inv;
      let sign = -Math.sign(d);
      if (t1 > t2) {
        const tmp = t1; t1 = t2; t2 = tmp;
        sign = Math.sign(d);
      }
      if (t1 > tMin) {
        tMin = t1;
        hitAxis = axis;
        hitSign = sign;
      }
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return null;
    }
  }

  const face = [0, 0, 0];
  if (hitAxis >= 0) face[hitAxis] = hitSign;
  return { dist: tMin, face };
}

export function blockSelectionBounds(world, x, y, z, id) {
  const bd = getBlock(id);
  if (id === WOOD_DOOR || id === IRON_DOOR) {
    const meta = world.getMeta ? world.getMeta(x, y, z) : 0;
    const facing = meta & 3;
    const isOpen = (meta & 4) !== 0;
    const orient = isOpen ? ((facing + 2) & 3) : facing;
    const t = 0.1875;
    if (orient === 0) return [0, 0, 0, 1, 1, t];
    if (orient === 1) return [0, 0, 1 - t, 1, 1, 1];
    if (orient === 2) return [0, 0, 0, t, 1, 1];
    return [1 - t, 0, 0, 1, 1, 1];
  }
  if (id === CAKE_BLOCK) {
    const eaten = Math.min(5, (world.getMeta ? world.getMeta(x, y, z) : 0) & 7);
    return [0.0625 + eaten * 0.125, 0, 0.0625, 0.9375, 0.5, 0.9375];
  }
  if (id === LADDER) {
    if (getBlock(world.getBlock(x, y, z - 1)).solid) return [0, 0, 0, 1, 1, 0.15];
    if (getBlock(world.getBlock(x, y, z + 1)).solid) return [0, 0, 0.85, 1, 1, 1];
    if (getBlock(world.getBlock(x - 1, y, z)).solid) return [0, 0, 0, 0.15, 1, 1];
    if (getBlock(world.getBlock(x + 1, y, z)).solid) return [0.85, 0, 0, 1, 1, 1];
    return [0.85, 0, 0, 1, 1, 1];
  }
  return bd.bounds || null;
}

export class Player {
  constructor(world, camera, canvas) {
    this.world = world;
    this.camera = camera;
    this.pos = new THREE.Vector3(8, 80, 8);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.onGround = false;
    this.inWater = false;
    this.inLava = false;
    this.onLadder = false;
    this.inCobweb = false;
    this.sneaking = false;
    this.health = 20;
    this.maxHealth = 20;
    this.dead = false;
    this.fallStart = null;
    this.hurtTime = 0;
    this.breath = 0;
    this.air = 300;
    this.gameMode = 'survival';
    this.viewBobbing = true;
    this._bobPhase = 0;
    this._bobStrength = 0;

    // inventory: 36 slots + 4 armor slots (0:head, 1:chest, 2:legs, 3:feet)
    this.inventory = new Array(36).fill(null);
    this.armor = new Array(4).fill(null);
    this.hotbarIndex = 0;
    this.cursorStack = null; // for inventory drag
    this.mining = { active: false, x: 0, y: 0, z: 0, progress: 0, total: 0 };
    this.stats = { distance: 0, jumps: 0, blocksPlaced: 0, blocksMined: 0 };

    this.keys = {};
    this.pointerLocked = false;
    this.mouseDX = 0; this.mouseDY = 0;
    this.leftDown = false; this.rightDown = false;
    this.sensitivity = 0.0022;
    this.bindings = { ...DEFAULT_KEYS };
    this.invertMouse = false;

    canvas.addEventListener('click', () => {
      if (!this.pointerLocked && !window.uiPause) canvas.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
      if (!this.pointerLocked) {
        this.leftDown = false;
        this.rightDown = false;
        this.mouseDX = 0;
        this.mouseDY = 0;
        this.mining.active = false;
        this.mining.progress = 0;
        this.keys = {};
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.pointerLocked) return;
      if (`Mouse${e.button}` === this.bindings.attack) this.leftDown = true;
      if (`Mouse${e.button}` === this.bindings.use) this.rightDown = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (`Mouse${e.button}` === this.bindings.attack) { this.leftDown = false; this.mining.active = false; this.mining.progress = 0; }
      if (`Mouse${e.button}` === this.bindings.use) this.rightDown = false;
    });
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      for (let i = 1; i <= 9; i++) if (e.code === this.bindings[`hotbar${i}`]) this.hotbarIndex = i - 1;
      if (e.code === this.bindings.attack) this.leftDown = true;
      if (e.code === this.bindings.use) this.rightDown = true;
    });
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; if (e.code === this.bindings.attack) { this.leftDown = false; this.mining.active = false; this.mining.progress = 0; } if (e.code === this.bindings.use) this.rightDown = false; });
    document.addEventListener('wheel', (e) => {
      if (!this.pointerLocked) return;
      this.hotbarIndex = (this.hotbarIndex + (e.deltaY > 0 ? 1 : -1) + 9) % 9;
    });
  }

  get heldStack() { return this.inventory[this.hotbarIndex]; }

  get armorPoints() {
    let total = 0;
    for (const piece of this.armor) {
      if (!piece) continue;
      const def = ITEMS[piece.id];
      if (!def?.defense) continue;
      // Beta 1.7.3: armor protection scales slightly with remaining durability
      const maxDur = def.durability || 100;
      const ratio = Math.max(0.2, 1 - (piece.damage || 0) / maxDur);
      total += def.defense * ratio;
    }
    return Math.min(20, Math.round(total));
  }

  respawn(spawnY, spawnX = 8.5, spawnZ = 8.5) {
    this.pos.set(spawnX, spawnY, spawnZ);
    this.vel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.health = this.maxHealth;
    this.dead = false;
    this.fallStart = null;
    this.air = 300;
    this.breath = 0;
    this.hurtTime = 0;
    this.inWater = false;
    this.inLava = false;
    this.onLadder = false;
    this.inCobweb = false;
    this._drownAcc = 0;
    this._lavaAcc = 0;
    this._cactusAcc = 0;
    this.leftDown = false;
    this.rightDown = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mining.active = false;
    this.mining.progress = 0;
    this.keys = {};
    this.camera.position.set(spawnX, spawnY + EYE, spawnZ);
    this.camera.lookAt(spawnX, spawnY + EYE, spawnZ - 1);
  }

  _solidBlockAt(world, x, y, z) {
    if (typeof world.isSolidAt === 'function') return world.isSolidAt(x, y, z);
    return getBlock(world.getBlock(x, y, z)).solid;
  }

  updateRidingView(dt) {
    this.yaw -= this.mouseDX * this.sensitivity;
    this.pitch -= this.mouseDY * this.sensitivity * (this.invertMouse ? -1 : 1);
    this.mouseDX = this.mouseDY = 0;
    const limit = Math.PI / 2 - 0.001;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    this.camera.position.set(this.pos.x, this.pos.y + EYE, this.pos.z);
    const dir = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    this.camera.lookAt(this.camera.position.clone().add(dir));
  }

  update(dt, world, audio) {
    if (this.dead) return;
    dt = Math.min(dt, 0.05);

    // mouse look
    this.yaw -= this.mouseDX * this.sensitivity;
    this.pitch -= this.mouseDY * this.sensitivity * (this.invertMouse ? -1 : 1);
    this.mouseDX = 0; this.mouseDY = 0;
    const lim = Math.PI / 2 - 0.001;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));

    // movement input
    const forward = (this.keys[this.bindings.forward] ? 1 : 0) - (this.keys[this.bindings.back] ? 1 : 0);
    const strafe = (this.keys[this.bindings.right] ? 1 : 0) - (this.keys[this.bindings.left] ? 1 : 0);
    this.sneaking = !!(this.keys[this.bindings.sneak]);

    // check fluids / ladders / cobwebs / ground material
    const bx = Math.floor(this.pos.x), bz = Math.floor(this.pos.z);
    const groundBlock = world.getBlock(bx, Math.floor(this.pos.y - 0.2), bz);
    const feet = world.getBlock(bx, Math.floor(this.pos.y + 0.2), bz);
    const mid = world.getBlock(bx, Math.floor(this.pos.y + 1.1), bz);
    const headFluid = world.getBlock(bx, Math.floor(this.pos.y + EYE), bz);

    const prevInWater = this.inWater;
    this.inWater = isLiquidWater(feet) || isLiquidWater(mid) || isLiquidWater(headFluid);
    this.inLava = isLiquidLava(feet) || isLiquidLava(mid) || isLiquidLava(headFluid);
    if (!prevInWater && this.inWater && this.vel.y < -3.5 && audio?.splash) {
      audio.splash();
    }

    this.onLadder = feet === LADDER || mid === LADDER;
    this.inCobweb = feet === COBWEB || mid === COBWEB;

    // acceleration
    let speed = 4.317;
    if (this.sneaking) speed = 1.35;
    if (groundBlock === SLOW_SAND && this.onGround) speed *= 0.55;
    if (this.inWater) speed *= 0.44;
    if (this.inLava) speed *= 0.28;
    if (this.inCobweb) speed *= 0.25;

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let ax = (-forward * sin + strafe * cos);
    let az = (-forward * cos - strafe * sin);
    const len = Math.hypot(ax, az);
    if (len > 0) { ax /= len; az /= len; }

    const onIce = this.onGround && groundBlock === ICE;
    const control = this.onGround ? (onIce ? 2.4 : 8.5) : 1.6;
    if (len > 0) {
      this.vel.x += ax * speed * control * dt;
      this.vel.z += az * speed * control * dt;
    }

    // gravity / swimming / ladders / cobweb
    if (this.inCobweb) {
      this.vel.y = Math.max(-1.2, this.vel.y - 8 * dt);
      if (this.keys[this.bindings.jump]) this.vel.y = 0.8;
      this.fallStart = null;
    } else if (this.onLadder) {
      this.fallStart = null;
      if (this.keys[this.bindings.jump] || len > 0) {
        this.vel.y = 3.6;
      } else if (this.sneaking) {
        this.vel.y = 0;
      } else {
        this.vel.y = Math.max(this.vel.y - 20 * dt, -3.0);
      }
    } else if (this.inWater || this.inLava) {
      this.vel.y -= 7 * dt;
      if (this.keys[this.bindings.jump]) this.vel.y += 10.5 * dt;
      this.vel.y *= Math.pow(0.88, dt * 20);
    } else {
      this.vel.y -= 28 * dt;
    }

    // jump (0.42 blocks/tick = 8.4 b/s ≈ 1.25 block jump)
    if (this.keys[this.bindings.jump] && this.onGround && !this.inWater && !this.onLadder && !this.inCobweb) {
      this.vel.y = 8.45;
      this.onGround = false;
      this.stats.jumps++;
      if (audio) audio.jump();
    }

    // frame-rate independent damping
    const groundDamp = Math.pow(onIce ? 0.96 : 0.72, dt * 20);
    const airDamp = Math.pow(0.91, dt * 20);
    const damping = (this.onGround && !this.inWater) ? groundDamp : airDamp;
    this.vel.x *= damping; this.vel.z *= damping;
    if (this.inWater || this.inLava) {
      const wDamp = Math.pow(0.92, dt * 20);
      this.vel.x *= wDamp; this.vel.z *= wDamp;
    }

    // clamp horizontal speed
    const maxH = speed * (onIce ? 1.28 : 1.06);
    const hv = Math.hypot(this.vel.x, this.vel.z);
    if (hv > maxH) {
      this.vel.x *= maxH / hv;
      this.vel.z *= maxH / hv;
    }

    // integrate vertically first
    this.moveAxis(1, this.vel.y * dt, world);
    this.onGround = this.checkGround(world);

    // Sneak edge protection (Beta bridge-building!)
    let dx = this.vel.x * dt;
    let dz = this.vel.z * dt;
    if (this.sneaking && this.onGround) {
      if (dx !== 0 && !this.checkGroundAt(world, this.pos.x + dx, this.pos.y, this.pos.z)) {
        dx = 0;
        this.vel.x = 0;
      }
      if (dz !== 0 && !this.checkGroundAt(world, this.pos.x + dx, this.pos.y, this.pos.z + dz)) {
        dz = 0;
        this.vel.z = 0;
      }
    }

    const blockedX = this.moveAxis(0, dx, world) === 'blocked' || (dx !== 0 && this.vel.x === 0);
    const blockedZ = this.moveAxis(2, dz, world) === 'blocked' || (dz !== 0 && this.vel.z === 0);
    // Swim-up boost when jumping against a shoreline lip from water!
    if ((this.inWater || this.inLava) && this.keys[this.bindings.jump] && (blockedX || blockedZ)) {
      this.vel.y = Math.max(this.vel.y, 6.2);
    }
    this.onGround = this.checkGround(world);

    // fall damage
    if (this.onGround) {
      if (this.fallStart != null) {
        const dist = this.fallStart - this.pos.y;
        if (dist > 3.2 && !this.inWater && !this.onLadder && !this.inCobweb) {
          const dmg = Math.floor(dist - 3);
          if (dmg > 0) this.damage(dmg, audio);
        }
        this.fallStart = null;
      }
    } else if (this.vel.y < -0.5 && this.fallStart == null && !this.inWater && !this.onLadder && !this.inCobweb) {
      this.fallStart = this.pos.y;
    }
    if (this.inWater || this.onLadder || this.inCobweb) this.fallStart = null;

    // walk sound & view bobbing
    const moved = Math.hypot(this.pos.x - (this._lastX ?? this.pos.x), this.pos.z - (this._lastZ ?? this.pos.z));
    this.stats.distance += moved;
    if (this.onGround && moved > 0.001) {
      this._walkAcc = (this._walkAcc || 0) + moved;
      if (this._walkAcc > 2.05) {
        this._walkAcc = 0;
        if (audio) audio.step(groundBlock || 2);
      }
      this._bobPhase += moved * 2.7;
      this._bobStrength = Math.min(1, this._bobStrength + dt * 8);
    } else {
      this._bobStrength = Math.max(0, this._bobStrength - dt * 8);
    }
    this._lastX = this.pos.x; this._lastZ = this.pos.z;

    // drowning / lava / cactus contact damage
    const head = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + EYE), Math.floor(this.pos.z));
    if (isLiquidWater(head)) {
      this.air -= dt * 20;
      if (this.air <= 0) {
        this.air = 0;
        this._drownAcc = (this._drownAcc || 0) + dt;
        if (this._drownAcc > 1) {
          this._drownAcc = 0;
          this.damage(2, audio, true);
        }
      }
    } else {
      this.air = Math.min(300, this.air + dt * 60);
    }
    if (this.inLava) {
      this._lavaAcc = (this._lavaAcc || 0) + dt;
      if (this._lavaAcc > 0.5) {
        this._lavaAcc = 0;
        this.damage(4, audio);
      }
    }
    if (this.touchingBlock(world, CACTUS)) {
      this._cactusAcc = (this._cactusAcc || 0) + dt;
      if (this._cactusAcc > 0.5) {
        this._cactusAcc = 0;
        this.damage(1, audio);
      }
    } else {
      this._cactusAcc = 0;
    }

    if (this.hurtTime > 0) this.hurtTime = Math.max(0, this.hurtTime - dt);

    // camera with subtle Beta view-bobbing and hurt tilt
    const bobOffY = (this.viewBobbing && !this.sneaking) ? Math.abs(Math.cos(this._bobPhase)) * 0.045 * this._bobStrength : 0;
    const bobOffX = (this.viewBobbing && !this.sneaking) ? Math.sin(this._bobPhase) * 0.03 * this._bobStrength : 0;
    const rightX = Math.cos(this.yaw), rightZ = -Math.sin(this.yaw);
    this.camera.position.set(
      this.pos.x + rightX * bobOffX,
      this.pos.y + EYE - (this.sneaking ? 0.14 : 0) + bobOffY,
      this.pos.z + rightZ * bobOffX
    );
    const dir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    this.camera.lookAt(this.camera.position.clone().add(dir));
    if (this.hurtTime > 0 && this.camera.rotation) {
      this.camera.rotation.z += Math.sin((this.hurtTime / 0.5) * Math.PI) * 0.07;
    }
  }

  touchingBlock(world, blockId) {
    const pad = 0.06;
    const minX = Math.floor(this.pos.x - W / 2 - pad);
    const maxX = Math.floor(this.pos.x + W / 2 + pad);
    const minY = Math.floor(this.pos.y);
    const maxY = Math.floor(this.pos.y + H);
    const minZ = Math.floor(this.pos.z - W / 2 - pad);
    const maxZ = Math.floor(this.pos.z + W / 2 + pad);
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (world.getBlock(x, y, z) === blockId) return true;
        }
      }
    }
    return false;
  }

  moveAxis(axis, amount, world) {
    if (amount === 0) return 'ok';
    const pos = this.pos;
    const old = pos.getComponent(axis);
    pos.setComponent(axis, old + amount);

    const minX = pos.x - W / 2, maxX = pos.x + W / 2;
    const minY = pos.y, maxY = pos.y + H;
    const minZ = pos.z - W / 2, maxZ = pos.z + W / 2;

    for (let y = Math.floor(minY); y <= Math.floor(maxY); y++) {
      for (let z = Math.floor(minZ); z <= Math.floor(maxZ); z++) {
        for (let x = Math.floor(minX); x <= Math.floor(maxX); x++) {
          if (!this._solidBlockAt(world, x, y, z)) continue;
          const b = world.getBlock(x, y, z);
          const bounds = blockSelectionBounds(world, x, y, z, b);
          const bx0 = x + (bounds ? bounds[0] : 0);
          const by0 = y + (bounds ? bounds[1] : 0);
          const bz0 = z + (bounds ? bounds[2] : 0);
          const bx1 = x + (bounds ? bounds[3] : 1);
          const by1 = y + (bounds ? bounds[4] : 1);
          const bz1 = z + (bounds ? bounds[5] : 1);

          if (maxX > bx0 && minX < bx1 && maxY > by0 && minY < by1 && maxZ > bz0 && minZ < bz1) {
            if (axis === 1) {
              if (amount > 0) { pos.y = by0 - H - 0.001; this.vel.y = 0; }
              else { pos.y = by1 + 0.001; this.vel.y = 0; }
            } else if (axis === 0) {
              if (amount > 0) pos.x = bx0 - W / 2 - 0.001;
              else pos.x = bx1 + W / 2 + 0.001;
              this.vel.x = 0;
            } else {
              if (amount > 0) pos.z = bz0 - W / 2 - 0.001;
              else pos.z = bz1 + W / 2 + 0.001;
              this.vel.z = 0;
            }
            return amount > 0 ? 'blocked' : 'ground';
          }
        }
      }
    }
    return 'ok';
  }

  checkGroundAt(world, px, py, pz) {
    const x0 = Math.floor(px - W / 2 + 0.001);
    const x1 = Math.floor(px + W / 2 - 0.001);
    const z0 = Math.floor(pz - W / 2 + 0.001);
    const z1 = Math.floor(pz + W / 2 - 0.001);
    const y = Math.floor(py - 0.02);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (!this._solidBlockAt(world, x, y, z)) continue;
        const b = world.getBlock(x, y, z);
        const bounds = blockSelectionBounds(world, x, y, z, b);
        const topY = y + (bounds ? bounds[4] : 1);
        if (Math.abs(py - topY) < 0.08 || (!bounds && py >= y)) return true;
      }
    }
    return false;
  }

  checkGround(world) {
    return this.checkGroundAt(world, this.pos.x, this.pos.y, this.pos.z);
  }

  damage(amount, audio, bypassArmor = false) {
    if (this.dead || this.gameMode === 'creative') return;
    if (this.hurtTime > 0.35) return;

    let finalDamage = amount;
    if (!bypassArmor && this.armorPoints > 0) {
      // Beta 1.7.3: up to 80% damage reduction at 20 armor points (4% per armor point)
      const reduction = Math.min(0.8, this.armorPoints * 0.04);
      finalDamage = Math.max(1, Math.round(amount * (1 - reduction)));
      const wear = Math.max(1, Math.ceil(amount / 2));
      for (let i = 0; i < 4; i++) {
        const piece = this.armor[i];
        if (!piece) continue;
        const maxDur = ITEMS[piece.id]?.durability || 100;
        piece.damage = (piece.damage || 0) + wear;
        if (piece.damage >= maxDur) this.armor[i] = null;
      }
    }

    this.health -= finalDamage;
    this.hurtTime = 0.5;
    if (audio) audio.hurt();
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
  }

  // Raycast through blocks (DDA), returns {x,y,z, face:[dx,dy,dz], dist, block, bounds} or null
  raycast(world, maxDist = 5, opts = {}) {
    const dir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    const origin = this.camera.position;

    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const stepX = dir.x > 0 ? 1 : -1, stepY = dir.y > 0 ? 1 : -1, stepZ = dir.z > 0 ? 1 : -1;
    const tDeltaX = Math.abs(1 / (dir.x || 1e-10));
    const tDeltaY = Math.abs(1 / (dir.y || 1e-10));
    const tDeltaZ = Math.abs(1 / (dir.z || 1e-10));
    let tMaxX = tDeltaX * (dir.x > 0 ? (x + 1 - origin.x) : (origin.x - x));
    let tMaxY = tDeltaY * (dir.y > 0 ? (y + 1 - origin.y) : (origin.y - y));
    let tMaxZ = tDeltaZ * (dir.z > 0 ? (z + 1 - origin.z) : (origin.z - z));
    let face = [0, 0, 0];
    let t = 0;

    while (t <= maxDist) {
      const b = world.getBlock(x, y, z);
      if (b !== AIR) {
        const bd = getBlock(b);
        let candidate = false;
        if (opts.solidOnly) {
          candidate = this._solidBlockAt(world, x, y, z);
        } else if (opts.includeLiquids) {
          candidate = bd.targetable !== false || bd.liquid;
        } else {
          candidate = bd.targetable !== false && !bd.liquid;
        }

        if (candidate) {
          const bounds = blockSelectionBounds(world, x, y, z, b);
          if (!bounds) {
            return { x, y, z, face, dist: t, block: b, bounds: null };
          }
          const subHit = rayBoxIntersect(
            origin.x, origin.y, origin.z,
            dir.x, dir.y, dir.z,
            x + bounds[0], y + bounds[1], z + bounds[2],
            x + bounds[3], y + bounds[4], z + bounds[5],
            maxDist,
          );
          if (subHit) {
            return {
              x, y, z,
              face: (subHit.face[0] || subHit.face[1] || subHit.face[2]) ? subHit.face : face,
              dist: subHit.dist,
              block: b,
              bounds,
            };
          }
        }
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += tDeltaX;
        face = [-stepX, 0, 0];
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += tDeltaY;
        face = [0, -stepY, 0];
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ;
        face = [0, 0, -stepZ];
      }
    }
    return null;
  }

  insertItem(id, count = 1, damage = 0) {
    let remaining = Math.max(0, Math.floor(count));
    if (!remaining) return 0;
    const maxStack = itemStackLimit(id);

    if (maxStack > 1) {
      for (let i = 0; i < this.inventory.length && remaining > 0; i++) {
        const stack = this.inventory[i];
        if (!stack || stack.id !== id || (stack.damage || 0) !== damage || stack.count >= maxStack) continue;
        const inserted = Math.min(maxStack - stack.count, remaining);
        stack.count += inserted;
        remaining -= inserted;
      }
    }

    for (let i = 0; i < this.inventory.length && remaining > 0; i++) {
      if (this.inventory[i]) continue;
      const inserted = Math.min(maxStack, remaining);
      this.inventory[i] = { id, count: inserted, damage };
      remaining -= inserted;
    }
    return Math.floor(count) - remaining;
  }

  addItem(id, count = 1, damage = 0) {
    const wanted = Math.max(0, Math.floor(count));
    if (!wanted) return true;
    const maxStack = itemStackLimit(id);
    let capacity = 0;
    if (maxStack > 1) {
      for (const stack of this.inventory) {
        if (stack && stack.id === id && (stack.damage || 0) === damage) capacity += Math.max(0, maxStack - stack.count);
      }
    }
    capacity += this.inventory.filter(stack => !stack).length * maxStack;
    if (capacity < wanted) return false;
    return this.insertItem(id, wanted, damage) === wanted;
  }

  consumeItemId(id, amount = 1) {
    let needed = amount;
    for (let i = 0; i < this.inventory.length && needed > 0; i++) {
      const s = this.inventory[i];
      if (!s || s.id !== id) continue;
      const take = Math.min(s.count, needed);
      s.count -= take;
      needed -= take;
      if (s.count <= 0) this.inventory[i] = null;
    }
    return amount - needed;
  }

  hasItem(id, amount = 1) {
    let total = 0;
    for (const s of this.inventory) {
      if (s && s.id === id) total += s.count;
    }
    return total >= amount;
  }

  eatHeld(audio) {
    const stack = this.heldStack;
    const def = stack && ITEMS[stack.id];
    const food = def?.food;
    if (!food || this.dead) return false;
    this.health = Math.min(this.maxHealth, this.health + food);
    const returnItem = def.returns || null;
    this.consumeHeld();
    if (returnItem) this.insertItem(returnItem, 1, 0);
    if (audio) audio.eat();
    return true;
  }

  consumeHeld(count = 1) {
    const s = this.inventory[this.hotbarIndex];
    if (!s) return null;
    const taken = Math.min(s.count, count);
    const copy = { id: s.id, count: taken, damage: s.damage || 0 };
    s.count -= taken;
    if (s.count <= 0) this.inventory[this.hotbarIndex] = null;
    return copy;
  }

  useHeldOn(blockId, wear = 1) {
    const s = this.inventory[this.hotbarIndex];
    if (!s) return;
    const it = ITEMS[s.id];
    if (it && it.durability) {
      s.damage = (s.damage || 0) + wear;
      if (s.damage >= it.durability) this.inventory[this.hotbarIndex] = null;
    }
  }
}
