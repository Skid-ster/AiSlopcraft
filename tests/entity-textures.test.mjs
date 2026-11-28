import assert from 'node:assert/strict';
import * as THREE from 'three';
import { JSDOM } from 'jsdom';
import {
  PixelSheet, skinLayout, uvBox, skinBoxGeo, buildMobPixelSheet, getMobSkinTexture,
  PLAYER_OUTFITS, getPlayerSkinTextures, getFirstPersonArmTextures,
  getVehicleTexture, getProjectileTexture,
} from '../src/entities/entity-textures.js';
import { MOB_DEFS, MobManager } from '../src/entities/mobs.js';
import { createRemoteAvatarModel, disposeRemoteAvatarModel } from '../src/entities/remote-avatar.js';
import { VehicleManager } from '../src/entities/vehicles.js';
import { Lighting } from '../src/rendering.js';
import { World } from '../src/world/world.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.document = dom.window.document;
dom.window.HTMLCanvasElement.prototype.getContext = () => null;

// 1. PixelSheet & skinLayout non-overlapping Minecraft cuboid regions
{
  const layout = skinLayout(0, 0, 8, 8, 8);
  const rects = Object.values(layout);
  assert.equal(rects.length, 6, 'skinLayout returns 6 cuboid faces');
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const [ax, ay, aw, ah] = rects[i];
      const [bx, by, bw, bh] = rects[j];
      const overlap = ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
      assert.equal(overlap, false, `skinLayout faces ${i} and ${j} must never overlap`);
    }
  }

  const geo = skinBoxGeo(0.5, 0.5, 0.5, 0, 0, 8, 8, 8, 64, 64);
  const uv = geo.getAttribute('uv');
  assert.equal(uv.count, 24, 'BoxGeometry has 24 vertices across 6 faces');
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    assert.ok(u >= 0 && u <= 1 && v >= 0 && v <= 1, `UV (${u}, ${v}) stays within [0, 1]`);
  }
  const custom = uvBox(0.2, 0.2, 0.2, { all: [0, 0, 16, 16] }, 16, 16);
  assert.equal(custom.getAttribute('uv').count, 24);
}

// 2. Mob pixel-art sheets: every mob variant has rich multi-tone RGBA pixel art (not flat color!)
const MOB_VARIANTS = [
  'pig', 'cow', 'sheep', 'sheep_sheared', 'chicken',
  'zombie', 'skeleton', 'creeper', 'spider', 'pigman', 'ghast', 'ghast_shooting', 'blaze',
];
for (const variant of MOB_VARIANTS) {
  const sheet = buildMobPixelSheet(variant);
  const tex = getMobSkinTexture(variant);
  assert.equal(tex.magFilter, THREE.NearestFilter, `${variant} uses crisp NearestFilter`);
  assert.equal(tex.minFilter, THREE.NearestFilter);
  assert.equal(tex.flipY, true, `${variant} DataTexture uses flipY=true to match top-left UV origin`);
  assert.equal(tex.colorSpace, THREE.SRGBColorSpace);

  const distinctColors = new Set();
  for (let i = 0; i < sheet.data.length; i += 4) {
    if (sheet.data[i + 3] > 0) {
      distinctColors.add((sheet.data[i] << 16) | (sheet.data[i + 1] << 8) | sheet.data[i + 2]);
    }
  }
  assert.ok(distinctColors.size >= 8, `${variant} skin sheet has rich pixel-art shading (${distinctColors.size} colors)`);
}

// 3. Every MobManager mob (all 11 Overworld + Nether species) uses textured meshes & shader lighting
{
  const world = new World('texture-audit-seed');
  const scene = new THREE.Scene();
  const lighting = new Lighting({});
  const manager = new MobManager(world, scene, lighting);

  const expectedSpecies = ['pig', 'cow', 'sheep', 'chicken', 'zombie', 'skeleton', 'creeper', 'spider', 'pigman', 'ghast', 'blaze'];
  for (const species of expectedSpecies) {
    assert.ok(MOB_DEFS[species], `MOB_DEFS defines ${species}`);
    const mob = manager.add(species, 0.5, 70, 0.5);
    let texturedCount = 0;
    mob.group.traverse(obj => {
      if (obj.isMesh) {
        assert.equal(obj.material.uniforms.uHasMap.value, 1, `${species} mesh has active pixel-art texture map`);
        assert.ok(obj.material.uniforms.map.value?.isDataTexture, `${species} mesh binds RGBA DataTexture`);
        texturedCount++;
      }
    });
    assert.ok(texturedCount >= 2, `${species} model contains multiple UV-mapped textured parts (${texturedCount})`);
  }
  manager.clear();
  lighting.dispose();
}

// 4. Player outfits, remote avatars, first-person arm, vehicles, & projectiles all bind real pixel-art DataTextures
{
  const lighting = new Lighting({});
  for (let i = 0; i < PLAYER_OUTFITS.length; i++) {
    const { outfit, texture } = getPlayerSkinTextures(i);
    assert.ok(outfit && texture.isDataTexture);
  }
  const avatar = createRemoteAvatarModel('peer-1', 'Alex', lighting);
  let avatarMeshes = 0;
  avatar.root.traverse(obj => {
    if (obj.isMesh) {
      assert.equal(obj.material.uniforms.uHasMap.value, 1, 'remote avatar limb/torso/head binds player skin texture');
      avatarMeshes++;
    }
  });
  assert.equal(avatarMeshes, 6, 'remote avatar has 6 UV-mapped textured body parts');
  disposeRemoteAvatarModel(avatar, lighting);

  assert.ok(getFirstPersonArmTextures().isDataTexture, 'first-person arm texture is an RGBA DataTexture');
  assert.ok(getVehicleTexture().isDataTexture, 'vehicle atlas is an RGBA DataTexture');

  const world = new World('vehicle-tex-seed');
  const scene = new THREE.Scene();
  const vehicles = new VehicleManager(world, scene, lighting);
  for (const type of ['boat', 'minecart', 'storage', 'powered']) {
    const v = vehicles.create(type, 0.5, 65, 0.5);
    let meshes = 0;
    v.group.traverse(obj => {
      if (obj.isMesh) {
        assert.equal(obj.material.uniforms.uHasMap.value, 1, `${type} vehicle part uses textured UV atlas`);
        meshes++;
      }
    });
    assert.ok(meshes >= 5, `${type} vehicle has detailed textured geometry`);
  }
  vehicles.clear();

  for (const kind of ['arrow', 'snowball', 'egg', 'xp_bottle', 'fireball', 'blaze_bolt', 'xp_orb']) {
    const tex = getProjectileTexture(kind);
    assert.ok(tex.isDataTexture, `${kind} projectile has dedicated 16x16 pixel-art texture`);
  }

  const sheet = new PixelSheet(8, 8, 42);
  sheet.px(1, 1, 200, 100, 50);
  assert.equal(sheet.toTexture().image.width, 8);
  lighting.dispose();
}

console.log('ALL ENTITY TEXTURE TESTS PASSED');
