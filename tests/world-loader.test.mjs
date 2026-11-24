import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { applySavedEdits, selectSpawn } from '../src/world/world-loader.js';
import { PLANKS, STONE, BED_BLOCK } from '../src/world/blocks.js';

const world = new World('release-smoke', undefined, 'classic');
applySavedEdits(world, [['4,40,-3', PLANKS, 2], ['128,40,0', STONE, 0], ['0,64,0', STONE, 0]]);
assert.equal(world.chunks.size, 0, 'loading edits does not synchronously generate terrain');
const first = selectSpawn(world, { x: 0, y: 126, z: 0 });
assert.equal(first.bed, null, 'a missing saved bed is cleared');
assert.deepEqual(first.position, selectSpawn(world, null).position, 'missing beds fall back to the seeded spawn');
assert.equal(world.getBlock(4, 40, -3), PLANKS);
assert.equal(world.getMeta(4, 40, -3), 2);
assert.equal(world.edits.has('128,40,0'), false, 'Classic bounds apply to saved edits');
for (const [x, y, z, id] of [[2, 60, 2, BED_BLOCK], [3, 59, 2, STONE], [3, 60, 2, 0], [3, 61, 2, 0]]) world.setBlock(x, y, z, id);
const bed = { x: 2, y: 60, z: 2 };
assert.deepEqual(selectSpawn(world, bed), { position: { x: 3.5, y: 60.001, z: 2.5 }, bed });
console.log('ALL WORLD LOADER TESTS PASSED');
