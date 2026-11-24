// Chunk storage: 16x16 columns sized to the world's vertical profile.
import { AIR, getBlock } from './blocks.js';
import { BETA_HEIGHT } from './world-profile.js';

export const CH = 16;
export const WORLD_H = BETA_HEIGHT; // frozen legacy generator constant
export const SEA_LEVEL = 63;

export class Chunk {
  constructor(cx, cz, height = WORLD_H) {
    this.cx = cx; this.cz = cz;
    this.height = height;
    this.blocks = new Uint8Array(CH * height * CH);
    this.meta = new Uint8Array(CH * height * CH);
    this.skyLight = new Uint8Array(CH * height * CH);
    this.blockLight = new Uint8Array(CH * height * CH);
    this.dirty = true;
    this.generated = false;
    this.lightingReady = false;
    this.decorated = false;
    this.meshes = null; // { solid, cutout, water }
  }
  idx(x, y, z) { return (y * CH + z) * CH + x; }
  get(x, y, z) {
    if (y < 0 || y >= this.height) return AIR;
    return this.blocks[this.idx(x, y, z)];
  }
  set(x, y, z, id, meta = 0) {
    if (y < 0 || y >= this.height) return;
    const i = this.idx(x, y, z);
    this.blocks[i] = id;
    this.meta[i] = meta;
    this.dirty = true;
  }
  getMeta(x, y, z) {
    if (y < 0 || y >= this.height) return 0;
    return this.meta[this.idx(x, y, z)];
  }
  setMeta(x, y, z, meta) {
    if (y < 0 || y >= this.height) return;
    this.meta[this.idx(x, y, z)] = meta;
    this.dirty = true;
  }
  getLight(x, y, z) {
    if (y < 0) return 0;
    if (y >= this.height) return 0xf0;
    const i = this.idx(x, y, z);
    return (this.skyLight[i] << 4) | this.blockLight[i];
  }
  dispose(scene) {
    if (this.meshes) {
      for (const key of Object.keys(this.meshes)) {
        const m = this.meshes[key];
        if (!m) continue;
        scene.remove(m);
        m.geometry.dispose();
      }
      this.meshes = null;
    }
  }
}

// Coordinates helpers
export const blockIndex = (x, y, z) => (y * CH + z) * CH + x;

export function isOpaque(id) {
  return getBlock(id).opaque;
}

export function isSolid(id) {
  return getBlock(id).solid;
}
