// Regression tests for incremental cross-chunk light propagation and removal.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../src/world/world.js';
import { CH, WORLD_H } from '../src/world/chunk.js';
import { AIR, STONE, TORCH, GLASS, WATER, LEAVES, WOOD_DOOR, GLOWSTONE } from '../src/world/blocks.js';

function blankWorld() {
  const world = new World('lighting-test', new THREE.Scene());
  world.gen.fillChunk = chunk => {
    chunk.blocks.fill(AIR);
    for (let z = 0; z < CH; z++) for (let x = 0; x < CH; x++) chunk.set(x, 0, z, STONE);
    chunk.generated = true;
  };
  world.gen.decorate = (world, chunk) => { chunk.decorated = true; };
  return world;
}
const light = (world, x, y, z) => world.getLight(x, y, z);
const blockLight = (world, x, y, z) => light(world, x, y, z) & 15;
const skyLight = (world, x, y, z) => light(world, x, y, z) >> 4;

let w = blankWorld();
w.generateChunk(0, 0);
assert.equal(skyLight(w, 8, 100, 8), 15, 'open sky reaches 15');
assert.equal(skyLight(w, 8, 0, 8), 0, 'opaque ground blocks sky');
w.setBlock(15, 10, 8, TORCH);
assert.equal(blockLight(w, 15, 10, 8), 14);
w.generateChunk(1, 0);
assert.equal(blockLight(w, 16, 10, 8), 13, 'torch crosses a chunk border after neighbor loads');
assert.equal(blockLight(w, 20, 10, 8), 9, 'falloff continues in the new chunk');
w.generateChunk(1, 1);
assert.ok(blockLight(w, 16, 10, 16) > 0, 'light reaches diagonal chunks through cardinal paths');
w.setBlock(15, 10, 8, AIR);
for (let x = 10; x < 24; x++) assert.equal(blockLight(w, x, 10, 8), 0, `stale torch light removed at ${x}`);

// Loading order must not change the fixed point.
function orderedWorld(order) {
  const world = blankWorld();
  for (const [cx, cz] of order) world.generateChunk(cx, cz);
  world.setBlock(15, 12, 15, TORCH);
  return world;
}
const a = orderedWorld([[0, 0], [1, 0], [0, 1], [1, 1]]);
const b = orderedWorld([[1, 1], [0, 1], [1, 0], [0, 0]]);
for (const key of ['0,0', '1,0', '0,1', '1,1']) {
  assert.deepEqual([...a.chunks.get(key).blockLight], [...b.chunks.get(key).blockLight], `order-independent block light ${key}`);
  assert.deepEqual([...a.chunks.get(key).skyLight], [...b.chunks.get(key).skyLight], `order-independent sky light ${key}`);
}

// Filters are applied exactly once and consistently on every axis.
w = blankWorld(); w.generateChunk(0, 0);
// Isolate a vertical shaft so lateral scattering cannot mask filter costs.
for (let y = 14; y <= 22; y++) for (let z = 7; z <= 9; z++) for (let x = 7; x <= 9; x++) w.setBlock(x, y, z, STONE);
for (let y = 14; y <= 22; y++) w.setBlock(8, y, 8, AIR);
w.setBlock(8, 20, 8, GLASS);
assert.equal(skyLight(w, 8, 19, 8), 15, 'glass does not attenuate vertical skylight');
w.setBlock(8, 18, 8, WATER);
assert.equal(skyLight(w, 8, 18, 8), 13, 'water uses its declared filter on entry');
w.setBlock(8, 16, 8, LEAVES);
assert.equal(skyLight(w, 8, 16, 8), 11, 'leaves use the same filter vertically and horizontally');
for (let y = 9; y <= 11; y++) for (let z = 3; z <= 5; z++) for (let x = 3; x <= 7; x++) w.setBlock(x, y, z, STONE);
for (let x = 4; x <= 6; x++) w.setBlock(x, 10, 4, AIR);
w.setBlock(4, 10, 4, TORCH);
w.setBlock(5, 10, 4, WOOD_DOOR, 0);
assert.equal(blockLight(w, 6, 10, 4), 0, 'closed door blocks torch light');
w.setMeta(5, 10, 4, 4);
assert.equal(blockLight(w, 6, 10, 4), 12, 'opening the door restores propagation');

// Unloading a source chunk removes its contribution from surviving neighbors.
w = blankWorld(); w.generateChunk(0, 0); w.generateChunk(1, 0);
w.setBlock(15, 10, 8, GLOWSTONE);
assert.equal(blockLight(w, 16, 10, 8), 14);
const removed = w.getChunk(0, 0);
w.chunks.delete('0,0');
w.lighting.chunkRemoved(removed);
assert.equal(blockLight(w, 16, 10, 8), 0, 'unloaded emitter leaves no ghost light');
assert.equal(skyLight(w, 20, 50, 8), 15, 'surviving open sky is restored after unload cleanup');

// Random edits must match a fresh, non-incremental rebuild of the same blocks.
w = blankWorld();
for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) w.generateChunk(cx, cz);
let seed = 12345;
const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const ids = [AIR, STONE, TORCH, GLASS, WATER, LEAVES, GLOWSTONE];
for (let i = 0; i < 80; i++) {
  const x = Math.floor(rand() * 48) - 16, y = 2 + Math.floor(rand() * 30), z = Math.floor(rand() * 48) - 16;
  w.setBlock(x, y, z, ids[Math.floor(rand() * ids.length)]);
}
const reference = blankWorld();
for (const chunk of w.chunks.values()) {
  const c = reference.ensureChunk(chunk.cx, chunk.cz);
  c.blocks.set(chunk.blocks); c.meta.set(chunk.meta); c.generated = true; c.decorated = true;
}
for (const chunk of reference.chunks.values()) reference.lighting.addChunk(chunk);
for (const [key, chunk] of w.chunks) {
  const expected = reference.chunks.get(key);
  assert.deepEqual([...chunk.skyLight], [...expected.skyLight], `random-edit sky fixed point ${key}`);
  assert.deepEqual([...chunk.blockLight], [...expected.blockLight], `random-edit block fixed point ${key}`);
}
console.log('ALL LIGHTING TESTS PASSED');
