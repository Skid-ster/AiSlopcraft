// Headless tests for hostile AI, safe navigation, melee combat and sunlight burning.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  Mob, MobManager, MOB_DEFS, canMobBurnInSun, findSafeGround, isDaylight, mobAttackDamage, rollMobDrops,
} from '../src/entities/mobs.js';
import { AIR, LAVA, STONE, WATER } from '../src/world/blocks.js';

const context = { fillStyle: '', fillRect() {} };
global.document = {
  createElement() {
    return { width: 0, height: 0, getContext: () => context };
  },
};

class FakeWorld {
  constructor() { this.blocks = new Map(); }
  key(x, y, z) { return `${x},${y},${z}`; }
  getBlock(x, y, z) { return this.blocks.get(this.key(x, y, z)) ?? AIR; }
  setBlock(x, y, z, id) { this.blocks.set(this.key(x, y, z), id); }
  heightAt(x, z) {
    for (let y = 127; y >= 0; y--) {
      if (this.getBlock(x, y, z) !== AIR) return y + 1;
    }
    return 0;
  }
  fillFloor(minX = -8, maxX = 8, minZ = -8, maxZ = 8) {
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) this.setBlock(x, 0, z, STONE);
    }
  }
}

const audio = {
  hurt: 0, deaths: 0, attacks: 0, bows: 0, fuses: 0,
  mobHurt() { this.hurt++; },
  mobDeath() { this.deaths++; },
  mobAttack() { this.attacks++; },
  bow() { this.bows++; },
  fuse() { this.fuses++; },
};

let checks = 0;
function check(name, condition) {
  assert.ok(condition, name);
  checks++;
  console.log(`PASS  ${name}`);
}

const world = new FakeWorld();
world.fillFloor();
const player = {
  pos: new THREE.Vector3(4, 1.001, 0),
  dead: false,
  health: 20,
  damage(amount) { this.health -= amount; },
};

check('daylight follows the sky cycle', isDaylight(0.5) && isDaylight(0.4) && !isDaylight(0) && !isDaylight(0.9));
check('Beta passive-mob drops use the correct items and bounded quantities',
  rollMobDrops('pig', () => 0.999)[0]?.id === 319 && rollMobDrops('pig', () => 0.999)[0]?.count === 3 &&
  rollMobDrops('cow', () => 0).length === 0 && rollMobDrops('cow', () => 0.999)[0]?.count === 2 &&
  rollMobDrops('chicken', () => 0).length === 0 && rollMobDrops('chicken', () => 0.999)[0]?.count === 2 &&
  rollMobDrops('sheep', () => 0.5)[0]?.id === 150);
check('Beta hostile drops distinguish zombie feathers, skeleton gear and creeper gunpowder',
  rollMobDrops('zombie', () => 0.999)[0]?.id === 288 &&
  rollMobDrops('skeleton', () => 0.999).map(drop => drop.id).join(',') === '262,352' &&
  rollMobDrops('creeper', () => 0.999)[0]?.id === 289 && rollMobDrops('unknown').length === 0);

const chaser = new Mob('zombie', 0, 1.001, 0);
chaser.update(0.05, world, player, [], {}, audio, 0.5);
check('hostile mob acquires a player inside 16 blocks', chaser.state === 'chase' && chaser.vel.x > 0);
const distant = new Mob('zombie', 0, 1.001, 0);
distant.update(0.05, world, { ...player, pos: new THREE.Vector3(17, 1, 0) }, [], {}, audio, 0.5);
check('hostile mob does not acquire a player beyond 16 blocks', distant.state === 'wander');

const stepWorld = new FakeWorld();
stepWorld.fillFloor(-3, 6, -2, 2);
stepWorld.setBlock(1, 1, 0, STONE);
const stepMob = new Mob('zombie', 0.5, 1.001, 0.5);
const stepTarget = { ...player, pos: new THREE.Vector3(4, 1.001, 0.5) };
stepMob.update(0.05, stepWorld, stepTarget, [], {}, audio, 0.5);
stepMob.update(0.05, stepWorld, stepTarget, [], {}, audio, 0.5);
check('hostile navigation jumps up a one-block step', stepMob.vel.y > 0 && stepMob.pos.y > 1.001);

const pitWorld = new FakeWorld();
pitWorld.fillFloor(-2, 0, -2, 2);
const wanderer = new Mob('pig', 0.5, 1.001, 0.5);
wanderer.state = 'wander';
wanderer.moveToward = true;
wanderer.wanderTimer = 2;
wanderer.yaw = Math.PI / 2;
wanderer.update(0.05, pitWorld, { ...player, pos: new THREE.Vector3(30, 1, 0) }, [], {}, audio, 0.5);
check('passive mobs turn away from deep pits', !wanderer.moveToward && wanderer.pos.x < 0.6);

const lavaWorld = new FakeWorld();
lavaWorld.fillFloor(-2, 3, -2, 2);
lavaWorld.setBlock(1, 1, 0, LAVA);
const lavaAvoider = new Mob('sheep', 0.5, 1.001, 0.5);
lavaAvoider.state = 'wander';
lavaAvoider.moveToward = true;
lavaAvoider.wanderTimer = 2;
lavaAvoider.yaw = Math.PI / 2;
lavaAvoider.update(0.05, lavaWorld, { ...player, pos: new THREE.Vector3(30, 1, 0) }, [], {}, audio, 0.5);
check('passive mobs turn away from lava', !lavaAvoider.moveToward && lavaAvoider.pos.x < 0.6);

const spiderWorld = new FakeWorld();
spiderWorld.fillFloor(-2, 5, -2, 2);
for (let y = 1; y < 6; y++) spiderWorld.setBlock(1, y, 0, STONE);
const spider = new Mob('spider', 0.5, 1.001, 0.5);
const spiderTarget = { ...player, pos: new THREE.Vector3(4, 1.001, 0.5) };
spider.update(0.05, spiderWorld, spiderTarget, [], {}, audio, 0.5);
spider.update(0.05, spiderWorld, spiderTarget, [], {}, audio, 0.5);
check('spiders climb vertical walls when blocked', spider.climbing && spider.vel.y > 0);

const creeper = new Mob('creeper', 0, 1.001, 0);
const closePlayer = { ...player, pos: new THREE.Vector3(2, 1.001, 0) };
creeper.update(0.05, world, closePlayer, [], {}, audio, 0.5);
check('creeper starts a 1.5 second fuse inside three blocks', creeper.fuse > 1.3 && creeper.fuse <= 1.5);
const fuseBeforeRetreat = creeper.fuse;
creeper.update(0.05, world, { ...player, pos: new THREE.Vector3(7, 1.001, 0) }, [], {}, audio, 0.5);
check('creeper cancels its fuse after the player retreats beyond six blocks', creeper.fuse === -1 && fuseBeforeRetreat > 0);

const skeletonWorld = new FakeWorld();
skeletonWorld.fillFloor(-2, 12, -3, 3);
skeletonWorld.setBlock(0, 5, 0, STONE);
const skeleton = new Mob('skeleton', 0, 1.001, 0);
const rangedTarget = { ...player, pos: new THREE.Vector3(10, 1.001, 0) };
let arrowsFired = 0;
const rangedEffects = { shootArrow() { arrowsFired++; } };
skeleton.update(0.05, skeletonWorld, rangedTarget, [], rangedEffects, audio, 0.5);
check('skeleton strafes and fires at a player 8–12 blocks away', arrowsFired === 1 && skeleton.attackTimer > 1.9 && Math.abs(skeleton.vel.z) > 0);
for (let i = 0; i < 41; i++) skeleton.update(0.05, skeletonWorld, rangedTarget, [], rangedEffects, audio, 0.5);
check('skeleton arrow cadence is approximately two seconds', arrowsFired >= 2);

check('hand combat deals one point and swords use their Beta damage values',
  mobAttackDamage(null) === 1 && mobAttackDamage(268) === 4 && mobAttackDamage(272) === 5 && mobAttackDamage(267) === 6 && mobAttackDamage(276) === 7);

const combatScene = new THREE.Scene();
const manager = new MobManager(world, combatScene);
manager.spawnTimer = 100;
const targetMob = manager.add('zombie', 0, 1.001, -2);
const attacker = {
  pos: new THREE.Vector3(0, 1.001, 0), yaw: 0, pitch: 0,
  camera: { position: new THREE.Vector3(0, 2.621, 0) },
  raycast: () => null,
};
check('mob raycast detects an unobstructed target within 3.5 blocks', manager.raycastTarget(attacker, 3.5) === targetMob);
manager.attack(attacker, 268, audio, 3.5);
check('melee attack applies damage and knockback away from the player', targetMob.hp === 16 && targetMob.vel.z < 0 && targetMob.vel.y > 0);
manager.attack(attacker, 267, audio, 3.5);
check('melee attack cooldown prevents repeated damage in the same instant', targetMob.hp === 16);
attacker.raycast = () => ({ dist: 0.5 });
check('solid block raycast prevents attacking mobs through walls', manager.raycastTarget(attacker, 3.5) === null);

const daylightMob = new Mob('zombie', 0, 1.001, 0);
check('exposed zombie burns in daytime', canMobBurnInSun(daylightMob, world, 0.5));
world.setBlock(0, 5, 0, STONE);
check('opaque roof protects a zombie from sunlight', !canMobBurnInSun(daylightMob, world, 0.5));
world.setBlock(0, 5, 0, AIR);
world.setBlock(0, 2, 0, WATER);
check('submerged zombie does not burn', !canMobBurnInSun(daylightMob, world, 0.5));
world.setBlock(0, 2, 0, AIR);
check('zombies do not burn at night', !canMobBurnInSun(daylightMob, world, 0));
check('skeletons burn in sunlight, while passive mobs and spiders do not',
  canMobBurnInSun(new Mob('skeleton', 0, 1.001, 0), world, 0.5) &&
  !canMobBurnInSun(new Mob('pig', 0, 1.001, 0), world, 0.5) &&
  !canMobBurnInSun(new Mob('spider', 0, 1.001, 0), world, 0.5));
const burningWorld = new FakeWorld();
burningWorld.fillFloor();
const burningZombie = new Mob('zombie', 0, 1.001, 0);
let burnParticles = 0;
burningZombie.update(0.05, burningWorld, { ...player, pos: new THREE.Vector3(40, 1, 0) }, [], { mobBurn() { burnParticles++; } }, audio, 0.5);
check('exposed zombies take fire damage and emit visible burn effects', burningZombie.burning && burningZombie.hp === 18 && burnParticles > 0);
const shelteredWorld = new FakeWorld();
shelteredWorld.fillFloor();
shelteredWorld.setBlock(0, 4, 0, STONE);
const shelteredZombie = new Mob('zombie', 0, 1.001, 0);
shelteredZombie.update(0.05, shelteredWorld, { ...player, pos: new THREE.Vector3(40, 1, 0) }, [], {}, audio, 0.5);
check('a roof prevents actual zombie sun damage', !shelteredZombie.burning && shelteredZombie.hp === 20);
check('safe-ground search finds a clear, supported spawn position', findSafeGround(world, 2.5, 2.5, 0.6, 1.8) > 1);

console.log(`\nALL ${checks} MOB TESTS PASSED`);
