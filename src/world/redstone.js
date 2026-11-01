// Event-driven Beta-style redstone. Dust power is recomputed from live sources;
// repeaters and torches change state on scheduled redstone ticks.
import { CH } from './chunk.js';
import { structurePartner } from './structures.js';
import { REDSTONE_WIRE, REDSTONE_TORCH, REDSTONE_REPEATER, LEVER, WOOD_DOOR, IRON_DOOR, TNT, getBlock } from './blocks.js';

const DIRECTIONS = [[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
const NEIGHBORS = [...DIRECTIONS,[0,1,0],[0,-1,0]];
const TYPES = new Set([REDSTONE_WIRE, REDSTONE_TORCH, REDSTONE_REPEATER, LEVER, WOOD_DOOR, IRON_DOOR, TNT]);
const key = (x,y,z) => `${x},${y},${z}`;
const parse = k => k.split(',').map(Number);
// Lower bits describe the face a torch/lever was placed against. Zero is floor.
const SUPPORT = [[0,-1,0],[-1,0,0],[1,0,0],[0,0,-1],[0,0,1]];

export class RedstoneSimulator {
  constructor(world, { ignite = () => {} } = {}) {
    this.world = world;
    this.ignite = ignite;
    this.nodes = new Set();
    this.dirty = false;
    this.computing = false;
    this.time = 0;
    this.pending = new Map();
    world.onBlockChange((x,y,z,oldId,id) => {
      if (this.computing) return;
      const k = key(x,y,z);
      if (TYPES.has(id)) this.nodes.add(k); else this.nodes.delete(k);
      if (oldId !== id) this.pending.delete(k);
      if (TYPES.has(id) || TYPES.has(oldId)) this.dirty = true;
      // Solid block changes can connect dust on a step or change torch support power.
      else if (this.nodes.size) {
        for (let dx=-1;dx<=1 && !this.dirty;dx++) for (let dy=-1;dy<=1 && !this.dirty;dy++) for (let dz=-1;dz<=1;dz++) {
          if (this.nodes.has(key(x+dx,y+dy,z+dz))) { this.dirty=true; break; }
        }
      }
    });
    world.onChunkLoad((cx,cz) => this.chunkLoaded(cx,cz));
    world.onChunkUnload((cx,cz) => {
      for (const k of world.editsByChunk.get(world.key(cx,cz)) || []) {
        if (TYPES.has(world.edits.get(k))) { this.dirty = true; break; }
      }
    });
  }
  chunkLoaded(cx,cz) {
    for (const k of this.world.editsByChunk.get(this.world.key(cx,cz)) || []) {
      if (TYPES.has(this.world.edits.get(k))) { this.nodes.add(k); this.dirty = true; }
    }
  }
  isLoaded(x,y,z) { return !!this.world.getChunk(Math.floor(x/CH), Math.floor(z/CH))?.generated; }
  update(dt = 0) {
    this.time += Math.max(0, dt);
    // Scheduled transitions survive short input pulses; an opposite transition
    // is scheduled after the first one has taken effect.
    for (const [k,event] of this.pending) {
      if (event.time > this.time + 1e-9) continue;
      const [x,y,z] = parse(k);
      if (!this.isLoaded(x,y,z)) continue;
      this.pending.delete(k);
      if (this.world.getBlock(x,y,z) !== event.id) continue;
      const meta = this.world.getMeta(x,y,z);
      const mask = event.id === REDSTONE_TORCH ? 8 : 4;
      this.world.setMeta(x,y,z,event.state ? meta | mask : meta & ~mask);
      this.dirty = true;
    }
    if (!this.dirty) return false;
    this.dirty = false;
    this.computing = true;
    try {
      const w = this.world, components = new Map(), power = new Map(), queue = [];
      for (const k of this.nodes) {
        const [x,y,z] = parse(k);
        if (!this.isLoaded(x,y,z)) continue;
        const id = w.getBlock(x,y,z);
        if (TYPES.has(id)) components.set(k, { x,y,z,id,meta:w.getMeta(x,y,z) });
      }
      const push = (node, strength) => {
        const k = key(node.x,node.y,node.z);
        if (strength <= (power.get(k) || 0)) return;
        power.set(k,strength); queue.push({ ...node, strength });
      };
      for (const node of components.values()) {
        if ((node.id === REDSTONE_TORCH && !(node.meta & 8)) ||
            (node.id === LEVER && (node.meta & 8)) ||
            (node.id === REDSTONE_REPEATER && (node.meta & 4))) push(node,15);
      }
      for (let i=0;i<queue.length;i++) {
        const from=queue[i];
        if (from.strength < (power.get(key(from.x,from.y,from.z)) || 0)) continue;
        const dirs = from.id === REDSTONE_REPEATER ? [DIRECTIONS[from.meta & 3]] : from.id === REDSTONE_WIRE ? [...DIRECTIONS] : NEIGHBORS;
        if (from.id === REDSTONE_WIRE) {
          for (const [dx,,dz] of DIRECTIONS) {
            const side=w.getBlock(from.x+dx,from.y,from.z+dz);
            if (getBlock(side).solid && !getBlock(w.getBlock(from.x,from.y+1,from.z)).solid) dirs.push([dx,1,dz]);
            else if (!getBlock(side).solid) dirs.push([dx,-1,dz]);
          }
        }
        for (const [dx,dy,dz] of dirs) {
          const next=components.get(key(from.x+dx,from.y+dy,from.z+dz));
          if (!next || next.id !== REDSTONE_WIRE) continue;
          const strength = from.id === REDSTONE_WIRE ? from.strength - 1 : from.strength;
          if (strength > 0) push(next,strength);
        }
      }
      const poweredFrom = (node, tx,ty,tz) => {
        if (!(power.get(key(node.x,node.y,node.z)) || 0)) return false;
        if (node.id === REDSTONE_REPEATER) {
          const [dx,dy,dz] = DIRECTIONS[node.meta & 3];
          return node.x+dx===tx && node.y+dy===ty && node.z+dz===tz;
        }
        if (node.id === REDSTONE_TORCH) {
          const [dx,dy,dz] = SUPPORT[node.meta & 7] || SUPPORT[0];
          return !(node.x+dx===tx && node.y+dy===ty && node.z+dz===tz);
        }
        return node.id === REDSTONE_WIRE || node.id === LEVER;
      };
      const isPowered = (x,y,z,exclude) => NEIGHBORS.some(([dx,dy,dz]) => {
        const neighbor=components.get(key(x+dx,y+dy,z+dz));
        return neighbor && neighbor !== exclude && poweredFrom(neighbor,x,y,z);
      });
      const isReceiverPowered = (x,y,z) => isPowered(x,y,z) || NEIGHBORS.some(([dx,dy,dz]) => {
        const nx=x+dx, ny=y+dy, nz=z+dz;
        return getBlock(w.getBlock(nx,ny,nz)).solid && isPowered(nx,ny,nz);
      });
      const schedule = (node, state, delay) => {
        const k=key(node.x,node.y,node.z);
        if (!this.pending.has(k)) this.pending.set(k,{id:node.id,state,time:this.time+delay});
      };
      const visitedDoors = new Set();
      for (const node of components.values()) {
        const {x,y,z,id,meta} = node, strength = power.get(key(x,y,z)) || 0;
        if (id === REDSTONE_WIRE && meta !== strength) w.setMeta(x,y,z,strength);
        else if (id === REDSTONE_REPEATER) {
          const [dx,dy,dz] = DIRECTIONS[meta & 3];
          const input=components.get(key(x-dx,y-dy,z-dz));
          const powered = (!!input && poweredFrom(input,x,y,z)) ||
            (getBlock(w.getBlock(x-dx,y-dy,z-dz)).solid && isPowered(x-dx,y-dy,z-dz));
          if (powered !== !!(meta & 4)) schedule(node,powered,0.1 * (1 + ((meta >> 3) & 3)));
        } else if (id === REDSTONE_TORCH) {
          const [dx,dy,dz] = SUPPORT[meta & 7] || SUPPORT[0];
          const sx=x+dx, sy=y+dy, sz=z+dz;
          const off=getBlock(w.getBlock(sx,sy,sz)).solid && isPowered(sx,sy,sz,node);
          if (off !== !!(meta & 8)) schedule(node,off,0.1);
        } else if (id === TNT) {
          if (isReceiverPowered(x,y,z)) this.ignite(x,y,z);
        } else if (id === WOOD_DOOR || id === IRON_DOOR) {
          const k = key(x,y,z);
          if (visitedDoors.has(k)) continue;
          const partner = structurePartner(w,x,y,z,id);
          const parts = [node, ...(partner ? [partner] : [])];
          const powered = parts.some(p => isReceiverPowered(p.x,p.y,p.z));
          for (const part of parts) {
            visitedDoors.add(key(part.x,part.y,part.z));
            const next = powered ? (part.meta | 20) : (part.meta & 16) ? (part.meta & ~20) : part.meta;
            if (next !== part.meta) w.setMeta(part.x,part.y,part.z,next);
          }
        }
      }
    } finally { this.computing = false; }
    return true;
  }
}
