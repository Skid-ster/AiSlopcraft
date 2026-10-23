import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FirstPersonArm } from '../src/arm.js';

const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 600);
const arm = new FirstPersonArm(camera, null, null, {});
const hand = arm.armMesh.getObjectByName('hand');
const sleeve = arm.armMesh.getObjectByName('sleeve');
const cuff = arm.armMesh.getObjectByName('cuff');
assert.ok(hand && sleeve && cuff, 'arm has distinct skin, sleeve, and cuff meshes');

function worldYBounds(mesh) {
  mesh.geometry.computeBoundingBox();
  return [mesh.position.y + mesh.geometry.boundingBox.min.y, mesh.position.y + mesh.geometry.boundingBox.max.y];
}
const [handBottom, handTop] = worldYBounds(hand);
const [sleeveBottom, sleeveTop] = worldYBounds(sleeve);
assert.ok(Math.abs(handTop - sleeveBottom) < 1e-6, 'skin and sleeve meet cleanly without overlap or a gap');
assert.ok(handBottom < handTop && sleeveBottom < sleeveTop, 'arm segments have positive height');

function sameBaseHue(mesh, hex) {
  const expected = new THREE.Color(hex);
  const attr = mesh.geometry.getAttribute('color');
  const pairs = [[attr.getX(0), expected.r], [attr.getY(0), expected.g], [attr.getZ(0), expected.b]];
  if (pairs.some(([actual, base]) => base < 1e-6 && Math.abs(actual) > 1e-6)) return false;
  const ratios = pairs.filter(([, base]) => base >= 1e-6).map(([actual, base]) => actual / base);
  return Math.max(...ratios) - Math.min(...ratios) < 1e-5;
}
assert.ok(sameBaseHue(hand, 0xd8a57c), 'all hand faces retain the skin base hue');
assert.ok(sameBaseHue(sleeve, 0x00a8a8), 'all sleeve faces retain the shirt base hue');

const failingRenderer = {
  autoClear: true,
  clearDepth() {},
  render() { throw new Error('test render failure'); },
};
assert.throws(() => arm.render(failingRenderer), /test render failure/);
assert.equal(failingRenderer.autoClear, true, 'overlay render restores renderer state after failure');
console.log('ALL ARM TESTS PASSED');
