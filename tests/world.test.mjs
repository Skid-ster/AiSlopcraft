// Headless regression test for the world pipeline: generation, lighting, meshing,
// mining rules, crafting. Run with: npm test
import * as THREE from 'three';
import { World } from '../src/world/world.js';
import { buildChunkMesh } from '../src/world/mesher.js';
import { CH } from '../src/world/chunk.js';
import { WorldGen } from '../src/world/worldgen.js';
import { matchRecipe, smeltResult } from '../src/ui/recipes.js';
import { breakTime, canHarvest, STONE, DIAMOND_ORE, AIR, TORCH } from '../src/world/blocks.js';

let failures = 0;
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name);
  if (!cond) failures++;
}

const scene = new THREE.Scene();
const world = new World('Beta 1.7.3', scene);
for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) world.generateChunk(cx, cz);

const c0 = world.getChunk(0, 0);
const idx = (x, y, z) => (y * CH + z) * CH + x;

// Tree crowns surround the trunk top and have a leaf cap, with no missing layer.
const treeBlocks = new Map();
const treeWorld = { getBlockGen(x,y,z) { return treeBlocks.get(`${x},${y},${z}`) ?? AIR; }, setBlockGen(x,y,z,id) { treeBlocks.set(`${x},${y},${z}`,id); } };
new WorldGen('tree-test').placeTree(treeWorld, 0, 20, 0, { nextInt: () => 0, next: () => 0.9 });
check('tree canopy caps the trunk', treeWorld.getBlockGen(0, 24, 0) === 18 && treeWorld.getBlockGen(0, 23, 0) === 17);
check('tree canopy has continuous upper and lower leaf layers', [21,22,23,24].every(y => treeWorld.getBlockGen(1,y,0) === 18));

// terrain sanity
let nonAir = 0, water = 0, logs = 0;
for (let i = 0; i < c0.blocks.length; i++) {
  const b = c0.blocks[i];
  if (b !== 0) nonAir++;
  if (b === 8) water++;
  if (b === 17) logs++;
}
check('chunk has terrain', nonAir > 8000);
check('chunk has trees or neighbors do', logs > 0 || world.getChunk(1, 0).blocks.some(b => b === 17));

// lighting
check('skylight 15 in open air', c0.skyLight[idx(8, 110, 8)] === 15);
check('skylight 0 underground', c0.skyLight[idx(8, 1, 8)] === 0);

// torch light falloff (beta: 14, −1/block)
const y = world.heightAt(5, 5);
world.setBlock(5, y, 5, TORCH);
check('torch light 14 at source', c0.blockLight[idx(5, y, 5)] === 14);
check('torch light 13 adjacent', c0.blockLight[idx(5, y + 1, 5)] === 13);
check('torch light 12 two away', c0.blockLight[idx(7, y, 5)] === 12);

// meshing
const fakeTex = new THREE.Texture();
const built = buildChunkMesh(world, c0, fakeTex, fakeTex, 6);
check('mesh has geometry', built.solid.pos.length > 0);
check('mesh carries per-vertex sky/block light attributes', built.solid.light.length === (built.solid.pos.length / 3) * 2);
check('mesh carries RGBA tints for the shared shader', built.solid.col.length === (built.solid.pos.length / 3) * 4);
check('water alpha is owned by the material, not doubled in vertex colors', built.water.col.length === 0 || built.water.col.every((value, i) => i % 4 !== 3 || value === 1));
check('mesh carries a surface normal for directional shader lighting', built.solid.normal.length === (built.solid.pos.length / 3) * 3);
check('transparent water has dedicated standalone-texture UVs', built.water.uv.length === (built.water.pos.length / 3) * 2);
const mesh = built.makeMesh(built.solid, new THREE.MeshBasicMaterial());
check('makeMesh returns mesh', !!mesh);
check('render mesh exposes aligned aTint shader attribute',
  mesh?.geometry.getAttribute('aTint')?.count === mesh?.geometry.getAttribute('position')?.count &&
  mesh?.geometry.getAttribute('aTint')?.itemSize === 4);
check('render mesh exposes aligned aLight shader attribute',
  mesh?.geometry.getAttribute('aLight')?.count === mesh?.geometry.getAttribute('position')?.count &&
  mesh?.geometry.getAttribute('aLight')?.itemSize === 2);
check('render mesh exposes aligned aNormal shader attribute',
  mesh?.geometry.getAttribute('aNormal')?.count === mesh?.geometry.getAttribute('position')?.count &&
  mesh?.geometry.getAttribute('aNormal')?.itemSize === 3);
check('mesh normals are finite unit vectors',
  mesh?.geometry.getAttribute('aNormal')?.array.every(Number.isFinite) &&
  Math.abs(Math.hypot(...mesh.geometry.getAttribute('aNormal').array.slice(0, 3)) - 1) < 1e-5);
check('mesh shader light data matches the calculated per-vertex lighting',
  mesh?.geometry.getAttribute('aLight')?.array.length === built.solid.light.length &&
  mesh?.geometry.getAttribute('aLight')?.array[0] === built.solid.light[0]);

// mining rules (beta values)
check('stone by hand ≈ 7.9s', Math.abs(breakTime(STONE, null) - 7.9) < 1.2);
check('stone w/ wood pick ≈ 1.1s', Math.abs(breakTime(STONE, 270) - 1.1) < 0.3);
check('hand cannot harvest diamond ore', canHarvest(DIAMOND_ORE, null) === false);
check('iron pick harvests diamond ore', canHarvest(DIAMOND_ORE, 257) === true);
check('stone pick cannot harvest diamond ore', canHarvest(DIAMOND_ORE, 274) === false);

// crafting
check('2x2 planks -> crafting table', matchRecipe([{ id: 5, count: 1 }, { id: 5, count: 1 }, { id: 5, count: 1 }, { id: 5, count: 1 }], 2)?.id === 58);
check('planks column -> 4 sticks', matchRecipe([{ id: 5, count: 1 }, null, { id: 5, count: 1 }, null], 2)?.count === 4);

// smelting
check('iron ore -> ingot', smeltResult(15) === 265);
check('sand -> glass', smeltResult(12) === 20);
check('cobble -> stone', smeltResult(4) === 1);

// edits persist across regeneration
world.setBlock(8, y, 8, 5);
world.chunks.delete('0,0');
world.generateChunk(0, 0);
check('player edit survives chunk reload', world.getBlock(8, y, 8) === 5);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
