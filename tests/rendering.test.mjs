import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { JSDOM } from 'jsdom';
import { Lighting, SHADER_STYLES, shaderStyleId, syncFogUniforms } from '../src/rendering.js';
import { World } from '../src/world/world.js';
import { STONE, TORCH } from '../src/world/blocks.js';
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
const cutout = lighting.createMaterial({ voxel: true, cutout: true });
const water = lighting.createMaterial({ voxel: true, water: true, transparent: true, opacity: 0.78, depthWrite: false });
assert.equal(solid.uniforms.uSky, lighting.shared.uSky, 'materials share live sky uniforms');
assert.equal(solid.uniforms.uFoliage.value, 0, 'opaque terrain blocks do not sway');
assert.equal(cutout.uniforms.uFoliage.value, 1, 'cutout foliage receives Shader wind sway and translucency');
assert.equal(water.uniforms.uWater.value, 1);
assert.equal(water.uniforms.uOpacity.value, 0.78, 'water opacity has a single owner');
assert.equal(water.depthWrite, false);
assert.equal(lighting.shared.uBrightness.value, 1);
const overlay = lighting.createMaterial({ fog: false });
assert.equal(overlay.uniforms.uShadowStrength.value, 0, 'hand overlay does not inherit world shadows');
assert.notEqual(overlay.uniforms.uShadowStrength, lighting.shared.uShadowStrength);

// Only the two useful presets ('classic' = Normal, 'shader' = Shader) exist; legacy names safely fall back to 0.
assert.deepEqual(SHADER_STYLES, ['classic', 'shader']);
assert.equal(shaderStyleId('classic'), 0);
assert.equal(shaderStyleId('shader'), 1);
assert.equal(shaderStyleId('cinematic'), 0);
assert.equal(shaderStyleId('psx'), 0);

const sky = { dayFactor: 1, sunDirection: new THREE.Vector3(0, 1, 0) };
lighting.update({ sky, time: 4, style: 'shader', fog });
assert.equal(lighting.shared.uShaderStyle.value, 1);
assert.equal(lighting.shared.uTime.value, 4);
assert.equal(lighting.shared.uFogFar.value, 90);
sky.dayFactor = 0;
lighting.update({ sky, time: 5, style: 'shader', fog });
assert.equal(lighting.shared.uSky.value, 0.12, 'night retains the classic exposed-sky light floor instead of crushing block tops to black');
assert.equal(lighting.shared.uSunIntensity.value, 0, 'the sun does not illuminate at night');
assert.ok(lighting.shared.uSkyTint.value.b > lighting.shared.uSkyTint.value.g && lighting.shared.uSkyTint.value.g > lighting.shared.uSkyTint.value.r, 'night skylight uses 1.7.10 cool moonlit blue');
sky.dayFactor = 0.35;
lighting.update({ sky, time: 5, style: 'classic', fog });
assert.ok(lighting.shared.uSkyTint.value.r > lighting.shared.uSkyTint.value.b, 'sunset skylight warms toward amber');

// Legacy entity conversion keeps vertex hues and material tints intact.
const geometry = new THREE.BoxGeometry(1, 1, 1);
const count = geometry.getAttribute('position').count;
const colors = new Float32Array(count * 3).fill(0.5);
geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xff8844, vertexColors: true }));
lighting.prepare(mesh);
assert.equal(mesh.geometry.getAttribute('aTint').count, count);
assert.equal(mesh.material.uniforms.uHasMap.value, 0);
assert.equal(mesh.material.uniforms.uEntityShade.value, 0, 'pre-shaded vertex-colored geometry is not double-shaded');
assert.ok(mesh.material.uniforms.uTint.value.r > 0.9, 'base tint survives conversion');
lighting.setObjectLight(mesh, 0, 14);
assert.deepEqual(mesh.material.uniforms.uObjectLight.value.toArray(), [0, 14]);

// Trilinear non-opaque refreshObject avoids flashing pitch-black (0/0) when an entity or hand grazes a solid wall.
const fakeWallWorld = {
  getBlock(x) { return x >= 1 ? STONE : 0; },
  getLight(x) { return x >= 1 ? 0 : ((15 << 4) | 12); },
};
lighting.refreshObject(mesh, fakeWallWorld, new THREE.Vector3(0.95, 64.2, 0.5), 0.9);
assert.ok(mesh.material.uniforms.uObjectLight.value.x >= 14.5, 'entity next to opaque wall samples adjacent open air instead of flashing 0');
assert.ok(mesh.material.uniforms.uObjectLight.value.y >= 11.5, 'entity next to opaque wall keeps steady block light');

lighting.forget(mesh);
assert.equal(lighting.materials.has(mesh.material), false);
const caster = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
lighting.prepare(caster);
assert.equal(caster.layers.isEnabled(1), true, 'entity shader meshes participate in the sun-shadow pass');
assert.equal(caster.material.uniforms.uEntityShade.value, 1, 'unshaded entity meshes receive 1.7.10 diffuse box face shading');
const nonCaster = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
lighting.prepare(nonCaster, { castShadow: false });
assert.equal(nonCaster.layers.isEnabled(1), false, 'transient particles skip shadow rendering');

const vertex = solid.vertexShader, fragment = solid.fragmentShader;
assert.equal(solid.uniforms.uEntityShade.value, 0, 'voxel terrain uses baked 1.7.10 directional face shading only once');
assert.match(vertex, /pow\(max\(aTint\.rgb, vec3\(0\.0\)\), vec3\(2\.2\)\)/, 'voxel vertex tints convert cleanly from sRGB to linear');
assert.match(fragment, /nSky \/ \(4\.0 - 3\.0 \* nSky\)/, 'fragment shader uses 1.7.10 hyperbolic lightBrightnessTable');
assert.match(fragment, /1\.0 - invLight \* invLight \* invLight \* invLight/, 'fragment shader applies 1.7.10 gamma curve for brightness');
assert.match(fragment, /uHasEmissionMap > 0\.5 \? texture2D\(uEmissionMap, uv\)\.r : 0\.0/, 'emissive atlas pixels glow even when uEmission is 0');
assert.doesNotMatch(fragment, /torchFlicker/, 'emitted torch/lava/glowstone light does not oscillate or flicker over time');
assert.doesNotMatch(vertex, /uPsxSnap/, 'removed PSX vertex-snapping jitter is absent');
assert.doesNotMatch(fragment, /vAffineUv/, 'removed PSX affine texture warping is absent');
assert.match(fragment, /acesFilmic/, 'Shader mode applies ACES filmic tone mapping');
assert.match(fragment, /coolAmbient/, 'Shader mode contrasts cool sky shadows with warm sunlight');
assert.match(fragment, /backScatter/, 'Shader mode adds subsurface translucency on sunlit foliage');
assert.match(fragment, /sunAlign/, 'Shader mode adds directional Mie sun-haze');
assert.match(water.fragmentShader, /causticPattern/, 'water shader adds moving, sun-lit caustic glints');
assert.match(water.fragmentShader, /cos\(\(p\.x - p\.y\) \* 4\.1/, 'water surface uses finer secondary ripples');
assert.match(vertex, /attribute vec2 aLight/);
assert.match(vertex, /attribute vec3 aNormal/);
assert.match(vertex, /aInstanceLight/);
assert.match(fragment, /uShadowMap/);
assert.match(fragment, /fresnel/);
assert.match(fragment, /uEmissionMap/);
assert.match(fragment, /#include <colorspace_fragment>/);
assert.match(fragment, /uWater > 0\.5 && uShaderStyle > 0\.5/, 'Normal water stays still and pixelated');
assert.match(vertex, /uWater > 0\.5 && uShaderStyle > 0\.5/, 'Normal water geometry is not artificially wavy');
assert.match(fragment, /float daylight = max\(uSky, 0\.12\)/, 'night lighting retains a visible classic sky floor');
assert.match(fragment, /skyLight \+ direct \+ torchLight/, 'warm torch light adds to skylight instead of disappearing in daylight');
assert.match(fragment, /coord\.z <= 0\.0/, 'points before the shadow frustum remain lit');
assert.match(fragment, /0\.00072/, 'shadow bias is small enough to avoid detached shadows');
assert.match(lighting.updateShadows.toString(), /texelWorldSize/, 'shadow projection is texel-snapped to reduce shimmer');
assert.match(lighting.updateShadows.toString(), /_quantizedSun/, 'shadow sun direction is quantized to stop sub-pixel swimming');

// Diagonal chunk corner lighting changes mark diagonal neighbor meshes dirty to prevent corner seam flicker.
{
  const w = new World('corner-light-test', null, 'beta', 'overworld-v1');
  for (let cx = 0; cx <= 1; cx++) {
    for (let cz = 0; cz <= 1; cz++) {
      const c = w.generateChunk(cx, cz);
      c.meshes = { solid: {} };
      c.dirty = false;
    }
  }
  const y = w.heightAt(15, 15) + 2;
  w.setBlock(15, y, 15, TORCH);
  assert.equal(w.getChunk(1, 1).dirty, true, 'diagonal chunk mesh is marked dirty when corner light changes');
}

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
cachedLighting.invalidateShadows();
cachedLighting.updateShadows(cacheRenderer, cachedScene, cachedCamera, cacheSky, 'shader', 10.35);
assert.equal(cacheRenderer.renders, 2, 'invalidating shadows on chunk remesh refreshes the shadow map immediately');
cachedCamera.position.x = 1;
cachedLighting.updateShadows(cacheRenderer, cachedScene, cachedCamera, cacheSky, 'shader', 10.5);
assert.equal(cacheRenderer.renders, 3, 'moving the view refreshes the shadow map promptly');
cachedLighting.updateShadows(cacheRenderer, cachedScene, cachedCamera, cacheSky, 'shader', 10.6, false, false);
assert.equal(cacheRenderer.renders, 3, 'Fast graphics skips the expensive dynamic shadow pass');
assert.equal(cachedLighting.shared.uShadowStrength.value, 0, 'Fast graphics disables shadow sampling in the visible shader');
cachedLighting.updateShadows(cacheRenderer, cachedScene, cachedCamera, cacheSky, 'shader', 10.7);
assert.ok(cachedLighting.shared.uShadowStrength.value > 0, 'sun shadows resume immediately after returning to Fancy graphics');
const rendersBeforeTurn = cacheRenderer.renders;
cachedCamera.rotation.y = Math.PI / 2;
cachedLighting.updateShadows(cacheRenderer, cachedScene, cachedCamera, cacheSky, 'shader', 10.9);
assert.ok(cacheRenderer.renders > rendersBeforeTurn, 'turning in place recenters the sun shadow map');
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
assert.equal(skyObj.sun.material.blending, THREE.AdditiveBlending, 'sun uses additive sky blending');
assert.equal(skyObj.moon.material.depthTest, true, 'moon cannot draw through terrain');
assert.equal(skyObj.stars.material.depthTest, true, 'stars cannot draw through terrain');
assert.notEqual(skyObj.clouds.position.y % 1, 0, 'clouds sit at a non-integer height so they never Z-fight with block tops');
skyObj.time = 0.25;
skyObj.update(0, new THREE.Vector3(), 6);
assert.ok(skyObj.skyUniforms.uHorizon.value.r > skyObj.skyUniforms.uHorizon.value.b, 'dawn/sunset horizon carries warm glow');
skyObj.time = 0.5;
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
assert.doesNotMatch(main, /PSXPostProcess/, 'removed PSX post-process pass is absent from main loop');
console.log('ALL RENDERING TESTS PASSED');
