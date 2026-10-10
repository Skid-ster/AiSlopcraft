// Player physics + controls. Beta 1.7.3 feel: no sprint, 4.317 b/s walk,
// 1.25-block jump, fall damage, sneak, swimming.
import * as THREE from 'three';
import { getBlock, AIR, WATER, LAVA, isBlock, ITEMS, breakTime, canHarvest, GRASS, STONE, COBBLE, DIRT, SAND, GRAVEL, LEAVES, LOG, SNOW } from '../world/blocks.js';
import { CH, WORLD_H } from '../world/chunk.js';

const W = 0.6;          // player width
const H = 1.8;          // player height
const EYE = 1.62;       // eye height

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
    this.sneaking = false;
    this.health = 20;
    this.maxHealth = 20;
    this.dead = false;
    this.fallStart = null;
    this.hurtTime = 0;
    this.breath = 0;
    this.air = 300;
    this.gameMode = 'survival';

    // inventory: 36 slots + hotbar index. slot = {id, count, damage}
    this.inventory = new Array(36).fill(null);
    this.hotbarIndex = 0;
    this.cursorStack = null; // for inventory drag
    this.mining = { active: false, x: 0, y: 0, z: 0, progress: 0, total: 0 };
    this.stats = { distance: 0, jumps: 0, blocksPlaced: 0, blocksMined: 0 };

    // start items: pickaxe + some torches + planks so testing is fun? Accurate survival starts empty.
    // Keep it authentic: empty inventory.

    this.keys = {};
    this.pointerLocked = false;
    this.mouseDX = 0; this.mouseDY = 0;
    this.leftDown = false; this.rightDown = false;
    this.sensitivity = 0.0022;

    canvas.addEventListener('click', () => {
      if (!this.pointerLocked && !window.uiPause) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.pointerLocked) return;
      if (e.button === 0) this.leftDown = true;
      if (e.button === 2) this.rightDown = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) { this.leftDown = false; this.mining.active = false; this.mining.progress = 0; }
      if (e.button === 2) this.rightDown = false;
    });
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Digit1') this.hotbarIndex = 0;
      if (e.code === 'Digit2') this.hotbarIndex = 1;
      if (e.code === 'Digit3') this.hotbarIndex = 2;
      if (e.code === 'Digit4') this.hotbarIndex = 3;
      if (e.code === 'Digit5') this.hotbarIndex = 4;
      if (e.code === 'Digit6') this.hotbarIndex = 5;
      if (e.code === 'Digit7') this.hotbarIndex = 6;
      if (e.code === 'Digit8') this.hotbarIndex = 7;
      if (e.code === 'Digit9') this.hotbarIndex = 8;
    });
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    document.addEventListener('wheel', (e) => {
      if (!this.pointerLocked) return;
      this.hotbarIndex = (this.hotbarIndex + (e.deltaY > 0 ? 1 : -1) + 9) % 9;
    });
  }

  get heldStack() { return this.inventory[this.hotbarIndex]; }

  respawn(spawnY) {
    this.pos.set(8, spawnY, 8);
    this.vel.set(0, 0, 0);
    this.health = 20;
    this.dead = false;
    this.fallStart = null;
    this.air = 300;
    this.hurtTime = 0;
  }

  update(dt, world, audio, onPlace, onBreak) {
    if (this.dead) return;
    dt = Math.min(dt, 0.05);

    // mouse look
    this.yaw -= this.mouseDX * this.sensitivity;
    this.pitch -= this.mouseDY * this.sensitivity;
    this.mouseDX = 0; this.mouseDY = 0;
    const lim = Math.PI / 2 - 0.001;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));

    // movement input
    const forward = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
    const strafe = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);
    this.sneaking = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']);

    // check fluids at feet / body
    const feet = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.2), Math.floor(this.pos.z));
    const mid = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 1.2), Math.floor(this.pos.z));
    this.inWater = feet === WATER || mid === WATER;
    this.inLava = feet === LAVA || mid === LAVA;

    // acceleration
    let speed = 4.317;
    if (this.sneaking) speed = 1.4;
    if (this.inWater) speed *= 0.42;
    if (this.inLava) speed *= 0.28;

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // camera at yaw=0 looks toward -Z; movement must use the same basis
    let ax = (-forward * sin + strafe * cos);
    let az = (-forward * cos - strafe * sin);
    const len = Math.hypot(ax, az);
    if (len > 0) { ax /= len; az /= len; }

    // velocity control (Minecraft-style ground/air control, scaled per second)
    const control = this.onGround ? 8.5 : 1.6;
    if (len > 0) {
      this.vel.x += ax * speed * control * dt;
      this.vel.z += az * speed * control * dt;
    }

    // gravity (Minecraft ~32 b/s², slightly softened for feel)
    if (this.inWater || this.inLava) {
      this.vel.y -= 7 * dt;
      if (this.keys['Space']) this.vel.y += 10 * dt;
      this.vel.y *= Math.pow(0.88, dt * 20);
    } else {
      this.vel.y -= 28 * dt;
    }

    // jump (0.42 blocks/tick = 8.4 b/s ≈ 1.25 block jump)
    if (this.keys['Space'] && this.onGround && !this.inWater) {
      this.vel.y = 8.45;
      this.onGround = false;
      this.stats.jumps++;
      if (audio) audio.jump();
    }

    // frame-rate independent damping (beta: 0.72 ground / 0.91 air per tick @20tps)
    const groundDamp = Math.pow(0.72, dt * 20);
    const airDamp = Math.pow(0.91, dt * 20);
    const damping = (this.onGround && !this.inWater) ? groundDamp : airDamp;
    this.vel.x *= damping; this.vel.z *= damping;
    if (this.inWater || this.inLava) {
      const wDamp = Math.pow(0.92, dt * 20);
      this.vel.x *= wDamp; this.vel.z *= wDamp;
    }

    // clamp
    const maxH = speed * 1.06;
    const hv = Math.hypot(this.vel.x, this.vel.z);
    if (hv > maxH) {
      this.vel.x *= maxH / hv;
      this.vel.z *= maxH / hv;
    }

    // integrate with collision
    const oldY = this.pos.y;
    this.moveAxis(1, this.vel.y * dt, world);
    const wasGround = this.onGround;
    this.onGround = this.moveAxis(0, this.vel.x * dt, world) === 'blocked' ? this.moveAxis(0, 0, world) === 'ground' : false;
    // simpler ground check
    this.onGround = this.checkGround(world);
    this.moveAxis(2, this.vel.z * dt, world);

    // fall damage
    if (this.onGround) {
      if (this.fallStart != null) {
        const dist = this.fallStart - this.pos.y;
        if (dist > 3.2 && !this.inWater) {
          const dmg = Math.floor(dist - 3);
          if (dmg > 0) this.damage(dmg, audio);
        }
        this.fallStart = null;
      }
    } else if (this.vel.y < -0.5 && this.fallStart == null && !this.inWater) {
      this.fallStart = this.pos.y;
    }
    if (this.inWater) this.fallStart = null;

    // walk sound
    const moved = Math.hypot(this.pos.x - (this._lastX ?? this.pos.x), this.pos.z - (this._lastZ ?? this.pos.z));
    if (this.onGround && moved > 0.001) {
      this._walkAcc = (this._walkAcc || 0) + moved;
      if (this._walkAcc > 2.1) {
        this._walkAcc = 0;
        if (audio) audio.step(feet);
      }
    }
    this._lastX = this.pos.x; this._lastZ = this.pos.z;

    // drowning / lava damage
    const head = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + EYE), Math.floor(this.pos.z));
    if (head === WATER) {
      this.air -= dt * 20;
      if (this.air <= 0) {
        this.air = 0;
        this._drownAcc = (this._drownAcc || 0) + dt;
        if (this._drownAcc > 1) {
          this._drownAcc = 0;
          this.damage(2, audio);
        }
      }
    } else {
      this.air = Math.min(300, this.air + dt * 60);
    }
    if (this.inLava) {
      this._lavaAcc = (this._lavaAcc || 0) + dt;
      if (this._lavaAcc > 0.5) {
        this._lavaAcc = 0;
        this.damage(2, audio);
      }
    }

    if (this.hurtTime > 0) this.hurtTime -= dt;

    // camera
    this.camera.position.set(this.pos.x, this.pos.y + EYE - (this.sneaking ? 0.12 : 0), this.pos.z);
    const dir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    this.camera.lookAt(this.camera.position.clone().add(dir));
  }

  moveAxis(axis, amount, world) {
    if (amount === 0) return 'ok';
    const pos = this.pos;
    const old = pos.getComponent(axis);
    pos.setComponent(axis, old + amount);

    // resolve collisions
    const minX = pos.x - W / 2, maxX = pos.x + W / 2;
    const minY = pos.y, maxY = pos.y + H;
    const minZ = pos.z - W / 2, maxZ = pos.z + W / 2;

    for (let y = Math.floor(minY); y <= Math.floor(maxY); y++) {
      for (let z = Math.floor(minZ); z <= Math.floor(maxZ); z++) {
        for (let x = Math.floor(minX); x <= Math.floor(maxX); x++) {
          const b = world.getBlock(x, y, z);
          const bd = getBlock(b);
          if (!bd.solid) continue;
          // AABB overlap check
          if (maxX > x && minX < x + 1 && maxY > y && minY < y + 1 && maxZ > z && minZ < z + 1) {
            if (axis === 1) {
              if (amount > 0) { pos.y = y - H - 0.001; this.vel.y = 0; }
              else { pos.y = y + 1.001; this.vel.y = 0; }
            } else if (axis === 0) {
              if (amount > 0) pos.x = x - W / 2 - 0.001;
              else pos.x = x + 1 + W / 2 + 0.001;
              this.vel.x = 0;
            } else {
              if (amount > 0) pos.z = z - W / 2 - 0.001;
              else pos.z = z + 1 + W / 2 + 0.001;
              this.vel.z = 0;
            }
            return amount > 0 ? 'blocked' : 'ground';
          }
        }
      }
    }
    return 'ok';
  }

  checkGround(world) {
    const x0 = Math.floor(this.pos.x - W / 2 + 0.001);
    const x1 = Math.floor(this.pos.x + W / 2 - 0.001);
    const z0 = Math.floor(this.pos.z - W / 2 + 0.001);
    const z1 = Math.floor(this.pos.z + W / 2 - 0.001);
    const y = Math.floor(this.pos.y - 0.02);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const b = world.getBlock(x, y, z);
        if (getBlock(b).solid) return true;
      }
    }
    return false;
  }

  damage(amount, audio) {
    if (this.dead || this.gameMode === 'creative') return;
    if (this.hurtTime > 0.35) return;
    this.health -= amount;
    this.hurtTime = 0.5;
    if (audio) audio.hurt();
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
  }

  // Raycast through blocks (DDA), returns {x,y,z, face:[dx,dy,dz], dist} or null
  raycast(world, maxDist = 5) {
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
      if (b !== AIR && getBlock(b).solid) {
        return { x, y, z, face, dist: t };
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

  addItem(id, count = 1) {
    // try to stack
    for (let i = 0; i < 36; i++) {
      const s = this.inventory[i];
      if (s && s.id === id && s.count < 64 && id >= 256 === (id >= 256)) {
        if (id < 256 || true) {
          const add = Math.min(64 - s.count, count);
          s.count += add;
          count -= add;
          if (count <= 0) return true;
        }
      }
    }
    for (let i = 0; i < 36; i++) {
      if (!this.inventory[i]) {
        this.inventory[i] = { id, count: Math.min(64, count), damage: 0 };
        count -= Math.min(64, count);
        if (count <= 0) return true;
      }
    }
    return count <= 0;
  }

  consumeHeld() {
    const s = this.inventory[this.hotbarIndex];
    if (!s) return;
    s.count--;
    if (s.count <= 0) this.inventory[this.hotbarIndex] = null;
  }

  useHeldOn(blockId) {
    // damage tool durability
    const s = this.inventory[this.hotbarIndex];
    if (!s) return;
    const it = ITEMS[s.id];
    if (it && it.durability) {
      s.damage = (s.damage || 0) + 1;
      if (s.damage >= it.durability) this.inventory[this.hotbarIndex] = null;
    }
  }
}
