// The browser Classic-era creative palette: every block is available without mining inventory.
import {
  STONE, GRASS, DIRT, COBBLE, PLANKS, BEDROCK, WATER, LAVA, SAND, GRAVEL,
  GOLD_ORE, IRON_ORE, COAL_ORE, LOG, LEAVES, GLASS, SANDSTONE, GOLD_BLOCK,
  IRON_BLOCK, BRICK, TNT, BOOKSHELF, MOSSY_COBBLE, OBSIDIAN, DIAMOND_ORE,
  DIAMOND_BLOCK, WOOL_BASE,
} from './world/blocks.js';

export const CLASSIC_BLOCKS = Object.freeze([
  STONE, GRASS, DIRT, COBBLE, PLANKS, BEDROCK, WATER, LAVA,
  SAND, GRAVEL, GOLD_ORE, IRON_ORE, COAL_ORE, LOG, LEAVES, GLASS,
  SANDSTONE, GOLD_BLOCK, IRON_BLOCK, BRICK, TNT, BOOKSHELF, MOSSY_COBBLE, OBSIDIAN,
  DIAMOND_ORE, DIAMOND_BLOCK, ...Array.from({ length: 6 }, (_, color) => WOOL_BASE + color),
]);

export function isClassicBlock(id) { return CLASSIC_BLOCKS.includes(id); }
