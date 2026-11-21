import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { WebSocket } from 'ws';

const configuredUrl = process.env.BASE_URL;
if (!configuredUrl) throw new Error('Set BASE_URL to the deployed Render site URL, e.g. https://aislopcraft-online.onrender.com');
const base = new URL(configuredUrl);
if (!['http:', 'https:'].includes(base.protocol)) throw new Error('BASE_URL must use http:// or https://');
base.pathname = '/'; base.search = ''; base.hash = '';
const timeout = AbortSignal.timeout(90_000); // Free instances may need time to wake.

const pageResponse = await fetch(base, { signal: timeout, redirect: 'follow' });
assert.equal(pageResponse.status, 200, 'the combined service serves the game at its root');
assert.match(pageResponse.headers.get('content-type') || '', /text\/html/);
assert.match(await pageResponse.text(), /AiSlopcraft/);
assert.match(pageResponse.headers.get('content-security-policy') || '', /default-src 'self'/);

const healthResponse = await fetch(new URL('/health', base), { signal: timeout });
assert.equal(healthResponse.status, 200, 'Render health check succeeds');
const health = await healthResponse.json();
assert.equal(health.status, 'ok');
assert.equal(health.maxRooms, 5);
assert.equal(health.maxPlayersPerRoom, 5);

const socketUrl = new URL('/ws', base);
socketUrl.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
const socket = new WebSocket(socketUrl, { handshakeTimeout: 60_000 });
await once(socket, 'open');
let requestSequence = 0;
function request(type, payload = {}) {
  const requestId = `deploy-smoke-${++requestSequence}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('message', onMessage); reject(new Error(`Timed out waiting for ${type}`)); }, 15_000);
    const onMessage = raw => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (message.requestId !== requestId) return;
      clearTimeout(timer); socket.off('message', onMessage);
      if (message.type === 'error') reject(new Error(message.message || `${type} failed`));
      else resolve(message);
    };
    socket.on('message', onMessage);
    socket.send(JSON.stringify({ type, requestId, ...payload }));
  });
}
try {
  const smokeName = `ArenaCheck${randomBytes(4).toString('hex')}`;
  const list = await request('players:list');
  assert.equal(list.type, 'players:list', 'public online-player list works over the deployed WebSocket');
  const claimed = await request('player:claim', { name: smokeName });
  assert.equal(claimed.type, 'player:claimed');
  assert.ok((await request('players:list')).players.includes(smokeName), 'claimed name appears in the public list');
  assert.equal((await request('player:release')).type, 'player:released');
  assert.ok(!(await request('players:list')).players.includes(smokeName), 'released name disappears from the public list');
  console.log('Render deployment smoke test passed: site, health, limits, secure WebSocket, public list, claim, and release.');
} finally {
  socket.close();
  if (socket.readyState !== WebSocket.CLOSED) await once(socket, 'close');
}
