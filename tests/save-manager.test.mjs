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
console.log('ALL SAVE MANAGER TESTS PASSED');
