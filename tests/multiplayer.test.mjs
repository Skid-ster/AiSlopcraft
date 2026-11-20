import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { deflateSync } from 'node:zlib';
import { createMultiplayerServer } from '../server/multiplayer.js';
import { AccountStore } from '../server/accounts.js';
import { normalizeRelayUrl } from '../src/network/multiplayer.js';

const tempDir = await mkdtemp(join(tmpdir(), 'aislopcraft-online-'));
const staticDir = join(tempDir, 'site');
await mkdir(join(staticDir, 'assets'), { recursive: true });
await writeFile(join(staticDir, 'index.html'), '<!doctype html><title>AiSlopcraft</title>');
await writeFile(join(staticDir, 'assets', 'app.js'), 'window.gameReady = true;');
await writeFile(join(staticDir, 'assets', 'main-AbCd1234.js'), 'window.versioned = true;');
await writeFile(join(tempDir, 'secret.json'), '{"private":true}');
await symlink(join(tempDir, 'secret.json'), join(staticDir, 'assets', 'escape.json'));
const accountFile = join(tempDir, 'accounts.json');
const service = createMultiplayerServer({ logger: { warn() {} }, staticDir, accountFile });
service.http.listen(0, '127.0.0.1');
await once(service.http, 'listening');
const { port } = service.http.address();
const base = `http://127.0.0.1:${port}`;
const sockets = [];
const healthResponse = await fetch(`${base}/health`);
assert.equal(healthResponse.status, 200, 'online server exposes a readiness check');
const health = await healthResponse.json();
assert.equal(health.status, 'ok', 'readiness includes the built game');
assert.equal(health.maxRooms, 5, 'health endpoint reports the room limit');
assert.equal(health.maxPlayersPerRoom, 5, 'health endpoint reports the player limit');
assert.equal((await fetch(`${base}/health`, { method: 'POST' })).status, 405, 'health endpoint rejects unsupported methods');
const siteResponse = await fetch(`${base}/`);
assert.equal(siteResponse.status, 200, 'combined service serves the built game at its root');
assert.match(await siteResponse.text(), /AiSlopcraft/);
assert.match(siteResponse.headers.get('content-type'), /text\/html/);
assert.equal(siteResponse.headers.get('cache-control'), 'no-cache', 'the app entry point is revalidated after deploys');
const assetResponse = await fetch(`${base}/assets/app.js`);
assert.equal(await assetResponse.text(), 'window.gameReady = true;', 'combined service serves static game assets beside the WebSocket relay');
assert.equal((await fetch(`${base}/assets/main-AbCd1234.js`)).headers.get('cache-control'), 'public, max-age=31536000, immutable', 'content-hashed assets are safely cached for a year');
assert.equal((await fetch(`${base}/assets/missing.js`)).status, 404, 'missing asset paths do not incorrectly return the SPA shell');
assert.equal((await fetch(`${base}/assets/escape.json`)).status, 403, 'static serving blocks symlinks outside the build directory');
assert.match(await (await fetch(`${base}/saved-world`)).text(), /AiSlopcraft/, 'client-side routes fall back to the app entry point');
assert.equal((await fetch(`${base}/`, { method: 'HEAD' })).status, 200, 'static serving supports HEAD requests');
const unbuiltService = createMultiplayerServer({ logger: { warn() {} }, staticDir: join(tempDir, 'not-built') });
unbuiltService.http.listen(0, '127.0.0.1');
await once(unbuiltService.http, 'listening');
const unbuiltBase = `http://127.0.0.1:${unbuiltService.http.address().port}`;
try {
  assert.equal((await fetch(`${unbuiltBase}/health`)).status, 503, 'readiness fails if the frontend build is missing');
  assert.equal((await fetch(`${unbuiltBase}/`)).status, 503, 'missing frontend build is reported instead of a false healthy root page');
} finally {
  await unbuiltService.close();
}

async function connectRaw() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await once(socket, 'open');
  sockets.push(socket);
  return socket;
}
let testAccountSequence = 0;
async function connect(username = `TestUser${++testAccountSequence}`) {
  const socket = await connectRaw();
  const result = await request(socket, 'auth:signup', { username, password: 'testpass123' });
  assert.equal(result.type, 'auth:success', `test account ${username} signs up`);
  return socket;
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
  const anonymous = await connectRaw();
  const anonymousBrowse = await request(anonymous, 'rooms:list');
  assert.equal(anonymousBrowse.type, 'error', 'public room browsing requires a player account');
  assert.match(anonymousBrowse.message, /sign up or log in/i);
  const accountCreated = await request(anonymous, 'auth:signup', { username: 'play565', password: '55543234' });
  assert.equal(accountCreated.type, 'auth:success', 'players can sign up with a username and an eight-character password');
  assert.equal(accountCreated.account.username, 'play565');
  assert.ok(accountCreated.token.length >= 40, 'signup returns an unguessable persistent login token');
  assert.equal(readFileSync(accountFile, 'utf8').includes('55543234'), false, 'account database never stores the raw password');
  const reloadedAccounts = new AccountStore(accountFile);
  assert.equal(reloadedAccounts.resume(accountCreated.token).account.username, 'play565', 'accounts and login sessions survive account-store reloads');
  const duplicate = await connectRaw();
  const duplicateSignup = await request(duplicate, 'auth:signup', { username: 'PLAY565', password: 'differentpass' });
  assert.equal(duplicateSignup.type, 'error', 'usernames are unique regardless of capitalization');
  const loginSocket = await connectRaw();
  const loggedIn = await request(loginSocket, 'auth:login', { username: 'play565', password: '55543234' });
  assert.equal(loggedIn.type, 'auth:success', 'players can log back in with their password');
  const badLogin = await connectRaw();
  const badCredentials = await request(badLogin, 'auth:login', { username: 'play565', password: 'not-the-password' });
  assert.equal(badCredentials.type, 'error');
  assert.equal(badCredentials.message, 'Username or password is incorrect.', 'login errors do not reveal whether a user exists');
  const resumed = await connectRaw();
  const resumedSession = await request(resumed, 'auth:resume', { token: accountCreated.token });
  assert.equal(resumedSession.type, 'auth:success', 'saved sessions restore login without storing a password');
  const loggedOut = await request(anonymous, 'auth:logout');
  assert.equal(loggedOut.type, 'auth:logged-out');
  assert.equal((await request(anonymous, 'rooms:list')).type, 'error', 'logout revokes room access');

  const host = await connect('Host');
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
  const initialWorld = await request(host, 'world:snapshot', { entries: [['12,70,-8', [5, 2]], ['13,70,-8', [1, 0]]] });
  assert.equal(initialWorld.type, 'world:snapshot:accepted', 'host can efficiently publish saved edits in a bounded batch');
  assert.equal(initialWorld.count, 2);
  assert.deepEqual(service.rooms.get(created.code).edits.get('12,70,-8'), [5, 2]);

  const wrongPass = await connect();
  const rejected = await request(wrongPass, 'room:join', { code: created.code, playerName: 'Intruder', password: 'wrong' });
  assert.equal(rejected.type, 'error', 'password-protected room rejects incorrect credentials');

  const browser = await connect();
  const listing = await request(browser, 'rooms:list');
  assert.equal(listing.rooms.length, 1, 'public world appears in the lobby');
  assert.equal(listing.rooms[0].gameMode, 'creative');
  assert.equal(listing.rooms[0].players, 1);
  assert.equal(listing.rooms[0].maxPlayers, 5, 'room listing publishes the five-player limit');
  assert.equal(listing.rooms[0].passwordProtected, true);
  assert.equal(listing.rooms[0].visualMode, 'forced', 'room listings identify forced host visuals');

  const guest = await connect('Builder');
  const joinedEvent = waitFor(host, message => message.type === 'player:joined');
  const joined = await request(guest, 'room:join', { code: created.code, playerName: 'Builder', password: 'blockparty' });
  assert.equal(joined.type, 'room:joined');
  assert.equal(joined.gameMode, 'creative');
  assert.deepEqual(joined.visuals, created.visuals, 'joining clients receive the host shader and texture atlas');
  assert.equal((await joinedEvent).name, 'Builder');
  const guestSnapshotRejected = await request(guest, 'world:snapshot', { entries: [['1,70,1', [1, 0]]] });
  assert.equal(guestSnapshotRejected.type, 'error', 'only the host can publish the initial world snapshot');

  const remoteEdit = waitFor(guest, message => message.type === 'world:edit');
  host.send(JSON.stringify({ type: 'world:edit', edit: { x: 4, y: 70, z: -3, id: 1, meta: 0 } }));
  assert.deepEqual((await remoteEdit).edit, { x: 4, y: 70, z: -3, id: 1, meta: 0 });

  const reverseEdit = waitFor(host, message => message.type === 'world:edit');
  guest.send(JSON.stringify({ type: 'world:edit', edit: { x: 4, y: 70, z: -3, id: 0, meta: 0 } }));
  assert.equal((await reverseEdit).edit.id, 0, 'air edits replicate so old blocks are removed');

  const newcomer = await connect('LateJoiner');
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
  assert.ok(savedSnapshot.entries.some(([key, [id, meta]]) => key === '12,70,-8' && id === 5 && meta === 2), 'joining snapshots include the host-published saved world batches');
  assert.equal((await lateItems).items[0].uid, 'drop-1', 'late joiners receive current dropped items');
  assert.equal((await lateState).state.timeOfDay, 0.4, 'late joiners receive shared state');
  assert.equal((await lateMobs).mobs[0].uid, 'mob-1', 'late joiners receive current mobs');
  assert.equal((await lateVehicles).vehicles[0].vehicle.uid, 'boat-1', 'late joiners receive current vehicles');
  assert.equal((await lateProjectiles).projectiles[0].uid, 'arrow-1', 'late joiners receive active projectile state');
  const projectileRemoved = waitFor(guest, message => message.type === 'projectile:remove' && message.uid === 'arrow-1');
  newcomer.send(JSON.stringify({ type: 'projectile:remove', uid: 'arrow-1' }));
  await projectileRemoved;
  newcomer.send(JSON.stringify({ type: 'item:pickup', uid: 'drop-1' }));
  const pickupStateOnHost = waitFor(host, message => message.type === 'player:state' && message.id === newcomerJoined.id);
  newcomer.send(JSON.stringify({ type: 'player:state', state: { x: 50, y: 70, z: 50, yaw: 0, pitch: 0, dead: false } }));
  await pickupStateOnHost;
  assert.equal(service.rooms.get(created.code).items.has('drop-1'), true, 'players cannot claim a shared drop from across the map');
  await new Promise(resolve => setTimeout(resolve, 45)); // Player-position updates are intentionally capped at 25 Hz.
  const itemRemoved = waitFor(host, message => message.type === 'item:remove' && message.uid === 'drop-1');
  const pickupGrant = waitFor(newcomer, message => message.type === 'item:pickup');
  newcomer.send(JSON.stringify({ type: 'player:state', state: { x: 4.5, y: 70, z: -2.5, yaw: 0, pitch: 0, dead: false } }));
  await waitFor(host, message => message.type === 'player:state' && message.id === newcomerJoined.id);
  newcomer.send(JSON.stringify({ type: 'item:pickup', uid: 'drop-1' }));
  assert.equal((await pickupGrant).item.count, 3, 'only a valid shared drop can be claimed');
  await itemRemoved;

  const fourth = await connect();
  const fourthJoined = await request(fourth, 'room:join', { code: created.code, playerName: 'Fourth', password: 'blockparty' });
  assert.equal(fourthJoined.type, 'room:joined');
  const fifth = await connect();
  const fifthJoined = await request(fifth, 'room:join', { code: created.code, playerName: 'Fifth', password: 'blockparty' });
  assert.equal(fifthJoined.type, 'room:joined', 'the fifth player can join');
  const sixth = await connect();
  const sixthRejected = await request(sixth, 'room:join', { code: created.code, playerName: 'Sixth', password: 'blockparty' });
  assert.equal(sixthRejected.type, 'error', 'a sixth player is rejected');
  assert.match(sixthRejected.message, /room is full/i);
  assert.equal(created.players.length, 1, 'the host starts as the first room member');
  assert.equal(service.rooms.get(created.code).clients.size, 5, 'room never exceeds five connected players');

  const closed = waitFor(newcomer, message => message.type === 'room:closed');
  await request(host, 'room:close');
  assert.equal((await closed).type, 'room:closed', 'host can close and clean up the lobby');
  assert.equal(service.rooms.size, 0);

  const individualHost = await connect();
  const individual = await request(individualHost, 'room:create', { playerName: 'Solo', name: 'Personal visuals' });
  assert.deepEqual(individual.visuals, { mode: 'individual' }, 'rooms default to player-controlled visuals');
  await request(individualHost, 'room:close');
  const psxRoom = await request(individualHost, 'room:create', { playerName: 'Solo', visuals: { mode: 'forced', shaderStyle: 'psx' } });
  assert.equal(psxRoom.visuals.shaderStyle, 'psx', 'relay accepts the 1.7.10 PSX shader preset');
  await request(individualHost, 'room:close');
  const invalidVisuals = await request(individualHost, 'room:create', {
    playerName: 'Solo', visuals: { mode: 'forced', shaderStyle: 'shader', resourcePack: { name: 'Bad pack', atlasData: 'data:image/png;base64,AAAA' } },
  });
  assert.equal(invalidVisuals.type, 'error', 'relay rejects malformed forced texture atlases');

  const roomHosts = [];
  for (let index = 0; index < 5; index++) {
    const roomHost = await connect();
    roomHosts.push(roomHost);
    const room = await request(roomHost, 'room:create', { playerName: `Host${index}`, name: `Capacity room ${index}` });
    assert.equal(room.type, 'room:joined');
    assert.equal(service.rooms.size, roomHosts.length, `room ${roomHosts.length} consumes one server slot`);
  }
  assert.equal(service.rooms.size, 5, 'server allows exactly five simultaneous rooms');
  const overflowHost = await connect();
  const overflowRoom = await request(overflowHost, 'room:create', { playerName: 'Overflow' });
  assert.equal(overflowRoom.type, 'error', 'server rejects a sixth simultaneous room');
  assert.match(overflowRoom.message, /all 5 rooms/i);
  for (const roomHost of roomHosts) await request(roomHost, 'room:close');
  assert.equal(service.rooms.size, 0, 'closing rooms releases room capacity');

  assert.equal(normalizeRelayUrl('wss://relay.example/ws'), 'wss://relay.example/ws');
  assert.throws(() => normalizeRelayUrl('ws://relay.example/ws'), /secure wss/);
  assert.equal(normalizeRelayUrl('ws://localhost:8787'), 'ws://localhost:8787/ws');
  console.log('ALL MULTIPLAYER TESTS PASSED');
  for (const socket of sockets) socket.close();
} finally {
  await service.close();
  await rm(tempDir, { recursive: true, force: true });
}
