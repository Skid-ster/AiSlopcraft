// Small, testable survival interactions shared by the game and regression tests.
import {
  AIR, GRASS, DIRT, FARMLAND, CROPS, CAKE_BLOCK, WATER, LAVA, SAPLING, LOG, LEAVES,
  ITEMS, WOOL_BASE,
} from './world/blocks.js';
import { CH, WORLD_H } from './world/chunk.js';

function replaceOneHeld(player, id, drop) {
  player.consumeHeld(1);
  const inserted = player.insertItem(id, 1);
  if (!inserted) drop?.(id, 1);
}

// Returns true only when an interaction actually changed something. The caller
// owns pointer targeting, audiovisual effects and the placement repeat timer.
export function useOnBlock(world, player, hit, { drop } = {}) {
  if (!hit) return false;
  const { x, y, z, face } = hit;
  const block = world.getBlock(x, y, z);
  const held = player.heldStack;
  const id = held?.id;
  if (ITEMS[id]?.tool === 'hoe' && (block === GRASS || block === DIRT) && face[1] === 1 && world.getBlock(x, y + 1, z) === AIR) {
    if (!world.setBlock(x, y, z, FARMLAND)) return false;
    player.useHeldOn(block);
    return true;
  }
  if (id === 295 && block === FARMLAND && face[1] === 1 && world.getBlock(x, y + 1, z) === AIR) {
    if (!world.setBlock(x, y + 1, z, CROPS, 0)) return false;
    player.consumeHeld();
    return true;
  }
  if (id === 368 && block === SAPLING) {
    // Do not grow into obstacles or across unloaded chunk borders.
    if (y + 6 >= WORLD_H) return false;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (!world.getChunk(Math.floor((x + dx) / CH), Math.floor((z + dz) / CH))?.generated) return false;
    }
    for (let dy = 1; dy <= 5; dy++) if (world.getBlock(x, y + dy, z) !== AIR && world.getBlock(x, y + dy, z) !== LEAVES) return false;
    for (let dy = 2; dy <= 5; dy++) {
      const radius = dy >= 4 ? 1 : 2;
      for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dz === 0 && dy < 5) continue;
        if (Math.abs(dx) === radius && Math.abs(dz) === radius && (dx + dz + dy) % 2 === 0) continue;
        if (world.getBlock(x + dx, y + dy, z + dz) === AIR) world.setBlock(x + dx, y + dy, z + dz, LEAVES);
      }
    }
    for (let dy = 0; dy < 5; dy++) world.setBlock(x, y + dy, z, LOG);
    player.consumeHeld();
    return true;
  }
  if (id === 368 && block === CROPS && world.getMeta(x, y, z) < 7) {
    if (!world.setMeta(x, y, z, 7)) return false;
    player.consumeHeld();
    return true;
  }
  if (block === CAKE_BLOCK && player.health < player.maxHealth && !player.dead) {
    const bites = world.getMeta(x, y, z) & 7;
    const changed = bites >= 5 ? world.setBlock(x, y, z, AIR) : world.setMeta(x, y, z, bites + 1);
    if (!changed) return false;
    player.health = Math.min(player.maxHealth, player.health + 3);
    return true;
  }
  if (id === 325 && (block === WATER || block === LAVA)) {
    if (!world.setBlock(x, y, z, AIR)) return false;
    replaceOneHeld(player, block === WATER ? 326 : 327, drop);
    return true;
  }
  if (id === 326 || id === 327) {
    const px = x + face[0], py = y + face[1], pz = z + face[2];
    // Never replace solid terrain or silently consume a bucket in an unloaded chunk.
    if (world.getBlock(px, py, pz) !== AIR || !world.setBlock(px, py, pz, id === 326 ? WATER : LAVA)) return false;
    replaceOneHeld(player, 325, drop);
    return true;
  }
  return false;
}

export function useOnMob(player, mob, { drop, random = Math.random } = {}) {
  if (!mob || mob.dead) return false;
  if (player.heldStack?.id === 359 && mob.type === 'sheep' && !mob.sheared) {
    mob.setSheared(true);
    drop?.(WOOL_BASE, 1 + Math.floor(random() * 3));
    player.useHeldOn(AIR);
    return true;
  }
  if (player.heldStack?.id === 325 && mob.type === 'cow') {
    replaceOneHeld(player, 335, drop);
    return true;
  }
  return false;
}

export function growCrop(world, x, y, z, random = Math.random) {
  if (world.getBlock(x, y, z) !== CROPS || world.getBlock(x, y - 1, z) !== FARMLAND) return false;
  const stage = world.getMeta(x, y, z) & 7;
  const light = world.getLight(x, y, z);
  if (stage >= 7 || Math.max(light >> 4, light & 15) < 9 || random() >= 0.05) return false;
  return world.setMeta(x, y, z, stage + 1);
}

export function cropDrops(stage, random = Math.random) {
  if ((stage & 7) < 7) return [{ id: 295, count: 1 }];
  const seeds = Math.floor(random() * 4);
  return [{ id: 296, count: 1 }, ...(seeds ? [{ id: 295, count: seeds }] : [])];
}
