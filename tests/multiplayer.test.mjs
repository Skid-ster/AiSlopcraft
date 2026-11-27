import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { deflateSync } from 'node:zlib';
import { createMultiplayerServer, resolveClientAddress } from '../server/multiplayer.js';
import { normalizeRelayUrl } from '../src/network/multiplayer.js';

const directRequest = { headers: { 'x-forwarded-for': '203.0.113.66' }, socket: { remoteAddress: '198.51.100.7' } };
assert.equal(resolveClientAddress(directRequest), '198.51.100.7', 'untrusted forwarded headers are ignored by default');
assert.equal(resolveClientAddress(directRequest, 1), '203.0.113.66', 'one configured trusted proxy hop uses its appended client address');
assert.equal(resolveClientAddress({ ...directRequest, headers: { 'x-forwarded-for': '192.0.2.9, 203.0.113.66' } }, 1), '203.0.113.66', 'spoofed values before a trusted proxy appended address are not selected');
assert.equal(resolveClientAddress({ ...directRequest, headers: { 'x-forwarded-for': '192.0.2.9, 203.0.113.66, 198.51.100.44' } }, 2), '203.0.113.66', 'multiple trusted proxy hops are counted from the right');
assert.equal(resolveClientAddress({ ...directRequest, headers: { 'x-forwarded-for': 'not-an-ip' } }, 1), '198.51.100.7', 'invalid forwarded chains fall back to the socket peer');
assert.equal(resolveClientAddress({ ...directRequest, headers: { 'x-forwarded-for': '2001:db8::7' } }, 1), '2001:db8::7', 'IPv6 client addresses are accepted');

const tempDir = await mkdtemp(join(tmpdir(), 'aislopcraft-online-'));
const staticDir = join(tempDir, 'site');
await mkdir(join(staticDir, 'assets'), { recursive: true });
await writeFile(join(staticDir, 'index.html'), '<!doctype html><title>AiSlopcraft</title>');
await writeFile(join(staticDir, 'assets', 'app.js'), 'window.gameReady = true;');
await writeFile(join(staticDir, 'assets', 'main-AbCd1234.js'), 'window.versioned = true;');
await writeFile(join(tempDir, 'secret.json'), '{"private":true}');
let hasEscapeSymlink = true;
try {
  await symlink(join(tempDir, 'secret.json'), join(staticDir, 'assets', 'escape.json'), 'file');
} catch (error) {
  if (process.platform !== 'win32' || error.code !== 'EPERM') throw error;
  hasEscapeSymlink = false;
  console.log('SKIP: static file symlink assertion requires Windows Developer Mode or symlink privileges.');
}
const service = createMultiplayerServer({ logger: { warn() {} }, staticDir });
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
assert.match(siteResponse.headers.get('content-security-policy'), /default-src 'self'.*object-src 'none'/, 'the app is served with a restrictive content security policy');
assert.equal(siteResponse.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', 'the app limits cross-site referrer disclosure');
assert.equal(siteResponse.headers.get('x-frame-options'), 'SAMEORIGIN', 'the app cannot be framed by unrelated sites');
assert.equal(siteResponse.headers.get('x-content-type-options'), 'nosniff', 'the app prevents MIME-type sniffing');
const assetResponse = await fetch(`${base}/assets/app.js`);
assert.equal(await assetResponse.text(), 'window.gameReady = true;', 'combined service serves static game assets beside the WebSocket relay');
assert.equal((await fetch(`${base}/assets/main-AbCd1234.js`)).headers.get('cache-control'), 'public, max-age=31536000, immutable', 'content-hashed assets are safely cached for a year');
assert.equal((await fetch(`${base}/assets/missing.js`)).status, 404, 'missing asset paths do not incorrectly return the SPA shell');
if (hasEscapeSymlink) {
  assert.equal((await fetch(`${base}/assets/escape.json`)).status, 403, 'static serving blocks symlinks outside the build directory');
}
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
let testNameSequence = 0;
async function connect(name = `TestUser${++testNameSequence}`) {
  const socket = await connectRaw();
  const result = await request(socket, 'player:claim', { name });
  assert.equal(result.type, 'player:claimed', `player claims available name ${name}`);
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
  socket.send(JSON.stringify({ type, requestId, ...(['room:create', 'room:join'].includes(type) ? { edition: 'classic' } : {}), ...payload }));
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
  anonymous.send('{');
  assert.equal((await request(anonymous, 'ping')).type, 'pong', 'malformed JSON does not break the next request');
  const oversizedLobby = await request(anonymous, 'rooms:list', { padding: ' '.repeat(65_536) });
  assert.match(oversizedLobby.message, /too large/i, 'the byte cap applies to public lobby requests too');
  const anonymousBrowse = await request(anonymous, 'rooms:list');
  assert.equal(anonymousBrowse.type, 'rooms:list', 'anyone can browse public rooms without an account');
  assert.deepEqual(anonymousBrowse.rooms, []);
  const unclaimedCreate = await request(anonymous, 'room:create', { name: 'No name yet' });
  assert.equal(unclaimedCreate.type, 'error', 'a player must claim a name before creating or joining a room');
  assert.match(unclaimedCreate.message, /choose an available player name/i);
  assert.deepEqual((await request(anonymous, 'players:list')).players, [], 'the public online list starts empty');
  const claimedListEvent = waitFor(anonymous, message => message.type === 'players:list' && !message.requestId);
  const claimed = await request(anonymous, 'player:claim', { name: 'play565' });
  assert.equal(claimed.type, 'player:claimed', 'players choose a temporary name without creating an account');
  assert.deepEqual((await claimedListEvent).players, ['play565'], 'the public live list updates immediately when someone connects');
  const duplicate = await connectRaw();
  const duplicateClaim = await request(duplicate, 'player:claim', { name: 'PLAY565' });
  assert.equal(duplicateClaim.type, 'error', 'names are unique while online, regardless of capitalization');
  assert.match(duplicateClaim.message, /already taken/i);
  assert.deepEqual((await request(duplicate, 'players:list')).players, ['play565'], 'any connected visitor can view the global online leaderboard');
  const releasedListEvent = waitFor(anonymous, message => message.type === 'players:list' && !message.requestId);
  const released = await request(anonymous, 'player:release');
  assert.equal(released.type, 'player:released', 'logging out explicitly releases the name');
  assert.deepEqual((await releasedListEvent).players, [], 'the public live list updates immediately after logout');
  const reused = await request(duplicate, 'player:claim', { name: 'PLAY565' });
  assert.equal(reused.type, 'player:claimed', 'a released name becomes immediately available');
  const disconnectedList = waitFor(anonymous, message => message.type === 'players:list' && !message.requestId && message.players.length === 0);
  duplicate.close();
  await once(duplicate, 'close');
  await disconnectedList; // The client can observe its close before the server processes it.
  const reclaimed = await request(anonymous, 'player:claim', { name: 'play565' });
  assert.equal(reclaimed.type, 'player:claimed', 'a disconnect also releases a temporary name');
  await request(anonymous, 'player:release');

  const throttled = await connectRaw();
  for (let attempt = 0; attempt < 12; attempt++) {
    const invalidClaim = await request(throttled, 'player:claim', { name: 'x' });
    assert.equal(invalidClaim.type, 'error', 'invalid name attempts are rejected without reserving a name');
  }
  const throttledClaim = await request(throttled, 'player:claim', { name: 'PatientPlayer' });
  assert.match(throttledClaim.message, /too many name checks/i, 'name claims are throttled per connection');
  throttled.close();

  const fastLister = await connectRaw();
  for (let requestIndex = 0; requestIndex < 30; requestIndex++) {
    assert.equal((await request(fastLister, 'players:list')).type, 'players:list', 'normal live-list polling remains available');
  }
  const blockedList = await request(fastLister, 'players:list');
  assert.match(blockedList.message, /refreshing too quickly/i, 'excessive public-list polling is rate-limited');
  fastLister.close();

  const host = await connect('Host');
  const created = await request(host, 'room:create', {
    playerName: 'Host', name: 'Pixel garden', access: 'public', gameMode: 'creative',
    password: 'blockparty', seed: 'multiplayer-test', visuals: {
      mode: 'forced', shaderStyle: 'shader', resourcePack: { name: 'Local pack', atlasData: testAtlasDataUrl() },
    },
  });
  assert.equal(created.type, 'room:joined');
  assert.equal(created.role, 'host');
  assert.equal(created.players[0].role, 'host', 'room roster identifies its host');
  const pingResponse = await request(host, 'ping');
  assert.equal(pingResponse.type, 'pong', 'authenticated players can measure relay round-trip latency');
  assert.equal(created.gameMode, 'creative');
  assert.equal(created.visuals.mode, 'forced');
  assert.equal(created.visuals.shaderStyle, 'shader');
  assert.equal(created.visuals.resourcePack.name, 'Local pack');
  assert.ok(created.visuals.resourcePack.atlasData.startsWith('data:image/png;base64,'));
  assert.match(created.code, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
  const initialWorld = await request(host, 'world:snapshot', { entries: [['12,40,-8', [5, 2]], ['13,40,-8', [1, 0]]] });
  assert.equal(initialWorld.type, 'world:snapshot:accepted', 'host can efficiently publish saved edits in a bounded batch');
  assert.equal(initialWorld.count, 2);
  assert.deepEqual(service.rooms.get(created.code).edits.get('12,40,-8'), [5, 2]);
  const outOfBoundsClassicEdit = await request(host, 'world:snapshot', { entries: [['0,64,0', [1, 0]]] });
  assert.equal(outOfBoundsClassicEdit.type, 'error', 'Classic multiplayer rejects edits above its 64-block build limit');

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
  assert.equal(joined.players.find(player => player.id === joined.id).role, 'player', 'roster distinguishes guests from the host');
  assert.equal(joined.gameMode, 'creative');
  assert.deepEqual(joined.visuals, created.visuals, 'joining clients receive the host shader and texture atlas');
  const joinedNotice = await joinedEvent;
  assert.equal(joinedNotice.name, 'Builder');
  assert.equal(joinedNotice.role, 'player', 'existing clients receive player-list role updates');
  const guestSnapshotRejected = await request(guest, 'world:snapshot', { entries: [['1,40,1', [1, 0]]] });
  assert.equal(guestSnapshotRejected.type, 'error', 'only the host can publish the initial world snapshot');

  const remoteEdit = waitFor(guest, message => message.type === 'world:edit');
  host.send(JSON.stringify({ type: 'world:edit', edit: { x: 4, y: 40, z: -3, id: 1, meta: 0 } }));
  assert.deepEqual((await remoteEdit).edit, { x: 4, y: 40, z: -3, id: 1, meta: 0 });

  const reverseEdit = waitFor(host, message => message.type === 'world:edit');
  guest.send(JSON.stringify({ type: 'world:edit', edit: { x: 4, y: 40, z: -3, id: 0, meta: 0 } }));
  assert.equal((await reverseEdit).edit.id, 0, 'air edits replicate so old blocks are removed');

  const newcomer = await connect('LateJoiner');
  const snapshot = waitFor(newcomer, message => message.type === 'world:snapshot' && message.done);

  const itemNotice = waitFor(guest, message => message.type === 'item:snapshot');
  host.send(JSON.stringify({ type: 'item:snapshot', items: [{ uid: 'drop-1', id: 1, count: 3, damage: 0, pos: [4.5, 41, -2.5], vy: 0, age: 2 }] }));
  assert.equal((await itemNotice).items[0].uid, 'drop-1', 'shared item drops replicate from the host');
  const hostStateNotice = waitFor(guest, message => message.type === 'game:state');
  host.send(JSON.stringify({ type: 'game:state', state: { timeOfDay: 0.4, chests: [['1,2,3', new Array(27).fill(null)]], furnaces: [] } }));
  assert.equal((await hostStateNotice).state.timeOfDay, 0.4, 'shared world state replicates between room members');
  const mobNotice = waitFor(guest, message => message.type === 'mob:snapshot');
  host.send(JSON.stringify({ type: 'mob:snapshot', mobs: [{ uid: 'mob-1', type: 'zombie', pos: [5, 70, 5], yaw: 1, hp: 16, sheared: false, fuse: -1 }] }));
  assert.equal((await mobNotice).mobs[0].uid, 'mob-1', 'host mob state replicates to guests');
  const stateOnHost = waitFor(host, message => message.type === 'player:state' && message.id === joined.id);
  guest.send(JSON.stringify({ type: 'player:state', state: { x: 5, y: 40, z: 4, yaw: 0, pitch: 0, dead: false } }));
  await stateOnHost;
  const attackOnHost = waitFor(host, message => message.type === 'mob:attack');
  guest.send(JSON.stringify({ type: 'mob:attack', uid: 'mob-1', heldId: 276 }));
  assert.equal((await attackOnHost).attacker.id, joined.id, 'guest mob attacks are forwarded for host validation');
  const tntOnHost = waitFor(host, message => message.type === 'tnt:ignite');
  guest.send(JSON.stringify({ type: 'tnt:ignite', x: 5, y: 40, z: 5 }));
  assert.equal((await tntOnHost).x, 5, 'nearby guest TNT ignitions are forwarded to the host simulator');
  const vehicleNotice = waitFor(guest, message => message.type === 'vehicle:update');
  host.send(JSON.stringify({ type: 'vehicle:update', riding: false, vehicle: { uid: 'boat-1', type: 'boat', pos: [6, 70, 6], rotation: 0, vx: 1, vz: 0 } }));
  assert.equal((await vehicleNotice).vehicle.uid, 'boat-1', 'vehicle state is replicated across the room');
  const projectileNotice = waitFor(guest, message => message.type === 'projectile:update');
  host.send(JSON.stringify({ type: 'projectile:update', projectile: { uid: 'arrow-1', owner: 'mob', pos: [6, 41, 6], vel: [1, 0, 0], age: 0.4 } }));
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
  assert.ok(savedSnapshot.entries.some(([key, [id]]) => key === '4,40,-3' && id === 0), 'new players receive current world edits');
  assert.ok(savedSnapshot.entries.some(([key, [id, meta]]) => key === '12,40,-8' && id === 5 && meta === 2), 'joining snapshots include the host-published saved world batches');
  assert.equal((await lateItems).items[0].uid, 'drop-1', 'late joiners receive current dropped items');
  assert.equal((await lateState).state.timeOfDay, 0.4, 'late joiners receive shared state');
  assert.equal((await lateMobs).mobs[0].uid, 'mob-1', 'late joiners receive current mobs');
  assert.equal((await lateVehicles).vehicles[0].vehicle.uid, 'boat-1', 'late joiners receive current vehicles');
  const boatRemoved = waitFor(guest, message => message.type === 'vehicle:remove' && message.uid === 'boat-1');
  host.send(JSON.stringify({ type: 'vehicle:remove', uid: 'boat-1' }));
  await boatRemoved;
  assert.equal((await lateProjectiles).projectiles[0].uid, 'arrow-1', 'late joiners receive active projectile state');
  newcomer.send(JSON.stringify({ type: 'projectile:update', projectile: { uid: 'arrow-1', owner: 'player', pos: [99, 70, 99], vel: [0, 0, 0], age: 0 } }));
  newcomer.send(JSON.stringify({ type: 'projectile:remove', uid: 'arrow-1' }));
  await request(newcomer, 'ping'); // Confirms the relay processed both preceding messages.
  assert.equal(service.rooms.get(created.code).projectiles.get('arrow-1').sourceId, created.id, 'a guest cannot take ownership of another player’s projectile');
  assert.deepEqual(service.rooms.get(created.code).projectiles.get('arrow-1').pos, [6, 41, 6], 'a guest cannot overwrite another player’s projectile state');
  assert.equal(service.rooms.get(created.code).projectiles.has('arrow-1'), true, 'a guest cannot remove another player’s projectile');
  const projectileRemoved = waitFor(guest, message => message.type === 'projectile:remove' && message.uid === 'arrow-1');
  host.send(JSON.stringify({ type: 'projectile:remove', uid: 'arrow-1' }));
  await projectileRemoved;
  assert.equal(service.rooms.get(created.code).projectiles.has('arrow-1'), false, 'projectile owners can remove their own projectiles');
  newcomer.send(JSON.stringify({ type: 'item:pickup', uid: 'drop-1' }));
  const pickupStateOnHost = waitFor(host, message => message.type === 'player:state' && message.id === newcomerJoined.id);
  newcomer.send(JSON.stringify({ type: 'player:state', state: { x: 50, y: 40, z: 50, yaw: 0, pitch: 0, dead: false } }));
  await pickupStateOnHost;
  assert.equal(service.rooms.get(created.code).items.has('drop-1'), true, 'players cannot claim a shared drop from across the map');
  await new Promise(resolve => setTimeout(resolve, 45)); // Player-position updates are intentionally capped at 25 Hz.
  const itemRemoved = waitFor(host, message => message.type === 'item:remove' && message.uid === 'drop-1');
  const pickupGrant = waitFor(newcomer, message => message.type === 'item:pickup');
  newcomer.send(JSON.stringify({ type: 'player:state', state: { x: 4.5, y: 40, z: -2.5, yaw: 0, pitch: 0, dead: false } }));
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

  const classicHost = await connect('ClassicHost');
  const classicRoom = await request(classicHost, 'room:create', {
    playerName: 'ClassicHost', name: 'Classic Commons', edition: 'classic', gameMode: 'survival', seed: 'classic-world-seed',
  });
  assert.equal(classicRoom.type, 'room:joined');
  assert.equal(classicRoom.edition, 'classic');
  assert.equal(classicRoom.gameMode, 'creative', 'Classic rooms always use creative mode');
  assert.equal(classicRoom.seed, 'classic-world-seed');
  const wrongEditionGuest = await connect('WrongEdition');
  const wrongEditionJoin = await request(wrongEditionGuest, 'room:join', { code: classicRoom.code, edition: 'beta' });
  assert.equal(wrongEditionJoin.type, 'error', 'Beta clients cannot join a Classic room');
  assert.match(wrongEditionJoin.message, /classic edition/i);
  const classicGuest = await connect('ClassicGuest');
  const classicJoin = await request(classicGuest, 'room:join', { code: classicRoom.code, edition: 'classic' });
  assert.equal(classicJoin.type, 'room:joined');
  assert.equal(classicJoin.edition, 'classic');
  const classicListings = await request(classicGuest, 'rooms:list');
  assert.equal(classicListings.rooms[0].edition, 'classic');
  assert.equal(classicListings.rooms[0].seed, 'classic-world-seed');
  await request(classicGuest, 'room:leave');
  await request(classicHost, 'room:close');

  const individualHost = await connect();
  const invalidMode = await request(individualHost, 'room:create', { edition: 'beta', gameMode: 'adventure' });
  assert.equal(invalidMode.type, 'error', 'unsupported modes cannot allocate a room');
  const survivalRoom = await request(individualHost, 'room:create', { edition: 'beta', gameMode: 'survival', seed: 'shared-survival' });
  assert.equal(survivalRoom.type, 'room:joined', 'the shared game can host Survival');
  assert.equal(survivalRoom.gameMode, 'survival');
  assert.equal(survivalRoom.edition, 'beta');
  assert.equal((await request(individualHost, 'world:snapshot', { entries: [['300,100,-300', [1, 0]]] })).type, 'world:snapshot:accepted', 'shared worlds are not limited to Classic bounds');
  assert.equal((await request(individualHost, 'world:snapshot', { entries: [['0,128,0', [1, 0]]] })).type, 'error', 'edits beyond the current world height remain invalid');
  const survivalGuest = await request(wrongEditionGuest, 'room:join', { edition: 'beta', code: survivalRoom.code });
  assert.equal(survivalGuest.type, 'room:joined');
  assert.equal(survivalGuest.gameMode, 'survival', 'guests receive the host-selected game mode');
  await request(wrongEditionGuest, 'room:leave');
  await request(individualHost, 'room:close');
  const creativeRoom = await request(individualHost, 'room:create', { edition: 'beta', gameMode: 'creative' });
  assert.equal(creativeRoom.type, 'room:joined', 'the shared game can host Creative');
  assert.equal(creativeRoom.gameMode, 'creative');
  await request(individualHost, 'room:close');
  const individual = await request(individualHost, 'room:create', { playerName: 'Solo', name: 'Personal visuals' });
  assert.deepEqual(individual.visuals, { mode: 'individual' }, 'rooms default to player-controlled visuals');
  await request(individualHost, 'room:close');
  const terrain = 'overworld-v1';
  assert.equal((await request(individualHost, 'room:create', { edition: 'beta', terrain: 'future' })).type, 'error');
  for (const gameMode of ['survival', 'creative']) {
    const room = await request(individualHost, 'room:create', { edition: 'beta', terrain, gameMode, seed: '  long seeded terrain  ' });
    assert.equal(room.terrain, terrain, 'new worlds retain their generator identity');
    assert.equal(room.seed, '  long seeded terrain  ', 'modern seed strings are transported exactly');
    assert.equal(room.gameMode, gameMode);
    const oldList = await request(anonymous, 'rooms:list');
    assert.equal(oldList.rooms.some(entry => entry.code === room.code), false, 'old clients do not see tall rooms');
    const newList = await request(anonymous, 'rooms:list', { terrain });
    assert.equal(newList.rooms.find(entry => entry.code === room.code)?.terrain, terrain);
    assert.equal((await request(wrongEditionGuest, 'room:join', { edition: 'beta', code: room.code })).type, 'error');
    assert.equal((await request(individualHost, 'world:snapshot', { entries: [['0,255,0', [1, 4]]] })).type, 'world:snapshot:accepted');
    assert.equal((await request(individualHost, 'world:snapshot', { entries: [['0,256,0', [1, 0]]] })).type, 'error');
    const initialSnapshot = waitFor(wrongEditionGuest, message => message.type === 'world:snapshot' && message.done);
    const roomJoin = await request(wrongEditionGuest, 'room:join', { edition: 'beta', code: room.code, terrain });
    assert.equal(roomJoin.terrain, terrain);
    assert.deepEqual((await initialSnapshot).entries, [['0,255,0', [1, 4]]]);
    const broadcast = waitFor(individualHost, message => message.type === 'world:edit');
    wrongEditionGuest.send(JSON.stringify({ type: 'world:edit', edit: { x: 0, y: 256, z: 0, id: 1 } }));
    wrongEditionGuest.send(JSON.stringify({ type: 'world:edit', edit: { x: 0, y: 255, z: 0, id: 3 } }));
    assert.deepEqual((await broadcast).edit, { x: 0, y: 255, z: 0, id: 3, meta: 0 });
    await request(wrongEditionGuest, 'room:leave');
    const rejoinSnapshot = waitFor(wrongEditionGuest, message => message.type === 'world:snapshot' && message.done);
    await request(wrongEditionGuest, 'room:join', { edition: 'beta', code: room.code, terrain });
    assert.deepEqual((await rejoinSnapshot).entries, [['0,255,0', [3, 0]]]);
    await request(wrongEditionGuest, 'room:leave');
    await request(individualHost, 'room:close');
  }
  const legacyShaderRoom = await request(individualHost, 'room:create', { playerName: 'Solo', visuals: { mode: 'forced', shaderStyle: 'psx' } });
  assert.equal(legacyShaderRoom.visuals.shaderStyle, 'classic', 'relay maps removed legacy shader styles cleanly to Normal (classic)');
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
