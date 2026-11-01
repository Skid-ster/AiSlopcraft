// Incremental, cross-chunk voxel lighting. Sky and emitted light are independent
// 0..15 channels. Removal uses a flood-fill of stale light followed by a re-add
// pass from surviving sources, so breaking a torch never leaves a bright ghost.
import { CH, WORLD_H } from './chunk.js';
import { AIR, WATER, WATER_FLOW, ICE, LEAVES, WOOD_DOOR, IRON_DOOR, REDSTONE_TORCH, getBlock } from './blocks.js';

const DIRS = [[0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0]];
const idx = (x, y, z) => (y * CH + z) * CH + x;

// Attenuation is applied once, on entry to a cell. Zero-opacity blocks (glass,
// plants, open doors) do not darken light; closed doors block the voxel column.
export function lightFilter(id, meta = 0) {
  if (id === WATER || id === WATER_FLOW || id === ICE) return 2;
  if (id === LEAVES) return 1;
  if ((id === WOOD_DOOR || id === IRON_DOOR) && (meta & 4) === 0) return 15;
  return 0;
}

export function lightEmission(id, meta = 0) {
  return id === REDSTONE_TORCH && (meta & 8) ? 0 : (getBlock(id).light || 0);
}

export function lightOpacity(id, meta = 0) {
  return getBlock(id).opaque ? 15 : lightFilter(id, meta);
}

export class WorldLighting {
  constructor(world) {
    this.world = world;
    this.touched = new Set();
    this.depth = 0;
  }

  cell(x, y, z) {
    if (y < 0 || y >= WORLD_H) return null;
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    const chunk = this.world.getChunk(cx, cz);
    if (!chunk?.generated || !chunk.lightingReady) return null;
    return { chunk, i: idx(x - cx * CH, y, z - cz * CH) };
  }

  get(x, y, z, sky) {
    const c = this.cell(x, y, z);
    return c ? (sky ? c.chunk.skyLight : c.chunk.blockLight)[c.i] : 0;
  }

  set(x, y, z, sky, value) {
    const c = this.cell(x, y, z);
    if (!c) return false;
    const arr = sky ? c.chunk.skyLight : c.chunk.blockLight;
    if (arr[c.i] === value) return false;
    arr[c.i] = value;
    this.touched.add(c.chunk);
    return true;
  }

  opacity(x, y, z) {
    const c = this.cell(x, y, z);
    if (!c) return 15; // unloaded space is not a light source
    return lightOpacity(c.chunk.blocks[c.i], c.chunk.meta[c.i]);
  }

  // Seed a newly loaded chunk from its columns, emitters, and every loaded
  // border. The queues are world-space, so light can continue through neighbors
  // (including around corners) instead of stopping at a chunk-local array.
  addChunk(chunk) {
    if (chunk.lightingReady) return;
    chunk.lightingReady = true;
    const skyQ = [], blockQ = [];
    const x0 = chunk.cx * CH, z0 = chunk.cz * CH;
    for (let z = 0; z < CH; z++) for (let x = 0; x < CH; x++) {
      let light = 15;
      for (let y = WORLD_H - 1; y >= 0; y--) {
        const i = idx(x, y, z), id = chunk.blocks[i];
        const opacity = lightOpacity(id, chunk.meta[i]);
        const filter = lightFilter(id, chunk.meta[i]);
        if (opacity >= 15) light = 0;
        else if (filter > 0) light = Math.max(0, light - filter);
        chunk.skyLight[i] = light;
        if (light > 0) skyQ.push(x0 + x, y, z0 + z, light);
        const emission = lightEmission(id, chunk.meta[i]);
        chunk.blockLight[i] = emission;
        if (emission > 0) blockQ.push(x0 + x, y, z0 + z, emission);
      }
    }
    this.touched.add(chunk);
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const neighbor = this.world.getChunk(chunk.cx + dx, chunk.cz + dz);
      if (!neighbor?.lightingReady) continue;
      for (let y = 0; y < WORLD_H; y++) for (let t = 0; t < CH; t++) {
        const x = dx === -1 ? 0 : dx === 1 ? CH - 1 : t;
        const z = dz === -1 ? 0 : dz === 1 ? CH - 1 : t;
        const nx = dx === -1 ? CH - 1 : dx === 1 ? 0 : x;
        const nz = dz === -1 ? CH - 1 : dz === 1 ? 0 : z;
        const ni = idx(nx, y, nz), i = idx(x, y, z);
        if (lightOpacity(chunk.blocks[i], chunk.meta[i]) >= 15) continue;
        const filter = lightFilter(chunk.blocks[i], chunk.meta[i]);
        const cost = Math.max(1, filter);
        const s = neighbor.skyLight[ni] - cost;
        const b = neighbor.blockLight[ni] - cost;
        if (s > chunk.skyLight[i]) { chunk.skyLight[i] = s; skyQ.push(x0 + x, y, z0 + z, s); }
        if (b > chunk.blockLight[i]) { chunk.blockLight[i] = b; blockQ.push(x0 + x, y, z0 + z, b); }
      }
    }
    this.depth++;
    this.add(skyQ, true);
    this.add(blockQ, false);
    this.depth--;
    this.finish();
  }

  add(queue, sky) {
    for (let h = 0; h < queue.length; h += 4) {
      const x = queue[h], y = queue[h + 1], z = queue[h + 2], level = queue[h + 3];
      if (level <= 0 || this.get(x, y, z, sky) < level) continue;
      for (let d = 0; d < 6; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1], nz = z + DIRS[d][2];
        const opacity = this.opacity(nx, ny, nz);
        if (opacity >= 15) continue;
        const c = this.cell(nx, ny, nz);
        const filter = lightFilter(c.chunk.blocks[c.i], c.chunk.meta[c.i]);
        // Direct vertical sunlight survives an arbitrary air column. Scattered
        // horizontal skylight and all torch light still lose one level/block.
        const next = sky && d === 1 && level === 15 && filter === 0 ? 15 : level - Math.max(1, filter);
        const arr = sky ? c.chunk.skyLight : c.chunk.blockLight;
        if (next <= arr[c.i]) continue;
        arr[c.i] = next;
        this.touched.add(c.chunk);
        if (next > 1) queue.push(nx, ny, nz, next);
      }
    }
  }

  remove(queue, sky, additions) {
    for (let h = 0; h < queue.length; h += 4) {
      const x = queue[h], y = queue[h + 1], z = queue[h + 2], level = queue[h + 3];
      for (let d = 0; d < 6; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1], nz = z + DIRS[d][2];
        const neighbor = this.get(nx, ny, nz, sky);
        if (neighbor <= 0) continue;
        const sunColumn = sky && d === 1 && level === 15 && neighbor === 15 && this.opacity(nx, ny, nz) === 0;
        if (neighbor < level || sunColumn) {
          this.set(nx, ny, nz, sky, 0);
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
    for (const sky of [true, false]) {
      const old = this.get(x, y, z, sky);
      const opacityChanged = newOpacity !== oldOpacity;
      const next = sky ? (newOpacity >= 15 || opacityChanged ? 0 : old) : (emission > 0 ? emission : (opacityChanged || oldEmission > 0 ? 0 : old));
      this.set(x, y, z, sky, next);
      if (old > 0 && (opacityChanged || (!sky && emission < old))) {
        const additions = [];
        this.remove([x, y, z, old], sky, additions);
        (sky ? skyQ : blockQ).push(...additions);
      }
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
      for (let y = 0; y < WORLD_H; y++) for (let t = 0; t < CH; t++) {
        const x = dx === -1 ? CH - 1 : dx === 1 ? 0 : t;
        const z = dz === -1 ? CH - 1 : dz === 1 ? 0 : t;
        const wx = neighbor.cx * CH + x, wz = neighbor.cz * CH + z;
        const s = this.get(wx, y, wz, true), b = this.get(wx, y, wz, false);
        if (s > 0) { this.set(wx, y, wz, true, 0); skyQ.push(wx, y, wz, s); }
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
    // Rebuild a mesh when its own light OR a sampled border cell changed.
    const dirty = new Set(this.touched);
    for (const chunk of this.touched) {
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const n = this.world.getChunk(chunk.cx + dx, chunk.cz + dz);
        if (n?.meshes) dirty.add(n);
      }
    }
    for (const chunk of dirty) chunk.dirty = true;
    this.touched.clear();
  }
}
