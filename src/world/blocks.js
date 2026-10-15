// Block + item registry, modeled on Minecraft Beta 1.7.3 values.

export const AIR = 0;
export const STONE = 1;
export const GRASS = 2;
export const DIRT = 3;
export const COBBLE = 4;
export const PLANKS = 5;
export const SAPLING = 6;
export const BEDROCK = 7;
export const WATER = 8;
export const LAVA = 10;
export const SAND = 12;
export const GRAVEL = 13;
export const GOLD_ORE = 14;
export const IRON_ORE = 15;
export const COAL_ORE = 16;
export const LOG = 17;
export const LEAVES = 18;
export const GLASS = 20;
export const DIAMOND_ORE = 56;
export const REDSTONE_ORE = 73;
export const LAPIS_ORE = 21;
export const COBWEB = 30;
export const TALL_GRASS = 31;
export const FLOWER_YELLOW = 37; // dandelion
export const FLOWER_RED = 38;    // rose
export const MUSHROOM_BROWN = 39;
export const MUSHROOM_RED = 40;
export const GOLD_BLOCK = 41;
export const IRON_BLOCK = 42;
export const BRICK = 45;
export const TNT = 46;
export const BOOKSHELF = 47;
export const MOSSY_COBBLE = 48;
export const OBSIDIAN = 49;
export const TORCH = 50;
export const CRAFTING_TABLE = 58;
export const FURNACE = 61;
export const LADDER = 65;
export const RAIL = 66;
export const LEVER = 69;
export const REDSTONE_TORCH = 76;
export const SNOW = 78;
export const ICE = 79;
export const SNOW_BLOCK = 80;
export const CACTUS = 81;
export const CLAY = 82;
export const SUGARCANE = 83;
export const JUKEBOX = 84;
export const PUMPKIN = 86;
export const NETHERRACK = 87;
export const SLOW_SAND = 88; // soul sand
export const GLOWSTONE = 89;
export const STONE_BRICK = 98;
export const IRON_DOOR = 71;
export const WOOD_DOOR = 64;
export const SANDSTONE = 24;
export const WOOL_BASE = 150; // +0..15 (kept clear of classic block ids)
export const DIAMOND_BLOCK = 57;
export const FARMLAND = 60;
export const LAVA_FLOW = 11;
export const WATER_FLOW = 9;

export const TILES = {
  grass_top: 0, grass_side: 1, dirt: 2, stone: 3, cobble: 4, bedrock: 5,
  sand: 6, gravel: 7, log_side: 8, log_top: 9, leaves: 10, planks: 11,
  glass: 12, water: 13, lava: 14, sandstone_top: 15, sandstone_side: 16,
  sandstone_bottom: 17, wool_white: 18, brick: 19, tnt_top: 20, tnt_side: 21,
  tnt_bottom: 22, crafting_top: 23, crafting_side: 24, crafting_front: 25,
  furnace_top: 26, furnace_side: 27, furnace_front: 28, furnace_front_lit: 29,
  coal_ore: 30, iron_ore: 31, gold_ore: 32, diamond_ore: 33, redstone_ore: 34,
  lapis_ore: 35, clay: 36, snow: 37, ice: 38, obsidian: 39, glowstone: 40,
  netherrack: 41, slow_sand: 42, stone_brick: 43, mossy_cobble: 44,
  iron_block: 45, gold_block: 46, diamond_block: 47, bookshelf: 48,
  pumpkin_side: 49, pumpkin_face: 50, pumpkin_top: 51, cactus_side: 52,
  cactus_top: 53, sugarcane: 54, rose: 55, dandelion: 56, tall_grass: 57,
  mushroom_red: 58, mushroom_brown: 59, sapling: 60, torch: 61, ladder: 62,
  rail: 63, snow_block: 64, jukebox_side: 65, jukebox_top: 66, wool_red: 67,
  wool_orange: 68, wool_yellow: 69, wool_lime: 70, wool_green: 71, wool_cyan: 72,
  wool_lightblue: 73, wool_blue: 74, wool_purple: 75, wool_magenta: 76,
  wool_pink: 77, wool_gray: 78, wool_lightgray: 79, wool_brown: 80,
  wool_black: 81, cobweb: 82, farmland: 83, destroy0: 84, destroy1: 85,
  destroy2: 86, destroy3: 87, destroy4: 88, destroy5: 89, destroy6: 90,
  destroy7: 91, destroy8: 92, destroy9: 93,
};

// Face order: +Y, -Y, +Z, -Z, +X, -X
function faces(top, bottom, side, front) {
  return [top, bottom, side, front != null ? front : side, side, side];
}

const B = {};
function def(id, name, opts) {
  B[id] = Object.assign({
    id, name,
    solid: true, opaque: true, liquid: false, light: 0,
    hardness: 1.0, tool: 'none', drops: id, dropCount: 1,
    tint: null, // 'grass' | 'foliage' | null
    cross: false, // X-shaped billboard (flowers etc.)
    tiles: null, render: 'cube',
  }, opts);
}

def(AIR, 'Air', { solid: false, opaque: false, render: 'none', hardness: 0 });
def(STONE, 'Stone', { tiles: faces(TILES.stone, TILES.stone, TILES.stone), hardness: 1.5, tool: 'pickaxe', drops: COBBLE });
def(GRASS, 'Grass', { tiles: faces(TILES.grass_top, TILES.dirt, TILES.grass_side), hardness: 0.6, tool: 'shovel', drops: DIRT, tint: 'grass' });
def(DIRT, 'Dirt', { tiles: faces(TILES.dirt, TILES.dirt, TILES.dirt), hardness: 0.5, tool: 'shovel' });
def(COBBLE, 'Cobblestone', { tiles: faces(TILES.cobble, TILES.cobble, TILES.cobble), hardness: 2.0, tool: 'pickaxe' });
def(PLANKS, 'Oak Planks', { tiles: faces(TILES.planks, TILES.planks, TILES.planks), hardness: 2.0, tool: 'axe' });
def(SAPLING, 'Sapling', { solid: false, opaque: false, cross: true, tiles: faces(TILES.sapling, TILES.sapling, TILES.sapling), hardness: 0.0, render: 'cross' });
def(BEDROCK, 'Bedrock', { tiles: faces(TILES.bedrock, TILES.bedrock, TILES.bedrock), hardness: -1, drops: 0 });
def(WATER, 'Water', { solid: false, opaque: false, liquid: true, tiles: faces(TILES.water, TILES.water, TILES.water), hardness: 100, render: 'liquid' });
def(LAVA, 'Lava', { solid: false, opaque: false, liquid: true, light: 15, tiles: faces(TILES.lava, TILES.lava, TILES.lava), hardness: 100, render: 'liquid' });
def(SAND, 'Sand', { tiles: faces(TILES.sand, TILES.sand, TILES.sand), hardness: 0.5, tool: 'shovel' });
def(GRAVEL, 'Gravel', { tiles: faces(TILES.gravel, TILES.gravel, TILES.gravel), hardness: 0.6, tool: 'shovel' });
def(GOLD_ORE, 'Gold Ore', { tiles: faces(TILES.gold_ore, TILES.gold_ore, TILES.gold_ore), hardness: 3.0, tool: 'pickaxe', minTier: 2 });
def(IRON_ORE, 'Iron Ore', { tiles: faces(TILES.iron_ore, TILES.iron_ore, TILES.iron_ore), hardness: 3.0, tool: 'pickaxe', minTier: 1 });
def(COAL_ORE, 'Coal Ore', { tiles: faces(TILES.coal_ore, TILES.coal_ore, TILES.coal_ore), hardness: 3.0, tool: 'pickaxe' });
def(LOG, 'Wood', { tiles: faces(TILES.log_top, TILES.log_top, TILES.log_side), hardness: 2.0, tool: 'axe' });
def(LEAVES, 'Leaves', { opaque: false, tiles: faces(TILES.leaves, TILES.leaves, TILES.leaves), hardness: 0.2, tint: 'foliage', drops: 0, render: 'cutout' });
def(GLASS, 'Glass', { opaque: false, tiles: faces(TILES.glass, TILES.glass, TILES.glass), hardness: 0.3, drops: 0, render: 'cutout' });
def(LAPIS_ORE, 'Lapis Ore', { tiles: faces(TILES.lapis_ore, TILES.lapis_ore, TILES.lapis_ore), hardness: 3.0, tool: 'pickaxe', minTier: 1 });
def(DIAMOND_ORE, 'Diamond Ore', { tiles: faces(TILES.diamond_ore, TILES.diamond_ore, TILES.diamond_ore), hardness: 3.0, tool: 'pickaxe', minTier: 2 });
def(REDSTONE_ORE, 'Redstone Ore', { tiles: faces(TILES.redstone_ore, TILES.redstone_ore, TILES.redstone_ore), hardness: 3.0, tool: 'pickaxe', minTier: 2, light: 0 });
def(COBWEB, 'Cobweb', { solid: false, opaque: false, cross: true, tiles: faces(TILES.cobweb, TILES.cobweb, TILES.cobweb), hardness: 4, render: 'cross', drops: 287 });
def(TALL_GRASS, 'Grass Shrub', { solid: false, opaque: false, cross: true, tiles: faces(TILES.tall_grass, TILES.tall_grass, TILES.tall_grass), hardness: 0, tint: 'foliage', render: 'cross', drops: 0 });
def(FLOWER_YELLOW, 'Dandelion', { solid: false, opaque: false, cross: true, tiles: faces(TILES.dandelion, TILES.dandelion, TILES.dandelion), hardness: 0, render: 'cross' });
def(FLOWER_RED, 'Rose', { solid: false, opaque: false, cross: true, tiles: faces(TILES.rose, TILES.rose, TILES.rose), hardness: 0, render: 'cross' });
def(MUSHROOM_BROWN, 'Brown Mushroom', { solid: false, opaque: false, cross: true, tiles: faces(TILES.mushroom_brown, TILES.mushroom_brown, TILES.mushroom_brown), hardness: 0, render: 'cross' });
def(MUSHROOM_RED, 'Red Mushroom', { solid: false, opaque: false, cross: true, tiles: faces(TILES.mushroom_red, TILES.mushroom_red, TILES.mushroom_red), hardness: 0, render: 'cross' });
def(GOLD_BLOCK, 'Gold Block', { tiles: faces(TILES.gold_block, TILES.gold_block, TILES.gold_block), hardness: 3, tool: 'pickaxe', minTier: 2 });
def(IRON_BLOCK, 'Iron Block', { tiles: faces(TILES.iron_block, TILES.iron_block, TILES.iron_block), hardness: 5, tool: 'pickaxe', minTier: 1 });
def(BRICK, 'Bricks', { tiles: faces(TILES.brick, TILES.brick, TILES.brick), hardness: 2, tool: 'pickaxe' });
def(TNT, 'TNT', { tiles: faces(TILES.tnt_top, TILES.tnt_bottom, TILES.tnt_side), hardness: 0 });
def(BOOKSHELF, 'Bookshelf', { tiles: faces(TILES.planks, TILES.planks, TILES.bookshelf), hardness: 1.5, tool: 'axe' });
def(MOSSY_COBBLE, 'Moss Stone', { tiles: faces(TILES.mossy_cobble, TILES.mossy_cobble, TILES.mossy_cobble), hardness: 2, tool: 'pickaxe' });
def(OBSIDIAN, 'Obsidian', { tiles: faces(TILES.obsidian, TILES.obsidian, TILES.obsidian), hardness: 10, tool: 'pickaxe', minTier: 3 });
def(TORCH, 'Torch', { solid: false, opaque: false, light: 14, tiles: faces(TILES.torch, TILES.torch, TILES.torch), hardness: 0, render: 'torch', drops: 50 });
def(CRAFTING_TABLE, 'Crafting Table', { tiles: faces(TILES.crafting_top, TILES.planks, TILES.crafting_side, TILES.crafting_front), hardness: 2.5, tool: 'axe' });
def(FURNACE, 'Furnace', { tiles: faces(TILES.furnace_top, TILES.furnace_top, TILES.furnace_side, TILES.furnace_front), hardness: 3.5, tool: 'pickaxe' });
def(LADDER, 'Ladder', { solid: false, opaque: false, tiles: faces(TILES.ladder, TILES.ladder, TILES.ladder), hardness: 0.4, render: 'flat' });
def(RAIL, 'Rail', { solid: false, opaque: false, tiles: faces(TILES.rail, TILES.rail, TILES.rail), hardness: 0.7, render: 'flat' });
def(SNOW, 'Snow', { solid: false, opaque: false, tiles: faces(TILES.snow, TILES.snow, TILES.snow), hardness: 0.1, tool: 'shovel', render: 'flat' });
def(ICE, 'Ice', { opaque: false, tiles: faces(TILES.ice, TILES.ice, TILES.ice), hardness: 0.5, tool: 'pickaxe', drops: 0, render: 'cutout' });
def(SNOW_BLOCK, 'Snow Block', { tiles: faces(TILES.snow_block, TILES.snow_block, TILES.snow_block), hardness: 0.2, tool: 'shovel' });
def(CACTUS, 'Cactus', { opaque: false, tiles: faces(TILES.cactus_top, TILES.cactus_top, TILES.cactus_side), hardness: 0.4, render: 'cutout' });
def(CLAY, 'Clay', { tiles: faces(TILES.clay, TILES.clay, TILES.clay), hardness: 0.6, tool: 'shovel', drops: 337, dropCount: 4 });
def(SUGARCANE, 'Sugar Canes', { solid: false, opaque: false, cross: true, tiles: faces(TILES.sugarcane, TILES.sugarcane, TILES.sugarcane), hardness: 0, render: 'cross' });
def(JUKEBOX, 'Jukebox', { tiles: faces(TILES.jukebox_top, TILES.planks, TILES.jukebox_side), hardness: 2, tool: 'axe' });
def(PUMPKIN, 'Pumpkin', { tiles: faces(TILES.pumpkin_top, TILES.pumpkin_top, TILES.pumpkin_side, TILES.pumpkin_face), hardness: 1, tool: 'axe' });
def(NETHERRACK, 'Netherrack', { tiles: faces(TILES.netherrack, TILES.netherrack, TILES.netherrack), hardness: 0.4, tool: 'pickaxe' });
def(SLOW_SAND, 'Soul Sand', { tiles: faces(TILES.slow_sand, TILES.slow_sand, TILES.slow_sand), hardness: 0.5, tool: 'shovel' });
def(GLOWSTONE, 'Glowstone', { tiles: faces(TILES.glowstone, TILES.glowstone, TILES.glowstone), light: 15, hardness: 0.3 });
def(STONE_BRICK, 'Stone Bricks', { tiles: faces(TILES.stone_brick, TILES.stone_brick, TILES.stone_brick), hardness: 2, tool: 'pickaxe' });
def(SANDSTONE, 'Sandstone', { tiles: faces(TILES.sandstone_top, TILES.sandstone_bottom, TILES.sandstone_side), hardness: 0.8, tool: 'pickaxe' });
def(DIAMOND_BLOCK, 'Diamond Block', { tiles: faces(TILES.diamond_block, TILES.diamond_block, TILES.diamond_block), hardness: 5, tool: 'pickaxe', minTier: 2 });

const WOOL_COLORS = [
  'white', 'orange', 'yellow', 'lime', 'green', 'cyan', 'lightblue', 'blue',
  'purple', 'magenta', 'pink', 'gray', 'lightgray', 'brown', 'red', 'black'
];
const WOOL_TILES = [TILES.wool_white, TILES.wool_orange, TILES.wool_yellow, TILES.wool_lime,
  TILES.wool_green, TILES.wool_cyan, TILES.wool_lightblue, TILES.wool_blue, TILES.wool_purple,
  TILES.wool_magenta, TILES.wool_pink, TILES.wool_gray, TILES.wool_lightgray, TILES.wool_brown,
  TILES.wool_red, TILES.wool_black];
for (let i = 0; i < 16; i++) {
  const t = WOOL_TILES[i];
  def(WOOL_BASE + i, WOOL_COLORS[i].replace(/^\w/, c => c.toUpperCase()) + ' Wool', {
    tiles: faces(t, t, t), hardness: 0.8
  });
}

// ---- Items (numeric ids follow beta-ish where handy) ----
export const ITEMS = {
  256: { name: 'Iron Shovel', tool: 'shovel', tier: 2, durability: 250, speed: 4 },
  257: { name: 'Iron Pickaxe', tool: 'pickaxe', tier: 2, durability: 250, speed: 4 },
  258: { name: 'Iron Axe', tool: 'axe', tier: 2, durability: 250, speed: 4 },
  259: { name: 'Flint and Steel', tool: 'none', durability: 64 },
  260: { name: 'Apple', food: 4 },
  261: { name: 'Bow', tool: 'bow', durability: 384 },
  262: { name: 'Arrow', },
  263: { name: 'Coal', },
  264: { name: 'Diamond', },
  265: { name: 'Iron Ingot', },
  266: { name: 'Gold Ingot', },
  267: { name: 'Iron Sword', tool: 'sword', tier: 2, durability: 250, damage: 6 },
  268: { name: 'Wooden Sword', tool: 'sword', tier: 0, durability: 59, damage: 4 },
  269: { name: 'Wooden Shovel', tool: 'shovel', tier: 0, durability: 59, speed: 2 },
  270: { name: 'Wooden Pickaxe', tool: 'pickaxe', tier: 0, durability: 59, speed: 2 },
  271: { name: 'Wooden Axe', tool: 'axe', tier: 0, durability: 59, speed: 2 },
  272: { name: 'Stone Sword', tool: 'sword', tier: 1, durability: 131, damage: 5 },
  273: { name: 'Stone Shovel', tool: 'shovel', tier: 1, durability: 131, speed: 4 },
  274: { name: 'Stone Pickaxe', tool: 'pickaxe', tier: 1, durability: 131, speed: 4 },
  275: { name: 'Stone Axe', tool: 'axe', tier: 1, durability: 131, speed: 4 },
  276: { name: 'Diamond Sword', tool: 'sword', tier: 3, durability: 1561, damage: 7 },
  277: { name: 'Diamond Shovel', tool: 'shovel', tier: 3, durability: 1561, speed: 8 },
  278: { name: 'Diamond Pickaxe', tool: 'pickaxe', tier: 3, durability: 1561, speed: 8 },
  279: { name: 'Diamond Axe', tool: 'axe', tier: 3, durability: 1561, speed: 8 },
  280: { name: 'Stick', },
  281: { name: 'Bowl', },
  282: { name: 'Mushroom Stew', food: 10 },
  283: { name: 'Golden Sword', tool: 'sword', tier: 0, durability: 32, damage: 4 },
  284: { name: 'Golden Shovel', tool: 'shovel', tier: 0, durability: 32, speed: 12 },
  285: { name: 'Golden Pickaxe', tool: 'pickaxe', tier: 0, durability: 32, speed: 12 },
  286: { name: 'Golden Axe', tool: 'axe', tier: 0, durability: 32, speed: 12 },
  287: { name: 'String', },
  288: { name: 'Feather', },
  289: { name: 'Gunpowder', },
  290: { name: 'Wooden Hoe', tool: 'hoe', tier: 0, durability: 59 },
  291: { name: 'Stone Hoe', tool: 'hoe', tier: 1, durability: 131 },
  292: { name: 'Iron Hoe', tool: 'hoe', tier: 2, durability: 250 },
  293: { name: 'Diamond Hoe', tool: 'hoe', tier: 3, durability: 1561 },
  294: { name: 'Golden Hoe', tool: 'hoe', tier: 0, durability: 32 },
  295: { name: 'Wheat Seeds', },
  296: { name: 'Wheat', },
  297: { name: 'Bread', food: 5 },
  298: { name: 'Leather Helmet', durability: 56 }, 299: { name: 'Leather Chestplate', durability: 81 },
  300: { name: 'Leather Leggings', durability: 76 }, 301: { name: 'Leather Boots', durability: 66 },
  306: { name: 'Iron Helmet', durability: 166 }, 307: { name: 'Iron Chestplate', durability: 241 },
  308: { name: 'Iron Leggings', durability: 226 }, 309: { name: 'Iron Boots', durability: 196 },
  310: { name: 'Diamond Helmet', durability: 364 }, 311: { name: 'Diamond Chestplate', durability: 529 },
  312: { name: 'Diamond Leggings', durability: 496 }, 313: { name: 'Diamond Boots', durability: 430 },
  314: { name: 'Golden Helmet', durability: 78 }, 315: { name: 'Golden Chestplate', durability: 113 },
  316: { name: 'Golden Leggings', durability: 106 }, 317: { name: 'Golden Boots', durability: 92 },
  348: { name: 'Glowstone Dust' },
  367: { name: 'Rotten Flesh' },
  318: { name: 'Flint', },
  319: { name: 'Raw Porkchop', food: 3 },
  320: { name: 'Cooked Porkchop', food: 8 },
  321: { name: 'Painting', },
  322: { name: 'Golden Apple', food: 20 },
  323: { name: 'Sign', },
  325: { name: 'Bucket', },
  326: { name: 'Water Bucket', },
  327: { name: 'Lava Bucket', },
  328: { name: 'Minecart', },
  329: { name: 'Saddle', },
  330: { name: 'Iron Door', },
  331: { name: 'Redstone', },
  332: { name: 'Snowball', },
  334: { name: 'Leather', },
  335: { name: 'Milk Bucket', },
  337: { name: 'Clay Ball', },
  338: { name: 'Sugar Canes', },
  339: { name: 'Paper', },
  340: { name: 'Book', },
  341: { name: 'Slimeball', },
  342: { name: 'Storage Minecart', },
  343: { name: 'Powered Minecart', },
  344: { name: 'Egg', },
  345: { name: 'Compass', },
  346: { name: 'Fishing Rod', },
  349: { name: 'Raw Fish', food: 2 },
  350: { name: 'Cooked Fish', food: 5 },
  351: { name: 'Ink Sac', },
  352: { name: 'Bone', },
  353: { name: 'Sugar', },
  354: { name: 'Cake', },
  355: { name: 'Bed', },
  356: { name: 'Redstone Repeater', },
  357: { name: 'Cookie', food: 1 },
  358: { name: 'Map', },
  359: { name: 'Shears', tool: 'shears', durability: 238 },
  360: { name: 'Melon', food: 2 },
  263: { name: 'Coal' },
};

export const ITEM_COAL = 263, ITEM_CHARCOAL_DYE = 263;
export const ITEM_NAMES = ITEMS;

export function isBlock(id) { return id > 0 && id < 256; }
export function isItem(id) { return id >= 256; }

export function getBlock(id) {
  return B[id] || B[AIR];
}

export function itemName(id) {
  if (isBlock(id)) return getBlock(id).name;
  return (ITEMS[id] || { name: 'Item ' + id }).name;
}

// Mining: returns seconds to break with given held item (null = hand)
// Beta values: dirt 0.75s by hand, stone 7.5s by hand, 1.15s w/ wooden pick.
export function breakTime(blockId, heldId) {
  const b = getBlock(blockId);
  if (b.hardness < 0) return Infinity;
  if (b.hardness === 0) return 0;
  let speed = 1;
  const harvest = canHarvest(blockId, heldId);
  if (heldId != null && ITEMS[heldId]) {
    const it = ITEMS[heldId];
    if (it.tool === b.tool) speed = it.speed || 2;
    if (it.tool === 'sword' && blockId === COBWEB) speed = 15;
    if (it.tool === 'shears' && (blockId === LEAVES || blockId === COBWEB || blockId === WOOL_BASE)) speed = 5;
  }
  const base = b.hardness * 1.5;
  return harvest ? Math.max(0.05, base / speed) : Math.max(0.05, base * 3.5 / speed);
}

// Beta 1.7.3: only pickaxe-tier blocks are tool-gated for drops.
// Shovels/axes only speed things up; grass/dirt/sand drop with anything.
export function canHarvest(blockId, heldId) {
  const b = getBlock(blockId);
  if (b.tool !== 'pickaxe') return true;
  if (heldId == null || !ITEMS[heldId]) return false;
  const it = ITEMS[heldId];
  return it.tool === 'pickaxe' && (it.tier || 0) >= (b.minTier || 0);
}
