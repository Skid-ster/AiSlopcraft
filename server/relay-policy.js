export const MAX_MESSAGE = 1024 * 1024;
const MAX_SMALL_MESSAGE = 64 * 1024;
const LARGE_MESSAGE_TYPES = new Set(['room:create', 'world:snapshot', 'container:snapshot', 'game:state', 'item:snapshot']);

export function parseRelayMessage(text) {
  try {
    const message = JSON.parse(text);
    return message && typeof message.type === 'string' ? message : null;
  } catch { return null; }
}

export function relaySizeAllowed(type, bytes) {
  return bytes <= (LARGE_MESSAGE_TYPES.has(type) ? MAX_MESSAGE : MAX_SMALL_MESSAGE);
}

export const validEntityId = (uid, max) => typeof uid === 'string' && uid.length > 0 && uid.length <= max;
export const canInsertId = (records, uid, limit) => records.size < limit && !records.has(uid);

export function canControl(actor, host, ownerId, hostOverride = false) {
  return Boolean(ownerId && (ownerId === actor.clientId || (hostOverride && actor === host)));
}

export function canReachDrop(state, drop, range) {
  return Boolean(state && !state.dead && drop
    && Math.hypot(drop.pos[0] - state.x, drop.pos[1] - state.y, drop.pos[2] - state.z) <= range);
}
