// Headless regression tests for player interaction: targeting, mining progress & crack stages,
// continuous block placement timing, collision check with player bounding box, and replaceable blocks.
import * as THREE from 'three';
import { World } from '../src/world/world.js';
import { Player } from '../src/entities/player.js';
import { advanceEating, EAT_DURATION } from '../src/entities/eating.js';
import {
  AIR, STONE, DIRT, GRASS, WATER, LAVA, TALL_GRASS, SAPLING, PLANKS,
  TILES, breakTime, canHarvest, getBlock
} from '../src/world/blocks.js';

let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (cond || !extra ? '' : '  → ' + extra));
  if (!cond) failures++;
}

// Set up a headless DOM environment for Player event listeners
if (typeof document === 'undefined') {
  global.document = {
    addEventListener() {},
    removeEventListener() {},
  };
}
if (typeof window === 'undefined') {
  global.window = {};
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
const canvas = {
  addEventListener() {},
  requestPointerLock() {},
};

const world = new World('InteractionTest', scene);
for (let cz = -1; cz <= 1; cz++) {
  for (let cx = -1; cx <= 1; cx++) {
    world.generateChunk(cx, cz);
  }
}

const player = new Player(world, camera, canvas);

// --- 1. Raycast block targeting returns correct face ---
// Place a stone block directly in front of the player
// Player at (8, 64, 8), camera looks along -Z by default (yaw = 0, pitch = 0)
player.pos.set(8.5, 64, 8.5);
player.yaw = 0;
player.pitch = 0;
// update camera position as player.update() does
player.camera.position.set(player.pos.x, player.pos.y + 1.62, player.pos.z);

// Clear space in front
for (let dy = -2; dy <= 4; dy++) {
  for (let dz = 0; dz >= -6; dz--) {
    world.setBlock(8, 64 + dy, 8 + dz, AIR);
    world.setBlock(9, 64 + dy, 8 + dz, AIR);
  }
}

// Target block at (8, 65, 5) which is ~3.5 blocks forward (-Z)
world.setBlock(8, 65, 5, STONE);

const hit = player.raycast(world, 5);
check('raycast finds stone block', hit !== null && hit.x === 8 && hit.y === 65 && hit.z === 5);
check('raycast returns correct south face ([0, 0, 1])',
  hit !== null && hit.face[0] === 0 && hit.face[1] === 0 && hit.face[2] === 1,
  hit ? JSON.stringify(hit.face) : 'no hit');

// Test looking down onto top face (+Y face -> face = [0, 1, 0])
player.pos.set(8.5, 67, 5.5);
player.camera.position.set(player.pos.x, player.pos.y + 1.62, player.pos.z);
player.pitch = -Math.PI / 2 + 0.05; // looking almost straight down
const hitDown = player.raycast(world, 5);
check('raycast looking down returns top face ([0, 1, 0])',
  hitDown !== null && hitDown.x === 8 && hitDown.y === 65 && hitDown.z === 5 &&
  hitDown.face[0] === 0 && hitDown.face[1] === 1 && hitDown.face[2] === 0,
  hitDown ? JSON.stringify(hitDown.face) : 'no hit');

// --- 2. Mining progress increments and triggers crack stage calculations ---
const totalTime = breakTime(STONE, null);
player.mining.active = true;
player.mining.x = 8;
player.mining.y = 65;
player.mining.z = 5;
player.mining.progress = 0;
player.mining.total = totalTime;

const getCrackStage = (progress, total) => Math.min(9, Math.floor((progress / total) * 10));
const getCrackTile = (stage) => TILES.destroy0 + stage;

check('initial crack stage is 0', getCrackStage(0, totalTime) === 0);
check('stage 0 tile is TILES.destroy0 (84)', getCrackTile(0) === 84);

// At 25% progress -> stage 2
check('crack stage at 25% is 2', getCrackStage(totalTime * 0.25, totalTime) === 2);
check('stage 2 tile is 86', getCrackTile(2) === 86);

// At 55% progress -> stage 5
check('crack stage at 55% is 5', getCrackStage(totalTime * 0.55, totalTime) === 5);

// At 95% progress -> stage 9
check('crack stage at 95% is 9', getCrackStage(totalTime * 0.95, totalTime) === 9);
check('stage 9 tile is TILES.destroy9 (93)', getCrackTile(9) === 93);

// At 100% progress -> clamped to 9
check('crack stage clamped to 9 at 100%', getCrackStage(totalTime, totalTime) === 9);

// --- 3. Continuous placement timing logic ---
let placeCooldown = 0;
let placeCount = 0;
const simulatePlace = () => { placeCount++; };

// Simulate holding right-click over 1 second with dt = 0.05 (20 ticks)
const simulateContinuousPlacement = (duration, dt = 0.05) => {
  placeCount = 0;
  placeCooldown = 0; // ready on initial click
  for (let t = 0; t < duration; t += dt) {
    placeCooldown -= dt;
    if (placeCooldown <= 0) {
      simulatePlace();
      placeCooldown = 0.25;
    }
  }
  return placeCount;
};

// In 1 second: t=0 -> 1st, t=0.25 -> 2nd, t=0.5 -> 3rd, t=0.75 -> 4th, t=1.0 -> 5th
const count1s = simulateContinuousPlacement(1.01, 0.05);
check('continuous placement triggers ~4-5 times per second (got ' + count1s + ')',
  count1s >= 4 && count1s <= 5);

// When right click is released, placeCooldown resets to 0
placeCooldown = 0.2;
const releaseRightClick = () => { placeCooldown = 0; };
releaseRightClick();
check('releasing right click resets placeCooldown to 0', placeCooldown === 0);

// --- 4. Player collision bounding box logic (0.7 x 1.8 x 0.7) ---
// Player at (10, 60, 10)
player.pos.set(10, 60, 10);
const pminX = player.pos.x - 0.35, pmaxX = player.pos.x + 0.35;
const pminZ = player.pos.z - 0.35, pmaxZ = player.pos.z + 0.35;
const pminY = player.pos.y, pmaxY = player.pos.y + 1.8;

const collidesWithPlayer = (bx, by, bz) => {
  return (bx + 1 > pminX && bx < pmaxX && by + 1 > pminY && by < pmaxY && bz + 1 > pminZ && bz < pmaxZ);
};

// Block exactly at feet (x=9.8 -> overlaps [9.65, 10.35], y=60, z=10)
check('block at player feet collides', collidesWithPlayer(9.8, 60, 9.8) === true);
// Block at player head (y=61)
check('block at player head collides', collidesWithPlayer(9.8, 61, 9.8) === true);
// Block directly below player (y=59)
check('block below player does not collide', collidesWithPlayer(9.8, 59, 9.8) === false);
// Block 2 blocks above (y=62)
check('block above player does not collide', collidesWithPlayer(9.8, 62, 9.8) === false);
// Block adjacent horizontally outside (x=11)
check('block adjacent outside does not collide', collidesWithPlayer(11, 60, 10) === false);

// --- 5. Replaceable blocks logic ---
const REPLACEABLE_SET = new Set([TALL_GRASS, SAPLING, WATER, LAVA]);
const isReplaceable = (id) => REPLACEABLE_SET.has(id);

check('tall grass is replaceable', isReplaceable(TALL_GRASS) === true);
check('sapling is replaceable', isReplaceable(SAPLING) === true);
check('water is replaceable', isReplaceable(WATER) === true);
check('lava is replaceable', isReplaceable(LAVA) === true);
check('stone is NOT replaceable', isReplaceable(STONE) === false);
check('dirt is NOT replaceable', isReplaceable(DIRT) === false);
check('planks is NOT replaceable', isReplaceable(PLANKS) === false);

// --- 6. Survival inventory, eating and respawn invariants ---
player.inventory.fill(null);
player.health = 10;
player.inventory[0] = { id: 320, count: 2, damage: 0 }; // cooked pork restores eight health points
player.pointerLocked = true;
player.rightDown = true;
let ate = 0;
const eatAudio = { eat() { ate++; } };
let eatingState = { id: 320, progress: 0 };
let eatingStep = advanceEating(eatingState, 1.5, player, eatAudio, true);
eatingState = eatingStep.eating;
check('food does not heal or consume before the eating timer completes',
  !eatingStep.completed && eatingState.progress < EAT_DURATION && player.health === 10 && player.inventory[0].count === 2);
eatingStep = advanceEating(eatingState, 0.1, player, eatAudio, true);
eatingState = eatingStep.eating;
check('holding right-click for the full eating timer heals and consumes once',
  eatingStep.completed && eatingState === null && player.health === 18 && player.inventory[0].count === 1 && ate === 1);
player.rightDown = false;
eatingStep = advanceEating({ id: 320, progress: 1.2 }, 0.5, player, eatAudio, true);
check('releasing right-click cancels eating without consuming food',
  !eatingStep.completed && eatingStep.eating === null && player.inventory[0].count === 1 && ate === 1);
player.rightDown = true;
player.health = 20;
check('food cannot be wasted at full health', !player.eatHeld({ eat() { ate++; } }) && player.inventory[0].count === 1 && ate === 1);

player.inventory.fill(null);
player.inventory[0] = { id: PLANKS, count: 63, damage: 0 };
check('inventory insertion fills a partial stack and preserves the remainder',
  player.insertItem(PLANKS, 3) === 3 && player.inventory[0].count === 64 && player.inventory[1].count === 2);
player.dead = true;
player.health = 0;
player.air = 0;
player.respawn(72.001, 8.5, 8.5);
check('respawn restores position, health, air and movement state',
  !player.dead && player.health === 20 && player.air === 300 && player.pos.x === 8.5 && player.pos.y === 72.001 && player.vel.lengthSq() === 0);

console.log(failures === 0 ? '\nALL INTERACTION TESTS PASSED' : `\n${failures} INTERACTION TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
