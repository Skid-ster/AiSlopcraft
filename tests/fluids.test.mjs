import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../src/world/world.js';
import { CH } from '../src/world/chunk.js';
import { FluidSimulator } from '../src/world/fluids.js';
import { AIR, STONE, WATER, WATER_FLOW, LAVA, OBSIDIAN } from '../src/world/blocks.js';

function blank() {
  const w = new World('fluid-test', new THREE.Scene());
  w.gen.fillChunk = chunk => {
    chunk.blocks.fill(AIR);
    for (let z=0;z<CH;z++) for(let x=0;x<CH;x++) chunk.set(x,0,z,STONE);
    chunk.generated=true;
  };
  w.gen.decorate = (_world, chunk) => { chunk.decorated=true; };
  const f = new FluidSimulator(w); w.onChunkLoad((x,z)=>f.chunkLoaded(x,z));
  w.generateChunk(0,0); return [w,f];
}
function settle(f, limit=25000) {
  for(let i=0; i<limit && f.pending.size; i++) f.tick(.1,200,1000);
  assert.equal(f.pending.size,0,'liquid update queue reaches a stable state');
}
let [w,f]=blank();
w.setBlock(8,4,8,WATER); settle(f);
assert.equal(w.getBlock(8,3,8),WATER_FLOW,'water falls');
assert.equal(w.getBlock(8,1,8),WATER_FLOW,'water reaches the floor');
assert.equal(w.getBlock(9,1,8),WATER_FLOW,'water spreads along the floor');
assert.equal(w.getBlock(9,4,8),AIR,'water does not spread sideways while falling');
w.setBlock(8,4,8,AIR); settle(f);
assert.equal(w.getBlock(8,1,8),AIR,'flow recedes after removing its source');
assert.equal(w.getBlock(9,1,8),AIR,'side flow also recedes');

[w,f]=blank();
w.setBlock(6,1,6,LAVA); w.setBlock(7,1,6,WATER); settle(f);
assert.equal(w.getBlock(6,1,6),OBSIDIAN,'water solidifies lava sources');

[w,f]=blank();
w.generateChunk(1,0);
w.setBlock(15,1,8,WATER); settle(f);
assert.equal(w.getBlock(16,1,8),WATER_FLOW,'flow crosses loaded chunk borders');
w.setBlock(15,1,8,AIR); settle(f);
assert.equal(w.getBlock(16,1,8),AIR,'cross-border flow recedes');
[w,f]=blank();
w.setBlock(15,1,8,WATER); settle(f);
assert.ok(f.deferred.has('1,0'),'flow waits for an unloaded neighboring chunk');
w.generateChunk(1,0); settle(f);
assert.equal(w.getBlock(16,1,8),WATER_FLOW,'deferred flow resumes when a neighbor loads');
[w,f]=blank();
w.setBlock(6,1,8,WATER); w.setBlock(8,1,8,WATER); settle(f);
assert.equal(w.getBlock(7,1,8),WATER,'two sources create an infinite water source');
w.setBlock(6,1,8,AIR); settle(f);
assert.equal(w.getBlock(6,1,8),WATER_FLOW,'a removed source is replenished by the remaining source');
[w,f]=blank();
w.setBlock(6,1,8,LAVA); w.setBlock(8,1,8,LAVA); settle(f);
assert.notEqual(w.getBlock(7,1,8),LAVA,'lava does not create new sources');
console.log('ALL FLUID TESTS PASSED');
