import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { syncFogUniforms } from '../src/rendering.js';

const fog = new THREE.Fog(0x446688, 12, 90);
const materials = Array.from({ length: 3 }, () => ({
  uniforms: {
    uFogColor: { value: new THREE.Color(0x000000) },
    uFogNear: { value: 0 },
    uFogFar: { value: 0 },
  },
}));
assert.equal(syncFogUniforms(materials, fog), true);
for (const material of materials) {
  assert.equal(material.uniforms.uFogColor.value.getHex(), fog.color.getHex());
  assert.equal(material.uniforms.uFogNear.value, 12);
  assert.equal(material.uniforms.uFogFar.value, 90);
}
assert.equal(syncFogUniforms(materials, null), false);

// Guard the real render loop integration: a missing/renamed call previously
// caused a ReferenceError immediately before renderer.render().
const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
assert.match(main, /import\s*\{\s*syncFogUniforms\s*\}\s*from\s*['"]\.\/rendering\.js['"]/);
assert.match(main, /syncFogUniforms\(\[solidMat,\s*cutoutMat,\s*waterMat\],\s*scene\.fog\);\s*renderer\.render\(scene,\s*camera\)/);
console.log('ALL RENDERING TESTS PASSED');
