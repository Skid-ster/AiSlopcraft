import { OVERWORLD_TERRAIN } from '../world/world-profile.js';

const REQUEST_TIMEOUT_MS = 12_000;
const CONNECT_TIMEOUT_MS = 60_000;

export function normalizeRelayUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'wss:' && url.protocol !== 'ws:') throw new Error('Multiplayer server must use ws:// or wss://. Use wss:// on public sites.');
  if (url.protocol === 'ws:' && !['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname)) {
    throw new Error('Public sites require a secure wss:// multiplayer server.');
  }
  if (!url.pathname || url.pathname === '/') url.pathname = '/ws';
  return url.toString();
}

const EARLY_MESSAGE_TYPES = new Set([
  'world:snapshot', 'container:snapshot', 'container:state', 'container:remove',
  'room:dimension', 'item:snapshot', 'game:state', 'mob:snapshot',
  'vehicle:snapshot', 'projectile:snapshot', 'player:state',
]);

export class MultiplayerClient {
  constructor() {
    this.socket = null;
    this.pending = new Map();
    this.listeners = new Map();
    this.earlyMessages = new Map();
    this.requestSequence = 0;
    this.room = null;
    this.resumeToken = null;
    this.playerName = null;
    this._manualDisconnect = false;
    this._reconnecting = false;
  }

  on(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
    const queued = this.earlyMessages.get(type) || [];
    this.earlyMessages.delete(type);
    for (const message of queued) {
      try { listener(message); } catch (error) { console.error(`Multiplayer ${type} listener failed`, error); }
    }
    return () => this.listeners.get(type)?.delete(listener);
  }

  emit(type, message) {
    for (const listener of this.listeners.get(type) || []) {
      try { listener(message); } catch (error) { console.error(`Multiplayer ${type} listener failed`, error); }
    }
  }

  async _openSocket(url) {
    if (typeof WebSocket === 'undefined') throw new Error('This browser does not support WebSockets.');
    const socket = new WebSocket(url);
    this.socket = socket;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { socket.close(); reject(new Error('Could not connect to the multiplayer server.')); }, CONNECT_TIMEOUT_MS);
      socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Could not connect to the multiplayer server. Check the address and that the server is running.')); }, { once: true });
    });
    socket.addEventListener('message', event => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'room:closed') {
        this.room = null;
        this.resumeToken = null;
      }
      if (message.requestId && this.pending.has(message.requestId)) {
        const pending = this.pending.get(message.requestId);
        this.pending.delete(message.requestId);
        clearTimeout(pending.timeout);
        if (message.type === 'error') pending.reject(new Error(message.message || 'Multiplayer request failed.'));
        else pending.resolve(message);
      }
      if (EARLY_MESSAGE_TYPES.has(message.type) && !this.listeners.get(message.type)?.size) {
        const queued = this.earlyMessages.get(message.type) || [];
        queued.push(message);
        if (queued.length > 1024) queued.shift();
        this.earlyMessages.set(message.type, queued);
      }
      this.emit(message.type, message);
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Multiplayer server disconnected.'));
        this.pending.delete(id);
      }
      if (!this._manualDisconnect && this.room?.code && this.resumeToken && !this._reconnecting) {
        void this._attemptAutoResume();
        return;
      }
      this.playerName = null;
      this.room = null;
      this.resumeToken = null;
      this.emit('disconnected', {});
    });
    return socket;
  }

  async _attemptAutoResume() {
    const savedRoom = this.room;
    const token = this.resumeToken;
    const url = this.relayUrl;
    if (!savedRoom?.code || !token || !url) return;
    this._reconnecting = true;
    this.emit('reconnecting', { code: savedRoom.code });
    const delays = [150, 400, 1000];
    for (let attempt = 0; attempt < delays.length; attempt++) {
      await new Promise(r => setTimeout(r, delays[attempt]));
      if (this._manualDisconnect) break;
      try {
        await this._openSocket(url);
        const resumed = await this.resumeSession(savedRoom.code, token);
        this.room = resumed;
        this.resumeToken = resumed.resumeToken || null;
        this.playerName = resumed.playerName || this.playerName;
        this._reconnecting = false;
        this.emit('reconnected', resumed);
        return;
      } catch {
        const s = this.socket;
        this.socket = null;
        if (s && s.readyState < WebSocket.CLOSING) s.close();
      }
    }
    this._reconnecting = false;
    this.playerName = null;
    this.room = null;
    this.resumeToken = null;
    this.emit('disconnected', {});
  }

  async connect(relay) {
    const url = normalizeRelayUrl(relay);
    if (this.socket?.readyState === WebSocket.OPEN && this.relayUrl === url) return this;
    this.disconnect(false);
    this._manualDisconnect = false;
    this.relayUrl = url;
    await this._openSocket(url);
    return this;
  }

  request(type, payload = {}) {
    if (this.socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Not connected to the multiplayer server.'));
    const requestId = `${Date.now().toString(36)}-${(++this.requestSequence).toString(36)}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('The multiplayer server took too long to respond.'));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ type, requestId, ...payload }));
    });
  }

  send(type, payload = {}) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ type, ...payload }));
    return true;
  }

  listRooms() { return this.request('rooms:list', { terrain: OVERWORLD_TERRAIN }); }
  listOnlinePlayers() { return this.request('players:list'); }
  claimPlayerName(name) {
    return this.request('player:claim', { name }).then(message => {
      this.playerName = message.name;
      return message;
    });
  }
  releasePlayerName() {
    if (!this.playerName) return Promise.resolve();
    return this.request('player:release').then(message => {
      this.playerName = null;
      this.room = null;
      return message;
    });
  }
  async ping() {
    const now = () => globalThis.performance?.now?.() ?? Date.now();
    const startedAt = now();
    await this.request('ping');
    return Math.max(0, Math.round(now() - startedAt));
  }
  createRoom(options) {
    return this.request('room:create', { resume: true, ...options }).then(message => {
      this.room = message;
      this.resumeToken = message.resumeToken || null;
      return message;
    });
  }
  joinRoom(options) {
    this.earlyMessages.clear();
    return this.request('room:join', { resume: true, ...options, terrain: OVERWORLD_TERRAIN }).then(message => {
      this.room = message;
      this.resumeToken = message.resumeToken || null;
      return message;
    });
  }
  resumeSession(code, resumeToken) {
    this.earlyMessages.clear();
    return this.request('session:resume', { code, resumeToken });
  }
  containerTx(payload) {
    return this.request('container:tx', payload);
  }
  publishContainers(dimension, chests, furnaces) {
    return this.request('container:snapshot', { dimension, chests, furnaces });
  }
  switchDimension(dimension, spawn = null) {
    return this.request('room:dimension', { dimension, ...(spawn ? { spawn } : {}) });
  }
  leave() {
    const room = this.room;
    this.room = null;
    this.resumeToken = null;
    return room ? this.request('room:leave').catch(() => {}) : Promise.resolve();
  }
  closeRoom() {
    const room = this.room;
    this.room = null;
    this.resumeToken = null;
    return room ? this.request('room:close').catch(() => {}) : Promise.resolve();
  }
  disconnect(leave = true) {
    this._manualDisconnect = true;
    if (leave && this.room) this.send('room:leave');
    this.room = null;
    this.resumeToken = null;
    for (const pending of this.pending.values()) { clearTimeout(pending.timeout); pending.reject(new Error('Disconnected.')); }
    this.pending.clear();
    const socket = this.socket;
    this.socket = null;
    this.playerName = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Client disconnected');
  }
}
