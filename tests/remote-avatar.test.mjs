import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import * as THREE from 'three';
import { createRemoteAvatarModel, disposeRemoteAvatarModel } from '../src/entities/remote-avatar.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.document = dom.window.document;
dom.window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
  get: () => () => {},
  set: () => true,
});

const lit = [];
const lighting = {
  prepare: root => lit.push(['prepare', root]),
  setObjectLight: (...args) => lit.push(['light', ...args]),
  forget: root => lit.push(['forget', root]),
};
const avatar = createRemoteAvatarModel('connection-1', 'Builder', lighting);
const scene = new THREE.Scene();
scene.add(avatar.root);
scene.updateMatrixWorld(true);
const bounds = object => new THREE.Box3().setFromObject(object);

const legs = bounds(avatar.leftLeg);
const torso = bounds(avatar.torso);
const arms = bounds(avatar.leftArm);
assert.ok(Math.abs(legs.min.y) < 1e-6, 'remote player legs rest on the world position instead of floating below it');
assert.ok(Math.abs(legs.max.y - torso.min.y) < 1e-6, 'legs meet the torso with no visible vertical gap');
assert.ok(Math.abs(torso.min.y - 0.72) < 1e-6, 'torso starts directly above the legs');
assert.ok(Math.abs(torso.max.y - 1.44) < 1e-6, 'torso ends at the shoulders');
assert.ok(arms.min.y >= 0.69 && arms.max.y <= 1.43, 'arms attach to the shoulders and end near the waist');
assert.equal(avatar.name, 'Builder');
assert.ok(avatar.labelTexture, 'name tag texture is created for the remote player');
assert.equal(lit.filter(entry => entry[0] === 'prepare').length, 1);

const samePlayerStyle = createRemoteAvatarModel('different-connection', 'Builder', lighting);
assert.equal(samePlayerStyle.torso.material.color.getHex(), avatar.torso.material.color.getHex(), 'player outfit color is stable across reconnects');
disposeRemoteAvatarModel(avatar, lighting);
assert.equal(lit.filter(entry => entry[0] === 'forget').length, 1, 'remote-player lighting resources are released on leave');
disposeRemoteAvatarModel(samePlayerStyle, lighting);
console.log('ALL REMOTE AVATAR TESTS PASSED');
