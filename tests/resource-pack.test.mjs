import assert from 'node:assert/strict';
import { zipSync } from 'fflate';
import { extractBlockSprites, BLOCK_SPRITES } from '../src/world/resource-pack.js';
import { TILES } from '../src/world/blocks.js';

for (const [name, tile] of Object.entries(BLOCK_SPRITES)) assert.notEqual(TILES[tile], undefined, `mapped tile ${name} exists`);
// Every tile must be either imported, explicitly aliased, or intentionally
// left on the built-in art until its different renderer/layout is supported.
const mappedTiles = new Set([...Object.values(BLOCK_SPRITES), 'snow_block']);
const fallbackTiles = new Set(['chest_top', 'chest_side', 'chest_front', 'redstone_wire']);
for (const tile of Object.keys(TILES)) {
  assert.ok(mappedTiles.has(tile) || fallbackTiles.has(tile), `${tile} has an explicit import/fallback decision`);
}
for (const tile of fallbackTiles) assert.ok(tile in TILES, `fallback ${tile} exists`);
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
