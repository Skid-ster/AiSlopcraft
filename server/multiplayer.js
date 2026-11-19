import { createServer } from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const MAX_PLAYERS = 8;
const MAX_EDITS = 50_000;
const MAX_MESSAGE = 128 * 1024;
const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const cleanText = (value, max = 24) => String(value ?? '').replace(/[<>\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
const validRoom = value => /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(String(value ?? ''));
const send = (socket, message) => {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
};
const roomSummary = room => ({
  code: room.code, name: room.name, players: room.clients.size, maxPlayers: MAX_PLAYERS,
  gameMode: room.gameMode, access: room.access, passwordProtected: Boolean(room.password),
});

function createCode(rooms) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const bytes = randomBytes(6);
    const code = [...bytes].map(byte => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join('');
    if (!rooms.has(code)) return code;
  }
  throw new Error('Could not allocate a room code. Try again.');
}

function passwordRecord(password) {
  if (!password) return null;
  const salt = randomBytes(16);
  return { salt, hash: scryptSync(password, salt, 32) };
}

function passwordMatches(record, password) {
  if (!record) return !password;
  if (!password) return false;
  const candidate = scryptSync(password, record.salt, 32);
  return timingSafeEqual(record.hash, candidate);
}

export function createMultiplayerServer({ logger = console } = {}) {
  const rooms = new Map();
  const http = createServer((request, response) => {
    if (request.url === '/health' || request.url === '/') {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ service: 'aislopcraft-multiplayer', status: 'ok', rooms: rooms.size }));
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end('{"error":"not found"}');
  });
  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_MESSAGE, perMessageDeflate: false });

  function leave(socket, announce = true) {
    const room = socket.room;
    if (!room) return;
    room.clients.delete(socket);
    socket.room = null;
    if (announce && room.clients.size) {
      for (const peer of room.clients) send(peer, { type: 'player:left', id: socket.clientId, name: socket.playerName });
    }
    if (!room.clients.size || room.host === socket) {
      for (const peer of room.clients) {
        send(peer, { type: 'room:closed', reason: 'The host left.' });
        peer.room = null;
        peer.close(1000, 'Host left');
      }
      rooms.delete(room.code);
    }
  }

  function fail(socket, requestId, message) {
    send(socket, { type: 'error', requestId, message });
  }

  function sendRoomSnapshot(socket) {
    const publicRooms = [...rooms.values()]
      .filter(room => room.access === 'public' && room.clients.size < MAX_PLAYERS)
      .map(roomSummary).sort((a, b) => b.players - a.players || a.name.localeCompare(b.name));
    send(socket, { type: 'rooms:list', requestId: socket.pendingRequestId, rooms: publicRooms });
    socket.pendingRequestId = null;
  }

  function join(socket, room, name, requestId) {
    if (room.clients.size >= MAX_PLAYERS) return fail(socket, requestId, 'That room is full.');
    if (socket.room) leave(socket);
    const id = randomBytes(8).toString('hex');
    socket.room = room;
    socket.clientId = id;
    socket.playerName = name;
    room.clients.add(socket);
    send(socket, {
      type: 'room:joined', requestId, id, code: room.code, name: room.name,
      playerName: name, role: socket === room.host ? 'host' : 'guest',
      gameMode: room.gameMode, seed: room.seed, access: room.access,
      players: [...room.clients].map(peer => ({ id: peer.clientId, name: peer.playerName })),
    });
    if (socket !== room.host) {
      const edits = [...room.edits.entries()];
      for (let index = 0; index < edits.length; index += 160) {
        send(socket, { type: 'world:snapshot', entries: edits.slice(index, index + 160), done: index + 160 >= edits.length });
      }
      if (!edits.length) send(socket, { type: 'world:snapshot', entries: [], done: true });
    }
    for (const peer of room.clients) {
      if (peer === socket) continue;
      send(peer, { type: 'player:joined', id, name });
      if (peer.lastState) send(socket, { type: 'player:state', id: peer.clientId, name: peer.playerName, ...peer.lastState });
    }
  }

  wss.on('connection', socket => {
    socket.isAlive = true;
    socket.lastStateAt = 0;
    socket.lastChatAt = 0;
    socket.on('pong', () => { socket.isAlive = true; });
    socket.on('message', buffer => {
      if (buffer.length > MAX_MESSAGE) { socket.close(1009, 'Message too large'); return; }
      let message;
      try { message = JSON.parse(buffer.toString()); } catch { return; }
      if (!message || typeof message.type !== 'string') return;
      const requestId = typeof message.requestId === 'string' ? message.requestId.slice(0, 80) : undefined;

      if (message.type === 'rooms:list') {
        socket.pendingRequestId = requestId;
        sendRoomSnapshot(socket);
      } else if (message.type === 'room:create') {
        if (socket.room) return fail(socket, requestId, 'Leave your current room first.');
        const playerName = cleanText(message.playerName, 20);
        const name = cleanText(message.name, 32) || `${playerName || 'Player'}’s world`;
        const password = String(message.password ?? '').slice(0, 64);
        const access = message.access === 'private' ? 'private' : 'public';
        const gameMode = message.gameMode === 'creative' ? 'creative' : 'survival';
        const seed = cleanText(message.seed, 80) || 'Beta 1.7.3';
        if (!playerName) return fail(socket, requestId, 'Choose a player name.');
        if (password.length && password.length < 4) return fail(socket, requestId, 'Passwords must be at least four characters.');
        try {
          const room = {
            code: createCode(rooms), name, playerName, access, gameMode, seed,
            password: passwordRecord(password), clients: new Set(), edits: new Map(), host: socket,
          };
          rooms.set(room.code, room);
          join(socket, room, playerName, requestId);
        } catch (error) { fail(socket, requestId, error.message); }
      } else if (message.type === 'room:join') {
        const code = String(message.code ?? '').trim().toUpperCase();
        const room = rooms.get(code);
        const playerName = cleanText(message.playerName, 20);
        if (!validRoom(code) || !room) return fail(socket, requestId, 'Room not found. Check the code or ask the host to reopen it.');
        if (!playerName) return fail(socket, requestId, 'Choose a player name.');
        if (!passwordMatches(room.password, String(message.password ?? '').slice(0, 64))) return fail(socket, requestId, 'Incorrect room password.');
        join(socket, room, playerName, requestId);
      } else if (message.type === 'room:leave') {
        leave(socket);
        send(socket, { type: 'room:left', requestId });
      } else if (message.type === 'room:close') {
        if (!socket.room || socket.room.host !== socket) return fail(socket, requestId, 'Only the host can close this room.');
        const room = socket.room;
        for (const peer of room.clients) {
          send(peer, { type: 'room:closed', reason: 'The host closed the room.' });
          peer.room = null;
          if (peer !== socket) peer.close(1000, 'Room closed');
        }
        rooms.delete(room.code);
        socket.room = null;
        send(socket, { type: 'room:left', requestId });
      } else if (!socket.room) {
        fail(socket, requestId, 'Join a room first.');
      } else if (message.type === 'player:state') {
        const now = Date.now();
        if (now - socket.lastStateAt < 40) return;
        const state = message.state;
        if (!state || ![state.x, state.y, state.z, state.yaw, state.pitch].every(Number.isFinite)) return;
        if (Math.abs(state.x) > 30_000_000 || Math.abs(state.z) > 30_000_000 || state.y < -128 || state.y > 512) return;
        socket.lastStateAt = now;
        socket.lastState = { x: state.x, y: state.y, z: state.z, yaw: state.yaw, pitch: state.pitch };
        for (const peer of socket.room.clients) if (peer !== socket) send(peer, { type: 'player:state', id: socket.clientId, name: socket.playerName, ...socket.lastState });
      } else if (message.type === 'world:edit') {
        const edit = message.edit;
        if (!edit || ![edit.x, edit.y, edit.z, edit.id, edit.meta ?? 0].every(Number.isInteger)) return;
        if (edit.y < 0 || edit.y >= 128 || edit.id < 0 || edit.id > 255 || Math.abs(edit.x) > 30_000_000 || Math.abs(edit.z) > 30_000_000) return;
        const key = `${edit.x},${edit.y},${edit.z}`;
        socket.room.edits.set(key, [edit.id, edit.meta || 0]);
        if (socket.room.edits.size > MAX_EDITS) return fail(socket, requestId, 'The shared world edit limit has been reached.');
        for (const peer of socket.room.clients) if (peer !== socket) send(peer, { type: 'world:edit', edit });
      } else if (message.type === 'chat') {
        const now = Date.now();
        if (now - socket.lastChatAt < 500) return;
        const text = cleanText(message.text, 240);
        if (!text) return;
        socket.lastChatAt = now;
        for (const peer of socket.room.clients) send(peer, { type: 'chat', id: socket.clientId, name: socket.playerName, text });
      }
    });
    socket.on('close', () => leave(socket));
    socket.on('error', error => logger.warn?.('Multiplayer socket error:', error.message));
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.isAlive) { socket.terminate(); continue; }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30_000);
  heartbeat.unref?.();

  return { http, wss, rooms, close: () => new Promise(resolve => {
    clearInterval(heartbeat);
    for (const socket of wss.clients) socket.close();
    wss.close(() => http.close(() => resolve()));
  }) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const service = createMultiplayerServer();
  const port = Math.max(1, Math.min(65535, Number(process.env.PORT) || 8787));
  const host = process.env.HOST || '0.0.0.0';
  service.http.listen(port, host, () => console.log(`AiSlopcraft multiplayer relay listening on ${host}:${port}`));
}
