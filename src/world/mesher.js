// Chunk mesher: builds Three.js geometry with baked beta-style lighting
// (per-face shading + per-vertex light level + biome tint).
import * as THREE from 'three';
import { CH, WORLD_H } from './chunk.js';
import { getBlock, AIR, WATER, LAVA, TILES, LEAVES, GLASS, ICE, CACTUS, TORCH, RAIL, LADDER, SNOW, COBWEB, SAPLING, TALL_GRASS, FLOWER_RED, FLOWER_YELLOW, MUSHROOM_BROWN, MUSHROOM_RED, SUGARCANE } from './blocks.js';

// Face shade factors (classic Minecraft)
const FACE_SHADE = [1.0, 0.5, 0.8, 0.8, 0.6, 0.6];

// face definitions: +Y, -Y, +Z, -Z, +X, -X
const FACES = [
  { // +Y (top)
    dir: [0, 1, 0], shade: 1.0, tile: 0,
    corners: [[0, 1, 1, 0, 1], [1, 1, 1, 1, 1], [1, 1, 0, 1, 0], [0, 1, 0, 0, 0]],
  },
  { // -Y (bottom)
    dir: [0, -1, 0], shade: 0.5, tile: 1,
    corners: [[0, 0, 0, 0, 0], [1, 0, 0, 1, 0], [1, 0, 1, 1, 1], [0, 0, 1, 0, 1]],
  },
  { // +Z (south)
    dir: [0, 0, 1], shade: 0.8, tile: 2,
    corners: [[0, 0, 1, 0, 0], [1, 0, 1, 1, 0], [1, 1, 1, 1, 1], [0, 1, 1, 0, 1]],
  },
  { // -Z (north)
    dir: [0, 0, -1], shade: 0.8, tile: 3,
    corners: [[1, 0, 0, 0, 0], [0, 0, 0, 1, 0], [0, 1, 0, 1, 1], [1, 1, 0, 0, 1]],
  },
  { // +X (east)
    dir: [1, 0, 0], shade: 0.6, tile: 4,
    corners: [[1, 0, 1, 0, 0], [1, 0, 0, 1, 0], [1, 1, 0, 1, 1], [1, 1, 1, 0, 1]],
  },
  { // -X (west)
    dir: [-1, 0, 0], shade: 0.6, tile: 5,
    corners: [[0, 0, 0, 0, 0], [0, 0, 1, 1, 0], [0, 1, 1, 1, 1], [0, 1, 0, 0, 1]],
  },
];

const ATLAS_COLS = 16;

function tileUV(tile) {
  const tx = tile % ATLAS_COLS, ty = Math.floor(tile / ATLAS_COLS);
  const s = 1 / ATLAS_COLS;
  // small inset to avoid bleeding
  const e = 0.0002;
  return [tx * s + e, 1 - (ty + 1) * s + e, (tx + 1) * s - e, 1 - ty * s - e];
}

// Beta-ish biome grass/foliage colors from temperature/humidity
export function grassColor(temp, hum) {
  const t = Math.max(0, Math.min(1, temp));
  const h = Math.max(0, Math.min(1, hum));
  // interpolate through the classic grass colormap diagonal
  const r = 120 + (t - 0.5) * 60 - (h - 0.5) * 20;
  const g = 168 + (h - 0.5) * 30 - (t - 0.5) * 40;
  const b = 64 + (t - 0.5) * 16 + (h - 0.5) * 24;
  return [Math.max(0, Math.min(255, r)) / 255, Math.max(0, Math.min(255, g)) / 255, Math.max(0, Math.min(255, b)) / 255];
}

export function foliageColor(temp, hum) {
  const c = grassColor(temp, hum);
  return [c[0] * 0.82, c[1] * 0.9, c[2] * 0.75];
}

function isCrossRender(bd) { return bd.cross; }

export function buildChunkMesh(world, chunk, atlasTexture, waterTexture, renderDistance) {
  if (chunk.meshes) {
    for (const k of Object.keys(chunk.meshes)) {
      const m = chunk.meshes[k];
      if (m) { world.scene.remove(m); m.geometry.dispose(); }
    }
    chunk.meshes = null;
  }

  const solid = { pos: [], uv: [], col: [], idx: [] };
  const cutout = { pos: [], uv: [], col: [], idx: [] };
  const water = { pos: [], uv: [], col: [], idx: [] };
  const wx0 = chunk.cx * CH, wz0 = chunk.cz * CH;

  // biome info is a pure function of (x,z) — cache one per column (256/chunk)
  const biomeCache = new Array(CH * CH);
  for (let z = 0; z < CH; z++) {
    for (let x = 0; x < CH; x++) {
      biomeCache[z * CH + x] = world.gen.columnInfo(wx0 + x, wz0 + z);
    }
  }
  const biomeAt = (x, z) => biomeCache[z * CH + x];

  const getB = (x, y, z) => {
    if (y < 0 || y >= WORLD_H) return AIR;
    if (x >= 0 && x < CH && z >= 0 && z < CH) return chunk.get(x, y, z);
    return world.getBlock(wx0 + x, y, wz0 + z);
  };
  const getL = (x, y, z) => {
    if (y >= WORLD_H) return 0xf0;
    if (y < 0) return 0;
    if (x >= 0 && x < CH && z >= 0 && z < CH) return chunk.getLight(x, y, z);
    return world.getLight(wx0 + x, y, wz0 + z);
  };

  const pushQuad = (buf, corners, tile, shade, skyL, blkL, tint, alpha = 1) => {
    const [u0, v0, u1, v1] = tileUV(tile);
    const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    const base = buf.pos.length / 3;
    // rgb = sky light * shade * tint (dimmed by day/night uniform in shader)
    // a   = block light * shade (always warm-bright in shader)
    const skyB = ((skyL >> 0) & 15) / 15;
    const blkB = ((blkL >> 0) & 15) / 15;
    for (let i = 0; i < 4; i++) {
      const c = corners[i];
      buf.pos.push(c[0], c[1], c[2]);
      buf.uv.push(uvs[i][0], uvs[i][1]);
      buf.col.push(shade * skyB * tint[0], shade * skyB * tint[1], shade * skyB * tint[2], shade * blkB * alpha);
    }
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  for (let y = 0; y < WORLD_H; y++) {
    for (let z = 0; z < CH; z++) {
      for (let x = 0; x < CH; x++) {
        const id = chunk.get(x, y, z);
        if (id === AIR) continue;
        const bd = getBlock(id);
        if (!bd.tiles) continue;

        const biome = biomeAt(x, z);
        let tint = [1, 1, 1];
        if (bd.tint === 'grass') tint = grassColor(biome.temp, biome.hum);
        else if (bd.tint === 'foliage') tint = foliageColor(biome.temp, biome.hum);

        // pick buffer
        let buf = solid;
        if (bd.render === 'cutout') buf = cutout;
        else if (bd.render === 'liquid') buf = water;
        else if (bd.render === 'cross' || bd.render === 'flat' || bd.render === 'torch') buf = cutout;

        if (bd.render === 'cross') {
          // two diagonal quads
          const light = getL(x, y, z);
          const skyL = light >> 4, blkL = light & 15;
          const cornersSets = [
            [[x + 0.1, y, z + 0.1, 0, 0], [x + 0.9, y, z + 0.9, 1, 0], [x + 0.9, y + 1, z + 0.9, 1, 1], [x + 0.1, y + 1, z + 0.1, 0, 1]],
            [[x + 0.9, y, z + 0.1, 0, 0], [x + 0.1, y, z + 0.9, 1, 0], [x + 0.1, y + 1, z + 0.9, 1, 1], [x + 0.9, y + 1, z + 0.1, 0, 1]],
          ];
          for (const corners of cornersSets) {
            pushQuad(buf, corners.map(c => [c[0], c[1], c[2]]), bd.tiles[2], 1.0, skyL, blkL, tint);
          }
          continue;
        }

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
          const nb = getB(nx, ny, nz);
          const nbd = getBlock(nb);

          // visibility rules
          let visible = false;
          if (bd.render === 'liquid') {
            visible = nb !== id && !nbd.opaque && !(nb === ICE);
            if (f === 0 && nb === AIR) visible = true;
          } else if (bd.render === 'torch') {
            continue; // billboard drawn below
          } else if (bd.render === 'flat') {
            // snow/rail: top face only; ladder: side faces only
            if (id === LADDER) visible = (f >= 2);
            else visible = (f === 0);
            if (id === SNOW && getB(x, y + 1, z) !== AIR) visible = false;
          } else {
            visible = !nbd.opaque && nb !== id;
            if (bd.render === 'cutout' && nb === LEAVES) visible = true;
          }
          if (!visible) continue;

          const light = getL(nx, ny, nz);
          const skyL = light >> 4, blkL = light & 15;
          const tile = bd.tiles[face.tile];
          const corners = face.corners.map(c => [x + c[0], y + c[1], z + c[2], c[3], c[4]]);

          // water surface slightly lower
          const yTop = (bd.render === 'liquid' && getB(x, y + 1, z) !== id) ? 0.88 : 1.0;
          const corners2 = corners.map(c => {
            const yy = c[1];
            if (yy === y + 1 && yTop < 1) return [c[0], y + yTop, c[2], c[3], c[4]];
            return c;
          });
          pushQuad(buf, corners2, tile, face.shade, skyL, blkL, tint, bd.render === 'liquid' ? 0.82 : 1);
        }

        // torch: draw small billboard
        if (bd.render === 'torch') {
          const light = getL(x, y, z);
          const skyL = light >> 4, blkL = light & 15;
          const cx = x + 0.5, cz = z + 0.5;
          const w = 0.14;
          const sets = [
            [[cx - w, y, cz - w], [cx + w, y, cz - w], [cx + w, y + 0.65, cz - w], [cx - w, y + 0.65, cz - w]],
            [[cx + w, y, cz + w], [cx - w, y, cz + w], [cx - w, y + 0.65, cz + w], [cx + w, y + 0.65, cz + w]],
            [[cx - w, y, cz + w], [cx - w, y, cz - w], [cx - w, y + 0.65, cz - w], [cx - w, y + 0.65, cz + w]],
            [[cx + w, y, cz - w], [cx + w, y, cz + w], [cx + w, y + 0.65, cz + w], [cx + w, y + 0.65, cz - w]],
          ];
          for (const corners of sets) {
            pushQuad(buf, corners, TILES.torch, 1.0, skyL, blkL, [1, 1, 1]);
          }
        }
      }
    }
  }

  const makeMesh = (buf, material) => {
    if (buf.idx.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 4));
    g.setIndex(buf.idx);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material);
    mesh.position.set(wx0, 0, wz0);
    mesh.frustumCulled = true;
    mesh.userData.isChunk = true;
    return mesh;
  };

  return { solid, cutout, water, makeMesh };
}
