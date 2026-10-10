// World manager: chunk loading, block access, lighting propagation (beta-style).
import { Chunk, CH, WORLD_H, SEA_LEVEL } from './chunk.js';
import { WorldGen } from './worldgen.js';
import { AIR, WATER, LAVA, ICE, getBlock, TORCH, GLOWSTONE, LEAVES } from './blocks.js';

export class World {
  constructor(seed, scene) {
    this.seed = seed;
    this.scene = scene;
    this.gen = new WorldGen(seed);
    this.chunks = new Map(); // "cx,cz" -> Chunk
    this.edits = new Map();  // player block edits "x,y,z" -> id
  }

  key(cx, cz) { return cx + ',' + cz; }

  getChunk(cx, cz) {
    return this.chunks.get(this.key(cx, cz)) || null;
  }

  ensureChunk(cx, cz) {
    const k = this.key(cx, cz);
    let c = this.chunks.get(k);
    if (!c) {
      c = new Chunk(cx, cz);
      this.chunks.set(k, c);
    }
    return c;
  }

  generateChunk(cx, cz) {
    const c = this.ensureChunk(cx, cz);
    if (!c.generated) {
      this.gen.fillChunk(c);
      // replay player edits that touch this chunk
      if (this.edits.size > 0) {
        const x0 = cx * CH, z0 = cz * CH;
        for (const [k, id] of this.edits) {
          const p = k.split(',');
          const x = +p[0], y = +p[1], z = +p[2];
          if (x >= x0 && x < x0 + CH && z >= z0 && z < z0 + CH) {
            c.set(x - x0, y, z - z0, id);
          }
        }
      }
    }
    this.gen.decorate(this, c);
    this.computeLight(c);
    return c;
  }

  // Generation-time block access (may touch not-yet-lit chunks)
  getBlockGen(x, y, z) {
    if (y < 0 || y >= WORLD_H) return AIR;
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    const c = this.getChunk(cx, cz);
    if (!c) {
      // generate on demand for decoration queries
      const nc = this.ensureChunk(cx, cz);
      if (!nc.generated) this.gen.fillChunk(nc);
      return nc.get(x - cx * CH, y, z - cz * CH);
    }
    return c.get(x - cx * CH, y, z - cz * CH);
  }

  setBlockGen(x, y, z, id) {
    if (y < 0 || y >= WORLD_H) return;
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    const c = this.ensureChunk(cx, cz);
    if (!c.generated) this.gen.fillChunk(c);
    c.set(x - cx * CH, y, z - cz * CH, id);
    // mark neighbors dirty if on the border
    const lx = x - cx * CH, lz = z - cz * CH;
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CH - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CH - 1) this.markDirty(cx, cz + 1);
  }

  markDirty(cx, cz) {
    const c = this.getChunk(cx, cz);
    if (c) c.dirty = true;
  }

  getBlock(x, y, z) {
    if (y < 0 || y >= WORLD_H) return AIR;
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    const c = this.chunks.get(this.key(cx, cz));
    if (!c || !c.generated) return AIR;
    return c.get(x - cx * CH, y, z - cz * CH);
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= WORLD_H) return false;
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    const c = this.chunks.get(this.key(cx, cz));
    if (!c || !c.generated) return false;
    c.set(x - cx * CH, y, z - cz * CH, id);
    this.edits.set(x + ',' + y + ',' + z, id);
    const lx = x - cx * CH, lz = z - cz * CH;
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CH - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CH - 1) this.markDirty(cx, cz + 1);
    this.computeLight(c);
    return true;
  }

  getLight(x, y, z) {
    if (y >= WORLD_H) return 0xf0;
    if (y < 0) return 0;
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    const c = this.chunks.get(this.key(cx, cz));
    if (!c || !c.generated) return 0xf0;
    return c.getLight(x - cx * CH, y, z - cz * CH);
  }

  // Sky + block light for one chunk. Neighboring chunks already generated are
  // consulted at borders for better continuity.
  computeLight(chunk) {
    const sky = chunk.skyLight, bl = chunk.blockLight, B = chunk.blocks;
    sky.fill(0); bl.fill(0);
    const idx = (x, y, z) => (y * CH + z) * CH + x;

    // --- skylight: column flood-fill downward, then BFS spread ---
    const q = [];
    for (let z = 0; z < CH; z++) {
      for (let x = 0; x < CH; x++) {
        let light = 15;
        for (let y = WORLD_H - 1; y >= 0; y--) {
          const i = idx(x, y, z);
          const b = B[i];
          const def = getBlock(b);
          if (def.opaque) {
            light = 0;
          } else if (b === WATER || b === ICE) {
            light = Math.max(0, light - 1);
          } else if (b === LEAVES) {
            light = Math.max(0, light - 2);
          }
          sky[i] = light;
          if (light > 1) q.push(x, y, z, light);
        }
      }
    }
    this.spread(chunk, q, sky, true);

    // --- block light from light-emitting blocks ---
    const q2 = [];
    for (let y = 0; y < WORLD_H; y++) {
      for (let z = 0; z < CH; z++) {
        for (let x = 0; x < CH; x++) {
          const i = idx(x, y, z);
          const l = getBlock(B[i]).light;
          if (l > 0) {
            bl[i] = l;
            q2.push(x, y, z, l);
          }
        }
      }
    }
    this.spread(chunk, q2, bl, false);
  }

  spread(chunk, queue, lightArr, isSky) {
    const idx = (x, y, z) => (y * CH + z) * CH + x;
    const B = chunk.blocks;
    let head = 0;
    while (head < queue.length) {
      const x = queue[head++], y = queue[head++], z = queue[head++], l = queue[head++];
      if (l <= 1) continue;
      const nl = isSky ? l - 1 : l - 1;
      for (let d = 0; d < 6; d++) {
        const nx = x + (d === 4 ? 1 : d === 5 ? -1 : 0);
        const ny = y + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const nz = z + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (nx < 0 || nx >= CH || nz < 0 || nz >= CH || ny < 0 || ny >= WORLD_H) continue;
        const ni = idx(nx, ny, nz);
        const b = B[ni];
        const def = getBlock(b);
        if (def.opaque) continue;
        let falloff = nl;
        if (isSky && d !== 1) {
          // sky light only drops 1 through air going sideways/up
          falloff = l - 1;
        }
        if (b === WATER || b === ICE) falloff -= 1;
        if (b === LEAVES) falloff -= 1;
        if (falloff <= lightArr[ni]) continue;
        lightArr[ni] = falloff;
        queue.push(nx, ny, nz, falloff);
      }
    }
  }

  // Full-sky flag for a position (is the block exposed to sunlight column)
  isAir(x, y, z) {
    return this.getBlock(x, y, z) === AIR;
  }

  heightAt(x, z) {
    for (let y = WORLD_H - 1; y >= 0; y--) {
      const b = this.getBlock(x, y, z);
      if (b !== AIR && getBlock(b).solid) return y + 1;
    }
    return SEA_LEVEL;
  }
}
