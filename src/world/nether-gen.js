// Deterministic 1.7.10-inspired Nether generator ("nether-v1"):
// 128-block bedrock-roofed caverns, y<=31 lava sea, Soul Sand & gravel basins,
// Nether Quartz veins, hanging Glowstone clusters, mushrooms, and Nether Fortresses.
import { CH } from './chunk.js';
import { Noise as Perlin, hashSeed } from './noise.js';
import {
  AIR, BEDROCK, LAVA, GRAVEL, NETHERRACK, SLOW_SAND, GLOWSTONE,
  MUSHROOM_BROWN, MUSHROOM_RED, NETHER_BRICK, NETHER_BRICK_FENCE, NETHER_BRICK_STAIRS, QUARTZ_ORE,
} from './blocks.js';

export const NETHER_HEIGHT = 128;
export const NETHER_LAVA_SEA = 31;

function colHash(seed, x, y, z) {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 1442695041) ^ Math.imul(z, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class NetherGen {
  constructor(seedStr = 'aislopcraft') {
    const base = (hashSeed(`nether:${seedStr}`) ^ 0x6a09e667) >>> 0;
    this.seed = base;
    this.cavernA = new Perlin(base + 11);
    this.cavernB = new Perlin(base + 29);
    this.warp = new Perlin(base + 47);
    this.soulNoise = new Perlin(base + 73);
    this.gravelNoise = new Perlin(base + 97);
    this.biomeNoise = new Perlin(base + 131);

    // Precompute vertical envelope curve so roof & floor close smoothly into Netherrack.
    this.yBias = new Float64Array(17);
    for (let gy = 0; gy <= 16; gy++) {
      const y = gy * 8;
      let bias = 0;
      if (y <= 24) bias += (24 - y) * 0.065;
      if (y >= 104) bias += (y - 104) * 0.085;
      // Encourage open cavern halls around y=36..88
      if (y >= 34 && y <= 92) bias -= 0.24 * Math.sin(((y - 34) / 58) * Math.PI);
      this.yBias[gy] = bias;
    }
  }

  columnInfo(wx, wz) {
    const b = this.biomeNoise.fbm2(wx * 0.006, wz * 0.006, 2);
    const biome = this.isFortressZone(wx >> 4, wz >> 4)
      ? 'Nether Fortress'
      : b > 0.22 ? 'Soul Sand Valley' : b < -0.24 ? 'Quartz Wastes' : 'Nether Wastes';
    return { temp: 1.0, hum: 0.0, biome, height: 64 };
  }

  isFortressZone(cx, cz) {
    // Deterministic regional grid: 1 fortress complex per 12x12 chunk region.
    const rx = Math.floor(cx / 12);
    const rz = Math.floor(cz / 12);
    const anchorX = rx * 12 + 4 + Math.floor(colHash(this.seed, rx, 0, rz) * 4);
    const anchorZ = rz * 12 + 4 + Math.floor(colHash(this.seed, rx, 1, rz) * 4);
    const dx = cx - anchorX;
    const dz = cz - anchorZ;
    // Cross-shaped bridge network spanning 5 chunks along X and Z from anchor
    return (Math.abs(dx) <= 2 && dz === 0) || (Math.abs(dz) <= 2 && dx === 0);
  }

  _sampleDensity(wx, wy, wz) {
    const warpX = this.warp.noise3(wx * 0.015, wy * 0.02, wz * 0.015) * 10;
    const warpZ = this.warp.noise3(wx * 0.015 + 31.7, wy * 0.02, wz * 0.015 - 19.3) * 10;
    const sx = (wx + warpX) * 0.022;
    const sy = wy * 0.036;
    const sz = (wz + warpZ) * 0.022;
    const n1 = this.cavernA.noise3(sx, sy, sz);
    const n2 = this.cavernB.noise3(sx * 2.05, sy * 2.1, sz * 2.05) * 0.45;
    return n1 + n2;
  }

  heightAt(wx, wz) {
    const cx = Math.floor(wx / CH);
    const cz = Math.floor(wz / CH);
    if (this.isFortressZone(cx, cz)) return 55;
    for (let y = 34; y <= 104; y += 2) {
      const dBelow = this._sampleDensity(wx, y - 2, wz) + this.yBias[Math.min(16, (y - 2) >> 3)];
      const dHere = this._sampleDensity(wx, y + 2, wz) + this.yBias[Math.min(16, (y + 2) >> 3)];
      if (dBelow > 0.02 && dHere <= 0.02) return y;
    }
    return 64;
  }

  fillChunk(chunk) {
    const { cx, cz, blocks } = chunk;
    const wx0 = cx * CH;
    const wz0 = cz * CH;

    // 5 x 17 x 5 trilinear density lattice (cell size 4 x 8 x 4)
    const grid = new Float64Array(5 * 17 * 5);
    let gi = 0;
    for (let gz = 0; gz <= 4; gz++) {
      const wz = wz0 + gz * 4;
      for (let gx = 0; gx <= 4; gx++) {
        const wx = wx0 + gx * 4;
        for (let gy = 0; gy <= 16; gy++) {
          const wy = gy * 8;
          grid[gi++] = this._sampleDensity(wx, wy, wz) + this.yBias[gy];
        }
      }
    }

    // Trilinearly interpolate into 16 x 128 x 16 blocks
    for (let czSub = 0; czSub < 4; czSub++) {
      for (let cxSub = 0; cxSub < 4; cxSub++) {
        const base00 = (czSub * 5 + cxSub) * 17;
        const base10 = (czSub * 5 + cxSub + 1) * 17;
        const base01 = ((czSub + 1) * 5 + cxSub) * 17;
        const base11 = ((czSub + 1) * 5 + cxSub + 1) * 17;

        for (let cySub = 0; cySub < 16; cySub++) {
          const d000 = grid[base00 + cySub], d001 = grid[base00 + cySub + 1];
          const d100 = grid[base10 + cySub], d101 = grid[base10 + cySub + 1];
          const d010 = grid[base01 + cySub], d011 = grid[base01 + cySub + 1];
          const d110 = grid[base11 + cySub], d111 = grid[base11 + cySub + 1];

          for (let dy = 0; dy < 8; dy++) {
            const y = cySub * 8 + dy;
            const ty = dy * 0.125;
            const c00 = d000 + (d001 - d000) * ty;
            const c10 = d100 + (d101 - d100) * ty;
            const c01 = d010 + (d011 - d010) * ty;
            const c11 = d110 + (d111 - d110) * ty;

            for (let dz = 0; dz < 4; dz++) {
              const z = czSub * 4 + dz;
              const tz = dz * 0.25;
              const c0 = c00 + (c01 - c00) * tz;
              const c1 = c10 + (c11 - c10) * tz;

              for (let dx = 0; dx < 4; dx++) {
                const x = cxSub * 4 + dx;
                const density = c0 + (c1 - c0) * (dx * 0.25);
                const idx = (y * CH + z) * CH + x;
                if (density > 0.02) {
                  blocks[idx] = NETHERRACK;
                } else if (y <= NETHER_LAVA_SEA) {
                  blocks[idx] = LAVA;
                } else {
                  blocks[idx] = AIR;
                }
              }
            }
          }
        }
      }
    }

    // Soul Sand & Gravel surface basins + Bedrock roof & floor
    for (let z = 0; z < CH; z++) {
      const wz = wz0 + z;
      for (let x = 0; x < CH; x++) {
        const wx = wx0 + x;
        const soulPatch = this.soulNoise.noise2(wx * 0.035, wz * 0.035) > 0.16;
        const gravelPatch = this.gravelNoise.noise2(wx * 0.04 + 19, wz * 0.04 - 11) > 0.32;

        for (let y = NETHER_LAVA_SEA - 2; y <= 58; y++) {
          const idx = (y * CH + z) * CH + x;
          const above = ((y + 1) * CH + z) * CH + x;
          if (blocks[idx] === NETHERRACK && blocks[above] === AIR) {
            if (soulPatch) {
              blocks[idx] = SLOW_SAND;
              if (y > 4 && blocks[((y - 1) * CH + z) * CH + x] === NETHERRACK) {
                blocks[((y - 1) * CH + z) * CH + x] = SLOW_SAND;
              }
            } else if (gravelPatch && y <= 38) {
              blocks[idx] = GRAVEL;
            }
          }
        }

        // Guaranteed impenetrable Bedrock floor (y=0) and ceiling (y=127), rough transition 1..4 & 123..126
        blocks[z * CH + x] = BEDROCK;
        blocks[((NETHER_HEIGHT - 1) * CH + z) * CH + x] = BEDROCK;
        for (let y = 1; y <= 4; y++) {
          if (colHash(this.seed, wx, y, wz) * 5 > y) blocks[(y * CH + z) * CH + x] = BEDROCK;
        }
        for (let y = NETHER_HEIGHT - 5; y < NETHER_HEIGHT - 1; y++) {
          const distFromTop = (NETHER_HEIGHT - 1) - y;
          if (colHash(this.seed, wx, y + 200, wz) * 5 > distFromTop) blocks[(y * CH + z) * CH + x] = BEDROCK;
        }
      }
    }

    // Nether Quartz Ore veins (abundant across y=10..116)
    for (let v = 0; v < 16; v++) {
      let vx = Math.floor(colHash(this.seed, cx, v * 3, cz) * 14) + 1;
      let vy = 10 + Math.floor(colHash(this.seed, cx, v * 3 + 1, cz) * 106);
      let vz = Math.floor(colHash(this.seed, cx, v * 3 + 2, cz) * 14) + 1;
      for (let step = 0; step < 7; step++) {
        if (vx >= 0 && vx < CH && vz >= 0 && vz < CH && vy >= 5 && vy < 122) {
          const idx = (vy * CH + vz) * CH + vx;
          if (blocks[idx] === NETHERRACK) blocks[idx] = QUARTZ_ORE;
        }
        vx += Math.floor(colHash(this.seed, cx + step, v, cz) * 3) - 1;
        vy += Math.floor(colHash(this.seed, cx, v + step, cz) * 3) - 1;
        vz += Math.floor(colHash(this.seed, cx, v, cz + step) * 3) - 1;
      }
    }

    // Hanging Glowstone clusters under Netherrack ceilings
    for (let g = 0; g < 10; g++) {
      const gx = 2 + Math.floor(colHash(this.seed + 71, cx, g, cz) * 12);
      const gz = 2 + Math.floor(colHash(this.seed + 73, cx, g, cz) * 12);
      for (let y = 118; y >= 45; y--) {
        const idx = (y * CH + gz) * CH + gx;
        const above = ((y + 1) * CH + gz) * CH + gx;
        if (blocks[idx] === AIR && blocks[above] === NETHERRACK) {
          blocks[idx] = GLOWSTONE;
          for (let c = 0; c < 12; c++) {
            const ox = gx + Math.floor(colHash(this.seed + c * 13, cx + g, y, cz) * 3) - 1;
            const oy = y - Math.floor(colHash(this.seed + c * 17, cx, y + g, cz) * 3);
            const oz = gz + Math.floor(colHash(this.seed + c * 19, cx, y, cz + g) * 3) - 1;
            if (ox >= 0 && ox < CH && oz >= 0 && oz < CH && oy > NETHER_LAVA_SEA + 2) {
              const cIdx = (oy * CH + oz) * CH + ox;
              if (blocks[cIdx] === AIR) blocks[cIdx] = GLOWSTONE;
            }
          }
          break;
        }
      }
    }

    // Cavern mushrooms
    for (let m = 0; m < 6; m++) {
      const mx = Math.floor(colHash(this.seed + 301, cx, m, cz) * CH);
      const mz = Math.floor(colHash(this.seed + 307, cx, m, cz) * CH);
      const mushroomId = (m & 1) ? MUSHROOM_RED : MUSHROOM_BROWN;
      for (let y = 34; y < 105; y++) {
        const idx = (y * CH + mz) * CH + mx;
        const below = ((y - 1) * CH + mz) * CH + mx;
        if (blocks[idx] === AIR && (blocks[below] === NETHERRACK || blocks[below] === SLOW_SAND)) {
          blocks[idx] = mushroomId;
          break;
        }
      }
    }

    // Nether Fortress bridges, battlements, stairs, and support piers
    if (this.isFortressZone(cx, cz)) {
      this._buildFortressSegment(chunk);
    }

    chunk.generated = true;
  }

  decorate(_world, chunk) {
    chunk.decorated = true;
  }

  _buildFortressSegment(chunk) {
    const { cx, cz } = chunk;
    const deckY = 54;
    const alongX = this.isFortressZone(cx - 1, cz) || this.isFortressZone(cx + 1, cz);
    const alongZ = this.isFortressZone(cx, cz - 1) || this.isFortressZone(cx, cz + 1);
    const isCrossing = alongX && alongZ;

    const carveAndFloor = (x0, z0, x1, z1) => {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          for (let y = deckY - 2; y <= deckY; y++) chunk.set(x, y, z, NETHER_BRICK);
          for (let y = deckY + 1; y <= deckY + 5; y++) chunk.set(x, y, z, AIR);
        }
      }
    };

    if (alongX || !alongZ) {
      carveAndFloor(0, 5, 15, 10);
      for (let x = 0; x < 16; x++) {
        chunk.set(x, deckY + 1, 5, NETHER_BRICK);
        chunk.set(x, deckY + 1, 10, NETHER_BRICK);
        if (x % 2 === 0) {
          chunk.set(x, deckY + 2, 5, NETHER_BRICK_FENCE);
          chunk.set(x, deckY + 2, 10, NETHER_BRICK_FENCE);
        }
      }
    }
    if (alongZ) {
      carveAndFloor(5, 0, 10, 15);
      for (let z = 0; z < 16; z++) {
        chunk.set(5, deckY + 1, z, NETHER_BRICK);
        chunk.set(10, deckY + 1, z, NETHER_BRICK);
        if (z % 2 === 0) {
          chunk.set(5, deckY + 2, z, NETHER_BRICK_FENCE);
          chunk.set(10, deckY + 2, z, NETHER_BRICK_FENCE);
        }
      }
    }

    if (isCrossing) {
      // Fortress keep tower & Blaze dais at bridge intersections
      carveAndFloor(3, 3, 12, 12);
      for (let i = 3; i <= 12; i++) {
        chunk.set(i, deckY + 1, 3, NETHER_BRICK);
        chunk.set(i, deckY + 1, 12, NETHER_BRICK);
        chunk.set(3, deckY + 1, i, NETHER_BRICK);
        chunk.set(12, deckY + 1, i, NETHER_BRICK);
        if (i >= 6 && i <= 9) {
          // Open archways onto the 4 bridges
          if (alongZ) { chunk.set(i, deckY + 1, 3, AIR); chunk.set(i, deckY + 1, 12, AIR); }
          if (alongX) { chunk.set(3, deckY + 1, i, AIR); chunk.set(12, deckY + 1, i, AIR); }
        }
      }
      // Raised Blaze platform with stairs
      for (let z = 6; z <= 9; z++) {
        for (let x = 6; x <= 9; x++) chunk.set(x, deckY + 1, z, NETHER_BRICK);
      }
      chunk.set(7, deckY + 1, 5, NETHER_BRICK_STAIRS, 1);
      chunk.set(8, deckY + 1, 5, NETHER_BRICK_STAIRS, 1);
      chunk.set(6, deckY + 2, 6, NETHER_BRICK_FENCE);
      chunk.set(9, deckY + 2, 6, NETHER_BRICK_FENCE);
      chunk.set(6, deckY + 2, 9, NETHER_BRICK_FENCE);
      chunk.set(9, deckY + 2, 9, NETHER_BRICK_FENCE);
    }

    // Support piers down through lava/air into solid Netherrack
    for (const [px, pz] of [[6, 6], [9, 6], [6, 9], [9, 9]]) {
      for (let y = deckY - 3; y >= 4; y--) {
        const existing = chunk.get(px, y, pz);
        if (existing === BEDROCK) break;
        chunk.set(px, y, pz, NETHER_BRICK);
        if (y < NETHER_LAVA_SEA - 2 && existing === NETHERRACK) break;
      }
    }
  }
}
