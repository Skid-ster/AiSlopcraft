// Obsidian Nether Portal frame validation, ignition, collapse, and 1:8 coordinate travel.
import { AIR, OBSIDIAN, NETHER_PORTAL, NETHERRACK, BEDROCK, getBlock } from './blocks.js';
import { CH } from './chunk.js';

const MIN_INNER_WIDTH = 2;
const MAX_INNER_WIDTH = 21;
const MIN_INNER_HEIGHT = 3;
const MAX_INNER_HEIGHT = 21;

function detectPlanarFrame(world, seedX, seedY, seedZ, axis) {
  const stepX = axis === 'x' ? 1 : 0;
  const stepZ = axis === 'z' ? 1 : 0;

  if (world.getBlock(seedX, seedY, seedZ) !== AIR && world.getBlock(seedX, seedY, seedZ) !== NETHER_PORTAL) {
    return null;
  }

  // Walk down to bottom interior air cell above an Obsidian base
  let bottomY = seedY;
  while (bottomY > 1 && (world.getBlock(seedX, bottomY - 1, seedZ) === AIR || world.getBlock(seedX, bottomY - 1, seedZ) === NETHER_PORTAL)) {
    if (seedY - bottomY > MAX_INNER_HEIGHT) return null;
    bottomY--;
  }
  if (world.getBlock(seedX, bottomY - 1, seedZ) !== OBSIDIAN) return null;

  // Walk negative along axis to find left Obsidian pillar
  let negSteps = 0;
  while (negSteps <= MAX_INNER_WIDTH) {
    const b = world.getBlock(seedX - (negSteps + 1) * stepX, bottomY, seedZ - (negSteps + 1) * stepZ);
    if (b === OBSIDIAN) break;
    if (b !== AIR && b !== NETHER_PORTAL) return null;
    negSteps++;
  }
  if (negSteps > MAX_INNER_WIDTH) return null;

  const startX = seedX - negSteps * stepX;
  const startZ = seedZ - negSteps * stepZ;

  // Measure inner width until right Obsidian pillar
  let width = 0;
  while (width <= MAX_INNER_WIDTH) {
    const b = world.getBlock(startX + width * stepX, bottomY, startZ + width * stepZ);
    if (b === OBSIDIAN) break;
    if (b !== AIR && b !== NETHER_PORTAL) return null;
    width++;
  }
  if (width < MIN_INNER_WIDTH || width > MAX_INNER_WIDTH) return null;

  // Measure inner height until top Obsidian lintel
  let height = 0;
  while (height <= MAX_INNER_HEIGHT) {
    const y = bottomY + height;
    if (y >= (world.height ?? 128) - 1) return null;
    const first = world.getBlock(startX, y, startZ);
    if (first === OBSIDIAN) break;

    // Left and right side pillars must be Obsidian at this row
    if (world.getBlock(startX - stepX, y, startZ - stepZ) !== OBSIDIAN) return null;
    if (world.getBlock(startX + width * stepX, y, startZ + width * stepZ) !== OBSIDIAN) return null;

    // All interior cells in this row must be AIR or NETHER_PORTAL
    for (let i = 0; i < width; i++) {
      const cell = world.getBlock(startX + i * stepX, y, startZ + i * stepZ);
      if (cell !== AIR && cell !== NETHER_PORTAL) return null;
    }
    height++;
  }
  if (height < MIN_INNER_HEIGHT || height > MAX_INNER_HEIGHT) return null;

  // Verify full bottom threshold and top lintel are Obsidian
  for (let i = 0; i < width; i++) {
    const ix = startX + i * stepX;
    const iz = startZ + i * stepZ;
    if (world.getBlock(ix, bottomY - 1, iz) !== OBSIDIAN) return null;
    if (world.getBlock(ix, bottomY + height, iz) !== OBSIDIAN) return null;
  }

  const meta = axis === 'x' ? 0 : 1;
  const blocks = [];
  for (let dy = 0; dy < height; dy++) {
    for (let i = 0; i < width; i++) {
      blocks.push({ x: startX + i * stepX, y: bottomY + dy, z: startZ + i * stepZ, meta });
    }
  }
  return { axis, meta, width, height, startX, bottomY, startZ, blocks };
}

export function findPortalFrameAt(world, x, y, z) {
  return detectPlanarFrame(world, x, y, z, 'x') || detectPlanarFrame(world, x, y, z, 'z');
}

export function tryIgnitePortal(world, hitX, hitY, hitZ, face = [0, 1, 0]) {
  const candidates = [
    [hitX + face[0], hitY + face[1], hitZ + face[2]],
    [hitX, hitY + 1, hitZ],
    [hitX + 1, hitY, hitZ],
    [hitX - 1, hitY, hitZ],
    [hitX, hitY, hitZ + 1],
    [hitX, hitY, hitZ - 1],
  ];
  for (const [cx, cy, cz] of candidates) {
    if (world.getBlock(cx, cy, cz) !== AIR) continue;
    const frame = findPortalFrameAt(world, cx, cy, cz);
    if (!frame) continue;
    for (const cell of frame.blocks) {
      world.setBlock(cell.x, cell.y, cell.z, NETHER_PORTAL, cell.meta);
    }
    return frame;
  }
  return null;
}

export function collapseInvalidPortalsNear(world, bx, by, bz) {
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const checked = new Set();
  let removed = 0;

  for (const [dx, dy, dz] of [[0, 0, 0], ...dirs]) {
    const sx = bx + dx, sy = by + dy, sz = bz + dz;
    const startKey = `${sx},${sy},${sz}`;
    if (checked.has(startKey) || world.getBlock(sx, sy, sz) !== NETHER_PORTAL) continue;

    const meta = world.getMeta(sx, sy, sz) & 1;
    const axis = meta === 0 ? 'x' : 'z';
    const frame = detectPlanarFrame(world, sx, sy, sz, axis);
    if (frame) {
      for (const cell of frame.blocks) checked.add(`${cell.x},${cell.y},${cell.z}`);
      continue;
    }

    // Frame was broken: flood-remove connected NETHER_PORTAL blocks
    const queue = [[sx, sy, sz]];
    checked.add(startKey);
    while (queue.length && removed < 512) {
      const [px, py, pz] = queue.shift();
      if (world.getBlock(px, py, pz) !== NETHER_PORTAL) continue;
      world.setBlock(px, py, pz, AIR, 0);
      removed++;
      for (const [ox, oy, oz] of dirs) {
        const nx = px + ox, ny = py + oy, nz = pz + oz;
        const k = `${nx},${ny},${nz}`;
        if (!checked.has(k) && world.getBlock(nx, ny, nz) === NETHER_PORTAL) {
          checked.add(k);
          queue.push([nx, ny, nz]);
        }
      }
    }
  }
  return removed;
}

function ensureChunksAround(world, wx, wz, radiusChunks = 1) {
  const pcx = Math.floor(wx / CH);
  const pcz = Math.floor(wz / CH);
  for (let dz = -radiusChunks; dz <= radiusChunks; dz++) {
    for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
      world.generateChunk(pcx + dx, pcz + dz);
    }
  }
}

export function findExistingPortalNear(world, targetX, targetZ, searchRadius = 16) {
  const tx = Math.floor(targetX);
  const tz = Math.floor(targetZ);
  ensureChunksAround(world, tx, tz, Math.ceil(searchRadius / CH));
  const maxY = (world.height ?? 128) - 3;
  let best = null;
  let bestDist2 = Infinity;

  for (let dz = -searchRadius; dz <= searchRadius; dz++) {
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      const wx = tx + dx, wz = tz + dz;
      const chunk = world.getChunk(Math.floor(wx / CH), Math.floor(wz / CH));
      if (!chunk?.generated) continue;
      for (let y = 4; y <= maxY; y++) {
        if (world.getBlock(wx, y, wz) !== NETHER_PORTAL) continue;
        if (world.getBlock(wx, y - 1, wz) === NETHER_PORTAL) continue; // pick bottom row of portal
        const d2 = dx * dx + dz * dz;
        if (d2 < bestDist2) {
          bestDist2 = d2;
          const meta = world.getMeta(wx, y, wz) & 1;
          best = { x: wx + 0.5, y: y + 0.01, z: wz + 0.5, meta };
        }
      }
    }
  }
  return best;
}

export function buildArrivalPortal(world, rawX, rawZ, isNether = false) {
  let bx = Math.floor(rawX);
  let bz = Math.floor(rawZ);
  if (world.edition === 'classic') {
    bx = Math.max(-120, Math.min(120, bx));
    bz = Math.max(-120, Math.min(120, bz));
  }
  ensureChunksAround(world, bx, bz, 1);

  let baseY;
  if (isNether) {
    // Scan for safe cavern space between y=34 and y=98, avoiding lava sea and bedrock ceiling
    baseY = 56;
    for (let y = 34; y <= 98; y++) {
      const floor = world.getBlock(bx, y - 1, bz);
      const a0 = world.getBlock(bx, y, bz);
      const a1 = world.getBlock(bx, y + 1, bz);
      const a2 = world.getBlock(bx, y + 2, bz);
      if (getBlock(floor).solid && floor !== BEDROCK && a0 === AIR && a1 === AIR && a2 === AIR) {
        baseY = y;
        break;
      }
    }
  } else {
    const surface = Math.max(8, Math.min((world.height ?? 256) - 10, world.heightAt(bx, bz)));
    baseY = surface;
  }

  // Clear a breathable 4x5x5 pocket and build a sturdy platform so players never step into lava or suffocate
  const padBlock = isNether ? NETHERRACK : OBSIDIAN;
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -1; dx <= 2; dx++) {
      world.setBlock(bx + dx, baseY - 1, bz + dz, padBlock, 0);
      for (let dy = 0; dy <= 4; dy++) {
        world.setBlock(bx + dx, baseY + dy, bz + dz, AIR, 0);
      }
    }
  }

  // Construct 4-wide x 5-tall Obsidian portal frame along X (inner 2x3 at dx=0..1, dy=0..2)
  for (let dx = -1; dx <= 2; dx++) {
    world.setBlock(bx + dx, baseY - 1, bz, OBSIDIAN, 0);
    world.setBlock(bx + dx, baseY + 3, bz, OBSIDIAN, 0);
  }
  for (let dy = 0; dy <= 2; dy++) {
    world.setBlock(bx - 1, baseY + dy, bz, OBSIDIAN, 0);
    world.setBlock(bx + 2, baseY + dy, bz, OBSIDIAN, 0);
    world.setBlock(bx, baseY + dy, bz, NETHER_PORTAL, 0);
    world.setBlock(bx + 1, baseY + dy, bz, NETHER_PORTAL, 0);
  }

  // Step-off arrival spot just in front of the portal frame (+Z side) so the player doesn't immediately re-trigger!
  return { x: bx + 0.5, y: baseY + 0.02, z: bz + 1.5, portalX: bx, portalY: baseY, portalZ: bz };
}

export function resolvePortalDestination(fromPos, fromDimension, targetWorld) {
  const toNether = fromDimension !== 'nether';
  const scale = toNether ? (1 / 8) : 8;
  const targetX = fromPos.x * scale;
  const targetZ = fromPos.z * scale;
  const existing = findExistingPortalNear(targetWorld, targetX, targetZ, toNether ? 16 : 32);
  if (existing) {
    // Place player just outside the portal pane so they don't loop back before stepping away
    const offsetX = existing.meta === 1 ? 1.1 : 0;
    const offsetZ = existing.meta === 0 ? 1.1 : 0;
    return { x: existing.x + offsetX, y: existing.y, z: existing.z + offsetZ, created: false };
  }
  const built = buildArrivalPortal(targetWorld, targetX, targetZ, toNether);
  return { x: built.x, y: built.y, z: built.z, created: true };
}
