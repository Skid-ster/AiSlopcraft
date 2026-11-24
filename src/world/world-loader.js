import { CH } from './chunk.js';
import { BED_BLOCK, LEAVES, LOG, WATER, LAVA, getBlock } from './blocks.js';
import { findSafeGround } from '../entities/mobs.js';

export function applySavedEdits(world, entries = []) {
  for (const [key, id, meta] of entries) world.recordEdit(...key.split(',').map(Number), id, meta || 0);
}

function generateRegion(world, cx, cz) {
  for (let z = cz - 1; z <= cz + 1; z++) {
    for (let x = cx - 1; x <= cx + 1; x++) world.generateChunk(x, z);
  }
}

function bedSpawn(world, bed) {
  if (!bed || ![bed.x, bed.y, bed.z].every(Number.isInteger)) return null;
  generateRegion(world, Math.floor(bed.x / CH), Math.floor(bed.z / CH));
  if (world.getBlock(bed.x, bed.y, bed.z) !== BED_BLOCK) return null;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = bed.x + dx, z = bed.z + dz;
    for (const offset of [0, 1, -1]) {
      const feet = bed.y + offset;
      const floor = world.getBlock(x, feet - 1, z);
      if (!getBlock(floor).solid || floor === LEAVES || floor === LOG) continue;
      const block = world.getBlock(x, feet, z);
      if (!getBlock(block).solid && !getBlock(world.getBlock(x, feet + 1, z)).solid && block !== WATER && block !== LAVA) {
        return { x: x + 0.5, y: feet + 0.001, z: z + 0.5 };
      }
    }
  }
  if (!getBlock(world.getBlock(bed.x, bed.y + 1, bed.z)).solid && !getBlock(world.getBlock(bed.x, bed.y + 2, bed.z)).solid) {
    return { x: bed.x + 0.5, y: bed.y + 0.5635, z: bed.z + 0.5 };
  }
  return null;
}

export function selectSpawn(world, bed) {
  const nearBed = bedSpawn(world, bed);
  if (nearBed) return { position: nearBed, bed };
  // The player may have streamed far enough away that spawn is no longer loaded.
  generateRegion(world, 0, 0);
  const center = world.edition === 'classic' ? 0.5 : 8.5;
  for (let r = 0; r <= 8; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const x = center + dx, z = center + dz;
      const y = findSafeGround(world, x, z, 0.6, 1.8);
      if (y == null) continue;
      const bx = Math.floor(x), bz = Math.floor(z);
      const support = world.getBlock(bx, Math.floor(y - 1), bz);
      if (support === LEAVES || support === LOG || support === WATER) continue;
      let open = true;
      for (let yy = Math.floor(y); yy < Math.floor(y) + 3 && open; yy++) {
        for (let dz2 = -1; dz2 <= 1 && open; dz2++) for (let dx2 = -1; dx2 <= 1; dx2++) {
          if (getBlock(world.getBlock(bx + dx2, yy, bz + dz2)).solid) { open = false; break; }
        }
      }
      if (open) return { position: { x, y, z }, bed: null };
    }
  }
  const y = world.heightAt(Math.floor(center), Math.floor(center)) + 1.001;
  return { position: { x: center, y, z: center }, bed: null };
}
