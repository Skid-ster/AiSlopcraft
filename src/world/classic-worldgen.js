// Classic-era rolling terrain with a waterline, underground caves and ore veins,
// plus locally authored block decorations. The biome and hostile-mob systems stay off.
import { Noise, RNG, hashSeed } from './noise.js';
import {
  AIR, STONE, GRASS, DIRT, SAND, WATER, BEDROCK, LOG, LEAVES,
  COAL_ORE, IRON_ORE, GOLD_ORE, TALL_GRASS, FLOWER_RED, FLOWER_YELLOW,
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
    this.carveCaves(chunk);
    this.placeOres(chunk);
    chunk.generated = true;
    chunk.dirty = true;
  }

  carveCaves(chunk) {
    const minX = chunk.cx * CH, minZ = chunk.cz * CH;
    for (let oz = chunk.cz - 2; oz <= chunk.cz + 2; oz++) for (let ox = chunk.cx - 2; ox <= chunk.cx + 2; ox++) {
      const rng = new RNG(this.seed ^ Math.imul(ox, 3418731287) ^ Math.imul(oz, 132897987) ^ 0x6c8e9cf5);
      const caveCount = rng.nextInt(3);
      for (let cave = 0; cave < caveCount; cave++) {
        let x = ox * CH + rng.range(0, CH), z = oz * CH + rng.range(0, CH);
        const ceiling = Math.min(25, this.columnInfo(Math.floor(x), Math.floor(z)).height - 5);
        if (ceiling <= 5) continue;
        let y = rng.range(5, ceiling), heading = rng.range(0, Math.PI * 2);
        const length = 12 + rng.nextInt(17), radius = 1.35 + rng.next() * 0.55;
        for (let step = 0; step < length; step++) {
          const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
          for (let by = Math.max(2, cy - 2); by <= cy + 2; by++) {
            for (let bz = cz - 2; bz <= cz + 2; bz++) for (let bx = cx - 2; bx <= cx + 2; bx++) {
              const dx = bx + 0.5 - x, dy = by + 0.5 - y, dz = bz + 0.5 - z;
              if (dx * dx + dy * dy + dz * dz > radius * radius) continue;
              const lx = bx - minX, lz = bz - minZ;
              if (lx < 0 || lx >= CH || lz < 0 || lz >= CH) continue;
              const index = (by * CH + lz) * CH + lx;
              if (chunk.blocks[index] === STONE) chunk.blocks[index] = AIR;
            }
          }
          x += Math.cos(heading) * 0.9;
          z += Math.sin(heading) * 0.9;
          y += rng.range(-0.22, 0.22);
          heading += rng.range(-0.18, 0.18);
        }
      }
    }
  }

  placeOres(chunk) {
    const minX = chunk.cx * CH, minZ = chunk.cz * CH;
    const veins = [
      { id: COAL_ORE, count: 9, length: 7, minY: 5, maxY: 28 },
      { id: IRON_ORE, count: 6, length: 6, minY: 4, maxY: 22 },
      { id: GOLD_ORE, count: 2, length: 5, minY: 3, maxY: 14 },
    ];
    for (let oz = chunk.cz - 1; oz <= chunk.cz + 1; oz++) for (let ox = chunk.cx - 1; ox <= chunk.cx + 1; ox++) {
      for (let type = 0; type < veins.length; type++) {
        const veinType = veins[type];
        const rng = new RNG(this.seed ^ Math.imul(ox, 3418731287) ^ Math.imul(oz, 132897987) ^ (0x51ed270b + type * 977));
        for (let vein = 0; vein < veinType.count; vein++) {
          let x = ox * CH + rng.nextInt(CH), z = oz * CH + rng.nextInt(CH);
          let y = veinType.minY + rng.nextInt(veinType.maxY - veinType.minY + 1);
          const length = Math.max(2, veinType.length + rng.nextInt(5) - 2);
          for (let step = 0; step < length; step++) {
            const lx = x - minX, lz = z - minZ;
            if (lx >= 0 && lx < CH && lz >= 0 && lz < CH && y > 1 && y < WORLD_H - 1) {
              const index = (y * CH + lz) * CH + lx;
              if (chunk.blocks[index] === STONE) chunk.blocks[index] = veinType.id;
            }
            x += rng.nextInt(3) - 1;
            z += rng.nextInt(3) - 1;
            y += rng.nextInt(3) - 1;
          }
        }
      }
    }
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
