import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../src/world/world.js';
import { Player } from '../src/entities/player.js';
import { useOnBlock, useOnMob, growCrop, cropDrops } from '../src/interactions.js';
import { loadSettings, persistSettings, rebindKey, sanitizeSettings } from '../src/settings.js';
import { AIR, DIRT, FARMLAND, CROPS, WATER, LAVA, CAKE_BLOCK, WOOL_BASE, SAPLING, LOG } from '../src/world/blocks.js';

globalThis.document = { addEventListener() {}, removeEventListener() {} };
globalThis.window = {};
const world = new World('gameplay-test', new THREE.Scene());
world.generateChunk(0, 0);
const player = new Player(world, new THREE.PerspectiveCamera(), { addEventListener() {} });
const at = (x, y, z, face = [0, 1, 0]) => ({ x, y, z, face });
const held = (id, count = 1) => { player.inventory.fill(null); player.inventory[0] = { id, count, damage: 0 }; player.hotbarIndex = 0; };
const set = (x, y, z, id, meta = 0) => assert.equal(world.setBlock(x, y, z, id, meta), true);

set(2, 100, 2, DIRT); set(2, 101, 2, AIR);
held(290);
assert.equal(useOnBlock(world, player, at(2, 100, 2)), true);
assert.equal(world.getBlock(2, 100, 2), FARMLAND);
assert.equal(player.heldStack.damage, 1);
held(295, 3);
assert.equal(useOnBlock(world, player, at(2, 100, 2)), true);
assert.equal(world.getBlock(2, 101, 2), CROPS);
assert.equal(player.heldStack.count, 2);
assert.equal(useOnBlock(world, player, at(2, 100, 2)), false);
assert.equal(growCrop(world, 2, 101, 2, () => 0), true);
assert.equal(world.getMeta(2, 101, 2), 1);
held(368, 2);
assert.equal(useOnBlock(world, player, at(2, 101, 2)), true);
assert.equal(world.getMeta(2, 101, 2), 7);
assert.equal(player.heldStack.count, 1);
assert.deepEqual(cropDrops(7, () => 0.75), [{ id: 296, count: 1 }, { id: 295, count: 3 }]);
assert.deepEqual(cropDrops(0), [{ id: 295, count: 1 }]);

set(3, 100, 2, CAKE_BLOCK);
player.health = 10;
held(280);
for (let i = 0; i < 6; i++) { player.health = 10; assert.equal(useOnBlock(world, player, at(3, 100, 2)), true); }
assert.equal(world.getBlock(3, 100, 2), AIR);
assert.equal(player.health, 13);

set(4, 100, 2, WATER);
held(325, 2);
assert.equal(useOnBlock(world, player, at(4, 100, 2)), true);
assert.equal(world.getBlock(4, 100, 2), AIR);
assert.equal(player.inventory[0].count, 1);
assert.equal(player.inventory[1].id, 326);
player.hotbarIndex = 1;
set(4, 99, 2, DIRT);
assert.equal(useOnBlock(world, player, at(4, 99, 2)), true);
assert.equal(world.getBlock(4, 100, 2), WATER);
assert.equal(player.inventory[0].count, 2);
set(4, 100, 2, LAVA);
held(325);
assert.equal(useOnBlock(world, player, at(4, 100, 2)), true);
assert.equal(player.heldStack.id, 327);

const sheep = { type: 'sheep', sheared: false, setSheared(v) { this.sheared = v; } };
const drops = [];
held(359);
assert.equal(useOnMob(player, sheep, { random: () => 0.7, drop: (id, count) => drops.push({ id, count }) }), true);
assert.deepEqual(drops, [{ id: WOOL_BASE, count: 3 }]);
assert.equal(player.heldStack.damage, 1);
assert.equal(useOnMob(player, sheep), false);
held(325);
assert.equal(useOnMob(player, { type: 'cow' }), true);
assert.equal(player.heldStack.id, 335);

held(326);
assert.equal(player.insertItem(326, 1), 1);
assert.equal(player.inventory[1].id, 326, 'filled buckets do not stack');
held(332, 16);
assert.equal(player.insertItem(332, 1), 1);
assert.equal(player.inventory[1].count, 1, 'snowballs stack to sixteen');

set(8, 100, 8, SAPLING);
for (let dy = 1; dy <= 6; dy++) set(8, 100 + dy, 8, AIR);
held(368);
assert.equal(useOnBlock(world, player, at(8, 100, 8)), true);
assert.equal(world.getBlock(8, 100, 8), LOG, 'bone meal grows a sapling into a tree');
assert.equal(player.heldStack, null);

// Metadata-only changes to generated blocks are represented in saved edits.
set(5, 100, 2, CAKE_BLOCK);
world.edits.delete('5,100,2');
assert.equal(world.setMeta(5, 100, 2, 3), true);
assert.equal(world.edits.get('5,100,2'), CAKE_BLOCK);
assert.equal(world.metaEdits.get('5,100,2'), 3);
const settings = sanitizeSettings();
rebindKey(settings.keys, 'forward', 'KeyS');
assert.equal(settings.keys.back, null);
const store = new Map();
const storage = { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) };
assert.equal(persistSettings(storage, settings), true);
assert.equal(loadSettings(storage).keys.forward, 'KeyS');
assert.equal(loadSettings(storage).keys.back, null, 'cleared conflicting keys stay unbound after reload');
assert.equal(sanitizeSettings({ renderDistance: 100, fov: 1 }).renderDistance, 12);
assert.equal(sanitizeSettings({ renderDistance: 100, fov: 1 }).fov, 30);

const saved = [...world.edits].map(([key, id]) => [key, id, world.metaEdits.get(key) || 0]);
const restored = new World('gameplay-test', new THREE.Scene());
for (const [key, id, meta] of saved) restored.recordEdit(...key.split(',').map(Number), id, meta);
restored.generateChunk(0, 0);
assert.equal(restored.getBlock(5, 100, 2), CAKE_BLOCK);
assert.equal(restored.getMeta(5, 100, 2), 3, 'edits and metadata survive a fresh world load');
console.log('ALL GAMEPLAY TESTS PASSED');

// Beta food stack sizes: only cookies stack.
const { itemStackLimit, ITEMS } = await import('../src/world/blocks.js');
assert.equal(itemStackLimit(260),1);
assert.equal(itemStackLimit(297),1);
assert.equal(itemStackLimit(357),8);
assert.equal(ITEMS[357].food,2);
