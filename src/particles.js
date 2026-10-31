// Voxel particle system for block breaking and digging in AiSlopcraft
import * as THREE from 'three';
import { getBlock, isBlock, TILES } from './world/blocks.js';

// Fallback representative colors for common blocks if texture sampling is unavailable
const BLOCK_COLORS = {
  1: [125, 125, 125], // Stone
  2: [124, 168, 72],  // Grass
  3: [134, 96, 67],   // Dirt
  4: [110, 110, 110], // Cobblestone
  5: [156, 128, 78],  // Planks
  6: [70, 140, 50],   // Sapling
  7: [70, 70, 70],    // Bedrock
  8: [42, 82, 196],   // Water
  10: [240, 100, 20], // Lava
  12: [219, 207, 163], // Sand
  13: [126, 124, 122], // Gravel
  14: [220, 200, 100], // Gold Ore
  15: [180, 160, 140], // Iron Ore
  16: [60, 60, 60],    // Coal Ore
  17: [108, 80, 50],   // Log
  18: [60, 140, 40],   // Leaves
  20: [200, 230, 240], // Glass
  21: [48, 76, 188],   // Lapis Ore
  24: [219, 207, 163], // Sandstone
  30: [220, 220, 220], // Cobweb
  31: [90, 150, 50],   // Tall Grass
  37: [240, 220, 40],  // Dandelion
  38: [220, 40, 40],   // Rose
  39: [160, 120, 80],  // Brown Mushroom
  40: [200, 40, 40],   // Red Mushroom
  41: [248, 212, 64],  // Gold Block
  42: [220, 220, 220], // Iron Block
  45: [158, 88, 72],   // Brick
  46: [180, 48, 40],   // TNT
  47: [156, 128, 78],  // Bookshelf
  48: [100, 110, 90],  // Mossy Cobble
  49: [24, 18, 36],    // Obsidian
  50: [242, 180, 52],  // Torch
  56: [96, 226, 220],  // Diamond Ore
  57: [108, 230, 220], // Diamond Block
  58: [156, 128, 78],  // Crafting Table
  61: [116, 116, 116], // Furnace
  65: [130, 100, 60],  // Ladder
  66: [130, 130, 130], // Rail
  73: [222, 36, 36],   // Redstone Ore
  78: [238, 246, 250], // Snow
  79: [146, 182, 238], // Ice
  80: [236, 244, 250], // Snow Block
  81: [40, 120, 40],   // Cactus
  82: [158, 164, 176], // Clay
  83: [140, 200, 70],  // Sugarcane
  86: [204, 118, 28],  // Pumpkin
  87: [122, 52, 52],   // Netherrack
  88: [116, 92, 68],   // Soul Sand
  89: [220, 180, 100], // Glowstone
  98: [122, 122, 122], // Stone Bricks
};

const MAX_PARTICLES = 256;
const PARTICLE_SIZE = 0.09;

export class ParticleManager {
  constructor(scene, atlasCanvas, lighting = null) {
    this.scene = scene;
    this.atlasCanvas = atlasCanvas;
    this.lighting = lighting;
    this.atlasCtx = atlasCanvas ? atlasCanvas.getContext('2d') : null;

    // Cache of block color palettes: blockId -> array of THREE.Color
    this.colorCache = new Map();

    // Reusable InstancedMesh for performance: 1 draw call for all particles
    this.geometry = new THREE.BoxGeometry(PARTICLE_SIZE, PARTICLE_SIZE, PARTICLE_SIZE);
    this.material = lighting ? lighting.createMaterial({ name: 'Particles', transparent: true }) : new THREE.MeshBasicMaterial({ transparent: true });

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, MAX_PARTICLES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    if (lighting) {
      lighting.prepare(this.mesh);
      this.instanceLight = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 2), 2);
      this.instanceEmission = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES), 1);
      this.instanceLight.setUsage(THREE.DynamicDrawUsage);
      this.instanceEmission.setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute('aInstanceLight', this.instanceLight);
      this.geometry.setAttribute('aInstanceEmission', this.instanceEmission);
    }
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    // Active particle data
    this.particles = [];

    // Helper dummy object for matrix calculations
    this.dummy = new THREE.Object3D();
    this.colorDummy = new THREE.Color();
  }

  getBlockColors(blockId) {
    if (this.colorCache.has(blockId)) {
      return this.colorCache.get(blockId);
    }

    const colors = [];
    const bd = getBlock(blockId);
    const tile = bd.tiles ? bd.tiles[0] : null;

    if (this.atlasCtx && tile != null) {
      const tx = (tile % 16) * 16;
      const ty = Math.floor(tile / 16) * 16;
      try {
        const img = this.atlasCtx.getImageData(tx, ty, 16, 16).data;
        // Sample several pixels across the 16x16 tile
        for (let py = 2; py < 14; py += 3) {
          for (let px = 2; px < 14; px += 3) {
            const idx = (py * 16 + px) * 4;
            const a = img[idx + 3];
            if (a > 50) {
              colors.push(new THREE.Color().setRGB(img[idx] / 255, img[idx + 1] / 255, img[idx + 2] / 255, THREE.SRGBColorSpace));
            }
          }
        }
      } catch (e) {
        // Fallback to static table if getImageData fails
      }
    }

    if (colors.length === 0) {
      const base = BLOCK_COLORS[blockId] || [140, 140, 140];
      for (let i = 0; i < 6; i++) {
        const jitter = (Math.random() - 0.5) * 30;
        const r = Math.max(0, Math.min(255, base[0] + jitter)) / 255;
        const g = Math.max(0, Math.min(255, base[1] + jitter)) / 255;
        const b = Math.max(0, Math.min(255, base[2] + jitter)) / 255;
        colors.push(new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace));
      }
    }

    this.colorCache.set(blockId, colors);
    return colors;
  }

  getRandomColor(blockId) {
    const list = this.getBlockColors(blockId);
    return list[Math.floor(Math.random() * list.length)];
  }

  // Burst of 16-24 voxel particles on block break
  spawnBreak(x, y, z, blockId) {
    if (!blockId) return;
    const count = 16 + Math.floor(Math.random() * 9); // 16 to 24
    const cx = x + 0.5;
    const cy = y + 0.5;
    const cz = z + 0.5;

    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) {
        this.particles.shift(); // Evict oldest
      }

      const px = cx + (Math.random() - 0.5) * 0.7;
      const py = cy + (Math.random() - 0.5) * 0.7;
      const pz = cz + (Math.random() - 0.5) * 0.7;

      const vx = (Math.random() - 0.5) * 3.2;
      const vy = Math.random() * 3.0 + 1.2; // Upward bias
      const vz = (Math.random() - 0.5) * 3.2;

      const color = this.getRandomColor(blockId);
      const life = 0.5 + Math.random() * 0.5; // 0.5s to 1.0s

      this.particles.push({
        x: px, y: py, z: pz,
        vx, vy, vz,
        color,
        life,
        maxLife: life,
        scale: 0.8 + Math.random() * 0.4,
      });
    }
  }

  spawnEffect(position, { color = 0xffa020, life = 0.45, scale = 0.7, vx = 0, vy = 1.4, vz = 0, gravity = -0.4 } = {}) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    const tint = color?.isColor ? color.clone() : new THREE.Color(color);
    this.particles.push({
      x: position.x + (Math.random() - 0.5) * 0.45,
      y: position.y + Math.random() * 0.5,
      z: position.z + (Math.random() - 0.5) * 0.45,
      vx: vx + (Math.random() - 0.5) * 0.5,
      vy: vy + Math.random() * 0.5,
      vz: vz + (Math.random() - 0.5) * 0.5,
      color: tint,
      life,
      maxLife: life,
      scale,
      gravity,
      collide: false,
      emissive: true,
    });
  }

  // 1-2 small particles while digging
  spawnDig(hit, blockId) {
    if (!hit || !blockId) return;
    const count = 1 + (Math.random() > 0.5 ? 1 : 0);
    const fx = hit.face ? hit.face[0] : 0;
    const fy = hit.face ? hit.face[1] : 0;
    const fz = hit.face ? hit.face[2] : 0;

    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) {
        this.particles.shift();
      }

      // Position on the hit face with slight jitter
      const px = hit.x + 0.5 + fx * 0.52 + (Math.random() - 0.5) * (fx !== 0 ? 0.05 : 0.6);
      const py = hit.y + 0.5 + fy * 0.52 + (Math.random() - 0.5) * (fy !== 0 ? 0.05 : 0.6);
      const pz = hit.z + 0.5 + fz * 0.52 + (Math.random() - 0.5) * (fz !== 0 ? 0.05 : 0.6);

      const vx = (Math.random() - 0.5) * 1.5 + fx * 0.8;
      const vy = Math.random() * 1.8 + 0.5 + Math.max(0, fy * 1.2);
      const vz = (Math.random() - 0.5) * 1.5 + fz * 0.8;

      const color = this.getRandomColor(blockId);
      const life = 0.3 + Math.random() * 0.3;

      this.particles.push({
        x: px, y: py, z: pz,
        vx, vy, vz,
        color,
        life,
        maxLife: life,
        scale: 0.5 + Math.random() * 0.3,
      });
    }
  }

  update(dt, world) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      // Block fragments fall; fire/smoke effect particles drift upward.
      p.vy -= (p.gravity ?? 18) * dt;

      // Integrate position
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      // Simple ground / block bounce or damping
      if (world && p.collide !== false) {
        const bx = Math.floor(p.x);
        const by = Math.floor(p.y);
        const bz = Math.floor(p.z);
        const b = world.getBlock(bx, by, bz);
        if (b && getBlock(b).solid && p.vy < 0) {
          p.y = by + 1.0 + PARTICLE_SIZE / 2;
          p.vy = -p.vy * 0.3; // bounce with damping
          p.vx *= 0.6;
          p.vz *= 0.6;
        }
      }
    }

    // Update InstancedMesh matrices & colors
    const activeCount = Math.min(this.particles.length, MAX_PARTICLES);
    this.mesh.count = activeCount;

    for (let i = 0; i < activeCount; i++) {
      const p = this.particles[i];
      const lifeRatio = Math.max(0, p.life / p.maxLife);
      const s = p.scale * (lifeRatio > 0.2 ? 1 : lifeRatio / 0.2); // shrink at end of life

      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.scale.set(s, s, s);
      this.dummy.updateMatrix();

      this.mesh.setMatrixAt(i, this.dummy.matrix);
      if (this.mesh.setColorAt) this.mesh.setColorAt(i, p.color);
      if (this.instanceLight) {
        const packed = world ? world.getLight(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) : 0xf0;
        this.instanceLight.setXY(i, packed >> 4, packed & 15);
        this.instanceEmission.setX(i, p.emissive ? 1 : 0);
      }
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.instanceLight) { this.instanceLight.needsUpdate = true; this.instanceEmission.needsUpdate = true; }
  }
}
