// Headless tests for fuel consumption, smelting progress and output capacity.
import assert from 'node:assert/strict';
import { createFurnaceState, interactWithFurnaceSlot, tickFurnace } from '../src/ui/furnace.js';

let checks = 0;
function check(name, condition) {
  assert.ok(condition, name);
  checks++;
  console.log(`PASS  ${name}`);
}
function advance(furnace, seconds) {
  const steps = Math.ceil(seconds * 10);
  for (let i = 0; i < steps; i++) tickFurnace(furnace, Math.min(0.1, seconds - i * 0.1));
}

const slots = createFurnaceState();
let transfer = interactWithFurnaceSlot(slots, 'input', { id: 15, count: 4, damage: 0 }, 2);
check('right-click deposits one item into a furnace slot', slots.input?.count === 1 && transfer.cursorStack?.count === 3);
transfer = interactWithFurnaceSlot(slots, 'input', transfer.cursorStack, 0);
check('left-click merges matching stacks into the furnace slot', slots.input?.count === 4 && transfer.cursorStack === null);
transfer = interactWithFurnaceSlot(slots, 'input', null, 2);
check('right-click removes half a furnace stack, rounding up', slots.input?.count === 2 && transfer.cursorStack?.count === 2);
transfer = interactWithFurnaceSlot(slots, 'input', { id: 263, count: 1, damage: 0 }, 0);
check('left-click swaps incompatible furnace input stacks without loss', slots.input?.id === 263 && transfer.cursorStack?.id === 15 && transfer.cursorStack.count === 2);
slots.output = { id: 265, count: 3, damage: 0 };
transfer = interactWithFurnaceSlot(slots, 'output', null, 2);
check('right-click takes one smelted output item at a time', slots.output?.count === 2 && transfer.cursorStack?.count === 1);
transfer = interactWithFurnaceSlot(slots, 'output', null, 0);
check('left-click collects the remaining furnace output', slots.output === null && transfer.cursorStack?.count === 2);

const furnace = createFurnaceState();
furnace.input = { id: 15, count: 2, damage: 0 };
furnace.fuel = { id: 263, count: 1, damage: 0 };
const firstTick = tickFurnace(furnace, 0.1);
check('furnace consumes fuel as soon as a valid input can smelt', firstTick.burning && furnace.fuel === null && furnace.burn > 79);
advance(furnace, 5.9);
check('six seconds of heat produces the first ingot', furnace.output?.id === 265 && furnace.output.count === 1 && furnace.input.count === 1);
advance(furnace, 6);
check('continued heat produces and accumulates the second ingot', furnace.output.count === 2 && furnace.input === null);
check('burn time decreases smoothly while smelting', furnace.burn > 67 && furnace.burn < 69);

const blocked = createFurnaceState();
blocked.input = { id: 15, count: 1, damage: 0 };
blocked.output = { id: 266, count: 1, damage: 0 };
blocked.fuel = { id: 5, count: 1, damage: 0 };
tickFurnace(blocked, 0.1);
check('a mismatched output prevents fuel from being consumed', blocked.burn === 0 && blocked.fuel.count === 1);

const capped = createFurnaceState();
capped.input = { id: 12, count: 2, damage: 0 };
capped.output = { id: 20, count: 63, damage: 0 };
capped.fuel = { id: 5, count: 1, damage: 0 };
advance(capped, 6);
check('furnace output stacks to 64 without overflowing', capped.output.count === 64 && capped.input.count === 1);
advance(capped, 0.5);
check('full output stops further smelting and preserves remaining input', capped.output.count === 64 && capped.input.count === 1);

console.log(`\nALL ${checks} FURNACE TESTS PASSED`);
