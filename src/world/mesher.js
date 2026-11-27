// Chunk mesher: builds Three.js geometry with baked beta-style lighting
// (per-face shading + per-vertex light level + biome tint).
import * as THREE from 'three';
import { CH } from './chunk.js';
import {
  getBlock, AIR, WATER, WATER_FLOW, LAVA, LAVA_FLOW, TILES, LEAVES, ICE, CACTUS, TORCH, REDSTONE_TORCH,
  LADDER, SNOW, CROPS, FARMLAND, CHEST, LEVER, REDSTONE_WIRE, REDSTONE_REPEATER, RAIL, CAKE_BLOCK, WOOD_DOOR, IRON_DOOR,
  FURNACE, FURNACE_LIT, PUMPKIN, JACK_O_LANTERN, STONE, FENCE, NETHER_BRICK_FENCE, ENCHANTING_TABLE, BLOCK_OPAQUE, BLOCK_HAS_TILES,
} from './blocks.js';

// face definitions: +Y, -Y, +Z, -Z, +X, -X
const FACES = [
  { // +Y (top)
    dir: [0, 1, 0], shade: 1.0, tile: 0,
    corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  },
  { // -Y (bottom)
    dir: [0, -1, 0], shade: 0.5, tile: 1,
    corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  },
  { // +Z (south)
    dir: [0, 0, 1], shade: 0.8, tile: 2,
    corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  },
  { // -Z (north)
    dir: [0, 0, -1], shade: 0.8, tile: 3,
    corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
  },
  { // +X (east)
    dir: [1, 0, 0], shade: 0.6, tile: 4,
    corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  },
  { // -X (west)
    dir: [-1, 0, 0], shade: 0.6, tile: 5,
    corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  },
];

// Precompute corner neighbor offsets for AO and smooth light sampling (6 faces * 4 corners).
const FACE_CORNER_META = FACES.map((face) => {
  const axes = [0, 1, 2].filter(axis => face.dir[axis] === 0);
  face.axes = axes;
  return face.corners.map((corner) => {
    const a = corner[axes[0]] ? 1 : -1;
    const b = corner[axes[1]] ? 1 : -1;
    return {
      cx: corner[0], cy: corner[1], cz: corner[2],
      ax: axes[0] === 0 ? a : 0, ay: axes[0] === 1 ? a : 0, az: axes[0] === 2 ? a : 0,
      bx: axes[1] === 0 ? b : 0, by: axes[1] === 1 ? b : 0, bz: axes[1] === 2 ? b : 0,
    };
  });
});

const ATLAS_COLS = 16;
const ATLAS_UNIT = 1 / ATLAS_COLS;
const ATLAS_EPS = 0.00025;

// Precompute standard full-tile UV rects for all 256 atlas tiles.
const TILE_U0 = new Float32Array(256);
const TILE_V0 = new Float32Array(256);
const TILE_U1 = new Float32Array(256);
const TILE_V1 = new Float32Array(256);
for (let t = 0; t < 256; t++) {
  const tx = t & 15, ty = t >> 4;
  TILE_U0[t] = tx * ATLAS_UNIT + ATLAS_EPS;
  TILE_V0[t] = 1 - (ty + 1) * ATLAS_UNIT + ATLAS_EPS;
  TILE_U1[t] = (tx + 1) * ATLAS_UNIT - ATLAS_EPS;
  TILE_V1[t] = 1 - ty * ATLAS_UNIT - ATLAS_EPS;
}

// Biome grass/foliage tint multipliers centered around 1.0 so vibrant Beta greens
// vary naturally across warm/dry, lush/wet, and cold biomes without darkening dirt.
export function grassColor(temp, hum) {
  const t = Math.max(0, Math.min(1, temp));
  const h = Math.max(0, Math.min(1, hum));
  const r = 1.0 + (t - 0.5) * 0.34 - (h - 0.5) * 0.16;
  const g = 1.02 + (h - 0.5) * 0.24 - (t - 0.5) * 0.14;
  const b = 0.96 + (h - 0.5) * 0.16 - (t - 0.5) * 0.20;
  return [
    Math.max(0.72, Math.min(1.24, r)),
    Math.max(0.78, Math.min(1.18, g)),
    Math.max(0.68, Math.min(1.16, b)),
  ];
}

export function foliageColor(temp, hum) {
  const c = grassColor(temp, hum);
  return [c[0] * 0.94, c[1] * 0.98, c[2] * 0.92];
}

const WHITE_TINT = [1, 1, 1];

// Map metadata facing (0: -Z, 1: +Z, 2: -X, 3: +X) to face index (2:+Z, 3:-Z, 4:+X, 5:-X)
const META_FRONT_FACE = [3, 2, 5, 4];

class LayerBuf {
  constructor(initialVerts) {
    this.capVerts = initialVerts;
    this.capIdx = initialVerts * 2;
    this.pos = new Float32Array(this.capVerts * 3);
    this.uv = new Float32Array(this.capVerts * 2);
    this.col = new Float32Array(this.capVerts * 4);
    this.light = new Float32Array(this.capVerts * 2);
    this.normal = new Float32Array(this.capVerts * 3);
    this.idx = new Uint32Array(this.capIdx);
    this.vLen = 0;
    this.iLen = 0;
  }

  reset() {
    this.vLen = 0;
    this.iLen = 0;
  }

  ensure(addVerts, addIdx) {
    if (this.vLen + addVerts > this.capVerts) {
      let next = this.capVerts * 2;
      while (next < this.vLen + addVerts) next *= 2;
      this.capVerts = next;
      const grow = (old, stride) => {
        const n = new Float32Array(next * stride);
        n.set(old.subarray(0, this.vLen * stride));
        return n;
      };
      this.pos = grow(this.pos, 3);
      this.uv = grow(this.uv, 2);
      this.col = grow(this.col, 4);
      this.light = grow(this.light, 2);
      this.normal = grow(this.normal, 3);
    }
    if (this.iLen + addIdx > this.capIdx) {
      let next = this.capIdx * 2;
      while (next < this.iLen + addIdx) next *= 2;
      this.capIdx = next;
      const n = new Uint32Array(next);
      n.set(this.idx.subarray(0, this.iLen));
      this.idx = n;
    }
  }

  finish() {
    const v = this.vLen, i = this.iLen;
    return {
      pos: this.pos.slice(0, v * 3),
      uv: this.uv.slice(0, v * 2),
      col: this.col.slice(0, v * 4),
      light: this.light.slice(0, v * 2),
      normal: this.normal.slice(0, v * 3),
      idx: v <= 65535 ? new Uint16Array(this.idx.subarray(0, i)) : this.idx.slice(0, i),
    };
  }
}

const SCRATCH_SOLID = new LayerBuf(16384);
const SCRATCH_CUTOUT = new LayerBuf(1024);
const SCRATCH_WATER = new LayerBuf(1024);

// Reusable 4-corner scalars so smooth light & AO never allocate temporary arrays.
const _ao = new Float32Array(4);
const _sky = new Float32Array(4);
const _blk = new Float32Array(4);
const _colGrassR = new Float32Array(256);
const _colGrassG = new Float32Array(256);
const _colGrassB = new Float32Array(256);
const _colFolR = new Float32Array(256);
const _colFolG = new Float32Array(256);
const _colFolB = new Float32Array(256);

// Module-level chunk neighborhood references so inner helper functions are never
// recreated per buildChunkMesh call (allowing V8 to inline them cleanly).
const _cBlocks = new Array(9);
const _cMeta = new Array(9);
const _cSky = new Array(9);
const _cBlk = new Array(9);
const _cGen = new Uint8Array(9);
let _centerBlocks = null;
let _centerMeta = null;
let _centerSky = null;
let _centerBlk = null;
let _chunkHeight = 128;
let _useSmooth = true;

function getB(x, y, z) {
  if (y < 0 || y >= _chunkHeight) return AIR;
  if (x >= 0 && x < CH && z >= 0 && z < CH) return _centerBlocks[(y * CH + z) * CH + x];
  const ci = (z < 0 ? 0 : z >= CH ? 6 : 3) + (x < 0 ? 0 : x >= CH ? 2 : 1);
  const arr = _cBlocks[ci];
  return arr ? arr[(y * CH + (z & 15)) * CH + (x & 15)] : AIR;
}
function getM(x, y, z) {
  if (y < 0 || y >= _chunkHeight) return 0;
  if (x >= 0 && x < CH && z >= 0 && z < CH) return _centerMeta[(y * CH + z) * CH + x];
  const ci = (z < 0 ? 0 : z >= CH ? 6 : 3) + (x < 0 ? 0 : x >= CH ? 2 : 1);
  const arr = _cMeta[ci];
  return arr ? arr[(y * CH + (z & 15)) * CH + (x & 15)] : 0;
}
function getL(x, y, z) {
  if (y >= _chunkHeight) return 0xf0;
  if (y < 0) return 0;
  if (x >= 0 && x < CH && z >= 0 && z < CH) {
    const i = (y * CH + z) * CH + x;
    return (_centerSky[i] << 4) | _centerBlk[i];
  }
  const ci = (z < 0 ? 0 : z >= CH ? 6 : 3) + (x < 0 ? 0 : x >= CH ? 2 : 1);
  if (!_cGen[ci]) {
    // Clamp unloaded neighbor reads to the chunk edge instead of flashing sky=15.
    const cx = x < 0 ? 0 : x >= CH ? CH - 1 : x;
    const cz = z < 0 ? 0 : z >= CH ? CH - 1 : z;
    const i = (y * CH + cz) * CH + cx;
    return (_centerSky[i] << 4) | _centerBlk[i];
  }
  const i = (y * CH + (z & 15)) * CH + (x & 15);
  return (_cSky[ci][i] << 4) | _cBlk[ci][i];
}

function computeFaceAO(x, y, z, f) {
  const face = FACES[f];
  const bx = x + face.dir[0], by = y + face.dir[1], bz = z + face.dir[2];
  const corners = FACE_CORNER_META[f];
  for (let i = 0; i < 4; i++) {
    const cm = corners[i];
    const sideA = BLOCK_OPAQUE[getB(bx + cm.ax, by + cm.ay, bz + cm.az)];
    const sideB = BLOCK_OPAQUE[getB(bx + cm.bx, by + cm.by, bz + cm.bz)];
    const diagonal = BLOCK_OPAQUE[getB(bx + cm.ax + cm.bx, by + cm.ay + cm.by, bz + cm.az + cm.bz)];
    // Authentic Minecraft 1.7.10 AO steps: 0->1.0, 1->0.80, 2->0.60, 3->0.48.
    const occ = (sideA && sideB) ? 3 : (sideA + sideB + diagonal);
    _ao[i] = occ === 0 ? 1.0 : occ === 1 ? 0.80 : occ === 2 ? 0.60 : 0.48;
  }
}

function computeFaceLight(x, y, z, f) {
  const face = FACES[f];
  const bx = x + face.dir[0], by = y + face.dir[1], bz = z + face.dir[2];
  const corners = FACE_CORNER_META[f];
  const b0 = getB(bx, by, bz);
  const l0 = getL(bx, by, bz);
  const o0 = BLOCK_OPAQUE[b0];
  for (let i = 0; i < 4; i++) {
    const cm = corners[i];
    let s = 0, lb = 0, n = 0;
    if (!o0) { s += l0 >> 4; lb += l0 & 15; n++; }
    const x1 = bx + cm.ax, y1 = by + cm.ay, z1 = bz + cm.az;
    const o1 = BLOCK_OPAQUE[getB(x1, y1, z1)];
    if (!o1) { const l = getL(x1, y1, z1); s += l >> 4; lb += l & 15; n++; }
    const x2 = bx + cm.bx, y2 = by + cm.by, z2 = bz + cm.bz;
    const o2 = BLOCK_OPAQUE[getB(x2, y2, z2)];
    if (!o2) { const l = getL(x2, y2, z2); s += l >> 4; lb += l & 15; n++; }
    // Prevent light from bleeding through a diagonal solid corner (1.7.10 rule).
    if (!(o1 && o2)) {
      const x3 = bx + cm.ax + cm.bx, y3 = by + cm.ay + cm.by, z3 = bz + cm.az + cm.bz;
      if (!BLOCK_OPAQUE[getB(x3, y3, z3)]) { const l = getL(x3, y3, z3); s += l >> 4; lb += l & 15; n++; }
    }
    if (n === 0) {
      _sky[i] = l0 >> 4;
      _blk[i] = l0 & 15;
    } else {
      _sky[i] = s / n;
      _blk[i] = lb / n;
    }
  }
}

function writeQuad(
  buf,
  x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3,
  u0, v0, u1, v1, u2, v2, u3, v3,
  nx, ny, nz,
  shade, tr, tg, tb,
  useSmooth, skyL, blkL, useAO,
) {
  buf.ensure(4, 6);
  const base = buf.vLen;
  const pos = buf.pos, uv = buf.uv, col = buf.col, light = buf.light, normal = buf.normal, idx = buf.idx;
  let p = base * 3, u = base * 2, c = base * 4, l = base * 2;

  pos[p] = x0; pos[p + 1] = y0; pos[p + 2] = z0;
  pos[p + 3] = x1; pos[p + 4] = y1; pos[p + 5] = z1;
  pos[p + 6] = x2; pos[p + 7] = y2; pos[p + 8] = z2;
  pos[p + 9] = x3; pos[p + 10] = y3; pos[p + 11] = z3;

  uv[u] = u0; uv[u + 1] = v0;
  uv[u + 2] = u1; uv[u + 3] = v1;
  uv[u + 4] = u2; uv[u + 5] = v2;
  uv[u + 6] = u3; uv[u + 7] = v3;

  for (let i = 0; i < 4; i++) {
    const vl = useAO ? _ao[i] : 1;
    col[c] = shade * tr * vl; col[c + 1] = shade * tg * vl; col[c + 2] = shade * tb * vl; col[c + 3] = 1;
    light[l] = useSmooth ? _sky[i] : skyL;
    light[l + 1] = useSmooth ? _blk[i] : blkL;
    normal[p] = nx; normal[p + 1] = ny; normal[p + 2] = nz;
    p += 3; c += 4; l += 2;
  }

  const ii = buf.iLen;
  if (useAO && (_ao[0] + _ao[2] + (_sky[0] + _sky[2]) * 0.01 < _ao[1] + _ao[3] + (_sky[1] + _sky[3]) * 0.01)) {
    idx[ii] = base; idx[ii + 1] = base + 1; idx[ii + 2] = base + 3;
    idx[ii + 3] = base + 1; idx[ii + 4] = base + 2; idx[ii + 5] = base + 3;
  } else {
    idx[ii] = base; idx[ii + 1] = base + 1; idx[ii + 2] = base + 2;
    idx[ii + 3] = base; idx[ii + 4] = base + 2; idx[ii + 5] = base + 3;
  }
  buf.vLen = base + 4;
  buf.iLen = ii + 6;
}

function writeCrossQuad(
  buf,
  x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3,
  u0, v0, u1, v1,
  shade, skyL, blkL, tr, tg, tb,
) {
  const e1x = x1 - x0, e1y = y1 - y0, e1z = z1 - z0;
  const e2x = x2 - x0, e2y = y2 - y0, e2z = z2 - z0;
  const cx = e1y * e2z - e1z * e2y;
  const cy = e1z * e2x - e1x * e2z;
  const cz = e1x * e2y - e1y * e2x;
  const len = Math.hypot(cx, cy, cz) || 1;
  writeQuad(
    buf,
    x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3,
    u0, v0, u1, v0, u1, v1, u0, v1,
    cx / len, cy / len, cz / len,
    shade, tr, tg, tb,
    false, skyL, blkL, false,
  );
}

function pushBox(buf, x0, y0, z0, x1, y1, z1, tiles, skyL, blkL, tr = 1, tg = 1, tb = 1, uvRects = null) {
  const bx = Math.floor(x0), by = Math.floor(y0), bz = Math.floor(z0);
  for (let f = 0; f < 6; f++) {
    if (_useSmooth) computeFaceLight(bx, by, bz, f);
    const tile = tiles[f];
    let u0, v0, u1, v1;
    if (uvRects) {
      const r = uvRects[f];
      const tx = tile & 15, ty = tile >> 4;
      u0 = (tx + r[0]) * ATLAS_UNIT + ATLAS_EPS;
      v0 = 1 - (ty + 1 - r[1]) * ATLAS_UNIT + ATLAS_EPS;
      u1 = (tx + r[2]) * ATLAS_UNIT - ATLAS_EPS;
      v1 = 1 - (ty + 1 - r[3]) * ATLAS_UNIT - ATLAS_EPS;
    } else {
      u0 = TILE_U0[tile]; v0 = TILE_V0[tile]; u1 = TILE_U1[tile]; v1 = TILE_V1[tile];
    }
    const face = FACES[f];
    const [dx, dy, dz] = face.dir;
    if (f === 0) writeQuad(buf, x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, u0, v0, u1, v0, u1, v1, u0, v1, dx, dy, dz, 1.0, tr, tg, tb, _useSmooth, skyL, blkL, false);
    else if (f === 1) writeQuad(buf, x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, u0, v0, u1, v0, u1, v1, u0, v1, dx, dy, dz, 0.5, tr, tg, tb, _useSmooth, skyL, blkL, false);
    else if (f === 2) writeQuad(buf, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, u0, v0, u1, v0, u1, v1, u0, v1, dx, dy, dz, 0.8, tr, tg, tb, _useSmooth, skyL, blkL, false);
    else if (f === 3) writeQuad(buf, x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, u0, v0, u1, v0, u1, v1, u0, v1, dx, dy, dz, 0.8, tr, tg, tb, _useSmooth, skyL, blkL, false);
    else if (f === 4) writeQuad(buf, x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, u0, v0, u1, v0, u1, v1, u0, v1, dx, dy, dz, 0.6, tr, tg, tb, _useSmooth, skyL, blkL, false);
    else writeQuad(buf, x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, u0, v0, u1, v0, u1, v1, u0, v1, dx, dy, dz, 0.6, tr, tg, tb, _useSmooth, skyL, blkL, false);
  }
}

function pushTiltedPrism(buf, bx0, by0, bz0, tx0, ty0, tz0, w, tile, skyL, blkL, tr, tg, tb, sideRect, topRect) {
  const tx = tile & 15, ty = tile >> 4;
  const su0 = (tx + sideRect[0]) * ATLAS_UNIT + ATLAS_EPS;
  const sv0 = 1 - (ty + 1 - sideRect[1]) * ATLAS_UNIT + ATLAS_EPS;
  const su1 = (tx + sideRect[2]) * ATLAS_UNIT - ATLAS_EPS;
  const sv1 = 1 - (ty + 1 - sideRect[3]) * ATLAS_UNIT - ATLAS_EPS;
  const tu0 = (tx + topRect[0]) * ATLAS_UNIT + ATLAS_EPS;
  const tv0 = 1 - (ty + 1 - topRect[1]) * ATLAS_UNIT + ATLAS_EPS;
  const tu1 = (tx + topRect[2]) * ATLAS_UNIT - ATLAS_EPS;
  const tv1 = 1 - (ty + 1 - topRect[3]) * ATLAS_UNIT - ATLAS_EPS;

  writeCrossQuad(buf, tx0 - w, ty0, tz0 + w, tx0 + w, ty0, tz0 + w, tx0 + w, ty0, tz0 - w, tx0 - w, ty0, tz0 - w, tu0, tv0, tu1, tv1, 1.0, skyL, blkL, tr, tg, tb);
  writeCrossQuad(buf, bx0 - w, by0, bz0 - w, bx0 + w, by0, bz0 - w, bx0 + w, by0, bz0 + w, bx0 - w, by0, bz0 + w, tu0, tv0, tu1, tv1, 0.5, skyL, blkL, tr, tg, tb);
  writeCrossQuad(buf, bx0 - w, by0, bz0 + w, bx0 + w, by0, bz0 + w, tx0 + w, ty0, tz0 + w, tx0 - w, ty0, tz0 + w, su0, sv0, su1, sv1, 0.8, skyL, blkL, tr, tg, tb);
  writeCrossQuad(buf, bx0 + w, by0, bz0 - w, bx0 - w, by0, bz0 - w, tx0 - w, ty0, tz0 - w, tx0 + w, ty0, tz0 - w, su0, sv0, su1, sv1, 0.8, skyL, blkL, tr, tg, tb);
  writeCrossQuad(buf, bx0 + w, by0, bz0 + w, bx0 + w, by0, bz0 - w, tx0 + w, ty0, tz0 - w, tx0 + w, ty0, tz0 + w, su0, sv0, su1, sv1, 0.6, skyL, blkL, tr, tg, tb);
  writeCrossQuad(buf, bx0 - w, by0, bz0 - w, bx0 - w, by0, bz0 + w, tx0 - w, ty0, tz0 + w, tx0 - w, ty0, tz0 - w, su0, sv0, su1, sv1, 0.6, skyL, blkL, tr, tg, tb);
}

// Precompute block tint type (0=none, 1=grass, 2=foliage) and render mode codes.
const RENDER_NONE = 0;
const RENDER_CUBE = 1;
const RENDER_CUTOUT_CUBE = 8;
const RENDER_LIQUID = 2;
const RENDER_CROSS = 3;
const RENDER_TORCH = 4;
const RENDER_SLAB = 5;
const RENDER_DOOR = 6;
const RENDER_FLAT = 7;
const RENDER_STAIRS = 9;
const RENDER_FENCE = 10;
const RENDER_PORTAL = 11;

const BLOCK_RENDER_CODE = new Uint8Array(256);
const BLOCK_TINT_CODE = new Uint8Array(256);
const BLOCK_TILES_TABLE = new Array(256);
for (let id = 0; id < 256; id++) {
  const bd = getBlock(id);
  BLOCK_TILES_TABLE[id] = bd.tiles;
  if (!bd.tiles) { BLOCK_RENDER_CODE[id] = RENDER_NONE; continue; }
  switch (bd.render) {
    case 'cube': BLOCK_RENDER_CODE[id] = RENDER_CUBE; break;
    case 'cutout': BLOCK_RENDER_CODE[id] = RENDER_CUTOUT_CUBE; break;
    case 'liquid': BLOCK_RENDER_CODE[id] = RENDER_LIQUID; break;
    case 'cross': BLOCK_RENDER_CODE[id] = RENDER_CROSS; break;
    case 'torch': BLOCK_RENDER_CODE[id] = RENDER_TORCH; break;
    case 'slab': BLOCK_RENDER_CODE[id] = RENDER_SLAB; break;
    case 'door': BLOCK_RENDER_CODE[id] = RENDER_DOOR; break;
    case 'flat': BLOCK_RENDER_CODE[id] = RENDER_FLAT; break;
    case 'stairs': BLOCK_RENDER_CODE[id] = RENDER_STAIRS; break;
    case 'fence': BLOCK_RENDER_CODE[id] = RENDER_FENCE; break;
    case 'portal': BLOCK_RENDER_CODE[id] = RENDER_PORTAL; break;
    default: BLOCK_RENDER_CODE[id] = RENDER_CUTOUT_CUBE; break;
  }
  BLOCK_TINT_CODE[id] = bd.tint === 'grass' ? 1 : bd.tint === 'foliage' ? 2 : 0;
}

export function buildChunkMesh(world, chunk, atlasTexture, waterTexture, renderDistance) {
  if (chunk.meshes) {
    for (const k of Object.keys(chunk.meshes)) {
      const m = chunk.meshes[k];
      if (m) { world.scene.remove(m); m.geometry.dispose(); }
    }
    chunk.meshes = null;
  }

  const solid = SCRATCH_SOLID; solid.reset();
  const cutout = SCRATCH_CUTOUT; cutout.reset();
  const water = SCRATCH_WATER; water.reset();
  const wx0 = chunk.cx * CH, wz0 = chunk.cz * CH;
  const height = _chunkHeight = chunk.height;
  _useSmooth = world.smoothLighting !== false;

  // Biomes are seed/coordinate dependent, not affected by block edits.
  // Classic has no climate values; skip climate evaluation entirely there.
  const useBiomes = world.edition !== 'classic';
  let biomeCache = chunk.biomeCache;
  if (useBiomes) {
    if (!biomeCache) biomeCache = chunk.biomeCache = new Array(CH * CH);
    if (!biomeCache[0]) {
      for (let z = 0; z < CH; z++) {
        for (let x = 0; x < CH; x++) biomeCache[z * CH + x] = world.gen.columnInfo(wx0 + x, wz0 + z);
      }
    }
  }

  // Resolve 3x3 chunk neighborhood once so every block/light read inside [-1..16]
  // becomes direct typed-array indexing with zero allocations or string keys.
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const idx9 = (dz + 1) * 3 + (dx + 1);
      const nc = (dx === 0 && dz === 0) ? chunk : world.getChunk(chunk.cx + dx, chunk.cz + dz);
      if (nc && nc.generated) {
        _cBlocks[idx9] = nc.blocks;
        _cMeta[idx9] = nc.meta;
        _cSky[idx9] = nc.skyLight;
        _cBlk[idx9] = nc.blockLight;
        _cGen[idx9] = 1;
      } else {
        _cBlocks[idx9] = _cMeta[idx9] = _cSky[idx9] = _cBlk[idx9] = null;
        _cGen[idx9] = 0;
      }
    }
  }
  const centerBlocks = _centerBlocks = chunk.blocks;
  const centerMeta = _centerMeta = chunk.meta;
  const centerSky = _centerSky = chunk.skyLight;
  const centerBlk = _centerBlk = chunk.blockLight;
  const cGen = _cGen;

  // Precompute column biome tints once (max 256 columns) into reusable buffers.
  const colGrassR = _colGrassR, colGrassG = _colGrassG, colGrassB = _colGrassB;
  const colFolR = _colFolR, colFolG = _colFolG, colFolB = _colFolB;
  if (useBiomes) {
    for (let i = 0; i < 256; i++) {
      const b = biomeCache[i];
      const t = Math.max(0, Math.min(1, b.temp));
      const h = Math.max(0, Math.min(1, b.hum));
      const gr = Math.max(0.72, Math.min(1.24, 1.0 + (t - 0.5) * 0.34 - (h - 0.5) * 0.16));
      const gg = Math.max(0.78, Math.min(1.18, 1.02 + (h - 0.5) * 0.24 - (t - 0.5) * 0.14));
      const gb = Math.max(0.68, Math.min(1.16, 0.96 + (h - 0.5) * 0.16 - (t - 0.5) * 0.20));
      colGrassR[i] = gr; colGrassG[i] = gg; colGrassB[i] = gb;
      colFolR[i] = gr * 0.94; colFolG[i] = gg * 0.98; colFolB[i] = gb * 0.92;
    }
  }

  // Avoid traversing the empty sky above this chunk, while preserving blocks
  // placed at any height. The contiguous y-major storage makes this cheap.
  let top = height - 1;
  while (top >= 0) {
    let occupied = false;
    const start = top * CH * CH;
    for (let i = start; i < start + CH * CH; i++) if (centerBlocks[i] !== AIR) { occupied = true; break; }
    if (occupied) break;
    top--;
  }

  const torchSideRect = [7 / 16, 0, 9 / 16, 10 / 16];
  const torchTopRect = [7 / 16, 10 / 16, 9 / 16, 12 / 16];
  const leverBaseRect = [4 / 16, 0, 12 / 16, 8 / 16];
  const bedFootTiles = [TILES.bed_foot, TILES.planks, TILES.bed_side, TILES.bed_end, TILES.bed_side, TILES.bed_side];

  for (let y = 0; y <= top; y++) {
    const yOff = y * CH * CH;
    for (let z = 0; z < CH; z++) {
      const zOff = yOff + z * CH;
      for (let x = 0; x < CH; x++) {
        const idxCell = zOff + x;
        const id = centerBlocks[idxCell];
        if (id === AIR || !BLOCK_HAS_TILES[id]) continue;

        const renderCode = BLOCK_RENDER_CODE[id];
        const isLava = id === LAVA || id === LAVA_FLOW;
        const isWaterFamily = id === WATER || id === WATER_FLOW;

        // Fast interior skip: if this is an ordinary opaque cube surrounded by 6 opaque blocks,
        // skip all tint/meta/light work immediately.
        if (renderCode === RENDER_CUBE && BLOCK_OPAQUE[id] && id !== CACTUS) {
          if (x > 0 && x < CH - 1 && z > 0 && z < CH - 1 && y > 0 && y < height - 1) {
            if (
              BLOCK_OPAQUE[centerBlocks[idxCell + 256]] &&
              BLOCK_OPAQUE[centerBlocks[idxCell - 256]] &&
              BLOCK_OPAQUE[centerBlocks[idxCell + 16]] &&
              BLOCK_OPAQUE[centerBlocks[idxCell - 16]] &&
              BLOCK_OPAQUE[centerBlocks[idxCell + 1]] &&
              BLOCK_OPAQUE[centerBlocks[idxCell - 1]]
            ) continue;
          } else if (
            BLOCK_OPAQUE[getB(x, y + 1, z)] &&
            BLOCK_OPAQUE[getB(x, y - 1, z)] &&
            BLOCK_OPAQUE[getB(x, y, z + 1)] &&
            BLOCK_OPAQUE[getB(x, y, z - 1)] &&
            BLOCK_OPAQUE[getB(x + 1, y, z)] &&
            BLOCK_OPAQUE[getB(x - 1, y, z)]
          ) continue;
        }

        const meta = centerMeta[idxCell];
        let tr = 1, tg = 1, tb = 1;
        if (useBiomes) {
          const tc = BLOCK_TINT_CODE[id];
          if (tc === 1) {
            const cIdx = z * CH + x;
            tr = colGrassR[cIdx]; tg = colGrassG[cIdx]; tb = colGrassB[cIdx];
          } else if (tc === 2) {
            const cIdx = z * CH + x;
            tr = colFolR[cIdx]; tg = colFolG[cIdx]; tb = colFolB[cIdx];
          }
        }

        let buf = solid;
        if (renderCode === RENDER_LIQUID) buf = isLava ? solid : water;
        else if (renderCode !== RENDER_CUBE && renderCode !== RENDER_STAIRS && renderCode !== RENDER_FENCE) buf = cutout;

        if (renderCode === RENDER_CROSS) {
          const light = (centerSky[idxCell] << 4) | centerBlk[idxCell];
          const skyL = light >> 4, blkL = light & 15;
          const tile = id === CROPS ? (TILES.crops0 + Math.min(7, meta & 7)) : BLOCK_TILES_TABLE[id][2];
          const u0 = TILE_U0[tile], v0 = TILE_V0[tile], u1 = TILE_U1[tile], v1 = TILE_V1[tile];
          writeCrossQuad(buf, x + 0.1, y, z + 0.1, x + 0.9, y, z + 0.9, x + 0.9, y + 1, z + 0.9, x + 0.1, y + 1, z + 0.1, u0, v0, u1, v1, 1.0, skyL, blkL, tr, tg, tb);
          writeCrossQuad(buf, x + 0.9, y, z + 0.1, x + 0.1, y, z + 0.9, x + 0.1, y + 1, z + 0.9, x + 0.9, y + 1, z + 0.1, u0, v0, u1, v1, 1.0, skyL, blkL, tr, tg, tb);
          continue;
        }

        if (renderCode === RENDER_TORCH) {
          const light = (centerSky[idxCell] << 4) | centerBlk[idxCell];
          const skyL = light >> 4;
          const blkL = Math.max(light & 15, id === TORCH ? 14 : (id === REDSTONE_TORCH && !(meta & 8) ? 7 : 0));
          const attach = meta & 7;
          const w = 1 / 16;

          if (id === LEVER) {
            // Stone base plate + angled lever stick (flips when toggled via bit 8)
            const active = (meta & 8) !== 0;
            const baseTiles = [TILES.cobble, TILES.cobble, TILES.cobble, TILES.cobble, TILES.cobble, TILES.cobble];
            const baseUv = [leverBaseRect, leverBaseRect, leverBaseRect, leverBaseRect, leverBaseRect, leverBaseRect];
            let bx0 = x + 0.5, by0 = y, bz0 = z + 0.5, tx0 = x + 0.5, ty0 = y + 0.56, tz0 = z + 0.5;
            if (attach === 1) {
              pushBox(buf, x, y + 0.25, z + 0.3125, x + 0.1875, y + 0.75, z + 0.6875, baseTiles, skyL, blkL, 1, 1, 1, baseUv);
              bx0 = x + 0.15; by0 = y + 0.5; tx0 = x + 0.52; ty0 = active ? y + 0.24 : y + 0.78;
            } else if (attach === 2) {
              pushBox(buf, x + 0.8125, y + 0.25, z + 0.3125, x + 1, y + 0.75, z + 0.6875, baseTiles, skyL, blkL, 1, 1, 1, baseUv);
              bx0 = x + 0.85; by0 = y + 0.5; tx0 = x + 0.48; ty0 = active ? y + 0.24 : y + 0.78;
            } else if (attach === 3) {
              pushBox(buf, x + 0.3125, y + 0.25, z, x + 0.6875, y + 0.75, z + 0.1875, baseTiles, skyL, blkL, 1, 1, 1, baseUv);
              bz0 = z + 0.15; by0 = y + 0.5; tz0 = z + 0.52; ty0 = active ? y + 0.24 : y + 0.78;
            } else if (attach === 4) {
              pushBox(buf, x + 0.3125, y + 0.25, z + 0.8125, x + 0.6875, y + 0.75, z + 1, baseTiles, skyL, blkL, 1, 1, 1, baseUv);
              bz0 = z + 0.85; by0 = y + 0.5; tz0 = z + 0.48; ty0 = active ? y + 0.24 : y + 0.78;
            } else {
              pushBox(buf, x + 0.3125, y, z + 0.3125, x + 0.6875, y + 0.1875, z + 0.6875, baseTiles, skyL, blkL, 1, 1, 1, baseUv);
              by0 = y + 0.15; tz0 = active ? z + 0.26 : z + 0.74; ty0 = y + 0.58;
            }
            pushTiltedPrism(buf, bx0, by0, bz0, tx0, ty0, tz0, w * 0.85, TILES.lever, skyL, blkL, 1, 1, 1, torchSideRect, torchTopRect);
            continue;
          }

          const torchTile = id === REDSTONE_TORCH && (meta & 8) ? TILES.redstone_torch_off : TILES.torch;
          const rTintR = id === REDSTONE_TORCH && !(meta & 8) ? 1.15 : 1;
          const rTintG = id === REDSTONE_TORCH && !(meta & 8) ? 0.45 : 1;
          const rTintB = id === REDSTONE_TORCH && !(meta & 8) ? 0.45 : 1;
          if (attach === 1) {
            pushTiltedPrism(buf, x + 0.14, y + 0.22, z + 0.5, x + 0.42, y + 0.80, z + 0.5, w, torchTile, skyL, blkL, rTintR, rTintG, rTintB, torchSideRect, torchTopRect);
          } else if (attach === 2) {
            pushTiltedPrism(buf, x + 0.86, y + 0.22, z + 0.5, x + 0.58, y + 0.80, z + 0.5, w, torchTile, skyL, blkL, rTintR, rTintG, rTintB, torchSideRect, torchTopRect);
          } else if (attach === 3) {
            pushTiltedPrism(buf, x + 0.5, y + 0.22, z + 0.14, x + 0.5, y + 0.80, z + 0.42, w, torchTile, skyL, blkL, rTintR, rTintG, rTintB, torchSideRect, torchTopRect);
          } else if (attach === 4) {
            pushTiltedPrism(buf, x + 0.5, y + 0.22, z + 0.86, x + 0.5, y + 0.80, z + 0.58, w, torchTile, skyL, blkL, rTintR, rTintG, rTintB, torchSideRect, torchTopRect);
          } else {
            const cx = x + 0.5, cz = z + 0.5;
            pushBox(
              buf, cx - w, y, cz - w, cx + w, y + 0.625, cz + w,
              [torchTile, torchTile, torchTile, torchTile, torchTile, torchTile],
              skyL, blkL, rTintR, rTintG, rTintB,
              [torchTopRect, torchSideRect, torchSideRect, torchSideRect, torchSideRect, torchSideRect],
            );
          }
          continue;
        }

        if (renderCode === RENDER_SLAB) {
          const light = (centerSky[idxCell] << 4) | centerBlk[idxCell];
          const skyL = light >> 4, blkL = light & 15;
          const bd = getBlock(id);
          if (id === CAKE_BLOCK) {
            const eaten = Math.min(6, meta & 7);
            pushBox(buf, x + 0.0625 + eaten * 0.125, y, z + 0.0625, x + 0.9375, y + 0.5, z + 0.9375, bd.tiles, skyL, blkL);
          } else {
            const tiles = id === 26 && !(meta & 8) ? bedFootTiles : bd.tiles;
            const bounds = bd.bounds;
            const minX = bounds ? bounds[0] : 0, minY = bounds ? bounds[1] : 0, minZ = bounds ? bounds[2] : 0;
            const maxX = bounds ? bounds[3] : 1, maxY = bounds ? bounds[4] : 0.5625, maxZ = bounds ? bounds[5] : 1;
            pushBox(buf, x + minX, y + minY, z + minZ, x + maxX, y + maxY, z + maxZ, tiles, skyL, blkL);
            if (id === ENCHANTING_TABLE) {
              pushBox(buf, x + 0.3125, y + 0.78, z + 0.3125, x + 0.6875, y + 0.90, z + 0.6875,
                [TILES.enchant_top, TILES.bookshelf, TILES.bookshelf, TILES.bookshelf, TILES.bookshelf, TILES.bookshelf],
                skyL, Math.max(blkL, 12));
            }
          }
          continue;
        }

        if (renderCode === RENDER_STAIRS) {
          const light = getL(x, y + 1, z) || ((centerSky[idxCell] << 4) | centerBlk[idxCell]);
          const skyL = light >> 4, blkL = light & 15;
          const bdTiles = BLOCK_TILES_TABLE[id];
          pushBox(buf, x, y, z, x + 1, y + 0.5, z + 1, bdTiles, skyL, blkL);
          const dir = meta & 3;
          if (dir === 0) pushBox(buf, x, y + 0.5, z, x + 1, y + 1, z + 0.5, bdTiles, skyL, blkL);
          else if (dir === 1) pushBox(buf, x, y + 0.5, z + 0.5, x + 1, y + 1, z + 1, bdTiles, skyL, blkL);
          else if (dir === 2) pushBox(buf, x, y + 0.5, z, x + 0.5, y + 1, z + 1, bdTiles, skyL, blkL);
          else pushBox(buf, x + 0.5, y + 0.5, z, x + 1, y + 1, z + 1, bdTiles, skyL, blkL);
          continue;
        }

        if (renderCode === RENDER_FENCE) {
          const light = (centerSky[idxCell] << 4) | centerBlk[idxCell];
          const skyL = light >> 4, blkL = light & 15;
          const bdTiles = BLOCK_TILES_TABLE[id];
          pushBox(buf, x + 0.375, y, z + 0.375, x + 0.625, y + 1, z + 0.625, bdTiles, skyL, blkL);
          const connects = (nb) => nb === id || nb === FENCE || nb === NETHER_BRICK_FENCE || BLOCK_OPAQUE[nb];
          if (connects(getB(x, y, z - 1))) {
            pushBox(buf, x + 0.4375, y + 0.375, z, x + 0.5625, y + 0.5625, z + 0.375, bdTiles, skyL, blkL);
            pushBox(buf, x + 0.4375, y + 0.75, z, x + 0.5625, y + 0.9375, z + 0.375, bdTiles, skyL, blkL);
          }
          if (connects(getB(x, y, z + 1))) {
            pushBox(buf, x + 0.4375, y + 0.375, z + 0.625, x + 0.5625, y + 0.5625, z + 1, bdTiles, skyL, blkL);
            pushBox(buf, x + 0.4375, y + 0.75, z + 0.625, x + 0.5625, y + 0.9375, z + 1, bdTiles, skyL, blkL);
          }
          if (connects(getB(x - 1, y, z))) {
            pushBox(buf, x, y + 0.375, z + 0.4375, x + 0.375, y + 0.5625, z + 0.5625, bdTiles, skyL, blkL);
            pushBox(buf, x, y + 0.75, z + 0.4375, x + 0.375, y + 0.9375, z + 0.5625, bdTiles, skyL, blkL);
          }
          if (connects(getB(x + 1, y, z))) {
            pushBox(buf, x + 0.625, y + 0.375, z + 0.4375, x + 1, y + 0.5625, z + 0.5625, bdTiles, skyL, blkL);
            pushBox(buf, x + 0.625, y + 0.75, z + 0.4375, x + 1, y + 0.9375, z + 0.5625, bdTiles, skyL, blkL);
          }
          continue;
        }

        if (renderCode === RENDER_PORTAL) {
          const light = (centerSky[idxCell] << 4) | centerBlk[idxCell];
          const skyL = light >> 4;
          const bdTiles = BLOCK_TILES_TABLE[id];
          if ((meta & 1) === 1) {
            pushBox(buf, x + 0.375, y, z, x + 0.625, y + 1, z + 1, bdTiles, skyL, 15);
          } else {
            pushBox(buf, x, y, z + 0.375, x + 1, y + 1, z + 0.625, bdTiles, skyL, 15);
          }
          continue;
        }

        if (renderCode === RENDER_DOOR) {
          const light = (centerSky[idxCell] << 4) | centerBlk[idxCell];
          const skyL = light >> 4, blkL = light & 15;
          const facing = meta & 3;
          const isOpen = (meta & 4) !== 0;
          const orient = isOpen ? ((facing + 2) & 3) : facing;
          const t = 0.1875;
          let x0 = x, z0 = z, x1 = x + 1, z1 = z + 1;
          if (orient === 0) z1 = z + t;
          else if (orient === 1) z0 = z + 1 - t;
          else if (orient === 2) x1 = x + t;
          else x0 = x + 1 - t;
          const doorTile = id === WOOD_DOOR ? (meta & 8 ? TILES.door_wood : TILES.door_wood_bottom) : (meta & 8 ? TILES.door_iron : TILES.door_iron_bottom);
          const bdTiles = BLOCK_TILES_TABLE[id];
          pushBox(buf, x0, y, z0, x1, y + 1, z1, [bdTiles[0], bdTiles[1], doorTile, doorTile, doorTile, doorTile], skyL, blkL);
          continue;
        }

        if (id === LADDER) {
          const light = (centerSky[idxCell] << 4) | centerBlk[idxCell];
          const skyL = light >> 4, blkL = light & 15;
          const o = 0.04;
          const tile = TILES.ladder;
          const u0 = TILE_U0[tile], v0 = TILE_V0[tile], u1 = TILE_U1[tile], v1 = TILE_V1[tile];
          let attached = false;
          if (getBlock(getB(x, y, z - 1)).solid) {
            writeQuad(buf, x, y, z + o, x + 1, y, z + o, x + 1, y + 1, z + o, x, y + 1, z + o, u0, v0, u1, v0, u1, v1, u0, v1, 0, 0, 1, 0.85, 1, 1, 1, false, skyL, blkL, false);
            attached = true;
          }
          if (getBlock(getB(x, y, z + 1)).solid) {
            writeQuad(buf, x + 1, y, z + 1 - o, x, y, z + 1 - o, x, y + 1, z + 1 - o, x + 1, y + 1, z + 1 - o, u0, v0, u1, v0, u1, v1, u0, v1, 0, 0, -1, 0.85, 1, 1, 1, false, skyL, blkL, false);
            attached = true;
          }
          if (getBlock(getB(x - 1, y, z)).solid) {
            writeQuad(buf, x + o, y, z + 1, x + o, y, z, x + o, y + 1, z, x + o, y + 1, z + 1, u0, v0, u1, v0, u1, v1, u0, v1, 1, 0, 0, 0.85, 1, 1, 1, false, skyL, blkL, false);
            attached = true;
          }
          if (getBlock(getB(x + 1, y, z)).solid || !attached) {
            writeQuad(buf, x + 1 - o, y, z, x + 1 - o, y, z + 1, x + 1 - o, y + 1, z + 1, x + 1 - o, y + 1, z, u0, v0, u1, v0, u1, v1, u0, v1, -1, 0, 0, 0.85, 1, 1, 1, false, skyL, blkL, false);
          }
          continue;
        }

        if (id === CHEST) {
          const light = getL(x, y + 1, z) || ((centerSky[idxCell] << 4) | centerBlk[idxCell]);
          const skyL = light >> 4, blkL = light & 15;
          const frontFace = META_FRONT_FACE[meta & 3];
          pushBox(buf, x + 0.0625, y, z + 0.0625, x + 0.9375, y + 0.875, z + 0.9375, [
            TILES.chest_top, TILES.chest_top,
            frontFace === 2 ? TILES.chest_front : TILES.chest_side,
            frontFace === 3 ? TILES.chest_front : TILES.chest_side,
            frontFace === 4 ? TILES.chest_front : TILES.chest_side,
            frontFace === 5 ? TILES.chest_front : TILES.chest_side,
          ], skyL, blkL);
          continue;
        }

        const isDirectional = id === FURNACE || id === FURNACE_LIT || id === PUMPKIN || id === JACK_O_LANTERN;
        const frontFaceIdx = isDirectional ? META_FRONT_FACE[meta & 3] : 3;
        const tiles = BLOCK_TILES_TABLE[id];
        const isCutout = renderCode === RENDER_CUTOUT_CUBE;
        const hasAO = _useSmooth && !isLava && (renderCode === RENDER_CUBE || renderCode === RENDER_CUTOUT_CUBE);

        for (let f = 0; f < 6; f++) {
          if (renderCode === RENDER_FLAT && f !== 0) continue;
          const face = FACES[f];
          const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];

          const inside = nx >= 0 && nx < CH && nz >= 0 && nz < CH;
          if (!inside) {
            const nci = (nz < 0 ? 0 : nz >= CH ? 6 : 3) + (nx < 0 ? 0 : nx >= CH ? 2 : 1);
            if (!cGen[nci]) continue; // do not flash bright boundary walls while streaming
          }
          const nb = getB(nx, ny, nz);

          let visible = false;
          if (renderCode === RENDER_LIQUID) {
            const sameFluid = isWaterFamily ? (nb === WATER || nb === WATER_FLOW) : (nb === LAVA || nb === LAVA_FLOW);
            visible = !sameFluid && !BLOCK_OPAQUE[nb] && nb !== ICE;
            if (sameFluid && f >= 2) {
              const neighborMeta = getM(nx, ny, nz);
              const thisLevel = (id === WATER_FLOW || id === LAVA_FLOW) ? (meta & 8 ? 0 : meta & 7) : 0;
              const otherLevel = (nb === WATER_FLOW || nb === LAVA_FLOW) ? (neighborMeta & 8 ? 0 : neighborMeta & 7) : 0;
              visible = otherLevel > thisLevel;
            }
            if (f === 0 && nb === AIR) visible = true;
          } else if (renderCode === RENDER_FLAT) {
            visible = !(id === SNOW && getB(x, y + 1, z) !== AIR);
          } else if (id === CACTUS && f >= 2) {
            visible = true; // Cactus sides are inset by 1/16, always visible!
          } else {
            visible = !BLOCK_OPAQUE[nb] && nb !== id;
            if (isCutout && nb === LEAVES) visible = true;
          }
          if (!visible) continue;

          const light = (renderCode === RENDER_FLAT) ? ((centerSky[idxCell] << 4) | centerBlk[idxCell]) : getL(nx, ny, nz);
          const skyL = light >> 4;
          let blkL = isLava ? 15 : (light & 15);

          let tile = tiles[face.tile];
          if (isDirectional && f >= 2) {
            tile = (f === frontFaceIdx) ? tiles[3] : tiles[2];
          } else if (id === FARMLAND && f === 0 && meta > 0) {
            tile = TILES.farmland_wet;
          }

          let ftr = tr, ftg = tg, ftb = tb;
          if (id === REDSTONE_WIRE) {
            if (meta) {
              const glow = 0.45 + meta / 30;
              ftr = 1.15; ftg = glow * 0.7; ftb = glow * 0.7;
              blkL = Math.max(blkL, Math.min(10, 4 + (meta >> 1)));
            } else {
              ftr = 0.45; ftg = 0.35; ftb = 0.35;
            }
          } else if (id === REDSTONE_REPEATER && (meta & 4)) {
            ftr = 1.2; ftg = 0.65; ftb = 0.65;
            blkL = Math.max(blkL, 7);
          } else if (id === 2 /* GRASS */) {
            if (f !== 0) { ftr = 1; ftg = 1; ftb = 1; }
          }

          let yTop = 1.0;
          if (renderCode === RENDER_LIQUID && !(isWaterFamily ? (getB(x, y + 1, z) === WATER || getB(x, y + 1, z) === WATER_FLOW) : (getB(x, y + 1, z) === LAVA || getB(x, y + 1, z) === LAVA_FLOW))) {
            yTop = (id === WATER_FLOW || id === LAVA_FLOW) && !(meta & 8) ? Math.max(0.12, 0.88 - (meta & 7) * 0.1) : 0.88;
          } else if (id === SNOW) yTop = 0.125;
          else if (renderCode === RENDER_FLAT) yTop = 0.04;
          else if (id === FARMLAND) yTop = 0.9375;

          const inset = (id === CACTUS && f >= 2) ? (1 / 16) : 0;
          const c0 = face.corners[0], c1 = face.corners[1], c2 = face.corners[2], c3 = face.corners[3];
          const x0 = x + c0[0] - face.dir[0] * inset, y0 = y + (c0[1] === 1 && yTop < 1 ? yTop : c0[1]), z0 = z + c0[2] - face.dir[2] * inset;
          const x1 = x + c1[0] - face.dir[0] * inset, y1 = y + (c1[1] === 1 && yTop < 1 ? yTop : c1[1]), z1 = z + c1[2] - face.dir[2] * inset;
          const x2 = x + c2[0] - face.dir[0] * inset, y2 = y + (c2[1] === 1 && yTop < 1 ? yTop : c2[1]), z2 = z + c2[2] - face.dir[2] * inset;
          const x3 = x + c3[0] - face.dir[0] * inset, y3 = y + (c3[1] === 1 && yTop < 1 ? yTop : c3[1]), z3 = z + c3[2] - face.dir[2] * inset;

          if (_useSmooth) computeFaceLight(x, y, z, f);
          if (renderCode === RENDER_LIQUID && !isLava) {
            writeQuad(
              buf,
              x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3,
              0.002, 0.002, 0.998, 0.002, 0.998, 0.998, 0.002, 0.998,
              face.dir[0], face.dir[1], face.dir[2],
              face.shade, 1, 1, 1,
              _useSmooth, skyL, blkL, false,
            );
          } else {
            if (hasAO) computeFaceAO(x, y, z, f);
            let u0 = TILE_U0[tile], v0 = TILE_V0[tile], u1 = TILE_U1[tile], v1 = TILE_V1[tile];
            let qu0 = u0, qv0 = v0, qu1 = u1, qv1 = v0, qu2 = u1, qv2 = v1, qu3 = u0, qv3 = v1;

            // Rotate top UV for East-West rails and directional repeaters.
            if (f === 0 && id === RAIL) {
              const hasEW = getB(x - 1, y, z) === RAIL || getB(x + 1, y, z) === RAIL || getB(x - 1, y + 1, z) === RAIL || getB(x + 1, y + 1, z) === RAIL || getB(x - 1, y - 1, z) === RAIL || getB(x + 1, y - 1, z) === RAIL;
              const hasNS = getB(x, y, z - 1) === RAIL || getB(x, y, z + 1) === RAIL || getB(x, y + 1, z - 1) === RAIL || getB(x, y + 1, z + 1) === RAIL || getB(x, y - 1, z - 1) === RAIL || getB(x, y - 1, z + 1) === RAIL;
              if (hasEW && !hasNS) {
                qu0 = u0; qv0 = v1; qu1 = u0; qv1 = v0; qu2 = u1; qv2 = v0; qu3 = u1; qv3 = v1;
              }
            } else if (f === 0 && id === REDSTONE_REPEATER) {
              const rot = meta & 3;
              if (rot === 1) { qu0 = u1; qv0 = v1; qu1 = u0; qv1 = v1; qu2 = u0; qv2 = v0; qu3 = u1; qv3 = v0; }
              else if (rot === 2) { qu0 = u1; qv0 = v0; qu1 = u1; qv1 = v1; qu2 = u0; qv2 = v1; qu3 = u0; qv3 = v0; }
              else if (rot === 3) { qu0 = u0; qv0 = v1; qu1 = u0; qv1 = v0; qu2 = u1; qv2 = v0; qu3 = u1; qv3 = v1; }
            }

            if (isLava) {
              _sky[0] = _sky[1] = _sky[2] = _sky[3] = skyL;
              _blk[0] = _blk[1] = _blk[2] = _blk[3] = 15;
            }
            if (id === REDSTONE_WIRE || id === REDSTONE_REPEATER) {
              for (let i = 0; i < 4; i++) if (_blk[i] < blkL) _blk[i] = blkL;
            }
            writeQuad(
              buf,
              x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3,
              qu0, qv0, qu1, qv1, qu2, qv2, qu3, qv3,
              face.dir[0], face.dir[1], face.dir[2],
              isLava ? 1.0 : face.shade, ftr, ftg, ftb,
              _useSmooth, skyL, blkL, hasAO,
            );
          }
        }
      }
    }
  }

  const outSolid = solid.finish();
  const outCutout = cutout.finish();
  const outWater = water.finish();

  const makeMesh = (buf, material) => {
    if (buf.idx.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(buf.pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(buf.uv, 2));
    g.setAttribute('aTint', new THREE.BufferAttribute(buf.col, 4));
    // The lighting shader consumes this per-vertex pair as sky light / block light.
    // Keep it attached to every solid, cutout, and water mesh; otherwise WebGL's
    // default disabled-attribute value leaves every face effectively unlit.
    g.setAttribute('aLight', new THREE.BufferAttribute(buf.light, 2));
    g.setAttribute('aNormal', new THREE.BufferAttribute(buf.normal, 3));
    g.setIndex(new THREE.BufferAttribute(buf.idx, 1));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material);
    mesh.position.set(wx0, 0, wz0);
    mesh.frustumCulled = true;
    mesh.userData.isChunk = true;
    return mesh;
  };

  return { solid: outSolid, cutout: outCutout, water: outWater, makeMesh };
}
