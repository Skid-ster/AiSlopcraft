import { CH, SEA_LEVEL } from './chunk.js';
import { WorldGen } from './worldgen.js';
import { Noise, RNG } from './noise.js';
import { AIR, LOG, LEAVES, SNOW, TALL_GRASS, FLOWER_RED, FLOWER_YELLOW, CACTUS, PUMPKIN, SUGARCANE } from './blocks.js';

// Version 1: seeded continental landforms, ridges and river valleys, layered
// over the shared rock/cave/ore rules. Freeze these parameters for saved seeds.
export class OverworldGen extends WorldGen {
  constructor(seed) {
    super(seed);
    this.river = new Noise(this.seed ^ 0x75ad84);
    this.relief = new Noise(this.seed ^ 0x3b418f);
  }

  columnInfo(x, z) {
    const continent = this.nHeight.fbm2(x * 0.0017 + 12.5, z * 0.0017 - 26.8, 4);
    const hills = this.nHill.fbm2(x * 0.007, z * 0.007, 3);
    const detail = this.nDetail.fbm2(x * 0.028, z * 0.028, 3);
    const upland = Math.max(0, Math.min(1, (this.relief.noise2(x * 0.0019 + 31.2, z * 0.0019) - 0.08) / 0.48));
    const ridge = 1 - Math.abs(this.nBiome.fbm2(x * 0.007 + 20, z * 0.007 - 15, 3));
    const land = 70 + continent * 41 + hills * 12 + detail * 3 + upland * upland * ridge ** 3 * 121;
    const channel = Math.abs(this.river.fbm2(x * 0.004 + 6.3, z * 0.004 - 9.2, 3));
    const bank = Math.min(1, channel / 0.085);
    const riverbed = 59 + detail * 2;
    const height = Math.floor(Math.min(land, riverbed + (land - riverbed) * bank * bank * (3 - 2 * bank)));
    const temp = 0.52 + this.nTemp.fbm2(x * 0.0027 + 22, z * 0.0027 - 17, 3) * 0.93 - Math.max(0, height - 76) * 0.0042;
    const hum = 0.50 + this.nHum.fbm2(x * 0.0032 - 37, z * 0.0032 + 19, 3) * 0.9;
    let biome = 'grassland';
    if (temp < 0.35) biome = 'snow';
    else if (temp > 0.62 && hum < 0.54) biome = 'desert';
    else if (height > 100) biome = 'mountains';
    else if (hum > 0.54) biome = 'forest';
    return { height, temp, hum, biome };
  }

  decorate(_world, chunk) {
    if (chunk.decorated) return;
    const x0 = chunk.cx * CH, z0 = chunk.cz * CH;
    // Each chunk projects nearby features into itself only. Neither neighbors'
    // load order nor player edits can influence the generated block image.
    const inChunk = (x, z) => x >= x0 && x < x0 + CH && z >= z0 && z < z0 + CH;
    const place = (x, y, z, id) => {
      if (inChunk(x, z) && chunk.get(x - x0, y, z - z0) === AIR) chunk.set(x - x0, y, z - z0, id);
    };
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const cx = chunk.cx + dx, cz = chunk.cz + dz;
      const rng = new RNG(this.seed ^ Math.imul(cx, 3418731287) ^ Math.imul(cz, 132897987) ^ 0x772401);
      for (let i = 0; i < 12; i++) {
        const x = cx * CH + rng.nextInt(CH), z = cz * CH + rng.nextInt(CH);
        const chance = rng.next(), trunk = 4 + rng.nextInt(3);
        if (x < x0 - 2 || x > x0 + CH + 1 || z < z0 - 2 || z > z0 + CH + 1) continue;
        const { height, biome } = this.columnInfo(x, z);
        if (height <= SEA_LEVEL + 1 || height >= chunk.height - 8) continue;
        if (biome === 'desert') {
          if (chance < 0.29) for (let y = 1; y <= trunk - 3; y++) place(x, height + y, z, CACTUS);
        } else if (chance < (biome === 'forest' ? 0.76 : biome === 'snow' ? 0.18 : 0.31)) {
          for (let y = 1; y <= trunk; y++) place(x, height + y, z, LOG);
          for (let y = trunk - 2; y <= trunk + 1; y++) {
            const radius = y < trunk ? 2 : 1;
            for (let a = -radius; a <= radius; a++) for (let b = -radius; b <= radius; b++) {
              if (Math.abs(a) + Math.abs(b) > radius + 1) continue;
              place(x + a, height + y, z + b, LEAVES);
            }
          }
        }
      }
    }
    const plants = new RNG(this.seed ^ Math.imul(chunk.cx, 1103515245) ^ Math.imul(chunk.cz, 12345) ^ 0x713);
    for (let z = z0; z < z0 + CH; z++) for (let x = x0; x < x0 + CH; x++) {
      const { height, biome } = this.columnInfo(x, z);
      const roll = plants.next();
      if (height === SEA_LEVEL && biome !== 'snow' && roll < 0.16 &&
          [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => this.columnInfo(x + dx, z + dz).height < SEA_LEVEL)) {
        for (let y = 1; y <= 3; y++) place(x, height + y, z, SUGARCANE);
      } else if (height > SEA_LEVEL && biome !== 'desert') {
        if (biome === 'snow' && roll < 0.74) place(x, height + 1, z, SNOW);
        else if (roll < 0.13) place(x, height + 1, z, TALL_GRASS);
        else if (roll < 0.16) place(x, height + 1, z, roll < 0.145 ? FLOWER_RED : FLOWER_YELLOW);
        else if (roll < 0.163) place(x, height + 1, z, PUMPKIN);
      }
    }
    chunk.decorated = true;
    chunk.dirty = true;
  }
}
