// Lightweight, uncluttered terrain for Classic mode: rolling grassland, waterline,
// dirt/stone layers, scattered trees and flowers. No biomes, ores, caves or mobs.
import { Noise, RNG, hashSeed } from './noise.js';
import {
  AIR, STONE, GRASS, DIRT, SAND, WATER, BEDROCK, LOG, LEAVES,
  TALL_GRASS, FLOWER_RED, FLOWER_YELLOW,
} from './blocks.js';
import { CH, WORLD_H } from './chunk.js';

export const CLASSIC_WATER_LEVEL = 31;

export class ClassicWorldGen {
  constructor(seedStr) {
    this.seedStr = seedStr;
    this.seed = hashSeed(seedStr);
    this.land = new Noise(this.seed);
    this.hills = new Noise(this.seed ^ 0x23a);
    this.detail = new Noise(this.seed ^ 0x17c);
  }

  columnInfo(x, z) {
    const continent = this.land.fbm2(x * 0.0042, z * 0.0042, 3);
    const hill = this.hills.fbm2(x * 0.015, z * 0.015, 3);
    const detail = this.detail.noise2(x * 0.06, z * 0.06);
    const height = Math.max(12, Math.min(52, Math.round(38 + continent * 15 + hill * 7 + detail * 1.5)));
    return { height, biome: 'classic' };
  }

  fillChunk(chunk) {
    const { cx, cz, blocks } = chunk;
    for (let z = 0; z < CH; z++) for (let x = 0; x < CH; x++) {
      const wx = cx * CH + x, wz = cz * CH + z;
      const height = this.columnInfo(wx, wz).height;
      const floor = Math.max(height, CLASSIC_WATER_LEVEL);
      for (let y = 0; y <= floor; y++) {
        let id = AIR;
        if (y === 0) id = BEDROCK;
        else if (y <= height) {
          const depth = height - y;
          if (height <= CLASSIC_WATER_LEVEL) id = depth === 0 ? SAND : depth < 4 ? DIRT : STONE;
          else id = depth === 0 ? GRASS : depth < 4 ? DIRT : STONE;
        } else if (y <= CLASSIC_WATER_LEVEL) id = WATER;
        if (id !== AIR) blocks[(y * CH + z) * CH + x] = id;
      }
    }
    chunk.generated = true;
    chunk.dirty = true;
  }

  decorate(world, chunk) {
    if (chunk.decorated) return;
    // Place the same deterministic features for neighboring owners regardless
    // of load order so tree canopies match across chunk edges.
    for (let oz = chunk.cz - 1; oz <= chunk.cz + 1; oz++) for (let ox = chunk.cx - 1; ox <= chunk.cx + 1; ox++) {
      const rng = new RNG(this.seed ^ Math.imul(ox, 3418731287) ^ Math.imul(oz, 132897987));
      const trees = ox === chunk.cx && oz === chunk.cz ? 2 : 1;
      for (let i = 0; i < trees; i++) {
        const wx = ox * CH + 2 + rng.nextInt(CH - 4);
        const wz = oz * CH + 2 + rng.nextInt(CH - 4);
        const height = this.columnInfo(wx, wz).height;
        if (height <= CLASSIC_WATER_LEVEL + 1 || height > WORLD_H - 10) continue;
        if (rng.next() < 0.28) continue;
        const treeHeight = 4 + rng.nextInt(2);
        const crownY = height + treeHeight;
        for (let dy = -2; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && rng.next() < 0.5) continue;
          if (world.getBlockGen(wx + dx, crownY + dy, wz + dz) === AIR) world.setBlockGen(wx + dx, crownY + dy, wz + dz, LEAVES);
        }
        for (let dy = 0; dy < treeHeight; dy++) world.setBlockGen(wx, height + 1 + dy, wz, LOG);
      }
    }
    const plants = new RNG(this.seed ^ (chunk.cx * 1103515245 + chunk.cz * 12345 + 0x23a));
    for (let i = 0; i < 18; i++) {
      const wx = chunk.cx * CH + plants.nextInt(CH), wz = chunk.cz * CH + plants.nextInt(CH);
      const y = this.columnInfo(wx, wz).height;
      if (y <= CLASSIC_WATER_LEVEL || world.getBlockGen(wx, y, wz) !== GRASS || world.getBlockGen(wx, y + 1, wz) !== AIR) continue;
      const roll = plants.next();
      if (roll < 0.25) world.setBlockGen(wx, y + 1, wz, TALL_GRASS);
      else if (roll < 0.28) world.setBlockGen(wx, y + 1, wz, FLOWER_RED);
      else if (roll < 0.31) world.setBlockGen(wx, y + 1, wz, FLOWER_YELLOW);
    }
    chunk.decorated = true;
    chunk.dirty = true;
  }
}
