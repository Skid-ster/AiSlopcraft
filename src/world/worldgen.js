// Beta 1.7.3-style terrain generator:
// rolling hills from octaved perlin, beaches, deserts, forests, snow fields,
// caves, ore veins, lava pools, trees, flowers, sugar cane, pumpkins.
import { Noise, RNG, hashSeed } from './noise.js';
import {
  AIR, STONE, GRASS, DIRT, SAND, WATER, LAVA, BEDROCK, GRAVEL, SANDSTONE,
  LOG, LEAVES, SNOW, ICE, CACTUS, SUGARCANE, TALL_GRASS, FLOWER_RED, FLOWER_YELLOW,
  PUMPKIN, CLAY, COAL_ORE, IRON_ORE, GOLD_ORE, DIAMOND_ORE, REDSTONE_ORE, LAPIS_ORE,
  MUSHROOM_BROWN, MUSHROOM_RED, SNOW_BLOCK,
} from './blocks.js';
import { CH, WORLD_H, SEA_LEVEL, Chunk } from './chunk.js';

export class WorldGen {
  constructor(seedStr) {
    this.seedStr = seedStr;
    const s = hashSeed(seedStr);
    this.seed = s;
    this.nHeight = new Noise(s);
    this.nDetail = new Noise(s ^ 0x1234);
    this.nHill = new Noise(s ^ 0x5678);
    this.nTemp = new Noise(s ^ 0x9abc);
    this.nHum = new Noise(s ^ 0xdef0);
    this.nCave = new Noise(s ^ 0x1111);
    this.nCave2 = new Noise(s ^ 0x2222);
    this.nBiome = new Noise(s ^ 0x3333);
  }

  // Column height & biome info — pure function of x,z so chunk borders match
  columnInfo(x, z) {
    const NX = 0.0022, NZ = 0.0022;   // continent scale
    const HX = 0.0062, HZ = 0.0062;   // hills
    const DX = 0.02, DZ = 0.02;       // detail

    // Base continent + hills. Beta terrain is broadly smooth with dramatic hills.
    const cont = this.nHeight.fbm2(x * NX, z * NZ, 4);
    const hill = this.nHill.fbm2(x * HX, z * HZ, 4);
    const detail = this.nDetail.fbm2(x * DX, z * DZ, 3);

    let h = SEA_LEVEL + 2 + cont * 26 + hill * 14 + detail * 3;
    // Occasional mountains
    const mtn = this.nBiome.noise2(x * 0.0013, z * 0.0013);
    if (mtn > 0.22) {
      const t = (mtn - 0.22) / 0.78;
      h += t * t * 56 * (0.6 + hill * 0.7);
    }
    h = Math.floor(h);
    if (h < 4) h = 4;
    if (h > WORLD_H - 10) h = WORLD_H - 10;

    // Temperature / humidity for surface material (wider spread: snow and desert are common in beta)
    const temp = this.nTemp.fbm2(x * 0.0016, z * 0.0016, 3) * 0.72 + 0.5;
    const hum = this.nHum.fbm2(x * 0.0018 + 100, z * 0.0018 + 100, 3) * 0.72 + 0.5;

    let biome = 'grassland';
    if (temp < 0.36) biome = 'snow';
    else if (temp > 0.64 && hum < 0.52) biome = 'desert';
    else if (hum > 0.58) biome = 'forest';
    if (h > SEA_LEVEL + 26 || mtn > 0.42) biome = 'mountains';

    return { height: h, temp, hum, biome };
  }

  isCave(x, y, z, h) {
    if (y < 6) return false;
    if (y > h - 3 && y > SEA_LEVEL) return false;
    const c1 = this.nCave.fbm3(x * 0.017, y * 0.028, z * 0.017, 3);
    const c2 = this.nCave2.fbm3(x * 0.017 + 50, y * 0.028 + 50, z * 0.017 + 50, 3);
    return (c1 * c1 + c2 * c2) < 0.0022;
  }

  fillChunk(chunk) {
    const { cx, cz } = chunk;
    const B = chunk.blocks;
    for (let z = 0; z < CH; z++) {
      for (let x = 0; x < CH; x++) {
        const wx = cx * CH + x, wz = cz * CH + z;
        const info = this.columnInfo(wx, wz);
        const h = info.height;
        for (let y = 0; y <= Math.max(h, SEA_LEVEL); y++) {
          let id = AIR;
          if (y === 0 || (y < 3 && this.nDetail.noise2(wx * 0.1 + y * 7, wz * 0.1 - y * 3) > 0.4)) {
            id = BEDROCK;
          } else if (y <= h) {
            // caves
            const cave = this.isCave(wx, y, wz, h);
            if (cave) {
              // lava at the bottom of caves
              id = y < 11 ? LAVA : AIR;
            } else {
              const depth = h - y;
              if (info.biome === 'desert') {
                if (depth === 0) id = SAND;
                else if (depth < 4) id = SAND;
                else if (depth < 6) id = SANDSTONE;
                else id = STONE;
              } else if (info.biome === 'snow') {
                if (depth === 0) id = GRASS;
                else if (depth < 4) id = DIRT;
                else id = STONE;
              } else {
                if (depth === 0) id = GRASS;
                else if (depth < 4) id = DIRT;
                else id = STONE;
              }
              // underwater surface: sand/gravel/dirt near sea floor
              if (h < SEA_LEVEL && y === h) {
                if (info.biome === 'desert' || this.nDetail.noise2(wx * 0.05, wz * 0.05) > 0.1) id = SAND;
                else if (this.nDetail.noise2(wx * 0.07 + 31, wz * 0.07 - 17) > 0.3) id = GRAVEL;
                else id = DIRT;
              }
              // beaches
              if (y === h && h >= SEA_LEVEL - 2 && h <= SEA_LEVEL + 1 && info.biome !== 'snow') {
                if (this.nDetail.noise2(wx * 0.03 + 9, wz * 0.03 - 9) > -0.25) id = SAND;
              }
              // clay near water
              if (id === DIRT && y < SEA_LEVEL && y > h - 3 && this.nDetail.noise2(wx * 0.09 + 61, wz * 0.09 + 61) > 0.42) id = CLAY;
              // gravel patches underground
              if (id === STONE && y < h - 6 && this.nDetail.noise2(wx * 0.06 + 200, wz * 0.06 - 200) > 0.55) id = GRAVEL;
            }
          } else if (y <= SEA_LEVEL) {
            id = WATER;
          }
          if (id !== AIR) {
            const idx = (y * CH + z) * CH + x;
            B[idx] = id;
          }
        }
        // ice layer on snow-biome water
        if (info.biome === 'snow') {
          const wi = (SEA_LEVEL * CH + z) * CH + x;
          if (B[wi] === WATER) B[wi] = ICE;
        }
      }
    }

    // Ore generation
    this.placeOres(chunk);

    // Lava pools in deep stone (small)
    const rng = new RNG(this.seed ^ (cx * 341873128 + cz * 132897987));
    for (let i = 0; i < 3; i++) {
      const lx = rng.nextInt(CH), lz = rng.nextInt(CH), ly = 4 + rng.nextInt(10);
      const size = 1 + rng.nextInt(3);
      for (let dx = -size; dx <= size; dx++) for (let dy = -size; dy <= size; dy++) for (let dz = -size; dz <= size; dz++) {
        const x = lx + dx, y = ly + dy, z = lz + dz;
        if (x < 0 || x >= CH || z < 0 || z >= CH || y < 1 || y >= WORLD_H) continue;
        const idx = (y * CH + z) * CH + x;
        if (B[idx] === STONE && dx * dx + dy * dy + dz * dz <= size * size) B[idx] = LAVA;
      }
    }
    chunk.generated = true;
    chunk.dirty = true;
  }

  placeOres(chunk) {
    const { cx, cz } = chunk;
    const rng = new RNG(this.seed ^ (cx * 92837111) ^ (cz * 689287499));
    const place = (id, tries, minY, maxY, maxVein) => {
      for (let i = 0; i < tries; i++) {
        const x = rng.nextInt(CH), y = minY + rng.nextInt(Math.max(1, maxY - minY)), z = rng.nextInt(CH);
        const size = 1 + rng.nextInt(maxVein);
        for (let d = 0; d < size; d++) {
          const px = x + rng.nextInt(3) - 1, py = y + rng.nextInt(3) - 1, pz = z + rng.nextInt(3) - 1;
          if (px < 0 || px >= CH || pz < 0 || pz >= CH || py < 1 || py >= WORLD_H) continue;
          const idx = (py * CH + pz) * CH + px;
          if (chunk.blocks[idx] === STONE) chunk.blocks[idx] = id;
        }
      }
    };
    place(COAL_ORE, 16, 8, 120, 8);
    place(IRON_ORE, 12, 6, 64, 6);
    place(GOLD_ORE, 3, 4, 32, 5);
    place(REDSTONE_ORE, 4, 4, 20, 6);
    place(DIAMOND_ORE, 2, 4, 16, 5);
    place(LAPIS_ORE, 2, 4, 24, 5);
  }

  // Deterministic decoration (trees/plants) for chunk cx,cz — includes features
  // from neighbor chunks that overflow into this one.
  decorate(world, chunk) {
    if (chunk.decorated) return;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        this.decorateOwn(world, chunk, chunk.cx + dx, chunk.cz + dz, dx === 0 && dz === 0);
      }
    }
    chunk.decorated = true;
    chunk.dirty = true;
  }

  // Places features owned by chunk (ocx,ocz) into world (writing across borders)
  decorateOwn(world, chunk, ocx, ocz, isHome) {
    const rng = new RNG(this.seed ^ (ocx * 3418731287 ^ ocz * 132897987));
    // Count plants first
    const nTrees = rng.nextInt(7); // 0-6 trees
    const trees = [];
    for (let i = 0; i < nTrees; i++) {
      const x = 2 + rng.nextInt(12), z = 2 + rng.nextInt(12);
      trees.push([ocx * CH + x, ocz * CH + z, rng]);
    }
    // extra forest density
    const info0 = this.columnInfo(ocx * CH + 8, ocz * CH + 8);
    const extra = info0.biome === 'forest' ? 8 + rng.nextInt(6) : info0.biome === 'desert' ? 2 : 3;
    for (let i = 0; i < extra; i++) {
      const x = rng.nextInt(CH), z = rng.nextInt(CH);
      trees.push([ocx * CH + x, ocz * CH + z, rng]);
    }

    for (const [wx, wz, r] of trees) {
      const info = this.columnInfo(wx, wz);
      const h = info.height;
      if (h <= SEA_LEVEL || h > WORLD_H - 12) continue;
      const ground = world.getBlockGen(wx, h, wz);
      if (info.biome === 'desert') {
        if (ground === SAND && r.next() < 0.25) this.placeCactus(world, wx, h + 1, wz, r);
        continue;
      }
      if (info.biome === 'snow') {
        if (r.next() < 0.5) continue; // sparse trees in snow
      }
      if (ground !== GRASS && ground !== DIRT && ground !== SNOW) continue;
      if (r.next() < 0.62) this.placeTree(world, wx, h + 1, wz, r);
    }

    // Flowers / shrubs / cane / pumpkins for this chunk only (no overflow needed)
    if (isHome) {
      const rng2 = new RNG(this.seed ^ (ocx * 1103515245 + ocz * 12345 + 7));
      for (let i = 0; i < 26; i++) {
        const x = rng2.nextInt(CH), z = rng2.nextInt(CH);
        const wx = ocx * CH + x, wz = ocz * CH + z;
        const info = this.columnInfo(wx, wz);
        const h = info.height;
        if (h <= SEA_LEVEL) continue;
        const ground = world.getBlockGen(wx, h, wz);
        const above = world.getBlockGen(wx, h + 1, wz);
        if (above !== AIR) continue;
        const roll = rng2.next();
        if (info.biome === 'snow') {
          if (ground === GRASS) world.setBlockGen(wx, h + 1, wz, rng2.next() < 0.5 ? SNOW : TALL_GRASS);
          continue;
        }
        if (ground !== GRASS) {
          if (ground === SAND && info.biome === 'desert' && roll < 0.02) this.placeCactus(world, wx, h + 1, wz, rng2);
          continue;
        }
        if (roll < 0.32) world.setBlockGen(wx, h + 1, wz, TALL_GRASS);
        else if (roll < 0.38) world.setBlockGen(wx, h + 1, wz, FLOWER_YELLOW);
        else if (roll < 0.44) world.setBlockGen(wx, h + 1, wz, FLOWER_RED);
        else if (roll < 0.465) world.setBlockGen(wx, h + 1, wz, MUSHROOM_BROWN);
        else if (roll < 0.485) world.setBlockGen(wx, h + 1, wz, MUSHROOM_RED);
        else if (roll < 0.51) world.setBlockGen(wx, h + 1, wz, PUMPKIN);
      }
      // sugar cane near water
      const rng3 = new RNG(this.seed ^ (ocx * 22695477 + ocz * 69069 + 13));
      for (let i = 0; i < 10; i++) {
        const x = rng3.nextInt(CH), z = rng3.nextInt(CH);
        const wx = ocx * CH + x, wz = ocz * CH + z;
        const info = this.columnInfo(wx, wz);
        const h = info.height;
        if (h <= SEA_LEVEL - 1) continue;
        // near water?
        let nearWater = false;
        for (let d = 0; d < 4 && !nearWater; d++) {
          if (world.getBlockGen(wx + d, SEA_LEVEL, wz) === WATER) nearWater = true;
          if (world.getBlockGen(wx - d, SEA_LEVEL, wz) === WATER) nearWater = true;
          if (world.getBlockGen(wx, SEA_LEVEL, wz + d) === WATER) nearWater = true;
          if (world.getBlockGen(wx, SEA_LEVEL, wz - d) === WATER) nearWater = true;
        }
        if (!nearWater) continue;
        const ground = world.getBlockGen(wx, h, wz);
        if ((ground === GRASS || ground === SAND || ground === SNOW) && world.getBlockGen(wx, h + 1, wz) === AIR) {
          const height = 2 + rng3.nextInt(2);
          for (let y = 1; y <= height; y++) world.setBlockGen(wx, h + y, wz, SUGARCANE);
        }
      }
    }
  }

  placeTree(world, x, y, z, rng) {
    const height = 4 + rng.nextInt(3);
    // canopy radius by height
    const base = y + height - 3;
    for (let dy = -2; dy <= 1; dy++) {
      const radius = dy >= 0 ? 1 : 2;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (dx === 0 && dz === 0 && dy <= 0) continue;
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && rng.next() < 0.5) continue;
          const by = base + dy + (dy > 0 ? 1 : 0);
          if (world.getBlockGen(x + dx, by, z + dz) === AIR) {
            world.setBlockGen(x + dx, by, z + dz, LEAVES);
          }
        }
      }
    }
    for (let i = 0; i < height; i++) {
      world.setBlockGen(x, y + i, z, LOG);
    }
  }

  placeCactus(world, x, y, z, rng) {
    const height = 1 + rng.nextInt(3);
    for (let i = 0; i < height; i++) {
      world.setBlockGen(x, y + i, z, CACTUS);
    }
  }
}
