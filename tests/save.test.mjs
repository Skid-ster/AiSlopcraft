import assert from 'node:assert/strict';
import { decodeWorldSave, encodeWorldSave, normalizeWorldSave } from '../src/save.js';

const world = {
  version: 1,
  seed: 'portable-test-world',
  edits: [['1,64,-2', 1, 0], ['0,128,0', 2, 0], ['bad-key', 3, 0]],
  settings: { renderDistance: 8, shaderStyle: 'psx' },
  spawnBed: { x: 1, y: 65, z: -2 },
  timeOfDay: 1.25,
  furnaces: [['2,64,3', { input: { id: 15, count: 2 }, output: null, fuel: null, burn: 4, burnMax: 15, cook: 1.5 }]],
  chests: [['4,64,5', Array.from({ length: 27 }, (_, i) => i === 0 ? { id: 1, count: 32 } : null)]],
  vehicles: [{ type: 'boat', pos: [1.5, 65, -2.5] }],
  items: [{ id: 4, count: 3, damage: 0, pos: [1.5, 65, -2.5], vy: 0.2, age: 3 }],
  player: {
    pos: [1.5, 65, -2.5], yaw: 0.4, pitch: -0.1, health: 17,
    inventory: Array.from({ length: 36 }, (_, i) => i === 0 ? { id: 1, count: 5 } : null),
    armor: [null, null, null, null], hotbarIndex: 2, stats: { blocksMined: 8 },
  },
};

const text = encodeWorldSave(world);
const decoded = decodeWorldSave(text);
assert.equal(decoded.seed, 'portable-test-world');
assert.equal(decoded.edition, 'beta', 'older world saves remain in the Beta edition by default');
const classicSave = normalizeWorldSave({ ...world, edition: 'classic', gameMode: 'classic' });
assert.equal(classicSave.edition, 'classic');
assert.equal(classicSave.gameMode, 'classic', 'Classic edition is retained by portable saves');
assert.equal(decoded.worldId, decoded.seed, 'legacy-style saves default the world id to their seed');
assert.deepEqual(decoded.edits, [['1,64,-2', 1, 0]], 'invalid block edits are discarded');
assert.equal(decoded.timeOfDay, 0.25, 'time of day wraps into the 0..1 interval');
assert.deepEqual(decoded.spawnBed, { x: 1, y: 65, z: -2 });
assert.deepEqual(decoded.player.inventory[0], { id: 1, count: 5, damage: 0 });
assert.deepEqual(decoded.chests[0][1][0], { id: 1, count: 32, damage: 0 });
assert.equal(normalizeWorldSave({ ...world, player: { ...world.player, pos: [Infinity, 2, 3] } }), null);
assert.throws(() => decodeWorldSave('{broken json'), /valid JSON/);
assert.throws(() => decodeWorldSave(JSON.stringify({ format: 'other', version: 1 })), /Unsupported save/);
assert.throws(() => encodeWorldSave({ version: 1, seed: 'missing-player', edits: [] }), /incomplete/);
console.log('ALL WORLD SAVE TESTS PASSED');
