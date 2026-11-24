import assert from 'node:assert/strict';
import { canControl, canReachDrop, canInsertId, validEntityId, parseRelayMessage, relaySizeAllowed } from '../server/relay-policy.js';

const host = { clientId: 'host' }, owner = { clientId: 'owner' }, guest = { clientId: 'guest' };
assert.equal(canControl(guest, host, owner.clientId), false, 'another member cannot control an owned record');
assert.equal(canControl(host, host, owner.clientId), false, 'being host is not a vehicle ownership transfer');
assert.equal(canControl(host, host, owner.clientId, true), true, 'explicit host cleanup can control a record');
assert.equal(canControl(owner, host, owner.clientId), true, 'the recorded owner can control a record');
assert.equal(canControl(guest, host, undefined), false, 'unknown records are not owned');
const ids = new Map([['a', {}]]);
assert.equal(canInsertId(ids, 'a', 3), false);
assert.equal(canInsertId(ids, 'b', 1), false);
assert.equal(canInsertId(ids, 'b', 2), true);
assert.equal(validEntityId('', 80), false);
assert.equal(validEntityId(42, 80), false);
assert.equal(validEntityId('a'.repeat(81), 80), false);
assert.equal(validEntityId('a:b', 80), true);

const drop = { pos: [1, 10, 2] };
assert.equal(canReachDrop(null, drop, 5), false);
assert.equal(canReachDrop({ x: 1, y: 10, z: 2, dead: true }, drop, 5), false);
assert.equal(canReachDrop({ x: 1, y: 16, z: 2 }, drop, 5), false);
assert.equal(canReachDrop({ x: 1, y: 15, z: 2 }, drop, 5), true);
assert.equal(canReachDrop({ x: 1, y: 10, z: 2 }, undefined, 5), false);

for (const text of ['{', 'null', '42', '[]', '{"type":3}', '{}']) assert.equal(parseRelayMessage(text), null);
assert.deepEqual(parseRelayMessage('{"type":"ping"}'), { type: 'ping' });
assert.equal(relaySizeAllowed('ping', 65_536), true);
assert.equal(relaySizeAllowed('player:claim', 65_537), false);
assert.equal(relaySizeAllowed('room:create', 65_537), true);
assert.equal(relaySizeAllowed('world:snapshot', 1_048_577), false);
console.log('ALL RELAY POLICY TESTS PASSED');
