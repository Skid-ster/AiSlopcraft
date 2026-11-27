// 1.7.10-inspired Experience Orbs, Levels, Bookshelf Power & Enchanting Table mechanics.
import {
  AIR, BOOKSHELF, ITEMS, COAL_ORE, DIAMOND_ORE, LAPIS_ORE, REDSTONE_ORE, QUARTZ_ORE,
} from './world/blocks.js';

export const BOOK_ITEM_ID = 340;
export const ENCHANTED_BOOK_ID = 403;
export const XP_BOTTLE_ID = 384;

export const ENCHANTMENTS = Object.freeze({
  efficiency: { id: 'efficiency', name: 'Efficiency', maxLevel: 5, weight: 10, targets: ['pickaxe', 'shovel', 'axe', 'shears'] },
  unbreaking: { id: 'unbreaking', name: 'Unbreaking', maxLevel: 3, weight: 5, targets: ['pickaxe', 'shovel', 'axe', 'hoe', 'sword', 'bow', 'armor', 'shears', 'rod'] },
  fortune: { id: 'fortune', name: 'Fortune', maxLevel: 3, weight: 2, targets: ['pickaxe', 'shovel', 'axe'], conflicts: ['silk_touch'] },
  silk_touch: { id: 'silk_touch', name: 'Silk Touch', maxLevel: 1, weight: 1, targets: ['pickaxe', 'shovel', 'axe'], conflicts: ['fortune'] },
  sharpness: { id: 'sharpness', name: 'Sharpness', maxLevel: 5, weight: 10, targets: ['sword', 'axe'], conflicts: ['smite', 'bane_of_arthropods'] },
  smite: { id: 'smite', name: 'Smite', maxLevel: 5, weight: 5, targets: ['sword', 'axe'], conflicts: ['sharpness', 'bane_of_arthropods'] },
  bane_of_arthropods: { id: 'bane_of_arthropods', name: 'Bane of Arthropods', maxLevel: 5, weight: 5, targets: ['sword', 'axe'], conflicts: ['sharpness', 'smite'] },
  knockback: { id: 'knockback', name: 'Knockback', maxLevel: 2, weight: 5, targets: ['sword'] },
  fire_aspect: { id: 'fire_aspect', name: 'Fire Aspect', maxLevel: 2, weight: 2, targets: ['sword'] },
  looting: { id: 'looting', name: 'Looting', maxLevel: 3, weight: 2, targets: ['sword'] },
  power: { id: 'power', name: 'Power', maxLevel: 5, weight: 10, targets: ['bow'] },
  punch: { id: 'punch', name: 'Punch', maxLevel: 2, weight: 2, targets: ['bow'] },
  flame: { id: 'flame', name: 'Flame', maxLevel: 1, weight: 2, targets: ['bow'] },
  infinity: { id: 'infinity', name: 'Infinity', maxLevel: 1, weight: 1, targets: ['bow'] },
  protection: { id: 'protection', name: 'Protection', maxLevel: 4, weight: 10, targets: ['armor'], conflicts: ['fire_protection', 'blast_protection', 'projectile_protection'] },
  fire_protection: { id: 'fire_protection', name: 'Fire Protection', maxLevel: 4, weight: 5, targets: ['armor'], conflicts: ['protection', 'blast_protection', 'projectile_protection'] },
  blast_protection: { id: 'blast_protection', name: 'Blast Protection', maxLevel: 4, weight: 2, targets: ['armor'], conflicts: ['protection', 'fire_protection', 'projectile_protection'] },
  projectile_protection: { id: 'projectile_protection', name: 'Projectile Protection', maxLevel: 4, weight: 5, targets: ['armor'], conflicts: ['protection', 'fire_protection', 'blast_protection'] },
  feather_falling: { id: 'feather_falling', name: 'Feather Falling', maxLevel: 4, weight: 5, targets: ['boots'] },
});

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

function seededRng(seed) {
  let s = (seed | 0) || 0x5f3759df;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d);
    s = Math.imul(s ^ (s >>> 12), 0x297a2d39);
    return ((s ^ (s >>> 15)) >>> 0) / 4294967296;
  };
}

// Minecraft 1.7.10 XP curve: 17 XP per level for 0-15, +3/lvl for 16-30, +7/lvl for 31+.
export function xpForNextLevel(level) {
  const lvl = Math.max(0, Math.floor(Number(level) || 0));
  if (lvl < 16) return 17;
  if (lvl < 31) return 17 + (lvl - 15) * 3;
  return 62 + (lvl - 30) * 7;
}

export function xpTotalForLevel(level) {
  const lvl = Math.max(0, Math.floor(Number(level) || 0));
  let total = 0;
  for (let i = 0; i < lvl; i++) total += xpForNextLevel(i);
  return total;
}

export function xpStateFromTotal(rawTotal) {
  const total = Math.max(0, Math.floor(Number(rawTotal) || 0));
  let rem = total;
  let level = 0;
  while (level < 2000) {
    const need = xpForNextLevel(level);
    if (rem < need) return { total, level, progress: need > 0 ? rem / need : 0 };
    rem -= need;
    level += 1;
  }
  return { total, level, progress: 0 };
}

export function addPlayerXp(player, amount) {
  const gain = Math.max(0, Math.floor(Number(amount) || 0));
  if (!player || gain <= 0) return { leveledUp: false, levelsGained: 0 };
  let level = Math.max(0, Math.floor(Number(player.xpLevel) || 0));
  let progress = Math.max(0, Math.min(0.999999, Number(player.xpProgress) || 0));
  player.xpTotal = Math.max(0, Math.floor(Number(player.xpTotal) || 0)) + gain;

  let remaining = gain;
  let levelsGained = 0;
  while (remaining > 0) {
    const neededForBar = xpForNextLevel(level);
    const currentPoints = progress * neededForBar;
    const toNext = neededForBar - currentPoints;
    if (remaining + 1e-6 >= toNext) {
      remaining -= toNext;
      level += 1;
      levelsGained += 1;
      progress = 0;
    } else {
      progress = Math.max(0, Math.min(0.999999, (currentPoints + remaining) / neededForBar));
      remaining = 0;
    }
  }
  player.xpLevel = level;
  player.xpProgress = progress;
  return { leveledUp: levelsGained > 0, levelsGained };
}

export function spendPlayerLevels(player, cost) {
  const levels = Math.max(0, Math.floor(Number(cost) || 0));
  if (!player || levels <= 0) return false;
  if (typeof player.spendXpLevels === 'function') return player.spendXpLevels(levels);
  const current = Math.max(0, Math.floor(Number(player.xpLevel) || 0));
  if (current < levels) return false;
  const nextLevel = current - levels;
  const base = xpTotalForLevel(nextLevel);
  const nextSpan = xpTotalForLevel(nextLevel + 1) - base;
  player.xpLevel = nextLevel;
  player.xpTotal = base + Math.floor((Number(player.xpProgress) || 0) * nextSpan);
  player.xpSeed = (((player.xpSeed | 0) + Math.imul(levels, 0x9e3779b9) + 0x6d2b79f5) | 0) >>> 0;
  return true;
}

export function normalizeEnchants(enchants) {
  if (!enchants || typeof enchants !== 'object' || Array.isArray(enchants)) return null;
  const clean = {};
  let count = 0;
  for (const [key, rawLevel] of Object.entries(enchants)) {
    const def = ENCHANTMENTS[key];
    if (!def) continue;
    const lvl = Math.floor(Number(rawLevel));
    if (!Number.isInteger(lvl) || lvl < 1) continue;
    clean[key] = Math.min(def.maxLevel, lvl);
    count++;
    if (count >= 8) break;
  }
  return count > 0 ? clean : null;
}

export const cloneEnchants = normalizeEnchants;

export function sameEnchants(a, b) {
  const na = normalizeEnchants(a);
  const nb = normalizeEnchants(b);
  if (!na && !nb) return true;
  if (!na || !nb) return false;
  const ka = Object.keys(na).sort();
  const kb = Object.keys(nb).sort();
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i] || na[ka[i]] !== nb[kb[i]]) return false;
  }
  return true;
}

export function hasEnchants(stack) {
  return Boolean(stack && normalizeEnchants(stack.enchants));
}

export function formatEnchantments(enchants) {
  const norm = normalizeEnchants(enchants);
  if (!norm) return [];
  return Object.entries(norm).map(([key, level]) => {
    const def = ENCHANTMENTS[key];
    if (!def) return null;
    return def.maxLevel === 1 ? def.name : `${def.name} ${ROMAN[level] || level}`;
  }).filter(Boolean);
}

export function eligibleEnchantmentsForItem(itemId) {
  if (itemId === BOOK_ITEM_ID) return Object.values(ENCHANTMENTS);
  const def = ITEMS[itemId];
  if (!def) return [];
  const categories = new Set();
  if (def.tool) categories.add(def.tool);
  if (def.armorSlot != null) {
    categories.add('armor');
    if (def.armorSlot === 3) categories.add('boots');
  }
  if (!categories.size) return [];
  return Object.values(ENCHANTMENTS).filter(enc => enc.targets.some(target => categories.has(target)));
}

export function canEnchantStack(stack) {
  if (!stack || stack.count !== 1) return false;
  if (stack.id === ENCHANTED_BOOK_ID || hasEnchants(stack)) return false;
  return eligibleEnchantmentsForItem(stack.id).length > 0;
}

// 1.7.10 bookshelf ring scan: 2-block Chebyshev radius at dy = 0..1 with an unobstructed AIR gap.
export function countBookshelfPower(world, x, y, z) {
  if (!world) return 0;
  let power = 0;
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== 2) continue;
      for (let dy = 0; dy <= 1; dy++) {
        if (world.getBlock(x + dx, y + dy, z + dz) !== BOOKSHELF) continue;
        const gapX = x + Math.trunc(dx / 2);
        const gapZ = z + Math.trunc(dz / 2);
        if (world.getBlock(gapX, y + dy, gapZ) !== AIR) continue;
        // Side shelves next to an obstructed cardinal neighbor also require clear line-of-sight.
        if (Math.abs(dx) === 2 && Math.abs(dz) === 1 && world.getBlock(gapX, y + dy, z) !== AIR && world.getBlock(gapX, y + dy, z + dz) !== AIR) continue;
        if (Math.abs(dz) === 2 && Math.abs(dx) === 1 && world.getBlock(x, y + dy, gapZ) !== AIR && world.getBlock(x + dx, y + dy, gapZ) !== AIR) continue;
        power += 1;
        if (power >= 15) return 15;
      }
    }
  }
  return power;
}

function rollEnchantSet(itemId, cost, seed) {
  const pool = [...eligibleEnchantmentsForItem(itemId)];
  if (!pool.length) return null;
  const rng = seededRng(seed ^ Math.imul(cost, 0x85ebca6b));
  const chosen = {};
  const maxPicks = itemId === BOOK_ITEM_ID ? 1 : (cost >= 22 ? 3 : cost >= 11 ? 2 : 1);
  const powerRatio = Math.max(0.08, Math.min(1, cost / 30));

  for (let pick = 0; pick < maxPicks && pool.length > 0; pick++) {
    if (pick > 0 && rng() > 0.35 + powerRatio * 0.45) break;
    const totalWeight = pool.reduce((sum, enc) => sum + enc.weight, 0);
    let ticket = rng() * totalWeight;
    let selected = pool[0];
    for (const enc of pool) {
      ticket -= enc.weight;
      if (ticket <= 0) { selected = enc; break; }
    }
    const minLvl = Math.max(1, Math.floor(powerRatio * selected.maxLevel * 0.65));
    const maxLvl = Math.max(minLvl, Math.min(selected.maxLevel, Math.ceil(powerRatio * selected.maxLevel + rng() * 0.6)));
    const level = Math.min(selected.maxLevel, minLvl + Math.floor(rng() * (maxLvl - minLvl + 1)));
    chosen[selected.id] = level;

    const conflicts = new Set([selected.id, ...(selected.conflicts || [])]);
    for (let i = pool.length - 1; i >= 0; i--) {
      if (conflicts.has(pool[i].id) || (pool[i].conflicts || []).includes(selected.id)) {
        pool.splice(i, 1);
      }
    }
  }
  return normalizeEnchants(chosen);
}

export function getEnchantmentOffers(stack, bookshelfPower = 0, xpSeed = 1) {
  if (!canEnchantStack(stack)) return [];
  const power = Math.max(0, Math.min(15, Math.floor(Number(bookshelfPower) || 0)));
  const seedBase = ((xpSeed | 0) ^ Math.imul(stack.id, 7919) ^ Math.imul(power + 1, 104729)) >>> 0;
  const rng = seededRng(seedBase);
  const base = 1 + Math.floor(rng() * 4) + Math.floor(power / 2) + Math.floor(rng() * (power + 1));
  const rawCosts = [
    Math.max(1, Math.floor(base / 3)),
    Math.max(2, Math.floor((base * 2) / 3) + 1),
    Math.max(3, Math.max(base, power * 2)),
  ];
  return rawCosts.map((rawCost, slot) => {
    const cost = Math.max(slot + 1, Math.min(30, rawCost));
    const enchants = rollEnchantSet(stack.id, cost, seedBase + slot * 9973);
    const labels = formatEnchantments(enchants);
    return {
      slot,
      cost,
      enchants,
      preview: labels[0] ? `${labels[0]}${labels.length > 1 ? ' + …' : ''}` : 'Arcane Blessing',
    };
  });
}

export function applyEnchantmentOffer(player, stack, slotIndex, bookshelfPower = 0) {
  if (!player || !canEnchantStack(stack)) return null;
  const offers = getEnchantmentOffers(stack, bookshelfPower, player.xpSeed || 1);
  const offer = offers[slotIndex];
  if (!offer || !offer.enchants) return null;
  const creative = player.gameMode === 'creative';
  if (!creative && !spendPlayerLevels(player, offer.cost)) return null;
  if (creative) player.xpSeed = (((player.xpSeed | 0) + 0x9e3779b9) | 0) >>> 0;
  const enchanted = {
    id: stack.id === BOOK_ITEM_ID ? ENCHANTED_BOOK_ID : stack.id,
    count: 1,
    damage: stack.damage || 0,
    enchants: offer.enchants,
  };
  return { stack: enchanted, cost: offer.cost, enchants: offer.enchants };
}

export function miningSpeedBonus(stack, canHarvestBlock = true) {
  const eff = stack?.enchants?.efficiency | 0;
  if (eff <= 0 || !canHarvestBlock) return 0;
  return eff * eff + 1;
}

export function shouldConsumeDurability(stack, rng = Math.random) {
  const unb = stack?.enchants?.unbreaking | 0;
  if (unb <= 0) return true;
  return rng() < (1 / (unb + 1));
}

export function hasSilkTouch(stack) {
  return (stack?.enchants?.silk_touch | 0) > 0;
}

export function rollFortuneCount(baseCount, stack, blockId, rng = Math.random) {
  const fortune = stack?.enchants?.fortune | 0;
  if (fortune <= 0) return baseCount;
  if ([COAL_ORE, DIAMOND_ORE, LAPIS_ORE, REDSTONE_ORE, QUARTZ_ORE].includes(blockId)) {
    const bonus = Math.floor(rng() * (fortune + 2)) - 1;
    return baseCount * Math.max(1, 1 + Math.max(0, bonus));
  }
  return baseCount;
}

export function meleeEnchantBonus(stack, targetType = '') {
  const ench = stack?.enchants;
  if (!ench) return { extraDamage: 0, bonusDamage: 0, extraKnockback: 0, knockback: 0, fireSeconds: 0, looting: 0 };
  let bonusDamage = (ench.sharpness | 0) * 1.25;
  if ((ench.smite | 0) > 0 && ['zombie', 'skeleton', 'pigman'].includes(targetType)) {
    bonusDamage += (ench.smite | 0) * 2.5;
  }
  if ((ench.bane_of_arthropods | 0) > 0 && targetType === 'spider') {
    bonusDamage += (ench.bane_of_arthropods | 0) * 2.5;
  }
  const knockback = ench.knockback | 0;
  return {
    extraDamage: bonusDamage,
    bonusDamage,
    extraKnockback: knockback * 2.1,
    knockback,
    fireSeconds: (ench.fire_aspect | 0) * 4,
    looting: ench.looting | 0,
  };
}

export const meleeEnchantBonuses = meleeEnchantBonus;

export function bowEnchantBonuses(stack) {
  const ench = stack?.enchants;
  if (!ench) return { damage: 4, punch: 0, flame: false, infinity: false };
  const power = ench.power | 0;
  return {
    damage: power > 0 ? Math.round(4 * (1 + 0.25 * (power + 1))) : 4,
    punch: ench.punch | 0,
    flame: (ench.flame | 0) > 0,
    infinity: (ench.infinity | 0) > 0,
  };
}

export function bowDamageFor(stack) {
  return bowEnchantBonuses(stack).damage;
}

export function armorEnchantReduction(armor, sourceOrFall = false) {
  if (!Array.isArray(armor)) return 0;
  const source = sourceOrFall === true ? 'fall' : (typeof sourceOrFall === 'string' ? sourceOrFall : 'mob');
  let epf = 0;
  for (const piece of armor) {
    if (!piece?.enchants) continue;
    const e = piece.enchants;
    if ((e.protection | 0) > 0) epf += (e.protection | 0);
    if (source === 'fall' && (e.feather_falling | 0) > 0) epf += (e.feather_falling | 0) * 2.5;
    if (source === 'fire' && (e.fire_protection | 0) > 0) epf += (e.fire_protection | 0) * 2;
    if (source === 'blast' && (e.blast_protection | 0) > 0) epf += (e.blast_protection | 0) * 2;
    if (source === 'projectile' && (e.projectile_protection | 0) > 0) epf += (e.projectile_protection | 0) * 2;
  }
  return Math.min(0.8, Math.min(20, epf) * 0.04);
}

export function oreXpDrop(blockId, rng = Math.random) {
  if (blockId === COAL_ORE) return Math.floor(rng() * 3); // 0-2
  if (blockId === DIAMOND_ORE) return 3 + Math.floor(rng() * 5); // 3-7
  if (blockId === LAPIS_ORE || blockId === QUARTZ_ORE) return 2 + Math.floor(rng() * 4); // 2-5
  if (blockId === REDSTONE_ORE) return 1 + Math.floor(rng() * 5); // 1-5
  return 0;
}
