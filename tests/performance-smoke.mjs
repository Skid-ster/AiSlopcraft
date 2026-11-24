import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { buildChunkMesh } from '../src/world/mesher.js';

const p95 = samples => samples.sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1];
const results = [];
for (const [edition, terrain, distance] of [['classic', null, 2], ['classic', null, 12], ['beta', 'overworld-v1', 2]]) {
  const world = new World('release-perf', undefined, edition, terrain);
  const coordinates = [];
  for (let z = -8; z < 8; z++) for (let x = -8; x < 8; x++) {
    if (x * x + z * z <= (distance + 0.5) ** 2) coordinates.push([x, z]);
  }
  coordinates.sort(([ax, az], [bx, bz]) => ax * ax + az * az - bx * bx - bz * bz);
  const generate = [], light = [], mesh = [], total = [];
  const addChunk = world.lighting.addChunk.bind(world.lighting);
  let lightMs = 0;
  world.lighting.addChunk = chunk => {
    const start = performance.now();
    addChunk(chunk);
    lightMs += performance.now() - start;
  };
  for (const [x, z] of coordinates) {
    lightMs = 0;
    const start = performance.now();
    const chunk = world.generateChunk(x, z);
    const generated = performance.now();
    buildChunkMesh(world, chunk, null, null, distance);
    total.push(generated - start);
    generate.push(generated - start - lightMs);
    light.push(lightMs);
    mesh.push(performance.now() - generated);
  }
  assert.equal(coordinates.length, distance === 2 ? 21 : 256);
  results.push({ world: terrain || edition, distance, chunks: coordinates.length, genP95Ms: p95(generate), lightP95Ms: p95(light), meshP95Ms: p95(mesh), genAndLightP95Ms: p95(total) });
}
console.table(results);
for (const result of results) {
  assert.ok(result.genAndLightP95Ms < 150, `${result.world} distance ${result.distance}: p95 chunk generation including light must be under 150 ms`);
  assert.ok(result.meshP95Ms < 100, `${result.world} distance ${result.distance}: p95 CPU meshing must be under 100 ms`);
}
