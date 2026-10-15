// Minecraft Beta-era shaped/shapeless recipes and furnace results.
import { PLANKS, LOG, COBBLE, STONE, TORCH, CRAFTING_TABLE, FURNACE } from '../world/blocks.js';

const STICK = 280, COAL = 263, IRON = 265, GOLD = 266, DIAMOND = 264, LEATHER = 334;
const WOOD = { sword: 268, shovel: 269, pick: 270, axe: 271, hoe: 290 };
const STONE_TOOL = { sword: 272, shovel: 273, pick: 274, axe: 275, hoe: 291 };
const IRON_TOOL = { sword: 267, shovel: 256, pick: 257, axe: 258, hoe: 292 };
const GOLD_TOOL = { sword: 283, shovel: 284, pick: 285, axe: 286, hoe: 294 };
const DIAMOND_TOOL = { sword: 276, shovel: 277, pick: 278, axe: 279, hoe: 293 };
const STRING = 287, FEATHER = 288, GUNPOWDER = 289, WHEAT = 296;
const BOWL = 281, STEW = 282, BREAD = 297, PAPER = 339, BOOK = 340, SUGAR = 353;
const FLINT = 318, BRICK_ITEM = 336, CLAY_BALL = 337, REEDS = 338;
const TNT_BLOCK = 46, SAND = 12, SNOWBALL = 332, SNOW_BLOCK = 80;
const WOOL = 150, BED = 355, SIGN = 323, LADDER = 65, RAIL = 66;
const MINECART = 328, BOAT = 333, BUCKET = 325, WOOD_DOOR = 64, IRON_DOOR = 71;
const CHEST = 54, BOOKSHELF = 47, JUKEBOX = 84, GLOWSTONE = 89;
const GLOWSTONE_DUST = 348, CAKE = 354, FLINT_STEEL = 259, EGG = 344;

function toolPatterns(material, results) {
  return [
    { pattern: [[material, material, material], [0, STICK, 0], [0, STICK, 0]], out: [results.pick, 1] },
    { pattern: [[material, material], [material, STICK], [0, STICK]], out: [results.axe, 1] },
    { pattern: [[material], [STICK], [STICK]], out: [results.shovel, 1] },
    { pattern: [[material], [material], [STICK]], out: [results.sword, 1] },
    { pattern: [[material, material], [0, STICK], [0, STICK]], out: [results.hoe, 1] },
  ];
}

function armorPatterns(material, [helmet, chestplate, leggings, boots]) {
  return [
    { pattern: [[material, material, material], [material, 0, material]], out: [helmet, 1] },
    { pattern: [[material, 0, material], [material, material, material], [material, material, material]], out: [chestplate, 1] },
    { pattern: [[material, material, material], [material, 0, material], [material, 0, material]], out: [leggings, 1] },
    { pattern: [[material, 0, material], [material, 0, material]], out: [boots, 1] },
  ];
}

export const SHAPED = [
  { pattern: [[PLANKS, PLANKS], [PLANKS, PLANKS]], out: [CRAFTING_TABLE, 1] },
  { pattern: [[PLANKS], [PLANKS]], out: [STICK, 4] },
  { pattern: [[COBBLE, COBBLE, COBBLE], [COBBLE, 0, COBBLE], [COBBLE, COBBLE, COBBLE]], out: [FURNACE, 1] },
  { pattern: [[COAL], [STICK]], out: [TORCH, 4] },
  ...toolPatterns(PLANKS, WOOD),
  ...toolPatterns(COBBLE, STONE_TOOL),
  ...toolPatterns(IRON, IRON_TOOL),
  ...toolPatterns(GOLD, GOLD_TOOL),
  ...toolPatterns(DIAMOND, DIAMOND_TOOL),

  { pattern: [[STRING, STICK, 0], [STRING, 0, STICK], [STRING, STICK, 0]], out: [261, 1] },
  { pattern: [[FLINT], [STICK], [FEATHER]], out: [262, 4] },
  { pattern: [[WHEAT, WHEAT, WHEAT]], out: [BREAD, 1] },
  { pattern: [[REEDS, REEDS, REEDS]], out: [PAPER, 3] },
  { pattern: [[PAPER, PAPER, PAPER], [0, LEATHER, 0]], out: [340, 1] },
  { pattern: [[PLANKS, 0, PLANKS], [0, PLANKS, 0]], out: [BOWL, 4] },
  ...armorPatterns(334, [298, 299, 300, 301]),
  ...armorPatterns(265, [306, 307, 308, 309]),
  ...armorPatterns(264, [310, 311, 312, 313]),
  ...armorPatterns(266, [314, 315, 316, 317]),

  { pattern: [[SAND, SAND], [SAND, SAND]], out: [24, 1] },
  { pattern: [[CLAY_BALL, CLAY_BALL], [CLAY_BALL, CLAY_BALL]], out: [82, 1] },
  { pattern: [[BRICK_ITEM, BRICK_ITEM], [BRICK_ITEM, BRICK_ITEM]], out: [45, 1] },
  { pattern: [[SNOWBALL, SNOWBALL], [SNOWBALL, SNOWBALL]], out: [SNOW_BLOCK, 1] },
  { pattern: [[IRON, IRON, IRON], [IRON, IRON, IRON], [IRON, IRON, IRON]], out: [42, 1] },
  { pattern: [[GOLD, GOLD, GOLD], [GOLD, GOLD, GOLD], [GOLD, GOLD, GOLD]], out: [41, 1] },
  { pattern: [[DIAMOND, DIAMOND, DIAMOND], [DIAMOND, DIAMOND, DIAMOND], [DIAMOND, DIAMOND, DIAMOND]], out: [57, 1] },
  { pattern: [[PLANKS, PLANKS, PLANKS], [PLANKS, 0, PLANKS], [PLANKS, PLANKS, PLANKS]], out: [CHEST, 1] },
  { pattern: [[PLANKS, PLANKS, PLANKS], [0, BOOK, 0], [PLANKS, PLANKS, PLANKS]], out: [BOOKSHELF, 1] },
  { pattern: [[PLANKS, PLANKS, PLANKS], [PLANKS, DIAMOND, PLANKS], [PLANKS, PLANKS, PLANKS]], out: [JUKEBOX, 1] },
  { pattern: [[GLOWSTONE_DUST, GLOWSTONE_DUST], [GLOWSTONE_DUST, GLOWSTONE_DUST]], out: [GLOWSTONE, 1] },
  { pattern: [[PLANKS, PLANKS, PLANKS], [PLANKS, PLANKS, PLANKS], [0, STICK, 0]], out: [SIGN, 3] },
  { pattern: [[STICK, 0, STICK], [STICK, STICK, STICK], [STICK, 0, STICK]], out: [LADDER, 3] },
  { pattern: [[WOOL, WOOL, WOOL], [PLANKS, PLANKS, PLANKS]], out: [BED, 1] },
  { pattern: [[IRON, 0, IRON], [0, IRON, 0]], out: [BUCKET, 1] },
  { pattern: [[IRON, 0, IRON], [IRON, IRON, IRON]], out: [MINECART, 1] },
  { pattern: [[PLANKS, 0, PLANKS], [PLANKS, PLANKS, PLANKS]], out: [BOAT, 1] },
  { pattern: [[IRON, IRON], [IRON, IRON], [IRON, IRON]], out: [IRON_DOOR, 3] },
  { pattern: [[PLANKS, PLANKS], [PLANKS, PLANKS], [PLANKS, PLANKS]], out: [WOOD_DOOR, 3] },
  { pattern: [[IRON, 0, IRON], [IRON, STICK, IRON], [IRON, STICK, IRON]], out: [RAIL, 16] },
  { pattern: [[SAND, GUNPOWDER, SAND], [GUNPOWDER, SAND, GUNPOWDER], [SAND, GUNPOWDER, SAND]], out: [TNT_BLOCK, 1] },
  { pattern: [[334, 0, 334], [334, 334, 334], [334, 334, 334]], out: [299, 1] },
  { pattern: [[IRON, 0], [0, IRON]], out: [359, 1] },
  { pattern: [[IRON, 0], [0, FLINT]], out: [FLINT_STEEL, 1] },
  { pattern: [[335, 335, 335], [SUGAR, EGG, SUGAR], [WHEAT, WHEAT, WHEAT]], out: [CAKE, 1] },
];

export const SHAPELESS = [
  { in: [LOG], out: [PLANKS, 4] },
  { in: [REEDS], out: [SUGAR, 1] },
  { in: [REEDS, REEDS, REEDS], out: [PAPER, 3] },
  { in: [39, 40, BOWL], out: [STEW, 1] },
];

export const SMELTING = Object.freeze({
  [SAND]: 20,
  [COBBLE]: STONE,
  15: 265,
  14: 266,
  [LOG]: COAL,
  319: 320,
  349: 350,
  [CLAY_BALL]: BRICK_ITEM,
  81: 351,
});

function normalizePattern(pattern) {
  let minRow = pattern.length, maxRow = -1, minCol = Infinity, maxCol = -1;
  for (let row = 0; row < pattern.length; row++) {
    for (let col = 0; col < pattern[row].length; col++) {
      if (pattern[row][col]) {
        minRow = Math.min(minRow, row); maxRow = Math.max(maxRow, row);
        minCol = Math.min(minCol, col); maxCol = Math.max(maxCol, col);
      }
    }
  }
  if (maxRow < 0) return null;
  const grid = [];
  for (let row = minRow; row <= maxRow; row++) {
    const cells = [];
    for (let col = minCol; col <= maxCol; col++) cells.push(pattern[row][col] || 0);
    grid.push(cells);
  }
  return { grid, width: maxCol - minCol + 1, height: maxRow - minRow + 1 };
}

const NORMALIZED = SHAPED.map(recipe => {
  const normalized = normalizePattern(recipe.pattern);
  return normalized ? { ...normalized, out: recipe.out } : null;
}).filter(Boolean);

function extractGrid(slots, size) {
  let minRow = size, maxRow = -1, minCol = size, maxCol = -1;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (slots[row * size + col]) {
        minRow = Math.min(minRow, row); maxRow = Math.max(maxRow, row);
        minCol = Math.min(minCol, col); maxCol = Math.max(maxCol, col);
      }
    }
  }
  if (maxRow < 0) return null;
  const grid = [];
  for (let row = minRow; row <= maxRow; row++) {
    const cells = [];
    for (let col = minCol; col <= maxCol; col++) cells.push(slots[row * size + col]?.id || 0);
    grid.push(cells);
  }
  return { grid, width: maxCol - minCol + 1, height: maxRow - minRow + 1 };
}

function sameShape(recipe, grid, mirrored = false) {
  for (let row = 0; row < recipe.height; row++) {
    for (let col = 0; col < recipe.width; col++) {
      const recipeCol = mirrored ? recipe.width - 1 - col : col;
      if (recipe.grid[row][recipeCol] !== grid.grid[row][col]) return false;
    }
  }
  return true;
}

function matchesShapeless(slots, recipe) {
  const occupied = slots.filter(Boolean);
  if (occupied.length !== recipe.in.length) return false;
  const required = new Map(), present = new Map();
  for (const id of recipe.in) required.set(id, (required.get(id) || 0) + 1);
  for (const stack of occupied) present.set(stack.id, (present.get(stack.id) || 0) + 1);
  if (required.size !== present.size) return false;
  for (const [id, count] of required) if (present.get(id) !== count) return false;
  return true;
}

export function matchRecipe(slots, size) {
  if (!Array.isArray(slots) || (size !== 2 && size !== 3)) return null;
  const grid = extractGrid(slots, size);
  if (!grid) return null;
  for (const recipe of NORMALIZED) {
    if (recipe.width !== grid.width || recipe.height !== grid.height) continue;
    if (sameShape(recipe, grid) || sameShape(recipe, grid, true)) return { id: recipe.out[0], count: recipe.out[1] };
  }
  const activeSlots = slots.slice(0, size * size);
  for (const recipe of SHAPELESS) {
    if (matchesShapeless(activeSlots, recipe)) return { id: recipe.out[0], count: recipe.out[1] };
  }
  return null;
}

export function smeltResult(inputId) {
  return SMELTING[inputId] ?? null;
}

export function knownRecipes() {
  return NORMALIZED.map(recipe => recipe.out[0]).concat(SHAPELESS.map(recipe => recipe.out[0]));
}
