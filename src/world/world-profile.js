// Shared by browser storage, world simulation and the room relay. An absent
// terrain marker is always legacy; never change the meaning of an existing ID.
export const OVERWORLD_TERRAIN = 'overworld-v1';
export const NETHER_TERRAIN = 'nether-v1';
export const BETA_HEIGHT = 128;

export function worldHeight(edition, terrain, dimension = 'overworld') {
  if (edition === 'classic') return 64;
  if (dimension === 'nether' || terrain === NETHER_TERRAIN) return BETA_HEIGHT;
  return terrain === OVERWORLD_TERRAIN ? 256 : BETA_HEIGHT;
}
