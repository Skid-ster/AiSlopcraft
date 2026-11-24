import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createWorldSaveStore } from '../src/save-manager.js';

const dom = new JSDOM('', { url: 'https://game.test', storageQuota: 4096 });
const storage = dom.window.localStorage;
const store = createWorldSaveStore(storage);
const save = {
  version: 1, worldId: 'independent-id', worldName: 'Original', seed: 'a-seed', edits: [],
  player: { pos: [1, 65, 1], inventory: Array(36).fill(null), armor: Array(4).fill(null) },
};
store.write(save);
storage.setItem('aislopcraft:world:damaged', 'not JSON');
storage.setItem('aislopcraft:world:mismatched', JSON.stringify(save));
assert.equal(store.read('damaged'), null);
assert.equal(store.read('mismatched'), null);
assert.equal(store.has('mismatched'), true, 'a reserved key is not overwritten just because its data is invalid');
assert.deepEqual(store.list(), [{ id: 'independent-id', seed: 'a-seed', name: 'Original', gameMode: 'survival', edition: 'beta' }]);
store.rename('independent-id', '  Different name  ');
assert.equal(store.read('independent-id').worldName, 'Different name');
assert.throws(() => store.write({ ...save, settings: { padding: ' '.repeat(4096) } }), { name: 'QuotaExceededError' });
assert.equal(store.read('independent-id').worldName, 'Different name', 'a rejected write does not damage the previous save');
store.remove('independent-id');
assert.deepEqual(store.list(), []);
assert.deepEqual(createWorldSaveStore(null).list(), []);
assert.throws(() => createWorldSaveStore(null).write(save), /unavailable/);
dom.window.close();

const modern = { ...save, version: 2, terrain: 'overworld-v1', worldName: 'Tall', edits: [['0,255,0', 5, 7]] };
const oldKey = `aislopcraft:world:${save.worldId}`;
const collisionDom = new JSDOM('', { url: 'https://game.test' });
const collisionStorage = collisionDom.window.localStorage;
const collision = createWorldSaveStore(collisionStorage);
collision.write(modern);
// Cached builds only know this key and write a v1 save here after playing.
collisionStorage.setItem(oldKey, JSON.stringify(save));
assert.deepEqual(collision.read(save.worldId).edits, modern.edits, 'cached v1 autosave cannot erase tall edits');
assert.equal(collision.read(save.worldId, 1).worldName, 'Original');
assert.equal(collision.read(save.worldId, 2).worldName, 'Tall');
assert.deepEqual(collision.list().map(world => world.name).sort(), ['Original', 'Tall'], 'both versions are selectable');
assert.throws(() => collision.write({ ...save, version: 1 }, { createOnly: true }), /already exists/);
assert.throws(() => collision.write({ ...modern, seed: 'another-seed' }), /protected/);
collision.rename(save.worldId, 'Renamed Beta', 1);
collision.rename(save.worldId, 'Renamed Tall', 2);
assert.deepEqual(collision.list().map(world => world.name).sort(), ['Renamed Beta', 'Renamed Tall']);
collision.remove(save.worldId, 2);
assert.equal(collision.read(save.worldId, 2), null);
assert.equal(collision.read(save.worldId, 1).worldName, 'Renamed Beta', 'deletion leaves the other version alone');
collisionDom.window.close();

const developmentDom = new JSDOM('', { url: 'https://game.test', storageQuota: 4000 });
const developmentStorage = developmentDom.window.localStorage;
const development = createWorldSaveStore(developmentStorage);
const draft = JSON.stringify({ ...modern, settings: { padding: ' '.repeat(2400) } });
developmentStorage.setItem(oldKey, draft);
assert.deepEqual(development.read(save.worldId).edits, modern.edits, 'a full store still reads a development v2 save');
assert.equal(developmentStorage.getItem(oldKey), draft, 'failed copy does not mutate the source');
assert.throws(() => development.write(save), /protected|different/i, 'new legacy writer does not overwrite a development v2 under quota pressure');
const smallDraft = JSON.stringify(modern);
developmentStorage.setItem(oldKey, smallDraft);
assert.deepEqual(development.list().map(world => world.name), ['Tall']);
developmentStorage.setItem(oldKey, JSON.stringify(save));
assert.deepEqual(development.read(save.worldId, 2).edits, modern.edits, 'listing migrates a development v2 before the old key is reused');
const independentDraft = JSON.stringify({ ...modern, worldName: 'Independent draft', edits: [['0,200,0', 1, 0]] });
developmentStorage.setItem(oldKey, independentDraft);
development.rename(save.worldId, 'Renamed primary', 2);
assert.equal(developmentStorage.getItem(oldKey), independentDraft, 'renaming does not delete a divergent development record');
development.remove(save.worldId, 2);
assert.equal(development.read(save.worldId, 2).worldName, 'Independent draft', 'deleting the primary does not delete the divergent development record');
developmentDom.window.close();
console.log('ALL SAVE MANAGER TESTS PASSED');
