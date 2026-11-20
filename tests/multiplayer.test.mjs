import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { deflateSync } from 'node:zlib';
import { createMultiplayerServer } from '../server/multiplayer.js';
import { normalizeRelayUrl } from '../src/network/multiplayer.js';

const service = createMultiplayerServer({ logger: { warn() {} } });
service.http.listen(0, '127.0.0.1');
await once(service.http, 'listening');
const { port } = service.http.address();
const base = `http://127.0.0.1:${port}`;
assert.equal((await fetch(`${base}/health`)).status, 200, 'relay exposes a health check');

function connect() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  return once(socket, 'open').then(() => socket);
}
function waitFor(socket, predicate, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Timed out waiting for multiplayer event')); }, timeout);
    const onMessage = data => {
      let message;
      try { message = JSON.parse(data.toString()); } catch { return; }
      if (!predicate(message)) return;
      cleanup(); resolve(message);
    };
    const cleanup = () => { clearTimeout(timer); socket.off('message', onMessage); };
    socket.on('message', onMessage);
  });
}
function request(socket, type, payload = {}) {
  const requestId = `${type}-${Math.random()}`;
  const response = waitFor(socket, message => message.requestId === requestId);
  socket.send(JSON.stringify({ type, requestId, ...payload }));
  return response;
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const tag = Buffer.from(type), body = Buffer.concat([tag, data]), chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0); body.copy(chunk, 4); chunk.writeUInt32BE(crc32(body), 8 + data.length);
  return chunk;
}
function testAtlasDataUrl() {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13); header.writeUInt32BE(256, 0); header.writeUInt32BE(256, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc(256 * (1 + 256 * 4));
  const png = Buffer.concat([signature, pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(pixels)), pngChunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

try {
  const host = await connect();
  const created = await request(host, 'room:create', {
    playerName: 'Host', name: 'Pixel garden', access: 'public', gameMode: 'creative',
    password: 'blockparty', seed: 'multiplayer-test', visuals: {
      mode: 'forced', shaderStyle: 'shader', resourcePack: { name: 'Local pack', atlasData: testAtlasDataUrl() },
    },
  });
  assert.equal(created.type, 'room:joined');
  assert.equal(created.role, 'host');
  assert.equal(created.gameMode, 'creative');
  assert.equal(created.visuals.mode, 'forced');
  assert.equal(created.visuals.shaderStyle, 'shader');
  assert.equal(created.visuals.resourcePack.name, 'Local pack');
  assert.ok(created.visuals.resourcePack.atlasData.startsWith('data:image/png;base64,'));
  assert.match(created.code, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);

  const wrongPass = await connect();
  const rejected = await request(wrongPass, 'room:join', { code: created.code, playerName: 'Intruder', password: 'wrong' });
  assert.equal(rejected.type, 'error', 'password-protected room rejects incorrect credentials');

  const browser = await connect();
  const listing = await request(browser, 'rooms:list');
  assert.equal(listing.rooms.length, 1, 'public world appears in the lobby');
  assert.equal(listing.rooms[0].gameMode, 'creative');
  assert.equal(listing.rooms[0].passwordProtected, true);
  assert.equal(listing.rooms[0].visualMode, 'forced', 'room listings identify forced host visuals');

  const guest = await connect();
  const joinedEvent = waitFor(host, message => message.type === 'player:joined');
  const joined = await request(guest, 'room:join', { code: created.code, playerName: 'Builder', password: 'blockparty' });
  assert.equal(joined.type, 'room:joined');
  assert.equal(joined.gameMode, 'creative');
  assert.deepEqual(joined.visuals, created.visuals, 'joining clients receive the host shader and texture atlas');
  assert.equal((await joinedEvent).name, 'Builder');

  const remoteEdit = waitFor(guest, message => message.type === 'world:edit');
  host.send(JSON.stringify({ type: 'world:edit', edit: { x: 4, y: 70, z: -3, id: 1, meta: 0 } }));
  assert.deepEqual((await remoteEdit).edit, { x: 4, y: 70, z: -3, id: 1, meta: 0 });

  const reverseEdit = waitFor(host, message => message.type === 'world:edit');
  guest.send(JSON.stringify({ type: 'world:edit', edit: { x: 4, y: 70, z: -3, id: 0, meta: 0 } }));
  assert.equal((await reverseEdit).edit.id, 0, 'air edits replicate so old blocks are removed');

  const newcomer = await connect();
  const snapshot = waitFor(newcomer, message => message.type === 'world:snapshot' && message.done);

  const itemNotice = waitFor(guest, message => message.type === 'item:snapshot');
  host.send(JSON.stringify({ type: 'item:snapshot', items: [{ uid: 'drop-1', id: 1, count: 3, damage: 0, pos: [4.5, 71, -2.5], vy: 0, age: 2 }] }));
  assert.equal((await itemNotice).items[0].uid, 'drop-1', 'shared item drops replicate from the host');
  const hostStateNotice = waitFor(guest, message => message.type === 'game:state');
  host.send(JSON.stringify({ type: 'game:state', state: { timeOfDay: 0.4, chests: [['1,2,3', new Array(27).fill(null)]], furnaces: [] } }));
  assert.equal((await hostStateNotice).state.timeOfDay, 0.4, 'shared world state replicates between room members');
  const mobNotice = waitFor(guest, message => message.type === 'mob:snapshot');
  host.send(JSON.stringify({ type: 'mob:snapshot', mobs: [{ uid: 'mob-1', type: 'zombie', pos: [5, 70, 5], yaw: 1, hp: 16, sheared: false, fuse: -1 }] }));
  assert.equal((await mobNotice).mobs[0].uid, 'mob-1', 'host mob state replicates to guests');
  const stateOnHost = waitFor(host, message => message.type === 'player:state' && message.id === joined.id);
  guest.send(JSON.stringify({ type: 'player:state', state: { x: 5, y: 70, z: 4, yaw: 0, pitch: 0, dead: false } }));
  await stateOnHost;
  const attackOnHost = waitFor(host, message => message.type === 'mob:attack');
  guest.send(JSON.stringify({ type: 'mob:attack', uid: 'mob-1', heldId: 276 }));
  assert.equal((await attackOnHost).attacker.id, joined.id, 'guest mob attacks are forwarded for host validation');
  const tntOnHost = waitFor(host, message => message.type === 'tnt:ignite');
  guest.send(JSON.stringify({ type: 'tnt:ignite', x: 5, y: 70, z: 5 }));
  assert.equal((await tntOnHost).x, 5, 'nearby guest TNT ignitions are forwarded to the host simulator');
  const vehicleNotice = waitFor(guest, message => message.type === 'vehicle:update');
  host.send(JSON.stringify({ type: 'vehicle:update', riding: false, vehicle: { uid: 'boat-1', type: 'boat', pos: [6, 70, 6], rotation: 0, vx: 1, vz: 0 } }));
  assert.equal((await vehicleNotice).vehicle.uid, 'boat-1', 'vehicle state is replicated across the room');
  const projectileNotice = waitFor(guest, message => message.type === 'projectile:update');
  host.send(JSON.stringify({ type: 'projectile:update', projectile: { uid: 'arrow-1', owner: 'mob', pos: [6, 71, 6], vel: [1, 0, 0], age: 0.4 } }));
  assert.equal((await projectileNotice).projectile.uid, 'arrow-1', 'in-flight projectiles replicate to other players');
  const spawnOnHost = waitFor(host, message => message.type === 'item:spawn' && message.item.id === 2);
  const spawnOnPeer = waitFor(guest, message => message.type === 'item:spawn' && message.item.id === 2);
  guest.send(JSON.stringify({ type: 'item:spawn', item: { uid: 'guest-drop', id: 2, count: 1, pos: [2, 70, 2] } }));
  assert.match((await spawnOnHost).item.uid, /guest-drop$/, 'guest-created drops are shared with the host');
  await spawnOnPeer;
  const playerDamage = waitFor(guest, message => message.type === 'player:damage');
  host.send(JSON.stringify({ type: 'player:damage', targetId: joined.id, amount: 2 }));
  assert.equal((await playerDamage).amount, 2, 'host mob damage is relayed to the affected player');

  const lateItems = waitFor(newcomer, message => message.type === 'item:snapshot');
  const lateState = waitFor(newcomer, message => message.type === 'game:state');
  const lateMobs = waitFor(newcomer, message => message.type === 'mob:snapshot');
  const lateVehicles = waitFor(newcomer, message => message.type === 'vehicle:snapshot');
  const lateProjectiles = waitFor(newcomer, message => message.type === 'projectile:snapshot');
  const newcomerJoined = await request(newcomer, 'room:join', { code: created.code, playerName: 'Late joiner', password: 'blockparty' });
  assert.equal(newcomerJoined.type, 'room:joined');
  const savedSnapshot = await snapshot;
  assert.ok(savedSnapshot.entries.some(([key, [id]]) => key === '4,70,-3' && id === 0), 'new players receive current world edits');
  assert.equal((await lateItems).items[0].uid, 'drop-1', 'late joiners receive current dropped items');
  assert.equal((await lateState).state.timeOfDay, 0.4, 'late joiners receive shared state');
  assert.equal((await lateMobs).mobs[0].uid, 'mob-1', 'late joiners receive current mobs');
  assert.equal((await lateVehicles).vehicles[0].vehicle.uid, 'boat-1', 'late joiners receive current vehicles');
  assert.equal((await lateProjectiles).projectiles[0].uid, 'arrow-1', 'late joiners receive active projectile state');
  const projectileRemoved = waitFor(guest, message => message.type === 'projectile:remove' && message.uid === 'arrow-1');
  newcomer.send(JSON.stringify({ type: 'projectile:remove', uid: 'arrow-1' }));
  await projectileRemoved;
  const itemRemoved = waitFor(host, message => message.type === 'item:remove' && message.uid === 'drop-1');
  const pickupGrant = waitFor(newcomer, message => message.type === 'item:pickup');
  newcomer.send(JSON.stringify({ type: 'item:pickup', uid: 'drop-1' }));
  assert.equal((await pickupGrant).item.count, 3, 'only a valid shared drop can be claimed');
  await itemRemoved;

  const closed = waitFor(newcomer, message => message.type === 'room:closed');
  await request(host, 'room:close');
  assert.equal((await closed).type, 'room:closed', 'host can close and clean up the lobby');
  assert.equal(service.rooms.size, 0);

  const individualHost = await connect();
  const individual = await request(individualHost, 'room:create', { playerName: 'Solo', name: 'Personal visuals' });
  assert.deepEqual(individual.visuals, { mode: 'individual' }, 'rooms default to player-controlled visuals');
  await request(individualHost, 'room:close');
  const invalidVisuals = await request(individualHost, 'room:create', {
    playerName: 'Solo', visuals: { mode: 'forced', shaderStyle: 'shader', resourcePack: { name: 'Bad pack', atlasData: 'data:image/png;base64,AAAA' } },
  });
  assert.equal(invalidVisuals.type, 'error', 'relay rejects malformed forced texture atlases');

  assert.equal(normalizeRelayUrl('wss://relay.example/ws'), 'wss://relay.example/ws');
  assert.throws(() => normalizeRelayUrl('ws://relay.example/ws'), /secure wss/);
  assert.equal(normalizeRelayUrl('ws://localhost:8787'), 'ws://localhost:8787/ws');
  console.log('ALL MULTIPLAYER TESTS PASSED');
  for (const socket of [host, wrongPass, browser, guest, newcomer, individualHost]) socket.close();
} finally {
  await service.close();
}
