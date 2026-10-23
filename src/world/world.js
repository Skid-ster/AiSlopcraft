// World manager: chunk loading, block access, lighting propagation (beta-style).
import { Chunk, CH, WORLD_H, SEA_LEVEL } from './chunk.js';
import { WorldGen } from './worldgen.js';
import { AIR, WATER, LAVA, ICE, getBlock, LEAVES, WOOD_DOOR, IRON_DOOR } from './blocks.js';

export class World {
  constructor(seed, scene) {
    this.seed = seed;
    this.scene = scene;
    this.gen = new WorldGen(seed);
    this.chunks = new Map(); // "cx,cz" -> Chunk
    this.edits = new Map();  // player block edits "x,y,z" -> id
    this.metaEdits = new Map(); // player block metadata "x,y,z" -> meta
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
    const wasDecorated = c.decorated;
    if (!c.generated) {
      this.gen.fillChunk(c);
    }
    this.gen.decorate(this, c);
    if (!wasDecorated && this.edits.size > 0) {
      // Replay player edits AFTER decoration so chopped trees / dug terrain stay edited
      const x0 = cx * CH, z0 = cz * CH;
      for (const [k, id] of this.edits) {
        const p = k.split(',');
        const x = +p[0], y = +p[1], z = +p[2];
        if (x >= x0 && x < x0 + CH && z >= z0 && z < z0 + CH) {
          const m = this.metaEdits.get(k) || 0;
          c.set(x - x0, y, z - z0, id, m);
        }
      }
    }
    this.computeLight(c);
    if (!wasDecorated) {
      // Refresh already-meshed neighbors so cross-chunk light blends seamlessly
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nc = this.getChunk(cx + dx, cz + dz);
        if (nc && nc.generated && nc.decorated) {
          this.computeLight(nc);
          if (nc.meshes) nc.dirty = true;
        }
      }
    }
    return c;
  }

  // Generation-time block access (may touch not-yet-lit chunks)
  getBlockGen(x, y, z) {
    if (y < 0 || y >= WORLD_H) return AIR;
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    const c = this.getChunk(cx, cz);
    if (!c) {
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

  getMeta(x, y, z) {
    if (y < 0 || y >= WORLD_H) return 0;
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    const c = this.chunks.get(this.key(cx, cz));
    if (!c || !c.generated) return 0;
    return c.getMeta(x - cx * CH, y, z - cz * CH);
  }

  setMeta(x, y, z, meta) {
    if (y < 0 || y >= WORLD_H) return false;
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    const c = this.chunks.get(this.key(cx, cz));
    if (!c || !c.generated) return false;
    const lx = x - cx * CH, lz = z - cz * CH;
    c.setMeta(lx, y, lz, meta);
    const k = x + ',' + y + ',' + z;
    if (meta) this.metaEdits.set(k, meta);
    else this.metaEdits.delete(k);
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CH - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CH - 1) this.markDirty(cx, cz + 1);
    return true;
  }

  isSolidAt(x, y, z) {
    const id = this.getBlock(x, y, z);
    if (id === AIR) return false;
    if (id === WOOD_DOOR || id === IRON_DOOR) {
      // Open doors (bit 4) let entities pass through!
      return (this.getMeta(x, y, z) & 4) === 0;
    }
    return getBlock(id).solid;
  }

  setBlock(x, y, z, id, meta = 0) {
    if (y < 0 || y >= WORLD_H) return false;
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    const c = this.chunks.get(this.key(cx, cz));
    if (!c || !c.generated) return false;
    const lx = x - cx * CH, lz = z - cz * CH;
    const prevId = c.get(lx, y, lz);
    c.set(lx, y, lz, id, meta);
    const k = x + ',' + y + ',' + z;
    this.edits.set(k, id);
    if (meta) this.metaEdits.set(k, meta);
    else this.metaEdits.delete(k);

    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CH - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CH - 1) this.markDirty(cx, cz + 1);

    this.computeLight(c);

    // Propagate light updates into nearby chunks when light/opacity changes
    const lightChanged = getBlock(prevId).light !== getBlock(id).light ||
      getBlock(prevId).opaque !== getBlock(id).opaque;
    if (lightChanged) {
      const neighbors = [];
      if (lx < 14) neighbors.push([cx - 1, cz]);
      if (lx > CH - 15) neighbors.push([cx + 1, cz]);
      if (lz < 14) neighbors.push([cx, cz - 1]);
      if (lz > CH - 15) neighbors.push([cx, cz + 1]);
      for (const [ncx, ncz] of neighbors) {
        const nc = this.getChunk(ncx, ncz);
        if (nc && nc.generated) {
          this.computeLight(nc);
          nc.dirty = true;
        }
      }
      // Second pass on home chunk if neighbor bounce-back matters
      if (neighbors.length > 0) this.computeLight(c);
    }
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

  // Sky + block light for one chunk, consulting adjacent generated chunks at borders.
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

    // --- seed border light from already-generated cardinal neighbors ---
    const cWest = this.getChunk(chunk.cx - 1, chunk.cz);
    const cEast = this.getChunk(chunk.cx + 1, chunk.cz);
    const cNorth = this.getChunk(chunk.cx, chunk.cz - 1);
    const cSouth = this.getChunk(chunk.cx, chunk.cz + 1);

    const seedFromNeighbor = (x, y, z, nSky, nBlk) => {
      const i = idx(x, y, z);
      const b = B[i];
      const def = getBlock(b);
      if (def.opaque) return;
      const extra = (b === WATER || b === ICE || b === LEAVES) ? 1 : 0;
      const sVal = nSky - 1 - extra;
      if (sVal > sky[i]) {
        sky[i] = sVal;
        if (sVal > 1) q.push(x, y, z, sVal);
      }
      const bVal = nBlk - 1 - extra;
      if (bVal > bl[i]) {
        bl[i] = bVal;
        if (bVal > 1) q2.push(x, y, z, bVal);
      }
    };

    if (cWest?.generated) {
      for (let y = 0; y < WORLD_H; y++) for (let z = 0; z < CH; z++) {
        const ni = idx(CH - 1, y, z);
        if (cWest.skyLight[ni] > 1 || cWest.blockLight[ni] > 1) {
          seedFromNeighbor(0, y, z, cWest.skyLight[ni], cWest.blockLight[ni]);
        }
      }
    }
    if (cEast?.generated) {
      for (let y = 0; y < WORLD_H; y++) for (let z = 0; z < CH; z++) {
        const ni = idx(0, y, z);
        if (cEast.skyLight[ni] > 1 || cEast.blockLight[ni] > 1) {
          seedFromNeighbor(CH - 1, y, z, cEast.skyLight[ni], cEast.blockLight[ni]);
        }
      }
    }
    if (cNorth?.generated) {
      for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < CH; x++) {
        const ni = idx(x, y, CH - 1);
        if (cNorth.skyLight[ni] > 1 || cNorth.blockLight[ni] > 1) {
          seedFromNeighbor(x, y, 0, cNorth.skyLight[ni], cNorth.blockLight[ni]);
        }
      }
    }
    if (cSouth?.generated) {
      for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < CH; x++) {
        const ni = idx(x, y, 0);
        if (cSouth.skyLight[ni] > 1 || cSouth.blockLight[ni] > 1) {
          seedFromNeighbor(x, y, CH - 1, cSouth.skyLight[ni], cSouth.blockLight[ni]);
        }
      }
    }

    this.spread(chunk, q, sky, true);
    this.spread(chunk, q2, bl, false);
  }

  spread(chunk, queue, lightArr, isSky) {
    const idx = (x, y, z) => (y * CH + z) * CH + x;
    const B = chunk.blocks;
    let head = 0;
    while (head < queue.length) {
      const x = queue[head++], y = queue[head++], z = queue[head++], l = queue[head++];
      if (l <= 1) continue;
      if (lightArr[idx(x, y, z)] > l) continue;
      const nl = l - 1;
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
        if (b === WATER || b === ICE) falloff -= 1;
        if (b === LEAVES) falloff -= 1;
        if (falloff <= lightArr[ni]) continue;
        lightArr[ni] = falloff;
        if (falloff > 1) queue.push(nx, ny, nz, falloff);
      }
    }
  }

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
