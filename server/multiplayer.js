import { createServer } from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const MAX_PLAYERS = 8;
const MAX_EDITS = 50_000;
const MAX_MESSAGE = 1024 * 1024;
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
    if (room.host !== socket && socket.clientId) {
      for (const [uid, record] of room.vehicles) {
        if (record.owner !== socket.clientId || !record.riding) continue;
        record.riding = false; record.owner = room.host.clientId;
        for (const peer of room.clients) if (peer !== socket) send(peer, { type: 'vehicle:update', ...record });
      }
      for (const [uid, shot] of room.projectiles) {
        if (shot.sourceId !== socket.clientId) continue;
        room.projectiles.delete(uid);
        for (const peer of room.clients) if (peer !== socket) send(peer, { type: 'projectile:remove', uid });
      }
    }
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
      const items = [...room.items.values()];
      send(socket, { type: 'item:snapshot', items, done: true });
      if (room.gameState) send(socket, { type: 'game:state', state: room.gameState });
      send(socket, { type: 'mob:snapshot', mobs: room.mobs });
      send(socket, { type: 'vehicle:snapshot', vehicles: [...room.vehicles.values()] });
      send(socket, { type: 'projectile:snapshot', projectiles: [...room.projectiles.values()].map(({ sourceId, ...shot }) => shot) });
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
    socket.lastAttackAt = 0;
    socket.lastTntAt = 0;
    socket.vehicleTimes = new Map();
    socket.projectileTimes = new Map();
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
            password: passwordRecord(password), clients: new Set(), edits: new Map(), items: new Map(),
            gameState: null, mobs: [], vehicles: new Map(), projectiles: new Map(), host: socket,
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
        socket.lastState = { x: state.x, y: state.y, z: state.z, yaw: state.yaw, pitch: state.pitch, dead: !!state.dead };
        for (const peer of socket.room.clients) if (peer !== socket) send(peer, { type: 'player:state', id: socket.clientId, name: socket.playerName, ...socket.lastState });
      } else if (message.type === 'world:edit') {
        const edit = message.edit;
        if (!edit || ![edit.x, edit.y, edit.z, edit.id, edit.meta ?? 0].every(Number.isInteger)) return;
        if (edit.y < 0 || edit.y >= 128 || edit.id < 0 || edit.id > 255 || Math.abs(edit.x) > 30_000_000 || Math.abs(edit.z) > 30_000_000) return;
        const key = `${edit.x},${edit.y},${edit.z}`;
        socket.room.edits.set(key, [edit.id, edit.meta || 0]);
        if (socket.room.edits.size > MAX_EDITS) return fail(socket, requestId, 'The shared world edit limit has been reached.');
        for (const peer of socket.room.clients) if (peer !== socket) send(peer, { type: 'world:edit', edit });
      } else if (message.type === 'game:state') {
        if (!message.state || typeof message.state !== 'object' || Array.isArray(message.state) || JSON.stringify(message.state).length > 96_000) return fail(socket, requestId, 'Invalid shared world state.');
        socket.room.gameState = message.state;
        for (const peer of socket.room.clients) if (peer !== socket) send(peer, { type: 'game:state', state: message.state });
      } else if (message.type === 'item:snapshot') {
        if (socket.room.host !== socket) return fail(socket, requestId, 'Only the host can publish shared item state.');
        if (!Array.isArray(message.items) || message.items.length > 4096) return fail(socket, requestId, 'Invalid shared item snapshot.');
        const items = new Map();
        for (const item of message.items) {
          if (!item || typeof item.uid !== 'string' || item.uid.length > 80 || !Number.isInteger(item.id) || item.id < 0 || item.id > 4095 || !Number.isInteger(item.count) || item.count < 1 || item.count > 999 || !Array.isArray(item.pos) || item.pos.length !== 3 || !item.pos.every(Number.isFinite) || item.pos.some(value => Math.abs(value) > 30_000_000)) continue;
          items.set(item.uid, { uid: item.uid, id: item.id, count: item.count, damage: Number.isInteger(item.damage) ? Math.max(0, item.damage) : 0, pos: item.pos, vy: Number.isFinite(item.vy) ? Math.max(-80, Math.min(80, item.vy)) : 0, age: Number.isFinite(item.age) ? Math.max(0, Math.min(300, item.age)) : 0 });
        }
        socket.room.items = items;
        for (const peer of socket.room.clients) if (peer !== socket) send(peer, { type: 'item:snapshot', items: [...items.values()], done: true });
      } else if (message.type === 'item:spawn') {
        const source = message.item;
        if (!source || typeof source.uid !== 'string' || source.uid.length > 80 || !Number.isInteger(source.id) || source.id < 0 || source.id > 4095 || !Number.isInteger(source.count) || source.count < 1 || source.count > 999 || !Array.isArray(source.pos) || source.pos.length !== 3 || !source.pos.every(Number.isFinite) || source.pos.some(value => Math.abs(value) > 30_000_000)) return;
        if (socket.room.items.size >= 4096) return fail(socket, requestId, 'The shared item limit has been reached.');
        const uid = `${socket.clientId}:${source.uid}`;
        const item = { uid, id: source.id, count: source.count, damage: Number.isInteger(source.damage) ? Math.max(0, source.damage) : 0, pos: source.pos, vy: Number.isFinite(source.vy) ? Math.max(-80, Math.min(80, source.vy)) : 0, age: Number.isFinite(source.age) ? Math.max(0, Math.min(300, source.age)) : 0 };
        socket.room.items.set(uid, item);
        for (const peer of socket.room.clients) send(peer, { type: 'item:spawn', item });
      } else if (message.type === 'item:pickup') {
        const item = socket.room.items.get(String(message.uid ?? ''));
        if (!item) return;
        socket.room.items.delete(item.uid);
        send(socket, { type: 'item:pickup', item });
        for (const peer of socket.room.clients) if (peer !== socket) send(peer, { type: 'item:remove', uid: item.uid });
      } else if (message.type === 'projectile:update') {
        const now = Date.now();
        const shot = message.projectile;
        if (!shot || typeof shot.uid !== 'string' || shot.uid.length > 100 || !['player','mob'].includes(shot.owner) || !Array.isArray(shot.pos) || shot.pos.length !== 3 || !shot.pos.every(Number.isFinite) || shot.pos.some(value => Math.abs(value) > 30_000_000) || !Array.isArray(shot.vel) || shot.vel.length !== 3 || !shot.vel.every(Number.isFinite) || shot.vel.some(value => Math.abs(value) > 80)) return;
        if (now - (socket.projectileTimes.get(shot.uid) || 0) < 80) return;
        socket.projectileTimes.set(shot.uid, now);
        if (socket.room.projectiles.size >= 256 && !socket.room.projectiles.has(shot.uid)) return;
        const projectile = { uid: shot.uid, owner: shot.owner, pos: shot.pos, vel: shot.vel, age: Number.isFinite(shot.age) ? Math.max(0, Math.min(6, shot.age)) : 0, targetId: typeof shot.targetId === 'string' ? shot.targetId.slice(0, 80) : null, sourceId: socket.clientId };
        socket.room.projectiles.set(projectile.uid, projectile);
        const { sourceId, ...publicProjectile } = projectile;
        for (const peer of socket.room.clients) if (peer !== socket) send(peer, { type: 'projectile:update', projectile: publicProjectile });
      } else if (message.type === 'projectile:remove') {
        const uid = typeof message.uid === 'string' ? message.uid.slice(0, 100) : '';
        if (uid && socket.room.projectiles.delete(uid)) {
          socket.projectileTimes.delete(uid);
          for (const peer of socket.room.clients) if (peer !== socket) send(peer, { type: 'projectile:remove', uid });
        }
      } else if (message.type === 'vehicle:update') {
        const now = Date.now();
        const vehicle = message.vehicle;
        if (!vehicle || typeof vehicle.uid !== 'string' || vehicle.uid.length > 100 || !['boat','minecart','storage','powered'].includes(vehicle.type) || !Array.isArray(vehicle.pos) || vehicle.pos.length !== 3 || !vehicle.pos.every(Number.isFinite) || vehicle.pos.some(value => Math.abs(value) > 30_000_000) || !Number.isFinite(vehicle.rotation)) return;
        if (now - (socket.vehicleTimes.get(vehicle.uid) || 0) < 75) return;
        socket.vehicleTimes.set(vehicle.uid, now);
        if (socket.room.vehicles.size >= 1024 && !socket.room.vehicles.has(vehicle.uid)) return;
        const directions = [[1,0],[-1,0],[0,1],[0,-1]];
        const safeDirection = value => Array.isArray(value) && value.length === 2 && directions.some(([x,z]) => x === value[0] && z === value[1]);
        const safeVehicle = { uid: vehicle.uid, type: vehicle.type, pos: vehicle.pos, rotation: vehicle.rotation % (Math.PI * 2),
          vx: Number.isFinite(vehicle.vx) ? Math.max(-20, Math.min(20, vehicle.vx)) : 0,
          vz: Number.isFinite(vehicle.vz) ? Math.max(-20, Math.min(20, vehicle.vz)) : 0,
          ...(vehicle.type === 'storage' && Array.isArray(vehicle.slots) && vehicle.slots.length === 27 ? { slots: vehicle.slots } : {}),
          ...(vehicle.type === 'powered' ? { fuel: Number.isFinite(vehicle.fuel) ? Math.max(0, Math.min(3600, vehicle.fuel)) : 0 } : {}),
          ...(vehicle.type !== 'boat' ? {
            nodeX: Number.isInteger(vehicle.nodeX) ? Math.max(-30_000_000, Math.min(30_000_000, vehicle.nodeX)) : Math.floor(vehicle.pos[0]),
            nodeZ: Number.isInteger(vehicle.nodeZ) ? Math.max(-30_000_000, Math.min(30_000_000, vehicle.nodeZ)) : Math.floor(vehicle.pos[2]),
            target: safeDirection(vehicle.target) ? vehicle.target : null,
            progress: Number.isFinite(vehicle.progress) ? Math.max(0, Math.min(.999, vehicle.progress)) : 0,
            travel: safeDirection(vehicle.travel) ? vehicle.travel : [0,-1],
            cartSpeed: Number.isFinite(vehicle.cartSpeed) ? Math.max(0, Math.min(8, vehicle.cartSpeed)) : 0,
          } : {}) };
        socket.room.vehicles.set(vehicle.uid, { vehicle: safeVehicle, riding: !!message.riding, owner: socket.clientId });
        for (const peer of socket.room.clients) if (peer !== socket) send(peer, { type: 'vehicle:update', ...socket.room.vehicles.get(vehicle.uid) });
      } else if (message.type === 'vehicle:remove') {
        const uid = typeof message.uid === 'string' ? message.uid.slice(0, 100) : '';
        if (uid && socket.room.vehicles.delete(uid)) {
          socket.vehicleTimes.delete(uid);
          for (const peer of socket.room.clients) if (peer !== socket) send(peer, { type: 'vehicle:remove', uid });
        }
      } else if (message.type === 'tnt:ignite') {
        const now = Date.now();
        const { x, y, z } = message;
        if (socket === socket.room.host || now - socket.lastTntAt < 500 || !socket.lastState || ![x, y, z].every(Number.isInteger) || y < 0 || y >= 128 || Math.hypot(x + 0.5 - socket.lastState.x, z + 0.5 - socket.lastState.z) > 7) return;
        socket.lastTntAt = now;
        send(socket.room.host, { type: 'tnt:ignite', x, y, z });
      } else if (message.type === 'player:damage') {
        if (socket !== socket.room.host || typeof message.targetId !== 'string' || !Number.isFinite(message.amount) || message.amount <= 0 || message.amount > 40) return;
        const target = [...socket.room.clients].find(peer => peer.clientId === message.targetId);
        if (target) send(target, { type: 'player:damage', amount: message.amount });
      } else if (message.type === 'mob:attack') {
        const now = Date.now();
        if (socket === socket.room.host || now - socket.lastAttackAt < 350 || !socket.lastState || typeof message.uid !== 'string' || message.uid.length > 80) return;
        socket.lastAttackAt = now;
        send(socket.room.host, { type: 'mob:attack', attacker: { id: socket.clientId, name: socket.playerName, ...socket.lastState }, uid: message.uid, heldId: Number.isInteger(message.heldId) ? message.heldId : null, ranged: !!message.ranged });
      } else if (message.type === 'mob:snapshot') {
        if (socket.room.host !== socket) return fail(socket, requestId, 'Only the host can publish shared mob state.');
        if (!Array.isArray(message.mobs) || message.mobs.length > 18) return fail(socket, requestId, 'Invalid shared mob snapshot.');
        socket.room.mobs = message.mobs.filter(mob => mob && typeof mob.uid === 'string' && mob.uid.length <= 80 && typeof mob.type === 'string' && Array.isArray(mob.pos) && mob.pos.length === 3 && mob.pos.every(Number.isFinite) && [mob.yaw, mob.hp].every(Number.isFinite)).map(mob => ({ uid: mob.uid, type: mob.type, pos: mob.pos.map(value => Math.max(-30_000_000, Math.min(30_000_000, value))), yaw: mob.yaw, hp: Math.max(0, Math.min(1000, mob.hp)), sheared: !!mob.sheared, fuse: Number.isFinite(mob.fuse) ? mob.fuse : -1 }));
        for (const peer of socket.room.clients) if (peer !== socket) send(peer, { type: 'mob:snapshot', mobs: socket.room.mobs });
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
