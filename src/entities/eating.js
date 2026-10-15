import { ITEMS } from '../world/blocks.js';

export const EAT_DURATION = 1.6;

// Pure timer/controller logic so hold-to-eat behavior is testable without a renderer.
export function advanceEating(eating, dt, player, audio, active = true) {
  if (!eating) return { eating: null, completed: false };
  const held = player.heldStack;
  const item = held && ITEMS[held.id];
  if (!active || !player.rightDown || !player.pointerLocked || !item?.food ||
      held.id !== eating.id || player.health >= player.maxHealth || player.dead) {
    return { eating: null, completed: false };
  }

  const progress = Math.max(0, eating.progress || 0) + Math.max(0, dt);
  if (progress + 1e-9 < EAT_DURATION) {
    return { eating: { id: eating.id, progress }, completed: false };
  }
  return { eating: null, completed: player.eatHeld(audio) };
}
