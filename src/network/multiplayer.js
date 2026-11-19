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

export class MultiplayerClient {
  constructor() {
    this.socket = null;
    this.pending = new Map();
    this.listeners = new Map();
    this.earlyMessages = new Map();
    this.requestSequence = 0;
    this.room = null;
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

  async connect(relay) {
    const url = normalizeRelayUrl(relay);
    if (this.socket?.readyState === WebSocket.OPEN && this.relayUrl === url) return;
    this.disconnect(false);
    if (typeof WebSocket === 'undefined') throw new Error('This browser does not support WebSockets.');
    this.relayUrl = url;
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
      if (message.requestId && this.pending.has(message.requestId)) {
        const pending = this.pending.get(message.requestId);
        this.pending.delete(message.requestId);
        clearTimeout(pending.timeout);
        if (message.type === 'error') pending.reject(new Error(message.message || 'Multiplayer request failed.'));
        else pending.resolve(message);
      }
      if (['world:snapshot', 'item:snapshot', 'game:state', 'mob:snapshot', 'player:state'].includes(message.type) && !this.listeners.get(message.type)?.size) {
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
      this.emit('disconnected', {});
    });
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

  listRooms() { return this.request('rooms:list'); }
  createRoom(options) { return this.request('room:create', options).then(message => { this.room = message; return message; }); }
  joinRoom(options) { return this.request('room:join', options).then(message => { this.room = message; return message; }); }
  leave() {
    const room = this.room;
    this.room = null;
    return room ? this.request('room:leave').catch(() => {}) : Promise.resolve();
  }
  closeRoom() {
    const room = this.room;
    this.room = null;
    return room ? this.request('room:close').catch(() => {}) : Promise.resolve();
  }
  disconnect(leave = true) {
    if (leave && this.room) this.send('room:leave');
    this.room = null;
    for (const pending of this.pending.values()) { clearTimeout(pending.timeout); pending.reject(new Error('Disconnected.')); }
    this.pending.clear();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Client disconnected');
  }
}
