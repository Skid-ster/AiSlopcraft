// World manager: chunk loading, block access, lighting propagation (beta-style).
import { Chunk, CH, WORLD_H, SEA_LEVEL } from './chunk.js';
import { WorldGen } from './worldgen.js';
import { AIR, WATER, LAVA, ICE, getBlock, LEAVES, WOOD_DOOR, IRON_DOOR } from './blocks.js';
import { WorldLighting, lightOpacity, lightEmission } from './lighting.js';

export class World {
  constructor(seed, scene) {
    this.seed = seed;
    this.scene = scene;
    this.gen = new WorldGen(seed);
    this.chunks = new Map(); // "cx,cz" -> Chunk
    this.edits = new Map();  // player block edits "x,y,z" -> id
    this.metaEdits = new Map(); // player block metadata "x,y,z" -> meta
    this.editsByChunk = new Map(); // avoid scanning the entire save on every chunk load
    this.lighting = new WorldLighting(this);
    this.blockListeners = new Set();
    this.chunkListeners = new Set();
    this.unloadListeners = new Set();
  }

  onBlockChange(fn) { this.blockListeners.add(fn); return () => this.blockListeners.delete(fn); }
  onChunkLoad(fn) { this.chunkListeners.add(fn); return () => this.chunkListeners.delete(fn); }
  onChunkUnload(fn) { this.unloadListeners.add(fn); return () => this.unloadListeners.delete(fn); }
  unloadChunk(cx, cz) {
    const k = this.key(cx, cz), chunk = this.chunks.get(k);
    if (!chunk) return false;
    chunk.dispose(this.scene);
    this.chunks.delete(k);
    this.lighting.chunkRemoved(chunk);
    for (const listener of this.unloadListeners) listener(cx, cz);
    return true;
  }

  key(cx, cz) { return cx + ',' + cz; }

  recordEdit(x, y, z, id, meta = 0) {
    if (![x, y, z, id, meta].every(Number.isInteger) || y < 0 || y >= WORLD_H || id < 0 || id > 255 || meta < 0 || meta > 255) return false;
    const key = `${x},${y},${z}`;
    this.edits.set(key, id);
    if (meta) this.metaEdits.set(key, meta); else this.metaEdits.delete(key);
    const chunkKey = this.key(Math.floor(x / CH), Math.floor(z / CH));
    if (!this.editsByChunk.has(chunkKey)) this.editsByChunk.set(chunkKey, new Set());
    this.editsByChunk.get(chunkKey).add(key);
    return true;
  }

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
    if (!c.generated) this.gen.fillChunk(c);
    this.gen.decorate(this, c);
    if (!wasDecorated) {
      const x0 = cx * CH, z0 = cz * CH;
      for (const key of this.editsByChunk.get(this.key(cx, cz)) || []) {
        const [x, y, z] = key.split(',').map(Number);
        const id = this.edits.get(key);
        if (id !== undefined) c.set(x - x0, y, z - z0, id, this.metaEdits.get(key) || 0);
      }
    }
    // Light only after all cross-border decoration and saved edits are present.
    // Existing neighbors receive incremental updates through the same queues.
    if (!wasDecorated) {
      this.lighting.addChunk(c);
      for (const listener of this.chunkListeners) listener(cx, cz);
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
    const lx0 = x - cx * CH, lz0 = z - cz * CH;
    const previousId = c.get(lx0, y, lz0), previousMeta = c.getMeta(lx0, y, lz0);
    c.set(lx0, y, lz0, id);
    if (c.lightingReady) this.lighting.blockChanged(x, y, z, previousId, previousMeta);
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
    const previousId = c.get(lx, y, lz), previousMeta = c.getMeta(lx, y, lz);
    c.setMeta(lx, y, lz, meta);
    if (c.lightingReady && (lightOpacity(previousId, previousMeta) !== lightOpacity(previousId, meta) || lightEmission(previousId, previousMeta) !== lightEmission(previousId, meta))) {
      this.lighting.blockChanged(x, y, z, previousId, previousMeta);
    }
    // Metadata edits on naturally generated blocks must survive reload too.
    this.recordEdit(x, y, z, previousId, meta);
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CH - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CH - 1) this.markDirty(cx, cz + 1);
    for (const listener of this.blockListeners) listener(x, y, z, previousId, previousId, previousMeta, meta);
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
    const prevId = c.get(lx, y, lz), prevMeta = c.getMeta(lx, y, lz);
    if (prevId === id && prevMeta === meta) return true;
    c.set(lx, y, lz, id, meta);
    this.recordEdit(x, y, z, id, meta);

    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CH - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CH - 1) this.markDirty(cx, cz + 1);

    this.lighting.blockChanged(x, y, z, prevId, prevMeta);
    for (const listener of this.blockListeners) listener(x, y, z, prevId, id, prevMeta, meta);
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

  // Compatibility entry point for tools/tests; streaming and edits use the
  // incremental engine directly rather than repeatedly recomputing chunks.
  computeLight(chunk) {
    this.lighting.addChunk(chunk);
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
