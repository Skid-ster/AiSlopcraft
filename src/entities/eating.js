import { ITEMS } from '../world/blocks.js';

// In Beta 1.7.3 food heals immediately on use, rather than requiring a hold.
export const EAT_DURATION = 0;
export function advanceEating(eating, _dt, player, audio, active = true) {
  const held = player.heldStack;
  if (!eating || !active || !player.rightDown || !player.pointerLocked || !ITEMS[held?.id]?.food || held.id !== eating.id || player.dead) {
    return { eating: null, completed: false };
  }
  return { eating: null, completed: player.eatHeld(audio) };
}
