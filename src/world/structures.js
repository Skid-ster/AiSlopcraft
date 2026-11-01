// Metadata bits shared by doors and beds. Low two bits encode horizontal
// direction, bit 4 means an open door, bit 8 marks the upper/head half.
import { BED_BLOCK, WOOD_DOOR, IRON_DOOR } from './blocks.js';
export const DIRECTIONS = [[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
export function structurePartner(world, x, y, z, id = world.getBlock(x,y,z)) {
  if (id !== BED_BLOCK && id !== WOOD_DOOR && id !== IRON_DOOR) return null;
  const meta = world.getMeta(x,y,z), second = !!(meta & 8);
  let px=x, py=y, pz=z;
  if (id === BED_BLOCK) {
    const [dx,,dz] = DIRECTIONS[meta & 3], sign = second ? -1 : 1;
    px += dx*sign; pz += dz*sign;
  } else py += second ? -1 : 1;
  if (world.getBlock(px,py,pz) !== id) return null;
  const pm = world.getMeta(px,py,pz);
  if (!!(pm & 8) === second || (pm & 3) !== (meta & 3)) return null;
  return {x:px,y:py,z:pz,meta:pm};
}

export function setDoorOpen(world,x,y,z,open) {
  const id = world.getBlock(x,y,z);
  if (id !== WOOD_DOOR && id !== IRON_DOOR) return false;
  const partner = structurePartner(world,x,y,z,id);
  const parts = [{x,y,z,meta:world.getMeta(x,y,z)}, ...(partner ? [partner] : [])];
  for (const p of parts) world.setMeta(p.x,p.y,p.z,open ? p.meta | 4 : p.meta & ~4);
  return true;
}
