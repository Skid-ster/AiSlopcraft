// Small deterministic furnace simulation, separated for headless regression tests.
import { itemStackLimit, LOG, PLANKS, SAPLING, CHEST, WOOD_DOOR, LADDER, OAK_STAIRS, FENCE } from '../world/blocks.js';
import { smeltResult } from './recipes.js';
import { sameEnchants } from '../enchanting.js';

export const FUEL_TIMES = Object.freeze({
  [LOG]: 15,
  [PLANKS]: 15,
  [SAPLING]: 5,
  [CHEST]: 15,
  [WOOD_DOOR]: 10,
  [LADDER]: 15,
  [OAK_STAIRS]: 15,
  [FENCE]: 15,
  280: 5,    // stick
  281: 5,    // wooden bowl
  263: 80,   // coal / charcoal
  327: 1000, // lava bucket
  369: 120,  // blaze rod
  47: 15,    // bookshelf
  58: 15,    // crafting table
  268: 10, 269: 10, 270: 10, 271: 10, 290: 10, // wooden tools
});

export const SMELT_XP = Object.freeze({
  264: 1.0,  // diamond
  266: 1.0,  // gold ingot
  265: 0.7,  // iron ingot
  320: 0.35, // cooked porkchop
  350: 0.35, // cooked fish
  336: 0.3,  // brick
  406: 0.2,  // nether quartz
  405: 0.1,  // nether brick
  263: 0.15, // charcoal / coal
  20: 0.1,   // glass
  1: 0.1,    // stone
});

export function createFurnaceState() {
  return { input: null, output: null, fuel: null, burn: 0, burnMax: 0, cook: 0, storedXp: 0, soundTimer: 0 };
}

export function furnaceStackLimit(stack) {
  return itemStackLimit(stack.id);
}

function canMergeStacks(a, b) {
  return !!a && !!b && a.id === b.id && (a.damage || 0) === (b.damage || 0)
    && sameEnchants(a.enchants, b.enchants) && furnaceStackLimit(a) > 1;
}

export function interactWithFurnaceSlot(furnace, slot, cursorStack, button = 0) {
  if (!furnace || !['input', 'fuel', 'output'].includes(slot)) return { cursorStack, changed: false, xpEarned: 0 };
  const source = furnace[slot];
  const rightClick = button === 2;
  let changed = false;
  let xpEarned = 0;

  if (slot === 'output') {
    if (!source) return { cursorStack, changed, xpEarned };
    if (!cursorStack) {
      const amount = rightClick ? 1 : source.count;
      cursorStack = { ...source, count: amount };
      source.count -= amount;
      if (source.count <= 0) furnace.output = null;
      changed = true;
      if (furnace.storedXp > 0) {
        const whole = Math.floor(furnace.storedXp);
        const frac = furnace.storedXp - whole;
        xpEarned = whole + (Math.random() < frac ? 1 : 0);
        furnace.storedXp = 0;
      }
    } else if (canMergeStacks(cursorStack, source)) {
      const amount = Math.min(rightClick ? 1 : source.count, furnaceStackLimit(cursorStack) - cursorStack.count);
      if (amount > 0) {
        cursorStack.count += amount;
        source.count -= amount;
        if (source.count <= 0) furnace.output = null;
        changed = true;
        if (furnace.storedXp > 0) {
          const whole = Math.floor(furnace.storedXp);
          const frac = furnace.storedXp - whole;
          xpEarned = whole + (Math.random() < frac ? 1 : 0);
          furnace.storedXp = 0;
        }
      }
    }
  } else if (!cursorStack && source) {
    const amount = rightClick ? Math.ceil(source.count / 2) : source.count;
    cursorStack = { ...source, count: amount };
    source.count -= amount;
    if (source.count <= 0) furnace[slot] = null;
    changed = true;
  } else if (cursorStack && !source) {
    const amount = rightClick ? 1 : Math.min(furnaceStackLimit(cursorStack), cursorStack.count);
    furnace[slot] = { ...cursorStack, count: amount };
    cursorStack.count -= amount;
    if (cursorStack.count <= 0) cursorStack = null;
    changed = true;
  } else if (cursorStack && source && canMergeStacks(cursorStack, source)) {
    const amount = Math.min(rightClick ? 1 : cursorStack.count, furnaceStackLimit(source) - source.count);
    if (amount > 0) {
      source.count += amount;
      cursorStack.count -= amount;
      if (cursorStack.count <= 0) cursorStack = null;
      changed = true;
    }
  } else if (cursorStack && source && !rightClick) {
    furnace[slot] = cursorStack;
    cursorStack = source;
    changed = true;
  }

      return { cursorStack, changed, xpEarned };
}

function getSmeltableResult(furnace) {
  if (!furnace.input || furnace.input.count <= 0) return null;
  const result = smeltResult(furnace.input.id);
  if (result == null) return null;
  if (furnace.output && (furnace.output.id !== result || furnace.output.count >= 64)) return null;
  return result;
}

export function tickFurnace(furnace, dt) {
  const step = Math.max(0, Math.min(dt, 1));
  if (!step) return { burning: furnace.burn > 0, cooked: 0 };

  let cooked = 0;
  let result = getSmeltableResult(furnace);
  if (furnace.burn <= 0 && result != null && furnace.fuel && furnace.fuel.count > 0) {
    const fuelId = furnace.fuel.id;
    const fuelDuration = FUEL_TIMES[fuelId] || 0;
    if (fuelDuration > 0) {
      furnace.burn = fuelDuration;
      furnace.burnMax = fuelDuration;
      furnace.fuel.count--;
      if (furnace.fuel.count <= 0) {
        // Lava bucket leaves an empty bucket behind (Beta behavior!)
        furnace.fuel = fuelId === 327 ? { id: 325, count: 1, damage: 0 } : null;
      }
    }
  }

  if (furnace.burn > 0) {
    const activeTime = Math.min(step, furnace.burn);
    furnace.burn = Math.max(0, furnace.burn - step);
    result = getSmeltableResult(furnace);
    if (result != null) {
      furnace.cook += activeTime;
      while (furnace.cook + 1e-9 >= 6 && result != null) {
        furnace.cook = Math.max(0, furnace.cook - 6);
        if (furnace.output) furnace.output.count++;
        else furnace.output = { id: result, count: 1, damage: 0 };
        furnace.storedXp = (furnace.storedXp || 0) + (SMELT_XP[result] || 0.1);
        furnace.input.count--;
        cooked++;
        if (furnace.input.count <= 0) furnace.input = null;
        result = getSmeltableResult(furnace);
      }
      if (result == null) furnace.cook = 0;
    } else {
      furnace.cook = Math.max(0, furnace.cook - step * 2);
    }
  } else {
    furnace.cook = Math.max(0, furnace.cook - step * 2);
  }

  return { burning: furnace.burn > 0, cooked };
}
