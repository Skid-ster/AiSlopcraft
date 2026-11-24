import { ITEMS } from '../world/blocks.js';

export const EAT_DURATION = 1.6;
export function advanceEating(eating, dt, player, audio, active = true) {
  const held = player.heldStack;
  if (!eating || !active || !player.rightDown || !player.controlsActive || !ITEMS[held?.id]?.food || held.id !== eating.id || player.dead) {
    return { eating: null, completed: false };
  }
  const elapsed = (eating.elapsed || 0) + Math.max(0, dt);
  if (elapsed < EAT_DURATION) return { eating: { id: eating.id, elapsed }, completed: false };
  return { eating: null, completed: player.eatHeld(audio) };
}
