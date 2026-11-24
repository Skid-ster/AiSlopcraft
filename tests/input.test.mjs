import assert from 'node:assert/strict';
import { touchStick } from '../src/input.js';

const bindings = { forward: 'KeyI', back: 'KeyK', left: 'KeyJ', right: 'KeyL' };
const rect = { left: 10, top: 20, width: 100, height: 100 };
assert.deepEqual(touchStick(rect, 60, 70, bindings), { x: 0, y: 0, keys: new Set() });
assert.deepEqual(touchStick(rect, 64, 66, bindings), { x: 4, y: -4, keys: new Set() });
assert.deepEqual(touchStick(rect, 144, 70, bindings), { x: 42, y: 0, keys: new Set(['KeyL']) });
assert.deepEqual(touchStick(rect, 40, 51, bindings), { x: -20, y: -19, keys: new Set(['KeyI', 'KeyJ']) });
console.log('ALL INPUT TESTS PASSED');
