import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { JSDOM } from 'jsdom';
import { Lighting, PSXPostProcess, SHADER_STYLES, shaderStyleId, syncFogUniforms } from '../src/rendering.js';
import { ParticleManager } from '../src/particles.js';

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
assert.deepEqual(SHADER_STYLES, ['classic', 'vibrant', 'cinematic', 'shader', 'psx']);
assert.equal(shaderStyleId('psx'), 4);
const psxPost = new PSXPostProcess(0.25);
psxPost.setSize(800, 600);
assert.equal(psxPost.target.width, 200, 'PSX output renders at one-quarter internal width');
assert.equal(psxPost.target.height, 150, 'PSX output renders at one-quarter internal height');
assert.match(psxPost.material.fragmentShader, /bayer4/);
assert.match(psxPost.material.fragmentShader, /#include <colorspace_fragment>/, 'post-process output converts back to the renderer output color space');
psxPost.dispose();
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
const caster = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
lighting.prepare(caster);
assert.equal(caster.layers.isEnabled(1), true, 'entity shader meshes participate in the sun-shadow pass');
const nonCaster = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
lighting.prepare(nonCaster, { castShadow: false });
assert.equal(nonCaster.layers.isEnabled(1), false, 'transient particles skip shadow rendering');

const vertex = solid.vertexShader, fragment = solid.fragmentShader;
assert.match(water.fragmentShader, /causticPattern/, 'water shader adds moving, sun-lit caustic glints');
assert.match(water.fragmentShader, /cos\(\(p\.x - p\.y\) \* 4\.1/, 'water surface uses finer secondary ripples');
assert.match(vertex, /attribute vec2 aLight/);
assert.match(vertex, /attribute vec3 aNormal/);
assert.match(vertex, /aInstanceLight/);
assert.match(fragment, /uShadowMap/);
assert.match(fragment, /fresnel/);
assert.match(fragment, /uEmissionMap/);
assert.match(fragment, /#include <colorspace_fragment>/);
assert.match(fragment, /uTime \* 0\.006/, 'water UV animation is consumed by the shader');
assert.match(vertex, /uPsxSnap/, 'PSX vertex snapping scales with depth');
assert.match(vertex, /snapGrid/, 'PSX snapping uses the active internal resolution');
assert.match(fragment, /vAffineUv/, 'PSX preset enables affine texture mapping');


assert.match(fragment, /coord\.z <= 0\.0/, 'points before the shadow frustum remain lit');
assert.match(fragment, /0\.00072/, 'shadow bias is small enough to avoid detached shadows');
assert.match(lighting.updateShadows.toString(), /texelWorldSize/, 'shadow projection is texel-snapped to reduce shimmer');

// A failed shadow pass must not poison the renderer state for the main frame.
const shadowScene = new THREE.Scene();
const priorOverride = new THREE.MeshBasicMaterial();
shadowScene.overrideMaterial = priorOverride;
const priorTarget = { name: 'screen' };
const fakeRenderer = {
  autoClear: false,
  currentTarget: priorTarget,
  getRenderTarget() { return this.currentTarget; },
  getClearColor(target) { return target.set(0x123456); },
  getClearAlpha() { return 0.25; },
  setClearColor(color, alpha) { this.clearColor = color; this.clearAlpha = alpha; },
  setRenderTarget(target) { this.currentTarget = target; },
  clear() {},
  render() { throw new Error('simulated shadow pass failure'); },
};
const shadowCamera = new THREE.PerspectiveCamera();
assert.throws(() => lighting.updateShadows(fakeRenderer, shadowScene, shadowCamera,
  { sunDirection: new THREE.Vector3(0.4, 0.8, 0.2) }, 'shader', 100, true), /simulated shadow pass failure/);
assert.equal(fakeRenderer.currentTarget, priorTarget, 'render target restored after shadow failure');
assert.equal(fakeRenderer.autoClear, false, 'autoClear restored after shadow failure');
assert.equal(shadowScene.overrideMaterial, priorOverride, 'override material restored after shadow failure');
assert.equal(fakeRenderer.clearAlpha, 0.25, 'clear alpha restored after shadow failure');
const cachedLighting = new Lighting({ shadowSize: 64 });
const cachedScene = new THREE.Scene();
const cachedCamera = new THREE.PerspectiveCamera();
const cacheRenderer = {
  autoClear: true, currentTarget: null, renders: 0,
  getRenderTarget() { return this.currentTarget; },
  getClearColor(target) { return target.set(0x000000); },
  getClearAlpha() { return 1; },
  setClearColor() {}, setRenderTarget(target) { this.currentTarget = target; }, clear() {},
  render() { this.renders++; },
};
const cacheSky = { sunDirection: new THREE.Vector3(0.4, 0.8, 0.2) };
cachedLighting.updateShadows(cacheRenderer, cachedScene, cachedCamera, cacheSky, 'shader', 10);
cachedLighting.updateShadows(cacheRenderer, cachedScene, cachedCamera, cacheSky, 'shader', 10.3);
assert.equal(cacheRenderer.renders, 1, 'unchanged shadow maps are cached instead of rendered every frame');
cachedCamera.position.x = 1;
cachedLighting.updateShadows(cacheRenderer, cachedScene, cachedCamera, cacheSky, 'shader', 10.4);
assert.equal(cacheRenderer.renders, 2, 'moving the view refreshes the shadow map promptly');
cachedLighting.updateShadows(cacheRenderer, cachedScene, cachedCamera, cacheSky, 'shader', 10.6, false, false);
assert.equal(cacheRenderer.renders, 2, 'Fast graphics skips the expensive dynamic shadow pass');
assert.equal(cachedLighting.shared.uShadowStrength.value, 0, 'Fast graphics disables shadow sampling in the visible shader');
cachedLighting.dispose();

const particleScene = { add() {} };
const particleManager = new ParticleManager(particleScene, null);
particleManager.particles = Array.from({ length: 200 }, () => ({}));
particleManager.setQuality('minimal');
assert.equal(particleManager.maxParticles, 48, 'Minimal particles have a small active cap');
assert.equal(particleManager.particles.length, 48, 'changing quality immediately trims excess particles');
particleManager.setQuality('decreased');
assert.equal(particleManager.maxParticles, 128, 'Decreased particles use a medium active cap');
particleManager.setQuality('all');
assert.equal(particleManager.maxParticles, 256, 'All particles restore the full visual cap');
particleManager.mesh.geometry.dispose();
particleManager.mesh.material.dispose();

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
assert.match(main, /lighting\.updateShadows\(renderer, scene, camera, sky, game\.shaderStyle, game\.time, false, game\.settings\.graphics !== 'fast'\)/);
assert.match(main, /const effectiveScale = Math\.max\(0\.35, s\.renderScale \* \(s\.graphics === 'fast' \? 0\.75 : 1\)\)/);
assert.match(main, /particles\.setQuality\(s\.particles\)/);
assert.match(main, /camera\.layers\.enable\(1\)/);
assert.match(main, /s\.layers\.enable\(1\)/);
console.log('ALL RENDERING TESTS PASSED');
