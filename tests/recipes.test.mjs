// Regression coverage for player/table crafting dimensions and requested recipe families.
import assert from 'node:assert/strict';
import { matchRecipe, smeltResult } from '../src/ui/recipes.js';

let checks = 0;
function check(name, condition) {
  assert.ok(condition, name);
  checks++;
  console.log(`PASS  ${name}`);
}
function grid(size, entries) {
  const slots = new Array(size * size).fill(null);
  for (const [index, id] of entries) slots[index] = { id, count: 1 };
  return slots;
}

check('2x2 inventory crafting turns four planks into a table',
  matchRecipe(grid(2, [[0, 5], [1, 5], [2, 5], [3, 5]]), 2)?.id === 58);
check('2x2 crafting makes four sticks from a vertical plank pair',
  matchRecipe(grid(2, [[0, 5], [2, 5]]), 2)?.count === 4);
check('2x2 crafting makes four torches from coal over a stick',
  matchRecipe(grid(2, [[0, 263], [2, 280]]), 2)?.id === 50);
check('a log converts shapelessly into four planks',
  matchRecipe(grid(2, [[3, 17]]), 2)?.id === 5 && matchRecipe(grid(2, [[3, 17]]), 2)?.count === 4);

check('crafting table produces a furnace from the eight-cobble ring',
  matchRecipe(grid(3, [[0, 4], [1, 4], [2, 4], [3, 4], [5, 4], [6, 4], [7, 4], [8, 4]]), 3)?.id === 61);
check('rail recipe requires both center-column sticks and returns 16 rails',
  matchRecipe(grid(3, [[0, 265], [2, 265], [3, 265], [4, 280], [5, 265], [6, 265], [7, 280], [8, 265]]), 3)?.id === 66 &&
  matchRecipe(grid(3, [[0, 265], [2, 265], [3, 265], [4, 280], [5, 265], [6, 265], [7, 280], [8, 265]]), 3)?.count === 16 &&
  matchRecipe(grid(3, [[0, 265], [2, 265], [3, 265], [4, 280], [5, 265], [6, 265], [8, 265]]), 3) === null);
check('table recipes make a wooden pickaxe',
  matchRecipe(grid(3, [[0, 5], [1, 5], [2, 5], [4, 280], [7, 280]]), 3)?.id === 270);
check('table recipes make a stone sword with two materials and a handle',
  matchRecipe(grid(3, [[0, 4], [3, 4], [6, 280]]), 3)?.id === 272);
check('mirrored axe recipes remain craftable',
  matchRecipe(grid(3, [[0, 5], [1, 5], [3, 280], [4, 5], [6, 280]]), 3)?.id === 271);
check('leather armor recipe produces a helmet',
  matchRecipe(grid(3, [[0, 334], [1, 334], [2, 334], [3, 334], [5, 334]]), 3)?.id === 298);
check('iron armor recipe produces a chestplate',
  matchRecipe(grid(3, [[0, 265], [2, 265], [3, 265], [4, 265], [5, 265], [6, 265], [7, 265], [8, 265]]), 3)?.id === 307);
check('shapeless mushroom stew consumes two mushrooms and a bowl',
  matchRecipe(grid(3, [[0, 39], [3, 281], [8, 40]]), 3)?.id === 282);
check('2x2 player crafting cannot use hidden 3x3 slots',
  matchRecipe([...grid(2, [[0, 5], [1, 5], [2, 5]]), { id: 5, count: 1 }], 2) === null);
check('smelting maps ores, food and clay to their correct outputs',
  smeltResult(15) === 265 && smeltResult(319) === 320 && smeltResult(337) === 336);

console.log(`\nALL ${checks} RECIPE TESTS PASSED`);
