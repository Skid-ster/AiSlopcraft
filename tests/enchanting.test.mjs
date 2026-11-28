import assert from 'node:assert/strict';
import * as THREE from 'three';
import { JSDOM } from 'jsdom';
import {
  BOOK_ITEM_ID, ENCHANTED_BOOK_ID, ENCHANTMENTS,
  xpForNextLevel, xpTotalForLevel, xpStateFromTotal,
  countBookshelfPower, getEnchantmentOffers, applyEnchantmentOffer,
  sameEnchants, formatEnchantments, miningSpeedBonus, shouldConsumeDurability,
  hasSilkTouch, rollFortuneCount, meleeEnchantBonuses, bowEnchantBonuses,
  armorEnchantReduction, oreXpDrop,
} from '../src/enchanting.js';
import { Player } from '../src/entities/player.js';
import { World } from '../src/world/world.js';
import { BOOKSHELF, STONE, COAL_ORE, DIAMOND_ORE, QUARTZ_ORE, IRON_ORE } from '../src/world/blocks.js';
import { interactWithFurnaceSlot, createFurnaceState, tickFurnace } from '../src/ui/furnace.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const makePlayer = () => new Player({ heightAt: () => 64 }, new THREE.PerspectiveCamera(), document.createElement('canvas'));

// 1. 1.7.10 XP curve & Player XP progression / spending
{
  assert.equal(xpForNextLevel(0), 17);
  assert.equal(xpForNextLevel(15), 17);
  assert.equal(xpForNextLevel(16), 20);
  assert.equal(xpForNextLevel(30), 62);

  const lvl30Total = xpTotalForLevel(30);
  assert.equal(lvl30Total, 825, '1.7.10 level 30 requires 825 total XP');
  const state = xpStateFromTotal(lvl30Total + 31);
  assert.equal(state.level, 30);
  assert.ok(Math.abs(state.progress - 0.5) < 0.02);

  const player = makePlayer();
  let levelUps = 0;
  player.addXp(825, { levelUp: () => { levelUps++; } });
  assert.equal(player.xpLevel, 30);
  assert.ok(levelUps >= 1, 'crossing 5-level milestones plays level-up chime');

  assert.equal(player.spendXpLevels(10), true);
  assert.equal(player.xpLevel, 20);
  assert.equal(player.xpTotal, xpTotalForLevel(20));
  assert.equal(player.spendXpLevels(25), false, 'cannot spend more levels than owned');
}

// 2. Bookshelf power ring (1.7.10 +/-2 perimeter with clear air gap)
{
  const world = new World('enchant-ring-test', null);
  world.generateChunk(0, 0);
  const tx = 8, ty = 40, tz = 8;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = 0; dy <= 2; dy++) {
      for (let dz = -2; dz <= 2; dz++) {
        world.setBlock(tx + dx, ty + dy, tz + dz, 0);
      }
    }
  }
  assert.equal(countBookshelfPower(world, tx, ty, tz), 0);

  // Place 16 bookshelves along north/south/east/west perimeter -> capped at 15
  for (let dx = -2; dx <= 2; dx++) {
    for (const dz of [-2, 2]) {
      world.setBlock(tx + dx, ty, tz + dz, BOOKSHELF);
      world.setBlock(tx + dx, ty + 1, tz + dz, BOOKSHELF);
    }
  }
  assert.equal(countBookshelfPower(world, tx, ty, tz), 15, 'bookshelf power caps at 15');

  // Blocking the entire north air gap at dy=0..1 cuts north wall shelves below cap
  for (let dx = -1; dx <= 1; dx++) {
    world.setBlock(tx + dx, ty, tz - 1, STONE);
    world.setBlock(tx + dx, ty + 1, tz - 1, STONE);
  }
  assert.ok(countBookshelfPower(world, tx, ty, tz) < 15, 'solid blocks in the 1-block gap block bookshelf power');
}

// 3. Deterministic 3-slot enchanting offers, Enchanted Books, & mutual exclusions
{
  assert.ok(Object.keys(ENCHANTMENTS).length >= 19, 'all 19 classic 1.7.10 enchantments registered');
  const pick = { id: 278, count: 1, damage: 0 }; // Diamond Pickaxe
  const offersA = getEnchantmentOffers(pick, 15, 12345);
  const offersB = getEnchantmentOffers(pick, 15, 12345);
  assert.deepEqual(offersA, offersB, 'enchantment offers are deterministic for a given xpSeed');
  assert.equal(offersA.length, 3);
  assert.ok(offersA[2].cost >= offersA[0].cost && offersA[2].cost <= 30, 'top-slot offer reaches high tier up to 30');

  // Survival player enchants Diamond Pickaxe
  const player = makePlayer();
  player.addXp(xpTotalForLevel(30));
  const seedBefore = player.xpSeed;
  const result = applyEnchantmentOffer(player, pick, 2, 15);
  assert.ok(result && Object.keys(result.stack.enchants).length >= 1);
  assert.notEqual(player.xpSeed, seedBefore, 'enchanting advances player xpSeed');
  assert.equal(player.xpLevel, 30 - result.cost, 'spending offer deducts exact level cost and syncs xpTotal');

  // Silk Touch and Fortune never appear together on one rolled item
  assert.equal(Boolean(result.stack.enchants.silk_touch && result.stack.enchants.fortune), false, 'Silk Touch and Fortune are mutually exclusive');

  // Plain Book (340) transforms into Enchanted Book (403)
  player.addXp(xpTotalForLevel(30));
  const bookRes = applyEnchantmentOffer(player, { id: BOOK_ITEM_ID, count: 1, damage: 0 }, 0, 8);
  assert.ok(bookRes);
  assert.equal(bookRes.stack.id, ENCHANTED_BOOK_ID, 'enchanting a Book produces an Enchanted Book (403)');
  assert.equal(formatEnchantments(bookRes.stack.enchants).length >= 1, true);
}

// 4. Mining, Fortune, Silk Touch, Unbreaking, Combat, Armor, Ore XP, & Furnace XP
{
  const effPick = { id: 278, count: 1, enchants: { efficiency: 4, fortune: 3, unbreaking: 3 } };
  assert.equal(miningSpeedBonus(effPick, true), 17, 'Efficiency IV adds 4^2 + 1 = 17 speed bonus');
  assert.equal(hasSilkTouch(effPick), false);
  assert.equal(hasSilkTouch({ id: 278, count: 1, enchants: { silk_touch: 1 } }), true);
  assert.equal(rollFortuneCount(1, effPick, DIAMOND_ORE, () => 0.99), 4, 'Fortune III can multiply diamond ore drops up to 4x');
  assert.equal(shouldConsumeDurability(effPick, () => 0.5), false, 'Unbreaking III skips durability loss 75% of the time');

  const sword = { id: 276, count: 1, enchants: { sharpness: 5, fire_aspect: 2, looting: 3, knockback: 2 } };
  const melee = meleeEnchantBonuses(sword, 'zombie');
  assert.ok(melee.bonusDamage > 5, 'Sharpness V adds substantial melee damage');
  assert.equal(melee.fireSeconds, 8, 'Fire Aspect II ignites targets for 8s');
  assert.equal(melee.looting, 3);
  assert.equal(melee.knockback, 2);

  const bow = { id: 261, count: 1, enchants: { power: 3, punch: 2, flame: 1, infinity: 1 } };
  const bowStats = bowEnchantBonuses(bow);
  assert.ok(bowStats.damage > 4, 'Power III increases arrow damage');
  assert.equal(bowStats.punch, 2);
  assert.equal(bowStats.flame, true);
  assert.equal(bowStats.infinity, true);

  const boots = { id: 313, count: 1, enchants: { feather_falling: 4, protection: 4 } };
  assert.ok(armorEnchantReduction([null, null, null, boots], 'fall') >= 0.4, 'Feather Falling IV + Protection IV strongly mitigates fall damage');

  assert.ok(oreXpDrop(COAL_ORE, () => 0.9) >= 1);
  assert.ok(oreXpDrop(DIAMOND_ORE, () => 0.5) >= 3);
  assert.ok(oreXpDrop(QUARTZ_ORE, () => 0.5) >= 2);
  assert.equal(oreXpDrop(IRON_ORE, () => 0.5), 0, 'smelted metallic ores award XP in furnace, not on raw break');

  // Enchanted stacks never merge with unenchanted or differently-enchanted stacks
  assert.equal(sameEnchants({ sharpness: 1 }, null), false);
  const p = makePlayer();
  p.inventory.fill(null);
  p.insertItem(403, 1, 0, { power: 2 });
  p.insertItem(403, 1, 0, { flame: 1 });
  assert.ok(p.inventory[0] && p.inventory[1], 'distinct Enchanted Books occupy separate slots');

  // Smelting accumulates storedXp and awards xpEarned when output is collected
  const furnace = createFurnaceState();
  furnace.input = { id: IRON_ORE, count: 2, damage: 0 };
  furnace.fuel = { id: 369, count: 1, damage: 0 }; // Blaze Rod (120s fuel!)
  for (let i = 0; i < 13; i++) tickFurnace(furnace, 1);
  assert.equal(furnace.output?.count, 2);
  assert.ok(furnace.storedXp > 1.0, 'smelting iron ore with Blaze Rod stores smelting XP');
  const collect = interactWithFurnaceSlot(furnace, 'output', null, 0);
  assert.equal(collect.changed, true);
  assert.ok(collect.xpEarned >= 1, 'collecting smelted ingots awards stored XP');
}

console.log('ALL ENCHANTING & XP TESTS PASSED');
