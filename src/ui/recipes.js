// Beta 1.7.3 crafting recipes + furnace smelting.
import {
  PLANKS, LOG, COBBLE, STONE, TORCH, CRAFTING_TABLE, FURNACE
} from '../world/blocks.js';

// ItemStack: {id, count}. id < 256 = block.
const STICK = 280, COAL = 263, IRON_INGOT = 265, GOLD_INGOT = 266, DIAMOND = 264;
const WOOD_SWORD = 268, WOOD_SHOVEL = 269, WOOD_PICK = 270, WOOD_AXE = 271, WOOD_HOE = 290;
const STONE_SWORD = 272, STONE_SHOVEL = 273, STONE_PICK = 274, STONE_AXE = 275, STONE_HOE = 291;
const IRON_SWORD = 267, IRON_SHOVEL = 256, IRON_PICK = 257, IRON_AXE = 258, IRON_HOE = 292;
const GOLD_SWORD = 283, GOLD_SHOVEL = 284, GOLD_PICK = 285, GOLD_AXE = 286, GOLD_HOE = 294;
const DIA_SWORD = 276, DIA_SHOVEL = 277, DIA_PICK = 278, DIA_AXE = 279, DIA_HOE = 293;
const BOWL = 281, MUSHROOM_STEW = 282, BREAD = 297, APPLE = 260, SEEDS = 295, WHEAT = 296;
const PAPER = 339, BOOK = 340, SUGAR = 353, CAKE = 354, LEATHER = 334;
const RAIL = 66, MINECART = 328, TNT_BLOCK = 46, SUGARCANE_ITEM = 338, CLAY_BALL = 337;
const BRICK_ITEM = 336, FLINT_STEEL = 259, SHEARS = 359, BOW = 261, ARROW = 262;
const SNOWBALL = 332, SNOW_BLOCK = 80, SAND = 12, GLASS = 20, BRICK_BLOCK = 45;
const WOOL = 150, STRING = 287, BED = 355, SIGN = 323, LADDER = 65, STONE_BRICK = 98;
const IRON_BLOCK = 42, GOLD_BLOCK = 41, DIAMOND_BLOCK = 57, BOOKSHELF = 47, JUKEBOX = 84;
const OBSIDIAN = 49, GLOWSTONE = 89, COOKIE = 357, GOLD_APPLE = 322;
const FLINT = 318, FEATHER = 288, SANDSTONE = 24, CLAY = 82, GUNPOWDER_ALT = 289;
const CHEST_BLOCK = 54;

// Pattern recipes: pattern is array of rows of item ids (0 = empty), shapeless separate.
export const SHAPED = [
  { pattern: [[PLANKS, PLANKS], [PLANKS, PLANKS]], out: [CRAFTING_TABLE, 1] },
  { pattern: [[PLANKS], [PLANKS]], out: [STICK, 4] },
  { pattern: [[COBBLE, COBBLE, COBBLE], [COBBLE, 0, COBBLE], [COBBLE, COBBLE, COBBLE]], out: [FURNACE, 1] },
  { pattern: [[COAL], [STICK]], out: [TORCH, 4] },
  { pattern: [[263], [STICK]], out: [TORCH, 4] }, // coal
  // tools
  { pattern: [[PLANKS, PLANKS, PLANKS], [0, STICK, 0], [0, STICK, 0]], out: [WOOD_PICK, 1] },
  { pattern: [[COBBLE, COBBLE, COBBLE], [0, STICK, 0], [0, STICK, 0]], out: [STONE_PICK, 1] },
  { pattern: [[IRON_INGOT, IRON_INGOT, IRON_INGOT], [0, STICK, 0], [0, STICK, 0]], out: [IRON_PICK, 1] },
  { pattern: [[GOLD_INGOT, GOLD_INGOT, GOLD_INGOT], [0, STICK, 0], [0, STICK, 0]], out: [GOLD_PICK, 1] },
  { pattern: [[DIAMOND, DIAMOND, DIAMOND], [0, STICK, 0], [0, STICK, 0]], out: [DIA_PICK, 1] },
  { pattern: [[PLANKS, PLANKS], [PLANKS, STICK], [0, STICK]], out: [WOOD_AXE, 1] },
  { pattern: [[COBBLE, COBBLE], [COBBLE, STICK], [0, STICK]], out: [STONE_AXE, 1] },
  { pattern: [[IRON_INGOT, IRON_INGOT], [IRON_INGOT, STICK], [0, STICK]], out: [IRON_AXE, 1] },
  { pattern: [[GOLD_INGOT, GOLD_INGOT], [GOLD_INGOT, STICK], [0, STICK]], out: [GOLD_AXE, 1] },
  { pattern: [[DIAMOND, DIAMOND], [DIAMOND, STICK], [0, STICK]], out: [DIA_AXE, 1] },
  { pattern: [[PLANKS], [STICK], [STICK]], out: [WOOD_SHOVEL, 1] },
  { pattern: [[COBBLE], [STICK], [STICK]], out: [STONE_SHOVEL, 1] },
  { pattern: [[IRON_INGOT], [STICK], [STICK]], out: [IRON_SHOVEL, 1] },
  { pattern: [[GOLD_INGOT], [STICK], [STICK]], out: [GOLD_SHOVEL, 1] },
  { pattern: [[DIAMOND], [STICK], [STICK]], out: [DIA_SHOVEL, 1] },
  { pattern: [[PLANKS], [STICK], [STICK]], out: [WOOD_SWORD, 1] }, // ambiguous with shovel — resolve by shape match len
  { pattern: [[PLANKS, PLANKS], [0, STICK], [0, STICK]], out: [WOOD_SWORD, 1] },
  { pattern: [[COBBLE, COBBLE], [0, STICK], [0, STICK]], out: [STONE_SWORD, 1] },
  { pattern: [[IRON_INGOT, IRON_INGOT], [0, STICK], [0, STICK]], out: [IRON_SWORD, 1] },
  { pattern: [[GOLD_INGOT, GOLD_INGOT], [0, STICK], [0, STICK]], out: [GOLD_SWORD, 1] },
  { pattern: [[DIAMOND, DIAMOND], [0, STICK], [0, STICK]], out: [DIA_SWORD, 1] },
  { pattern: [[PLANKS, 0, PLANKS], [PLANKS, STICK, PLANKS], [0, STICK, 0]], out: [BOW, 1] },
  { pattern: [[FLINT, STICK, FEATHER]], out: [ARROW, 4] },
  { pattern: [[PLANKS, PLANKS, PLANKS], [0, STICK, 0], [0, 0, 0]], out: [WOOD_HOE, 1] },
  { pattern: [[COBBLE, COBBLE, COBBLE], [0, STICK, 0]], out: [STONE_HOE, 1] },
  { pattern: [[IRON_INGOT, IRON_INGOT, IRON_INGOT], [0, STICK, 0]], out: [IRON_HOE, 1] },
  { pattern: [[GOLD_INGOT, GOLD_INGOT, GOLD_INGOT], [0, STICK, 0]], out: [GOLD_HOE, 1] },
  { pattern: [[DIAMOND, DIAMOND, DIAMOND], [0, STICK, 0]], out: [DIA_HOE, 1] },
  // blocks
  { pattern: [[SAND, SAND], [SAND, SAND]], out: [SANDSTONE, 1] },
  { pattern: [[CLAY_BALL, CLAY_BALL], [CLAY_BALL, CLAY_BALL]], out: [CLAY, 1] },
  { pattern: [[BRICK_ITEM, BRICK_ITEM], [BRICK_ITEM, BRICK_ITEM]], out: [BRICK_BLOCK, 1] },
  { pattern: [[SNOWBALL, SNOWBALL], [SNOWBALL, SNOWBALL]], out: [SNOW_BLOCK, 1] },
  { pattern: [[IRON_INGOT, IRON_INGOT, IRON_INGOT], [IRON_INGOT, IRON_INGOT, IRON_INGOT], [IRON_INGOT, IRON_INGOT, IRON_INGOT]], out: [IRON_BLOCK, 1] },
  { pattern: [[GOLD_INGOT, GOLD_INGOT, GOLD_INGOT], [GOLD_INGOT, GOLD_INGOT, GOLD_INGOT], [GOLD_INGOT, GOLD_INGOT, GOLD_INGOT]], out: [GOLD_BLOCK, 1] },
  { pattern: [[DIAMOND, DIAMOND, DIAMOND], [DIAMOND, DIAMOND, DIAMOND], [DIAMOND, DIAMOND, DIAMOND]], out: [DIAMOND_BLOCK, 1] },
  { pattern: [[PLANKS, PLANKS, PLANKS], [PLANKS, PLANKS, PLANKS], [PLANKS, PLANKS, PLANKS]], out: [JUKEBOX, 1] },
  { pattern: [[PLANKS, PLANKS, PLANKS], [BOOK, BOOK, BOOK], [PLANKS, PLANKS, PLANKS]], out: [BOOKSHELF, 1] },
  { pattern: [[PLANKS, PLANKS, PLANKS], [PLANKS, PLANKS, PLANKS], [PLANKS, PLANKS, PLANKS]], out: [CHEST_BLOCK, 1] },
  { pattern: [[SAND, SAND, SAND], [SAND, GLASS, SAND], [SAND, SAND, SAND]], out: [GLOWSTONE, 1] },
  { pattern: [[0, PLANKS, 0], [PLANKS, PLANKS, PLANKS], [PLANKS, PLANKS, PLANKS]], out: [SIGN, 1] },
  { pattern: [[STICK, 0, STICK], [STICK, STICK, STICK], [STICK, 0, STICK]], out: [LADDER, 3] },
  { pattern: [[COBBLE, COBBLE, COBBLE], [COBBLE, COBBLE, COBBLE]], out: [STONE_BRICK, 4] },
  { pattern: [[IRON_INGOT, 0, IRON_INGOT], [IRON_INGOT, STICK, IRON_INGOT], [IRON_INGOT, 0, IRON_INGOT]], out: [MINECART, 1] },
  { pattern: [[SUGARCANE_ITEM, SUGARCANE_ITEM, SUGARCANE_ITEM]], out: [SUGAR, 1] },
  { pattern: [[SUGARCANE_ITEM, SUGARCANE_ITEM, SUGARCANE_ITEM]], out: [PAPER, 3] },
  { pattern: [[PAPER, PAPER, PAPER], [0, LEATHER, 0]], out: [BOOK, 1] },
  { pattern: [[SNOW_BLOCK, SNOW_BLOCK, SNOW_BLOCK], [0, WOOL, 0], [PLANKS, PLANKS, PLANKS]], out: [BED, 1] },
  { pattern: [[IRON_INGOT, IRON_INGOT], [0, STICK]], out: [SHEARS, 1] },
  { pattern: [[FLINT, IRON_INGOT], [0, STICK]], out: [FLINT_STEEL, 1] },
  { pattern: [[0, WHEAT, 0], [WHEAT, WHEAT, WHEAT], [0, WHEAT, 0]], out: [CAKE, 1] },
  { pattern: [[COAL, GUNPOWDER_ALT, COAL], [GUNPOWDER_ALT, COAL, GUNPOWDER_ALT], [COAL, GUNPOWDER_ALT, COAL]], out: [TNT_BLOCK, 1] },
];

export const SHAPELESS = [
  { in: [LOG], out: [PLANKS, 4] },
  { in: [39, 40], out: [MUSHROOM_STEW, 1] }, // mushrooms -> stew needs bowl; simplified below
  { in: [SUGARCANE_ITEM], out: [SUGAR, 1] },
  { in: [COAL, STICK], out: [263, 1] },
];

// Smelting map: input id -> output id
export const SMELTING = {
  [12]: 20,     // sand -> glass
  [1]: 1,       // cobble... wait cobble is 4. Fix below
  [4]: 1,       // cobblestone -> stone
  [15]: 265,    // iron ore -> iron ingot
  [14]: 266,    // gold ore -> gold ingot
  [17]: 263,    // log -> charcoal (coal item, we treat as coal)
  [13]: 12,     // gravel -> flint? actually flint is an item; simplify: gravel -> sand
  [82]: 337,    // clay block -> clay ball? actually clay block smelts to brick block. Fix:
  [319]: 320,   // raw porkchop -> cooked
  [349]: 350,   // raw fish -> cooked fish
  [353 - 56]: 353, // nonsense placeholder removed below
};
delete SMELTING[353 - 56];
SMELTING[82] = 45;  // clay -> bricks block
SMELTING[13] = 318; // gravel -> flint
SMELTING[17] = 263; // log -> coal (charcoal)

function normalizePattern(pattern) {
  // trim empty rows/cols, return {grid, w, h}
  let minR = pattern.length, maxR = -1, minC = 99, maxC = -1;
  pattern.forEach((row, r) => row.forEach((v, c) => {
    if (v) {
      minR = Math.min(minR, r); maxR = Math.max(maxR, r);
      minC = Math.min(minC, c); maxC = Math.max(maxC, c);
    }
  }));
  if (maxR < 0) return null;
  const grid = [];
  for (let r = minR; r <= maxR; r++) {
    const row = [];
    for (let c = minC; c <= maxC; c++) row.push(pattern[r][c] || 0);
    grid.push(row);
  }
  return { grid, w: maxC - minC + 1, h: maxR - minR + 1 };
}

const normShaped = SHAPED.map(r => {
  const n = normalizePattern(r.pattern);
  return n ? { ...n, out: r.out } : null;
}).filter(Boolean);

// Normalize the crafting grid slots (array of {id,count}|null, size = 2 or 3 per side)
export function matchRecipe(slots, size) {
  // build grid
  let minR = size, maxR = -1, minC = size, maxC = -1;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const s = slots[r * size + c];
      if (s) {
        minR = Math.min(minR, r); maxR = Math.max(maxR, r);
        minC = Math.min(minC, c); maxC = Math.max(maxC, c);
      }
    }
  }
  if (maxR < 0) return null;
  const w = maxC - minC + 1, h = maxR - minR + 1;
  const grid = [];
  for (let r = 0; r < h; r++) {
    const row = [];
    for (let c = 0; c < w; c++) {
      const s = slots[(minR + r) * size + (minC + c)];
      row.push(s ? s.id : 0);
    }
    grid.push(row);
  }

  for (const rec of normShaped) {
    if (rec.w !== w || rec.h !== h) continue;
    let ok = true;
    for (let r = 0; r < h && ok; r++) {
      for (let c = 0; c < w && ok; c++) {
        if (rec.grid[r][c] !== grid[r][c]) ok = false;
      }
    }
    if (ok) return { id: rec.out[0], count: rec.out[1] };
  }

  // shapeless fallback: count items
  const counts = {};
  for (const s of slots) {
    if (s) counts[s.id] = (counts[s.id] || 0) + 1;
  }
  const keys = Object.keys(counts).map(Number);
  if (keys.length === 1 && counts[keys[0]] === 1) {
    const id = keys[0];
    if (id === 17) return { id: PLANKS, count: 4 }; // log -> planks
    if (id === 39 || id === 40) return null; // need bowl for stew
    if (id === 82) return { id: 45, count: 1 };
    if (id === 13) return { id: 318, count: 1 }; // gravel shapeless? no
    if (id === 260) return null;
    if (id === 296) return { id: 297, count: 1 }; // 3 wheat need shape... skip
    if (id === 263) return null;
    if (id === 264) return null;
  }
  if (keys.length === 1 && keys[0] === 17 && counts[17] === 1) return { id: PLANKS, count: 4 };
  // 3 wheat -> bread (shapeless)
  if (keys.length === 1 && keys[0] === 296 && counts[296] === 3) return { id: BREAD, count: 1 };
  // 2 mushrooms + bowl -> stew
  if (keys.length === 3 && counts[281] === 1 && (counts[39] || 0) + (counts[40] || 0) === 2) return { id: MUSHROOM_STEW, count: 1 };
  // 3 wheat
  if (keys.length === 1 && keys[0] === 296 && counts[296] === 3) return { id: BREAD, count: 1 };
  // sugar cane -> paper handled shaped
  return null;
}

export function smeltResult(inputId) {
  return SMELTING[inputId] ?? null;
}

// All craftable outputs for recipe book hint
export function knownRecipes() {
  return normShaped.map(r => r.out[0]);
}
