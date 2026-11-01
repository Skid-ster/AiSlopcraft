// Bounded, event-driven liquid updates. Sources are WATER/LAVA; flowing cells
// store horizontal distance in metadata, or bit 8 for a falling column.
import { CH, WORLD_H } from './chunk.js';
import { AIR, WATER, WATER_FLOW, LAVA, LAVA_FLOW, OBSIDIAN, COBBLE, getBlock } from './blocks.js';

const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIRS = [[0,0,0], [0,1,0], [0,-1,0], [1,0,0], [-1,0,0], [0,0,1], [0,0,-1]];
const kind = id => id === WATER || id === WATER_FLOW ? 'water' : id === LAVA || id === LAVA_FLOW ? 'lava' : null;
const source = k => k === 'water' ? WATER : LAVA;
const flowing = k => k === 'water' ? WATER_FLOW : LAVA_FLOW;

export class FluidSimulator {
  constructor(world) {
    this.world = world;
    this.queue = [];
    this.head = 0;
    this.pending = new Set();
    this.deferred = new Map();
    this.clock = 0;
    this.unsubscribe = world.onBlockChange((x, y, z, oldId, id) => {
      if (kind(oldId) || kind(id) || DIRS.slice(1).some(([dx,dy,dz]) => kind(world.getBlock(x+dx,y+dy,z+dz)))) this.scheduleAround(x,y,z);
    });
  }
  loaded(x, y, z) {
    return y >= 0 && y < WORLD_H && !!this.world.getChunk(Math.floor(x / CH), Math.floor(z / CH))?.generated;
  }
  schedule(x, y, z) {
    if (y < 0 || y >= WORLD_H) return;
    const key = `${x},${y},${z}`;
    if (!this.loaded(x, y, z)) {
      const ck = this.world.key(Math.floor(x / CH), Math.floor(z / CH));
      if (!this.deferred.has(ck)) this.deferred.set(ck, new Set());
      this.deferred.get(ck).add(key);
      return;
    }
    if (this.pending.has(key)) return;
    this.pending.add(key); this.queue.push([x, y, z, key]);
  }
  scheduleAround(x, y, z) {
    for (const [dx,dy,dz] of DIRS) this.schedule(x+dx,y+dy,z+dz);
  }
  chunkLoaded(cx, cz) {
    const chunkKey = this.world.key(cx, cz);
    const deferred = this.deferred.get(chunkKey);
    if (deferred && this.world.getChunk(cx,cz)?.generated) {
      this.deferred.delete(chunkKey);
      for (const key of deferred) this.scheduleAround(...key.split(',').map(Number));
    }
    // Reawaken saved edits on both sides of a newly loaded boundary. Unedited
    // oceans stay dormant until disturbed, rather than flooding the task queue.
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      for (const key of this.world.editsByChunk.get(this.world.key(cx + dx, cz + dz)) || []) {
        const id = this.world.edits.get(key);
        const [x,y,z] = key.split(',').map(Number);
        if (x < cx*CH-1 || x > (cx+1)*CH || z < cz*CH-1 || z > (cz+1)*CH) continue;
        if (kind(id) || DIRS.slice(1).some(([dx,dy,dz]) => kind(this.world.getBlock(x+dx,y+dy,z+dz)))) this.scheduleAround(x,y,z);
      }
    }
  }
  process(x, y, z) {
    const w = this.world;
    if (!this.loaded(x,y,z)) return;
    const id = w.getBlock(x,y,z), own = kind(id);
    // Water touching lava solidifies the lava, never the water source.
    if (own === 'lava' && DIRS.slice(1).some(([dx,dy,dz]) => kind(w.getBlock(x+dx,y+dy,z+dz)) === 'water')) {
      w.setBlock(x,y,z,id === LAVA ? OBSIDIAN : COBBLE); return;
    }
    if (id === WATER || id === LAVA) return;
    if (id !== AIR && !own) return;
    // Two neighboring water sources renew a water cell supported by a solid
    // block or another source. Lava never forms an infinite source.
    if (own === 'water' && SIDES.filter(([dx,dz]) => w.getBlock(x+dx,y,z+dz) === WATER).length >= 2) {
      const below = w.getBlock(x,y-1,z);
      if (getBlock(below).solid || below === WATER) { w.setBlock(x,y,z,WATER); return; }
    }
    let desiredKind = null, level = Infinity;
    const above = w.getBlock(x,y+1,z);
    if (kind(above)) { desiredKind = kind(above); level = 8; }
    else {
      for (const [dx,dz] of SIDES) {
        const nx=x+dx, nz=z+dz, n=w.getBlock(nx,y,nz), k=kind(n);
        if (!k || !this.loaded(nx,y,nz)) continue;
        // A falling stream spreads when it meets a floor, not through the air.
        const below = w.getBlock(nx,y-1,nz);
        if (this.loaded(nx,y-1,nz) && (below === AIR || (kind(below) === k && below === flowing(k) && (w.getMeta(nx,y-1,nz) & 8)))) continue;
        const meta = w.getMeta(nx,y,nz);
        const next = n === source(k) ? 1 : (meta & 8) ? 1 : (meta & 7) + 1;
        const max = k === 'water' ? 7 : 3;
        if (next <= max && next < level) { desiredKind=k; level=next; }
      }
    }
    if (own && desiredKind && own !== desiredKind) {
      if (own === 'lava') w.setBlock(x,y,z,COBBLE);
      return;
    }
    if (!desiredKind) { if (own) w.setBlock(x,y,z,AIR); return; }
    const desired = flowing(desiredKind);
    if (id !== desired || w.getMeta(x,y,z) !== level) w.setBlock(x,y,z,desired,level);
  }
  tick(dt, maxUpdates = 24, budgetMs = 3) {
    this.clock += Math.max(0, dt);
    if (this.clock < 0.1) return 0;
    this.clock = Math.min(this.clock - 0.1, 0.1);
    const deadline = performance.now() + budgetMs;
    let n = 0;
    while (this.head < this.queue.length && n < maxUpdates && performance.now() < deadline) {
      const [x,y,z,key] = this.queue[this.head++];
      this.pending.delete(key); this.process(x,y,z); n++;
    }
    if (this.head === this.queue.length) { this.queue = []; this.head = 0; }
    else if (this.head > 1024) { this.queue = this.queue.slice(this.head); this.head = 0; }
    return n;
  }
}
