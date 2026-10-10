// Chunk storage: 16x16x128 (beta world height limit is 128!)
import {
  AIR, STONE, GRASS, DIRT, SAND, WATER, LAVA, BEDROCK, GRAVEL, SANDSTONE,
  LOG, LEAVES, SNOW, ICE, CACTUS, SUGARCANE, TALL_GRASS, FLOWER_RED, FLOWER_YELLOW,
  PUMPKIN, CLAY, COAL_ORE, IRON_ORE, GOLD_ORE, DIAMOND_ORE, REDSTONE_ORE, LAPIS_ORE,
  MUSHROOM_BROWN, MUSHROOM_RED, getBlock
} from './blocks.js';

export const CH = 16;
export const WORLD_H = 128;
export const SEA_LEVEL = 63;

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.blocks = new Uint8Array(CH * WORLD_H * CH);
    this.skyLight = new Uint8Array(CH * WORLD_H * CH);
    this.blockLight = new Uint8Array(CH * WORLD_H * CH);
    this.dirty = true;
    this.generated = false;
    this.decorated = false;
    this.meshes = null; // { solid, cutout, water }
  }
  idx(x, y, z) { return (y * CH + z) * CH + x; }
  get(x, y, z) {
    if (y < 0 || y >= WORLD_H) return AIR;
    return this.blocks[this.idx(x, y, z)];
  }
  set(x, y, z, id) {
    if (y < 0 || y >= WORLD_H) return;
    this.blocks[this.idx(x, y, z)] = id;
    this.dirty = true;
  }
  getLight(x, y, z) {
    if (y < 0) return 0;
    if (y >= WORLD_H) return 15;
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
