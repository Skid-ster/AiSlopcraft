import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { JSDOM } from 'jsdom';
import { Lighting, SHADER_STYLES, shaderStyleId, syncFogUniforms } from '../src/rendering.js';

const fog = new THREE.Fog(0x446688, 12, 90);
const materials = Array.from({ length: 3 }, () => ({ uniforms: {
  uFogColor: { value: new THREE.Color(0) }, uFogNear: { value: 0 }, uFogFar: { value: 0 },
} }));
assert.equal(syncFogUniforms(materials, fog), true);
for (const material of materials) {
  assert.equal(material.uniforms.uFogColor.value.getHex(), fog.color.getHex());
  assert.equal(material.uniforms.uFogNear.value, 12);
  assert.equal(material.uniforms.uFogFar.value, 90);
}
assert.equal(syncFogUniforms(materials, null), false);

const lighting = new Lighting({});
const solid = lighting.createMaterial({ voxel: true });
const water = lighting.createMaterial({ voxel: true, water: true, transparent: true, opacity: 0.78, depthWrite: false });
assert.equal(solid.uniforms.uSky, lighting.shared.uSky, 'materials share live sky uniforms');
assert.equal(water.uniforms.uWater.value, 1);
assert.equal(water.uniforms.uOpacity.value, 0.78, 'water opacity has a single owner');
assert.equal(water.depthWrite, false);
assert.equal(lighting.shared.uBrightness.value, 1);
const overlay = lighting.createMaterial({ fog: false });
assert.equal(overlay.uniforms.uShadowStrength.value, 0, 'hand overlay does not inherit world shadows');
assert.notEqual(overlay.uniforms.uShadowStrength, lighting.shared.uShadowStrength);
assert.deepEqual(SHADER_STYLES, ['classic', 'vibrant', 'cinematic', 'shader']);
assert.equal(shaderStyleId('cinematic'), 2);

const sky = { dayFactor: 1, sunDirection: new THREE.Vector3(0, 1, 0) };
lighting.update({ sky, time: 4, style: 'shader', fog });
assert.equal(lighting.shared.uShaderStyle.value, 3);
assert.equal(lighting.shared.uTime.value, 4);
assert.equal(lighting.shared.uFogFar.value, 90);
sky.dayFactor = 0;
lighting.update({ sky, time: 5, style: 'shader', fog });
assert.ok(lighting.shared.uSky.value < 0.05, 'night sky light is genuinely dark');
assert.equal(lighting.shared.uSunIntensity.value, 0, 'the sun does not illuminate at night');

// Legacy entity conversion keeps vertex hues and material tints intact.
const geometry = new THREE.BoxGeometry(1, 1, 1);
const count = geometry.getAttribute('position').count;
const colors = new Float32Array(count * 3).fill(0.5);
geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xff8844, vertexColors: true }));
lighting.prepare(mesh);
assert.equal(mesh.geometry.getAttribute('aTint').count, count);
assert.equal(mesh.material.uniforms.uHasMap.value, 0);
assert.ok(mesh.material.uniforms.uTint.value.r > 0.9, 'base tint survives conversion');
lighting.setObjectLight(mesh, 0, 14);
assert.deepEqual(mesh.material.uniforms.uObjectLight.value.toArray(), [0, 14]);
lighting.forget(mesh);
assert.equal(lighting.materials.has(mesh.material), false);

const vertex = solid.vertexShader, fragment = solid.fragmentShader;
assert.match(vertex, /attribute vec2 aLight/);
assert.match(vertex, /attribute vec3 aNormal/);
assert.match(vertex, /aInstanceLight/);
assert.match(fragment, /uShadowMap/);
assert.match(fragment, /fresnel/);
assert.match(fragment, /uEmissionMap/);
assert.match(fragment, /#include <colorspace_fragment>/);
assert.match(fragment, /uTime \* 0\.006/, 'water UV animation is consumed by the shader');

// Sky/fog integration: one source of truth, depth-tested celestials, underwater.
const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.document = dom.window.document;
dom.window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {}, set: () => true });
const { Sky } = await import('../src/sky.js');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
const skyObj = new Sky(scene, camera);
assert.equal(skyObj.sun.material.depthTest, true, 'sun cannot draw through terrain');
assert.equal(skyObj.moon.material.depthTest, true, 'moon cannot draw through terrain');
assert.equal(skyObj.stars.material.depthTest, true, 'stars cannot draw through terrain');
skyObj.update(0, new THREE.Vector3(), 2);
assert.equal(scene.fog.far, 24, 'short render distances get matching fog');
skyObj.update(0, new THREE.Vector3(), 6, { underwater: true });
assert.equal(scene.fog.far, 26);
assert.equal(skyObj.sun.visible, false);
assert.equal(skyObj.clouds.visible, false);
skyObj.update(0, new THREE.Vector3(), 6);
assert.equal(skyObj.sun.visible, true);
assert.ok(scene.fog.far > 80);

const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
assert.match(main, /lighting\.update\(\{ sky, time: game\.time, style: game\.shaderStyle, fog: scene\.fog \}\)/);
assert.match(main, /lighting\.updateShadows\(renderer, scene, camera, sky, game\.shaderStyle, game\.time\)/);
assert.match(main, /camera\.layers\.enable\(1\)/);
assert.match(main, /s\.layers\.enable\(1\)/);
console.log('ALL RENDERING TESTS PASSED');
