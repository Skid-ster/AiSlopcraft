// Shared by browser storage, world simulation and the room relay. An absent
// terrain marker is always legacy; never change the meaning of an existing ID.
export const OVERWORLD_TERRAIN = 'overworld-v1';
export const BETA_HEIGHT = 128;

export function worldHeight(edition, terrain) {
  if (edition === 'classic') return 64;
  return terrain === OVERWORLD_TERRAIN ? 256 : BETA_HEIGHT;
}
