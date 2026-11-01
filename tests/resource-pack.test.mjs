import assert from 'node:assert/strict';
import { zipSync } from 'fflate';
import { extractBlockSprites, BLOCK_SPRITES } from '../src/world/resource-pack.js';
import { TILES } from '../src/world/blocks.js';

for (const [name, tile] of Object.entries(BLOCK_SPRITES)) assert.notEqual(TILES[tile], undefined, `mapped tile ${name} exists`);
const zip = entries => zipSync(Object.fromEntries(Object.entries(entries).map(([name, value]) => [name, new Uint8Array(value)])));
const root = 'assets/minecraft/textures/blocks/';
const selected = extractBlockSprites(zip({[root+'stone.png']:[1,2,3], [root+'grass_top.png']:[4], 'irrelevant.png':[9]}));
assert.deepEqual(Object.keys(selected).sort(), ['grass_top', 'stone']);
assert.deepEqual([...selected.stone], [1,2,3]);
assert.throws(() => extractBlockSprites(zip({'assets/minecraft/textures/items/stone.png':[1]})), /No supported/);
assert.throws(() => extractBlockSprites(zip({[root+'__proto__.png']:[1]})), /No supported/);
assert.throws(() => extractBlockSprites(zip({[root+'stone.png']:new Uint8Array(1024*1024+1)})), /too large/);
assert.throws(() => extractBlockSprites(new Uint8Array(32*1024*1024+1)), /too large/);
console.log('ALL RESOURCE PACK TESTS PASSED');
