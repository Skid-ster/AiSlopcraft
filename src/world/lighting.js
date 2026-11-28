// Incremental, cross-chunk voxel lighting. Sky and emitted light are independent
// 0..15 channels. Removal uses a flood-fill of stale light followed by a re-add
// pass from surviving sources, so breaking a torch never leaves a bright ghost.
import { CH } from './chunk.js';
import {
  WATER, WATER_FLOW, ICE, LEAVES, WOOD_DOOR, IRON_DOOR, REDSTONE_TORCH,
  STONE_SLAB, CHEST, FARMLAND, OAK_STAIRS, COBBLESTONE_STAIRS, NETHER_BRICK_STAIRS, ENCHANTING_TABLE,
  BLOCK_OPAQUE, BLOCK_LIGHT,
} from './blocks.js';

const DIRS = [[0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0]];
const idx = (x, y, z) => (y * CH + z) * CH + x;

const BASE_FILTER = new Uint8Array(256);
BASE_FILTER[WATER] = 2;
BASE_FILTER[WATER_FLOW] = 2;
BASE_FILTER[ICE] = 2;
BASE_FILTER[LEAVES] = 1;
BASE_FILTER[STONE_SLAB] = 2;
BASE_FILTER[CHEST] = 2;
BASE_FILTER[FARMLAND] = 15;
BASE_FILTER[OAK_STAIRS] = 2;
BASE_FILTER[COBBLESTONE_STAIRS] = 2;
BASE_FILTER[NETHER_BRICK_STAIRS] = 2;
BASE_FILTER[ENCHANTING_TABLE] = 2;

const BASE_OPACITY = new Uint8Array(256);
for (let id = 0; id < 256; id++) {
  BASE_OPACITY[id] = BLOCK_OPAQUE[id] ? 15 : BASE_FILTER[id];
}

// Attenuation is applied once, on entry to a cell. Zero-opacity blocks (glass,
// plants, open doors) do not darken light; closed doors block the voxel column.
export function lightFilter(id, meta = 0) {
  if (id === WOOD_DOOR || id === IRON_DOOR) return (meta & 4) === 0 ? 15 : 0;
  return BASE_FILTER[id] || 0;
}

export function lightEmission(id, meta = 0) {
  return id === REDSTONE_TORCH && (meta & 8) ? 0 : (BLOCK_LIGHT[id] || 0);
}

export function lightOpacity(id, meta = 0) {
  if (id === WOOD_DOOR || id === IRON_DOOR) return (meta & 4) === 0 ? 15 : 0;
  return BASE_OPACITY[id] || 0;
}

export class WorldLighting {
  constructor(world) {
    this.world = world;
    this.touched = new Set();
    this.depth = 0;
  }

  cell(x, y, z) {
    if (y < 0 || y >= this.world.height) return null;
    const cx = x >> 4, cz = z >> 4;
    const chunk = this.world.getChunk(cx, cz);
    if (!chunk?.generated || !chunk.lightingReady) return null;
    return { chunk, i: idx(x & 15, y, z & 15) };
  }

  _chunkAt(cx, cz) {
    const chunk = this.world.getChunk(cx, cz);
    return (chunk?.generated && chunk.lightingReady) ? chunk : null;
  }

  get(x, y, z, sky) {
    if (y < 0 || y >= this.world.height) return 0;
    const chunk = this._chunkAt(x >> 4, z >> 4);
    if (!chunk) return 0;
    const i = idx(x & 15, y, z & 15);
    return (sky ? chunk.skyLight : chunk.blockLight)[i];
  }

  set(x, y, z, sky, value) {
    if (y < 0 || y >= this.world.height) return false;
    const chunk = this._chunkAt(x >> 4, z >> 4);
    if (!chunk) return false;
    const i = idx(x & 15, y, z & 15);
    const arr = sky ? chunk.skyLight : chunk.blockLight;
    if (arr[i] === value) return false;
    arr[i] = value;
    this.touched.add(chunk);
    return true;
  }

  opacity(x, y, z) {
    if (y < 0 || y >= this.world.height) return 15;
    const chunk = this._chunkAt(x >> 4, z >> 4);
    if (!chunk) return 15; // unloaded space is not a light source
    const i = idx(x & 15, y, z & 15);
    return lightOpacity(chunk.blocks[i], chunk.meta[i]);
  }

  // Seed a newly loaded chunk from its columns, emitters, and every loaded
  // border. The queues are world-space, so light can continue through neighbors
  // (including around corners) instead of stopping at a chunk-local array.
  addChunk(chunk) {
    if (chunk.lightingReady) return;
    chunk.lightingReady = true;
    const skyQ = [], blockQ = [];
    const x0 = chunk.cx * CH, z0 = chunk.cz * CH;
    const h = chunk.height;
    const blocks = chunk.blocks, meta = chunk.meta;
    const skyLight = chunk.skyLight, blockLight = chunk.blockLight;
    let maxDarkY = -1;

    const isNether = this.world.dimension === 'nether';
    for (let z = 0; z < CH; z++) for (let x = 0; x < CH; x++) {
      let light = isNether ? 0 : 15;
      for (let y = h - 1; y >= 0; y--) {
        const i = (y * CH + z) * CH + x;
        const id = blocks[i];
        if (id !== 0) {
          const m = meta[i];
          const opacity = (id === WOOD_DOOR || id === IRON_DOOR) ? ((m & 4) === 0 ? 15 : 0) : BASE_OPACITY[id];
          const filter = (id === WOOD_DOOR || id === IRON_DOOR) ? opacity : BASE_FILTER[id];
          if (opacity >= 15) light = 0;
          else if (filter > 0) light = Math.max(0, light - filter);
          const emission = id === REDSTONE_TORCH && (m & 8) ? 0 : BLOCK_LIGHT[id];
          blockLight[i] = emission;
          if (emission > 0) blockQ.push(x0 + x, y, z0 + z, emission);
        } else {
          blockLight[i] = 0;
        }
        skyLight[i] = light;
        if (light < 15 && y > maxDarkY) maxDarkY = y;
      }
    }
    // Vertical sunlight is already settled. Seed only the horizontal frontier
    // where it can spread, not every full-bright voxel in 190 layers of air.
    const scanMaxY = Math.min(h - 1, maxDarkY + 1);
    for (let y = 0; y <= scanMaxY; y++) {
      const yOff = y * CH * CH;
      for (let z = 0; z < CH; z++) {
        const zOff = yOff + z * CH;
        for (let x = 0; x < CH; x++) {
          const i = zOff + x, s = skyLight[i];
          if (s <= 1) continue;
          const threshold = s - 1;
          if ((x > 0 && skyLight[i - 1] < threshold && lightOpacity(blocks[i - 1], meta[i - 1]) < 15)
            || (x < CH - 1 && skyLight[i + 1] < threshold && lightOpacity(blocks[i + 1], meta[i + 1]) < 15)
            || (z > 0 && skyLight[i - CH] < threshold && lightOpacity(blocks[i - CH], meta[i - CH]) < 15)
            || (z < CH - 1 && skyLight[i + CH] < threshold && lightOpacity(blocks[i + CH], meta[i + CH]) < 15)) {
            skyQ.push(x0 + x, y, z0 + z, s);
          }
        }
      }
    }
    this.touched.add(chunk);
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const neighbor = this.world.getChunk(chunk.cx + dx, chunk.cz + dz);
      if (!neighbor?.lightingReady) continue;
      const nBlocks = neighbor.blocks, nMeta = neighbor.meta;
      const nSky = neighbor.skyLight, nBlk = neighbor.blockLight;
      for (let y = 0; y < h; y++) for (let t = 0; t < CH; t++) {
        const x = dx === -1 ? 0 : dx === 1 ? CH - 1 : t;
        const z = dz === -1 ? 0 : dz === 1 ? CH - 1 : t;
        const nx = dx === -1 ? CH - 1 : dx === 1 ? 0 : x;
        const nz = dz === -1 ? CH - 1 : dz === 1 ? 0 : z;
        const ni = (y * CH + nz) * CH + nx;
        const i = (y * CH + z) * CH + x;
        if (skyLight[i] > nSky[ni] + 1 && lightOpacity(nBlocks[ni], nMeta[ni]) < 15) {
          skyQ.push(x0 + x, y, z0 + z, skyLight[i]);
        }
        if (lightOpacity(blocks[i], meta[i]) >= 15) continue;
        const filter = lightFilter(blocks[i], meta[i]);
        const cost = filter > 1 ? filter : 1;
        const s = nSky[ni] - cost;
        const b = nBlk[ni] - cost;
        if (s > skyLight[i]) { skyLight[i] = s; skyQ.push(x0 + x, y, z0 + z, s); }
        if (b > blockLight[i]) { blockLight[i] = b; blockQ.push(x0 + x, y, z0 + z, b); }
      }
    }
    this.depth++;
    this.add(skyQ, true);
    this.add(blockQ, false);
    this.depth--;
    this.finish();
  }

  add(queue, sky) {
    const world = this.world;
    const maxH = world.height;
    let lastCX = 0x7fffffff, lastCZ = 0x7fffffff, lastChunk = null;
    for (let h = 0; h < queue.length; h += 4) {
      const x = queue[h], y = queue[h + 1], z = queue[h + 2], level = queue[h + 3];
      if (level <= 0 || y < 0 || y >= maxH) continue;
      let cx = x >> 4, cz = z >> 4;
      if (cx !== lastCX || cz !== lastCZ) {
        lastCX = cx; lastCZ = cz;
        const c = world.getChunk(cx, cz);
        lastChunk = (c?.generated && c.lightingReady) ? c : null;
      }
      if (!lastChunk) continue;
      const curArr = sky ? lastChunk.skyLight : lastChunk.blockLight;
      if (curArr[(y * CH + (z & 15)) * CH + (x & 15)] < level) continue;

      for (let d = 0; d < 6; d++) {
        const dir = DIRS[d];
        const nx = x + dir[0], ny = y + dir[1], nz = z + dir[2];
        if (ny < 0 || ny >= maxH) continue;
        const ncx = nx >> 4, ncz = nz >> 4;
        let nChunk;
        if (ncx === lastCX && ncz === lastCZ) {
          nChunk = lastChunk;
        } else {
          nChunk = world.getChunk(ncx, ncz);
          if (!nChunk?.generated || !nChunk.lightingReady) continue;
        }
        const ni = (ny * CH + (nz & 15)) * CH + (nx & 15);
        const nid = nChunk.blocks[ni];
        const nmeta = nChunk.meta[ni];
        const opacity = (nid === WOOD_DOOR || nid === IRON_DOOR) ? ((nmeta & 4) === 0 ? 15 : 0) : BASE_OPACITY[nid];
        if (opacity >= 15) continue;
        const filter = (nid === WOOD_DOOR || nid === IRON_DOOR) ? opacity : BASE_FILTER[nid];
        // Direct vertical sunlight survives an arbitrary air column. Scattered
        // horizontal skylight and all torch light still lose one level/block.
        const next = sky && d === 1 && level === 15 && filter === 0 ? 15 : level - (filter > 1 ? filter : 1);
        const arr = sky ? nChunk.skyLight : nChunk.blockLight;
        if (next <= arr[ni]) continue;
        arr[ni] = next;
        this.touched.add(nChunk);
        if (next > 1) queue.push(nx, ny, nz, next);
      }
    }
  }

  remove(queue, sky, additions) {
    const world = this.world;
    const maxH = world.height;
    const maxWorldY = world.maxWorldY;
    let lastCX = 0x7fffffff, lastCZ = 0x7fffffff, lastChunk = null;
    for (let h = 0; h < queue.length; h += 4) {
      const x = queue[h], y = queue[h + 1], z = queue[h + 2], level = queue[h + 3];
      for (let d = 0; d < 6; d++) {
        const dir = DIRS[d];
        const nx = x + dir[0], ny = y + dir[1], nz = z + dir[2];
        if (ny < 0 || ny >= maxH) continue;
        const ncx = nx >> 4, ncz = nz >> 4;
        if (ncx !== lastCX || ncz !== lastCZ) {
          lastCX = ncx; lastCZ = ncz;
          const c = world.getChunk(ncx, ncz);
          lastChunk = (c?.generated && c.lightingReady) ? c : null;
        }
        if (!lastChunk) continue;
        const ni = (ny * CH + (nz & 15)) * CH + (nx & 15);
        const arr = sky ? lastChunk.skyLight : lastChunk.blockLight;
        const neighbor = arr[ni];
        if (neighbor <= 0) continue;
        if (sky && ny === maxWorldY) {
          // Independent of adjacent blocks: the sky directly feeds this plane.
          additions.push(nx, ny, nz, neighbor);
          continue;
        }
        const nid = lastChunk.blocks[ni];
        const opacity = (nid === WOOD_DOOR || nid === IRON_DOOR) ? ((lastChunk.meta[ni] & 4) === 0 ? 15 : 0) : BASE_OPACITY[nid];
        const sunColumn = sky && d === 1 && level === 15 && neighbor === 15 && opacity === 0;
        if (neighbor < level || sunColumn) {
          arr[ni] = 0;
          this.touched.add(lastChunk);
          queue.push(nx, ny, nz, neighbor);
        } else {
          additions.push(nx, ny, nz, neighbor);
        }
      }
    }
  }

  seedNeighbors(x, y, z, skyQ, blockQ) {
    for (const [dx, dy, dz] of DIRS) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      const s = this.get(nx, ny, nz, true), b = this.get(nx, ny, nz, false);
      if (s > 0) skyQ.push(nx, ny, nz, s);
      if (b > 0) blockQ.push(nx, ny, nz, b);
    }
    const c = this.cell(x, y, z);
    if (!c) return;
    const emission = lightEmission(c.chunk.blocks[c.i], c.chunk.meta[c.i]);
    if (emission > 0) blockQ.push(x, y, z, emission);
    const above = this.get(x, y + 1, z, true);
    if (above > 0) skyQ.push(x, y + 1, z, above);
  }

  blockChanged(x, y, z, previousId, previousMeta = 0) {
    const c = this.cell(x, y, z);
    if (!c) return;
    const id = c.chunk.blocks[c.i], meta = c.chunk.meta[c.i];
    const oldOpacity = lightOpacity(previousId, previousMeta);
    const newOpacity = lightOpacity(id, meta);
    const oldEmission = lightEmission(previousId, previousMeta);
    const emission = lightEmission(id, meta);
    const skyQ = [], blockQ = [];
    this.depth++;
    const isNether = this.world.dimension === 'nether';
    for (const sky of [true, false]) {
      if (sky && isNether) continue;
      const old = this.get(x, y, z, sky);
      const opacityChanged = newOpacity !== oldOpacity;
      const next = sky ? (y === c.chunk.height - 1 ? Math.max(0, 15 - newOpacity) : newOpacity >= 15 || opacityChanged ? 0 : old)
        : (emission > 0 ? emission : (opacityChanged || oldEmission > 0 ? 0 : old));
      this.set(x, y, z, sky, next);
      if (old > 0 && (opacityChanged || (!sky && emission < old))) {
        this.remove([x, y, z, old], sky, sky ? skyQ : blockQ);
      }
      if (sky && next > 0) skyQ.push(x, y, z, next);
    }
    this.seedNeighbors(x, y, z, skyQ, blockQ);
    this.add(skyQ, true);
    this.add(blockQ, false);
    this.depth--;
    this.finish();
  }

  // Called after a chunk is removed. Boundary cells are treated as potentially
  // stale; the removal walk clears only light that depended on the old chunk,
  // then surviving internal sources immediately illuminate it again.
  chunkRemoved(chunk) {
    const skyQ = [], blockQ = [], skyAdd = [], blockAdd = [];
    this.depth++;
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const neighbor = this.world.getChunk(chunk.cx + dx, chunk.cz + dz);
      if (!neighbor?.lightingReady) continue;
      for (let y = 0; y < chunk.height; y++) for (let t = 0; t < CH; t++) {
        const x = dx === -1 ? CH - 1 : dx === 1 ? 0 : t;
        const z = dz === -1 ? CH - 1 : dz === 1 ? 0 : t;
        const wx = neighbor.cx * CH + x, wz = neighbor.cz * CH + z;
        const s = this.get(wx, y, wz, true), b = this.get(wx, y, wz, false);
        if (s === 15 || y === chunk.height - 1) {
          if (s > 0) skyAdd.push(wx, y, wz, s);
        } else if (s > 0) { this.set(wx, y, wz, true, 0); skyQ.push(wx, y, wz, s); }
        if (b > 0) { this.set(wx, y, wz, false, 0); blockQ.push(wx, y, wz, b); }
      }
    }
    this.remove(skyQ, true, skyAdd);
    this.remove(blockQ, false, blockAdd);
    this.add(skyAdd, true);
    this.add(blockAdd, false);
    this.depth--;
    this.finish();
  }

  finish() {
    if (this.depth) return;
    // Rebuild a mesh when its own light OR a sampled border/corner cell changed.
    // Smooth AO/light in mesher.js samples all 8 surrounding chunks (including diagonals).
    const dirty = new Set(this.touched);
    for (const chunk of this.touched) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const n = this.world.getChunk(chunk.cx + dx, chunk.cz + dz);
          if (n?.meshes) dirty.add(n);
        }
      }
    }
    for (const chunk of dirty) chunk.dirty = true;
    this.touched.clear();
  }
}
