import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createMultiplayerServer } from '../server/multiplayer.js';
import { MultiplayerClient } from '../src/network/multiplayer.js';
import { OVERWORLD_TERRAIN } from '../src/world/world-profile.js';
import { CHEST, FURNACE, FURNACE_LIT, IRON_ORE } from '../src/world/blocks.js';
import { getSafeStorage, safeStorageGet, safeStorageSet, safeStorageRemove } from '../src/storage.js';

globalThis.WebSocket = WebSocket;

// 1. Safe storage resilience when browser storage throws SecurityError / QuotaExceededError
{
  const throwingScope = {
    get localStorage() {
      throw new Error('SecurityError: blocked in sandboxed iframe');
    },
  };
  const fallback = getSafeStorage(throwingScope);
  assert.equal(safeStorageSet(fallback, 'k', 'v'), true);
  assert.equal(safeStorageGet(fallback, 'k'), 'v');
  assert.equal(safeStorageRemove(fallback, 'k'), true);
  assert.equal(safeStorageGet(fallback, 'k'), null);

  const quotaStorage = {
    getItem() { return 'existing'; },
    setItem() { throw new Error('QuotaExceededError'); },
    removeItem() { throw new Error('SecurityError'); },
  };
  assert.equal(safeStorageSet(quotaStorage, 'k', 'big'), false);
  assert.equal(safeStorageRemove(quotaStorage, 'k'), false);
}

// 2. Authoritative multiplayer containers (Chest, Furnace + server tick + XP, Storage Minecart),
//    broken-container item spill, session:resume reconnect, & dimension switching
const service = createMultiplayerServer({ logger: { warn() {} } });
service.http.listen(0, '127.0.0.1');
await once(service.http, 'listening');
const { port } = service.http.address();
const relayUrl = `ws://127.0.0.1:${port}/ws`;

const host = new MultiplayerClient();
const guest = new MultiplayerClient();

try {
  await host.connect(relayUrl);
  await guest.connect(relayUrl);
  await host.claimPlayerName('HostBuilder');
  await guest.claimPlayerName('GuestMiner');

  const created = await host.createRoom({
    worldName: 'Shared Containers',
    seed: 'Beta 1.7.3',
    edition: 'beta',
    terrain: OVERWORLD_TERRAIN,
    gameMode: 'survival',
    isPublic: true,
  });
  assert.ok(created.resumeToken, 'room:create issues a session resumeToken');

  const joined = await guest.joinRoom({
    code: created.code,
    edition: 'beta',
  });
  assert.ok(joined.resumeToken, 'room:join issues a session resumeToken');

  // Position both players near (4, 70, 4) so reach checks succeed
  host.send('player:state', { state: { x: 4.5, y: 70, z: 4.5, yaw: 0, pitch: 0 } });
  guest.send('player:state', { state: { x: 5.0, y: 70, z: 4.5, yaw: 0, pitch: 0 } });

  // Place a Chest at 4,70,4 and a Furnace at 6,70,4
  host.send('world:edit', { edit: { x: 4, y: 70, z: 4, id: CHEST, meta: 0 } });
  host.send('world:edit', { edit: { x: 6, y: 70, z: 4, id: FURNACE, meta: 0 } });
  await new Promise(r => setTimeout(r, 40));

  // Guest deposits enchanted Diamond Sword into shared Chest via atomic container:tx!
  const hostChestBroadcast = new Promise(resolve => {
    const off = host.on('container:state', msg => {
      if (msg.kind === 'chest' && msg.key === '4,70,4') { off(); resolve(msg); }
    });
  });
  const sword = { id: 276, count: 1, damage: 5, enchants: { sharpness: 4 } };
  const putAck = await guest.containerTx({
    mode: 'click', kind: 'chest', key: '4,70,4', slot: 0, button: 0, cursorStack: sword,
  });
  assert.equal(putAck.cursorStack, null, 'guest deposited sword into shared chest');
  assert.deepEqual(putAck.state[0].enchants, { sharpness: 4 });
  const broadcastedChest = await hostChestBroadcast;
  assert.equal(broadcastedChest.state[0].id, 276, 'host receives real-time container:state for guest chest edit');

  // Host takes the sword out via shift-click ('take')
  const takeAck = await host.containerTx({
    mode: 'take', kind: 'chest', key: '4,70,4', slot: 0, maxCount: 64,
  });
  assert.equal(takeAck.taken.id, 276);
  assert.deepEqual(takeAck.taken.enchants, { sharpness: 4 });
  assert.equal(takeAck.state[0], null);

  // Guest loads Iron Ore + Blaze Rod into shared Furnace -> server ticks furnace -> lights block + produces Iron Ingot + awards XP!
  await guest.containerTx({
    mode: 'click', kind: 'furnace', key: '6,70,4', slot: 'input', button: 0,
    cursorStack: { id: IRON_ORE, count: 1, damage: 0 },
  });
  await guest.containerTx({
    mode: 'click', kind: 'furnace', key: '6,70,4', slot: 'fuel', button: 0,
    cursorStack: { id: 369, count: 1, damage: 0 },
  });

  // Wait for server furnace ticker to light the furnace; fast-forward smelt by checking state
  const litEdit = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Furnace did not light on server tick')), 2500);
    const off = guest.on('world:edit', msg => {
      if (msg.edit?.x === 6 && msg.edit?.y === 70 && msg.edit?.z === 4 && msg.edit?.id === FURNACE_LIT) {
        clearTimeout(timer); off(); resolve(msg);
      }
    });
  });
  assert.equal(litEdit.edit.id, FURNACE_LIT, 'server furnace tick broadcasts FURNACE_LIT block state');

  // Storage Minecart ('cart') shared container sync for guests!
  host.send('vehicle:update', {
    vehicle: { uid: 'cart-shared-1', type: 'storage', pos: [4.5, 70, 5.5], rotation: 0, vx: 0, vz: 0, slots: new Array(27).fill(null) },
    riding: false,
  });
  await new Promise(r => setTimeout(r, 40));
  const cartAck = await guest.containerTx({
    mode: 'insert', kind: 'cart', key: 'cart-shared-1', stack: { id: 264, count: 12, damage: 0 },
  });
  assert.equal(cartAck.remainder, null);
  assert.equal(cartAck.state[0].id, 264);
  assert.equal(cartAck.state[0].count, 12, 'guest inserts diamonds into shared Storage Minecart');

  // Breaking chest spills its contents via server-generated item:spawn + container:remove!
  await guest.containerTx({
    mode: 'insert', kind: 'chest', key: '4,70,4', stack: { id: 266, count: 7, damage: 0 },
  });
  const spilledPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chest break did not spill items')), 2000);
    const off = guest.on('item:spawn', msg => {
      if (msg.item?.id === 266 && msg.item?.count === 7) { clearTimeout(timer); off(); resolve(msg.item); }
    });
  });
  guest.send('world:edit', { edit: { x: 4, y: 70, z: 4, id: 0, meta: 0 } });
  const spilled = await spilledPromise;
  assert.equal(spilled.count, 7, 'breaking shared chest spills authoritative item drop to all peers');

  // Session Resume: simulate abrupt guest socket drop & seamless resume with token
  const originalGuestId = joined.id;
  guest.socket.terminate();
  await new Promise(r => setTimeout(r, 60));
  await guest.connect(relayUrl);
  const resumed = await guest.resumeSession(created.code, joined.resumeToken);
  assert.equal(resumed.id, originalGuestId, 'session:resume restores exact guest clientId');
  assert.equal(resumed.role, 'guest');
  assert.equal(resumed.playerName, 'GuestMiner');

  // Dimension Switching: host travels to Nether and back without losing Overworld edits!
  host.send('world:edit', { edit: { x: 2, y: 70, z: 2, id: 49, meta: 0 } }); // Overworld Obsidian
  await new Promise(r => setTimeout(r, 30));
  const guestDimPromise = new Promise(resolve => {
    const off = guest.on('room:dimension', msg => { off(); resolve(msg); });
  });
  const switched = await host.switchDimension('nether', [0.5, 65, 0.5]);
  assert.equal(switched.dimension, 'nether');
  const guestDim = await guestDimPromise;
  assert.equal(guestDim.dimension, 'nether', 'guest receives room:dimension transition');

  // Edit a block in the Nether, then switch back to Overworld and verify Overworld edit persisted!
  host.send('world:edit', { edit: { x: 1, y: 64, z: 1, id: 89, meta: 0 } });
  await new Promise(r => setTimeout(r, 30));
  const owSnapshotPromise = new Promise(resolve => {
    let off = null;
    off = guest.on('world:snapshot', msg => {
      if (msg.dimension === 'overworld' && msg.entries?.some(([k]) => k === '2,70,2')) {
        off?.();
        resolve(msg);
      }
    });
  });
  await host.switchDimension('overworld', [4.5, 70, 4.5]);
  const owSnap = await owSnapshotPromise;
  assert.ok(owSnap.entries.some(([k, v]) => k === '2,70,2' && v[0] === 49), 'Overworld edits persist across Nether round-trips');
} finally {
  host.disconnect(false);
  guest.disconnect(false);
  await service.close();
}

console.log('ALL MULTIPLAYER CONTAINER & RECONNECT TESTS PASSED');
