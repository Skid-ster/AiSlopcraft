import assert from 'node:assert/strict';
import * as THREE from 'three';
import { JSDOM } from 'jsdom';
import { NetherGen, NETHER_HEIGHT, NETHER_LAVA_SEA } from '../src/world/nether-gen.js';
import { World } from '../src/world/world.js';
import { CH } from '../src/world/chunk.js';
import { buildChunkMesh } from '../src/world/mesher.js';
import {
  AIR, BEDROCK, LAVA, NETHERRACK, GLOWSTONE, QUARTZ_ORE,
  NETHER_BRICK, NETHER_BRICK_FENCE, NETHER_BRICK_STAIRS,
  OBSIDIAN, NETHER_PORTAL, ENCHANTING_TABLE, OAK_STAIRS, FENCE,
} from '../src/world/blocks.js';
import {
  findPortalFrameAt, tryIgnitePortal, collapseInvalidPortalsNear, resolvePortalDestination,
} from '../src/world/portals.js';
import { useOnBlock } from '../src/interactions.js';
import { Player } from '../src/entities/player.js';
import { decodeWorldSave, encodeWorldSave, WORLD_SAVE_VERSION } from '../src/save.js';
import { OVERWORLD_TERRAIN } from '../src/world/world-profile.js';
import { Lighting } from '../src/rendering.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
dom.window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {}, set: () => true });
const makePlayer = w => new Player(w, new THREE.PerspectiveCamera(), document.createElement('canvas'));

// 1. NetherGen determinism, bedrock roof/floor, lava sea, Quartz/Glowstone, & Nether Fortress
{
  const genA = new NetherGen('fortress-seed-1');
  const genB = new NetherGen('fortress-seed-1');
  const world = new World('fortress-seed-1', null, 'beta', 'nether-v1');
  assert.equal(world.dimension, 'nether');

  const chunkA = world.generateChunk(0, 0);
  const worldB = new World('fortress-seed-1', null, 'beta', 'nether-v1');
  const chunkB = worldB.generateChunk(0, 0);
  assert.deepEqual(chunkA.blocks, chunkB.blocks, 'NetherGen chunk generation is 100% deterministic');

  // Bedrock floor (y=0) and ceiling (y=127), zero skylight everywhere
  for (let lx = 0; lx < CH; lx += 4) {
    for (let lz = 0; lz < CH; lz += 4) {
      assert.equal(chunkA.get(lx, 0, lz), BEDROCK, 'y=0 is solid Bedrock floor');
      assert.equal(chunkA.get(lx, NETHER_HEIGHT - 1, lz), BEDROCK, 'y=127 is solid Bedrock ceiling');
      const packed = world.getLight(lx, 64, lz);
      assert.equal(packed >> 4, 0, 'Nether has zero skylight everywhere');
    }
  }

  // Scan nearby chunks for Nether blocks + a Nether Fortress chunk
  let sawLavaSea = false, sawNetherrack = false, sawQuartz = false, sawFortressBrick = false;
  for (let cx = 0; cx < 12; cx++) {
    for (let cz = 0; cz < 12; cz++) {
      if (!genA.isFortressZone(cx, cz) && cx > 2) continue;
      const c = world.generateChunk(cx, cz);
      for (let i = 0; i < c.blocks.length; i++) {
        const b = c.blocks[i];
        if (b === LAVA) sawLavaSea = true;
        else if (b === NETHERRACK) sawNetherrack = true;
        else if (b === QUARTZ_ORE) sawQuartz = true;
        else if (b === NETHER_BRICK || b === NETHER_BRICK_FENCE || b === NETHER_BRICK_STAIRS) sawFortressBrick = true;
      }
      if (genA.isFortressZone(cx, cz)) {
        assert.equal(genB.columnInfo(cx * 16 + 8, cz * 16 + 8).biome, 'Nether Fortress');
      }
    }
  }
  assert.ok(NETHER_LAVA_SEA === 31 && sawLavaSea, 'Nether generates y<=31 lava oceans');
  assert.ok(sawNetherrack && sawQuartz, 'Nether generates Netherrack caverns and Quartz Ore veins');
  assert.ok(sawFortressBrick, 'Nether Fortress complexes generate Nether Brick bridges, fences, and stairs');
}

// 2. Meshing custom geometry (Stairs, Fences, Enchanting Table, Nether Portal) & Nether water evaporation
{
  const world = new World('mesh-nether-blocks', null, 'beta', 'nether-v1');
  world.generateChunk(0, 0);
  world.setBlock(4, 70, 4, OAK_STAIRS, 1);
  world.setBlock(6, 70, 4, FENCE, 0);
  world.setBlock(8, 70, 4, ENCHANTING_TABLE, 0);
  world.setBlock(10, 70, 4, NETHER_PORTAL, 0);
  world.setBlock(12, 70, 4, GLOWSTONE, 0);
  assert.equal(world.getLight(12, 70, 4) & 15, 15, 'Glowstone emits block light 15 in Nether');

  const built = buildChunkMesh(world, world.generateChunk(0, 0));
  assert.ok(built.solid.pos.length > 0, 'stairs, fences, and enchanting table build solid sub-voxel geometry');
  assert.ok(built.cutout.pos.length > 0, 'Nether portal builds translucent cutout pane geometry');

  // Water bucket evaporates in Nether instead of placing water
  const player = makePlayer(world);
  player.inventory[0] = { id: 326, count: 1, damage: 0 }; // Water Bucket
  player.hotbarIndex = 0;
  world.setBlock(5, 68, 5, NETHERRACK);
  world.setBlock(5, 69, 5, AIR);
  const evaporated = useOnBlock(world, player, { x: 5, y: 68, z: 5, face: [0, 1, 0] });
  assert.equal(evaporated, true, 'using a Water Bucket in the Nether is handled immediately');
  assert.equal(world.getBlock(5, 69, 5), AIR, 'water evaporates in the Nether without placing source water');
  assert.equal(player.inventory[0].id, 325, 'water bucket returns an empty bucket after evaporating');
}

// 3. Obsidian Portal frame validation, Flint & Steel ignition, flood collapse, & 1:8 / 8:1 travel
{
  const overworld = new World('portal-travel-seed', null, 'beta', OVERWORLD_TERRAIN);
  for (let cx = 0; cx <= 2; cx++) for (let cz = 0; cz <= 2; cz++) overworld.generateChunk(cx, cz);
  const bx = 16, by = 72, bz = 16;
  // Clear space & build a 4x5 Obsidian frame along X
  for (let dx = -1; dx <= 5; dx++) {
    for (let dy = -1; dy <= 6; dy++) {
      for (let dz = -2; dz <= 2; dz++) overworld.setBlock(bx + dx, by + dy, bz + dz, AIR);
    }
  }
  for (let dx = 0; dx < 4; dx++) {
    overworld.setBlock(bx + dx, by, bz, OBSIDIAN);
    overworld.setBlock(bx + dx, by + 4, bz, OBSIDIAN);
  }
  for (let dy = 0; dy < 5; dy++) {
    overworld.setBlock(bx, by + dy, bz, OBSIDIAN);
    overworld.setBlock(bx + 3, by + dy, bz, OBSIDIAN);
  }

  assert.ok(findPortalFrameAt(overworld, bx + 1, by + 1, bz), 'detects valid 4x5 Obsidian portal frame');
  const player = makePlayer(overworld);
  player.inventory[0] = { id: 259, count: 1, damage: 0 }; // Flint and Steel
  player.hotbarIndex = 0;
  const lit = useOnBlock(overworld, player, { x: bx + 1, y: by, z: bz, face: [0, 1, 0] });
  assert.equal(lit, true, 'Flint and Steel ignites valid Obsidian frame');
  assert.equal(overworld.getBlock(bx + 1, by + 1, bz), NETHER_PORTAL);
  assert.equal(overworld.getBlock(bx + 2, by + 3, bz), NETHER_PORTAL);

  // Breaking one Obsidian frame block collapses all interior NETHER_PORTAL blocks
  overworld.setBlock(bx, by + 2, bz, AIR);
  collapseInvalidPortalsNear(overworld, bx, by + 2, bz);
  assert.equal(overworld.getBlock(bx + 1, by + 1, bz), AIR, 'breaking frame collapses interior portal blocks');
  assert.equal(overworld.getBlock(bx + 2, by + 3, bz), AIR);

  // 1:8 Overworld -> Nether and 8:1 Nether -> Overworld coordinate scaling + arrival portal
  const netherWorld = new World('portal-travel-seed', null, 'beta', 'nether-v1');
  const toNether = resolvePortalDestination(new THREE.Vector3(80, 70, -160), 'overworld', netherWorld);
  assert.ok(Math.hypot(toNether.x - 10, toNether.z - (-20)) < 20, 'Overworld -> Nether scales X/Z by 1:8');
  assert.ok(toNether.y >= 32 && toNether.y <= 118, 'Nether arrival portal spawns safely above lava sea and below roof');

  const backToOverworld = resolvePortalDestination(new THREE.Vector3(10, 64, -20), 'nether', overworld);
  assert.ok(Math.hypot(backToOverworld.x - 80, backToOverworld.z - (-160)) < 24, 'Nether -> Overworld scales X/Z by 8:1');
}

// 4. World.switchDimension, Nether sky/lighting, & v2 portable save round-trip
{
  const w = new World('switch-dim-seed', null, 'beta', OVERWORLD_TERRAIN);
  w.generateChunk(0, 0);
  w.setBlock(2, 80, 2, OBSIDIAN);
  const owEdits = [...w.edits].map(([k, id]) => [k, id, w.metaEdits.get(k) || 0]);

  w.switchDimension('nether', OVERWORLD_TERRAIN, [['4,60,4', GLOWSTONE, 0]]);
  w.generateChunk(0, 0);
  assert.equal(w.dimension, 'nether');
  assert.equal(w.getBlock(4, 60, 4), GLOWSTONE);

  w.switchDimension('overworld', OVERWORLD_TERRAIN, owEdits);
  w.generateChunk(0, 0);
  assert.equal(w.dimension, 'overworld');
  assert.equal(w.getBlock(2, 80, 2), OBSIDIAN);

  // Sky & Lighting Nether crimson fog + shadow suppression
  const { Sky } = await import('../src/sky.js');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const sky = new Sky(scene, camera);
  sky.update(0, new THREE.Vector3(), 6, { dimension: 'nether' });
  assert.equal(sky.dimension, 'nether');
  assert.equal(sky.sun.visible, false, 'sun hidden in Nether');
  assert.ok(scene.fog.color.r > scene.fog.color.b * 2, 'Nether fog has deep crimson-ember color');

  const lighting = new Lighting({});
  lighting.update({ sky, time: 1, style: 'shader', fog: scene.fog });
  assert.equal(lighting.shared.uShadowStrength.value, 0, 'directional sun shadows are disabled in the Nether');
  lighting.dispose();

  // v2 Save round-trip preserves Nether dimension, Nether edits/containers, XP, and item enchants
  const encoded = encodeWorldSave({
    version: WORLD_SAVE_VERSION,
    id: 'nether-save-test',
    name: 'Nether Expedition',
    seed: 'Beta 1.7.3',
    edition: 'beta',
    terrain: OVERWORLD_TERRAIN,
    dimension: 'nether',
    gameMode: 'survival',
    time: 0.5,
    player: {
      pos: [12.5, 65, -8.5], yaw: 0, pitch: 0, health: 18, hunger: 19, saturation: 4,
      hotbar: 0, xpTotal: 450, xpSeed: 9999,
      inventory: [{ id: 276, count: 1, damage: 3, enchants: { sharpness: 3 } }, ...new Array(35).fill(null)],
      armor: [null, null, null, null],
    },
    edits: [['1,70,1', OBSIDIAN, 0]],
    chests: [],
    furnaces: [],
    nether: {
      edits: [['3,64,3', NETHER_PORTAL, 0]],
      chests: [['5,64,5', [{ id: 369, count: 4, damage: 0 }, ...new Array(26).fill(null)]]],
      furnaces: [],
      vehicles: [],
      items: [{ id: 406, count: 8, damage: 0, pos: [4, 65, 4], vy: 0, age: 1 }],
    },
  });
  const decoded = decodeWorldSave(encoded);
  assert.equal(decoded.version, 2);
  assert.equal(decoded.dimension, 'nether');
  assert.equal(decoded.player.xpTotal, 450);
  assert.deepEqual(decoded.player.inventory[0].enchants, { sharpness: 3 });
  assert.equal(decoded.nether.edits.length, 1);
  assert.equal(decoded.nether.chests[0][1][0].id, 369);
  assert.equal(decoded.nether.items[0].id, 406);
}

console.log('ALL NETHER & PORTAL TESTS PASSED');
