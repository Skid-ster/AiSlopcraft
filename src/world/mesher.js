// Chunk mesher: builds Three.js geometry with baked beta-style lighting
// (per-face shading + per-vertex light level + biome tint).
import * as THREE from 'three';
import { CH, WORLD_H } from './chunk.js';
import {
  getBlock, AIR, WATER, LAVA, TILES, LEAVES, ICE, CACTUS, TORCH, REDSTONE_TORCH,
  LADDER, SNOW, CROPS, FARMLAND, CHEST, CAKE_BLOCK, WOOD_DOOR, IRON_DOOR,
  FURNACE, FURNACE_LIT, PUMPKIN, JACK_O_LANTERN,
} from './blocks.js';

// Face shade factors (classic Minecraft)
const FACE_SHADE = [1.0, 0.5, 0.8, 0.8, 0.6, 0.6];

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

const ATLAS_COLS = 16;

function tileUV(tile, uMin = 0, vMin = 0, uMax = 1, vMax = 1) {
  const tx = tile % ATLAS_COLS, ty = Math.floor(tile / ATLAS_COLS);
  const s = 1 / ATLAS_COLS;
  const e = 0.00025;
  return [
    (tx + uMin) * s + e,
    1 - (ty + 1 - vMin) * s + e,
    (tx + uMax) * s - e,
    1 - (ty + 1 - vMax) * s - e,
  ];
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

export function buildChunkMesh(world, chunk, atlasTexture, waterTexture, renderDistance) {
  if (chunk.meshes) {
    for (const k of Object.keys(chunk.meshes)) {
      const m = chunk.meshes[k];
      if (m) { world.scene.remove(m); m.geometry.dispose(); }
    }
    chunk.meshes = null;
  }

  const solid = { pos: [], uv: [], col: [], light: [], normal: [], idx: [] };
  const cutout = { pos: [], uv: [], col: [], light: [], normal: [], idx: [] };
  const water = { pos: [], uv: [], col: [], light: [], normal: [], idx: [] };
  const wx0 = chunk.cx * CH, wz0 = chunk.cz * CH;

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

  // Corner occlusion adds gentle contact shadows where terrain blocks meet,
  // giving the world depth without realtime shadow maps or extra draw calls.
  const faceOcclusion = (x, y, z, face) => {
    const tangentAxes = [0, 1, 2].filter(axis => face.dir[axis] === 0);
    return face.corners.map(corner => {
      const signs = tangentAxes.map(axis => corner[axis] === 1 ? 1 : -1);
      const base = [x + face.dir[0], y + face.dir[1], z + face.dir[2]];
      const a = [...base], b = [...base], diagonal = [...base];
      a[tangentAxes[0]] += signs[0];
      b[tangentAxes[1]] += signs[1];
      diagonal[tangentAxes[0]] += signs[0];
      diagonal[tangentAxes[1]] += signs[1];
      const occupied = point => getBlock(getB(point[0], point[1], point[2])).solid;
      const sideA = occupied(a), sideB = occupied(b), cornerBlock = occupied(diagonal);
      if (sideA && sideB) return 0.68;
      return 1 - (Number(sideA) + Number(sideB) + Number(cornerBlock)) * 0.10;
    });
  };

  const pushQuad = (buf, corners, tile, shade, skyL, blkL, tint, alpha = 1, uvRect = null, vertexShade = null) => {
    const [u0, v0, u1, v1] = uvRect
      ? tileUV(tile, uvRect[0], uvRect[1], uvRect[2], uvRect[3])
      : tileUV(tile);
    const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    const base = buf.pos.length / 3;
    const e1 = corners[1].map((value, axis) => value - corners[0][axis]);
    const e2 = corners[2].map((value, axis) => value - corners[0][axis]);
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const normalLength = Math.hypot(cross[0], cross[1], cross[2]) || 1;
    const normal = cross.map(value => value / normalLength);
    for (let i = 0; i < 4; i++) {
      const c = corners[i];
      buf.pos.push(c[0], c[1], c[2]);
      buf.uv.push(uvs[i][0], uvs[i][1]);
      const vertexLight = vertexShade?.[i] ?? 1;
      buf.col.push(shade * tint[0] * vertexLight, shade * tint[1] * vertexLight, shade * tint[2] * vertexLight, alpha);
      buf.light.push(skyL, blkL);
      buf.normal.push(normal[0], normal[1], normal[2]);
    }
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  const pushBox = (buf, x0, y0, z0, x1, y1, z1, tiles, skyL, blkL, tint = WHITE_TINT, uvRects = null) => {
    const boxFaces = [
      { shade: 1.0, tile: tiles[0], corners: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]] },
      { shade: 0.5, tile: tiles[1], corners: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] },
      { shade: 0.8, tile: tiles[2], corners: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },
      { shade: 0.8, tile: tiles[3], corners: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]] },
      { shade: 0.6, tile: tiles[4], corners: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]] },
      { shade: 0.6, tile: tiles[5], corners: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]] },
    ];
    for (let f = 0; f < 6; f++) {
      const bf = boxFaces[f];
      pushQuad(buf, bf.corners, bf.tile, bf.shade, skyL, blkL, tint, 1, uvRects ? uvRects[f] : null);
    }
  };

  for (let y = 0; y < WORLD_H; y++) {
    for (let z = 0; z < CH; z++) {
      for (let x = 0; x < CH; x++) {
        const id = chunk.get(x, y, z);
        if (id === AIR) continue;
        const bd = getBlock(id);
        if (!bd.tiles) continue;
        const meta = chunk.getMeta(x, y, z);

        const biome = biomeAt(x, z);
        let biomeTint = WHITE_TINT;
        if (bd.tint === 'grass') biomeTint = grassColor(biome.temp, biome.hum);
        else if (bd.tint === 'foliage') biomeTint = foliageColor(biome.temp, biome.hum);

        const isLava = id === LAVA || id === 10;
        let buf = solid;
        if (bd.render === 'liquid') buf = isLava ? solid : water;
        else if (bd.render !== 'cube') buf = cutout;

        if (bd.render === 'cross') {
          const light = getL(x, y, z);
          const skyL = light >> 4, blkL = light & 15;
          const tile = id === CROPS ? (TILES.crops0 + Math.min(7, meta & 7)) : bd.tiles[2];
          const cornersSets = [
            [[x + 0.1, y, z + 0.1], [x + 0.9, y, z + 0.9], [x + 0.9, y + 1, z + 0.9], [x + 0.1, y + 1, z + 0.1]],
            [[x + 0.9, y, z + 0.1], [x + 0.1, y, z + 0.9], [x + 0.1, y + 1, z + 0.9], [x + 0.9, y + 1, z + 0.1]],
          ];
          for (const corners of cornersSets) {
            pushQuad(buf, corners, tile, 0.95, skyL, blkL, biomeTint);
          }
          continue;
        }

        if (bd.render === 'torch') {
          const light = getL(x, y, z);
          const skyL = light >> 4, blkL = Math.max(light & 15, id === TORCH ? 14 : 7);
          const w = 1 / 16;
          const cx = x + 0.5, cz = z + 0.5;
          const h = 0.625;
          const torchTile = TILES.torch;
          const sideRect = [7 / 16, 0, 9 / 16, 10 / 16];
          const topRect = [7 / 16, 10 / 16, 9 / 16, 12 / 16];
          pushBox(
            buf,
            cx - w, y, cz - w,
            cx + w, y + h, cz + w,
            [torchTile, torchTile, torchTile, torchTile, torchTile, torchTile],
            skyL, blkL,
            id === REDSTONE_TORCH ? [1.15, 0.45, 0.45] : WHITE_TINT,
            [topRect, sideRect, sideRect, sideRect, sideRect, sideRect],
          );
          continue;
        }

        if (bd.render === 'slab') {
          const light = getL(x, y, z);
          const skyL = light >> 4, blkL = light & 15;
          if (id === CAKE_BLOCK) {
            const eaten = Math.min(5, meta & 7);
            const x0 = x + 0.0625 + eaten * 0.125;
            pushBox(buf, x0, y, z + 0.0625, x + 0.9375, y + 0.5, z + 0.9375, bd.tiles, skyL, blkL);
          } else {
            // Bed slab
            pushBox(buf, x, y, z, x + 1, y + 0.5625, z + 1, bd.tiles, skyL, blkL);
          }
          continue;
        }

        if (bd.render === 'door') {
          const light = getL(x, y, z);
          const skyL = light >> 4, blkL = light & 15;
          const facing = meta & 3;
          const isOpen = (meta & 4) !== 0;
          // Closed door sits along its facing edge; open door swings 90 degrees
          const orient = isOpen ? ((facing + 2) & 3) : facing;
          const t = 0.1875;
          let x0 = x, z0 = z, x1 = x + 1, z1 = z + 1;
          if (orient === 0) z1 = z + t;
          else if (orient === 1) z0 = z + 1 - t;
          else if (orient === 2) x1 = x + t;
          else x0 = x + 1 - t;
          pushBox(buf, x0, y, z0, x1, y + 1, z1, bd.tiles, skyL, blkL);
          continue;
        }

        if (id === LADDER) {
          const light = getL(x, y, z);
          const skyL = light >> 4, blkL = light & 15;
          const o = 0.04;
          let attached = false;
          // Attach ladder flush against solid neighbor walls
          if (getBlock(getB(x, y, z - 1)).solid) {
            pushQuad(buf, [[x, y, z + o], [x + 1, y, z + o], [x + 1, y + 1, z + o], [x, y + 1, z + o]], TILES.ladder, 0.85, skyL, blkL, WHITE_TINT);
            attached = true;
          }
          if (getBlock(getB(x, y, z + 1)).solid) {
            pushQuad(buf, [[x + 1, y, z + 1 - o], [x, y, z + 1 - o], [x, y + 1, z + 1 - o], [x + 1, y + 1, z + 1 - o]], TILES.ladder, 0.85, skyL, blkL, WHITE_TINT);
            attached = true;
          }
          if (getBlock(getB(x - 1, y, z)).solid) {
            pushQuad(buf, [[x + o, y, z + 1], [x + o, y, z], [x + o, y + 1, z], [x + o, y + 1, z + 1]], TILES.ladder, 0.85, skyL, blkL, WHITE_TINT);
            attached = true;
          }
          if (getBlock(getB(x + 1, y, z)).solid || !attached) {
            pushQuad(buf, [[x + 1 - o, y, z], [x + 1 - o, y, z + 1], [x + 1 - o, y + 1, z + 1], [x + 1 - o, y + 1, z]], TILES.ladder, 0.85, skyL, blkL, WHITE_TINT);
          }
          continue;
        }

        if (id === CHEST) {
          const light = getL(x, y + 1, z) || getL(x, y, z);
          const skyL = light >> 4, blkL = light & 15;
          const frontFace = META_FRONT_FACE[meta & 3];
          const chestTiles = [
            TILES.chest_top, TILES.chest_top,
            frontFace === 2 ? TILES.chest_front : TILES.chest_side,
            frontFace === 3 ? TILES.chest_front : TILES.chest_side,
            frontFace === 4 ? TILES.chest_front : TILES.chest_side,
            frontFace === 5 ? TILES.chest_front : TILES.chest_side,
          ];
          pushBox(buf, x + 0.0625, y, z + 0.0625, x + 0.9375, y + 0.875, z + 0.9375, chestTiles, skyL, blkL);
          continue;
        }

        const isDirectional = id === FURNACE || id === FURNACE_LIT || id === PUMPKIN || id === JACK_O_LANTERN;
        const frontFaceIdx = isDirectional ? META_FRONT_FACE[meta & 3] : 3;

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
          const nb = getB(nx, ny, nz);
          const nbd = getBlock(nb);

          let visible = false;
          if (bd.render === 'liquid') {
            visible = nb !== id && !nbd.opaque && nb !== ICE;
            if (f === 0 && nb === AIR) visible = true;
          } else if (bd.render === 'flat') {
            visible = (f === 0);
            if (id === SNOW && getB(x, y + 1, z) !== AIR) visible = false;
          } else if (id === CACTUS && f >= 2) {
            visible = true; // Cactus sides are inset by 1/16, always visible!
          } else {
            visible = !nbd.opaque && nb !== id;
            if (bd.render === 'cutout' && nb === LEAVES) visible = true;
          }
          if (!visible) continue;

          const light = (bd.render === 'flat') ? getL(x, y, z) : getL(nx, ny, nz);
          const skyL = light >> 4;
          const blkL = isLava ? 15 : (light & 15);

          let tile = bd.tiles[face.tile];
          if (isDirectional && f >= 2) {
            tile = (f === frontFaceIdx) ? bd.tiles[3] : bd.tiles[2];
          } else if (id === FARMLAND && f === 0 && meta > 0) {
            tile = TILES.farmland_wet;
          }

          // Only tint top face of GRASS; tint all faces of foliage blocks (LEAVES)
          const faceTint = (bd.tint === 'grass') ? (f === 0 ? biomeTint : WHITE_TINT) : biomeTint;

          let yTop = 1.0;
          if (bd.render === 'liquid' && getB(x, y + 1, z) !== id) yTop = 0.88;
          else if (id === SNOW) yTop = 0.125;
          else if (bd.render === 'flat') yTop = 0.04;
          else if (id === FARMLAND) yTop = 0.9375;

          const inset = (id === CACTUS && f >= 2) ? (1 / 16) : 0;
          const corners = face.corners.map(c => {
            let cx = x + c[0];
            let cy = y + (c[1] === 1 && yTop < 1 ? yTop : c[1]);
            let cz = z + c[2];
            if (inset > 0) {
              cx -= face.dir[0] * inset;
              cz -= face.dir[2] * inset;
            }
            return [cx, cy, cz];
          });

          if (bd.render === 'liquid' && !isLava) {
            // Water uses standalone 16x16 animated waterTex: map full [0..1] UVs!
            const base = buf.pos.length / 3;
            for (const c of corners) buf.pos.push(c[0], c[1], c[2]);
            buf.uv.push(0.002, 0.002, 0.998, 0.002, 0.998, 0.998, 0.002, 0.998);
            for (let i = 0; i < 4; i++) {
              buf.col.push(face.shade, face.shade, face.shade, 0.82);
              buf.light.push(skyL, blkL);
              buf.normal.push(face.dir[0], face.dir[1], face.dir[2]);
            }
            buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          } else {
            const ao = !isLava && (bd.render === 'cube' || bd.render === 'cutout')
              ? faceOcclusion(x, y, z, face)
              : null;
            pushQuad(buf, corners, tile, isLava ? 1.0 : face.shade, skyL, blkL, faceTint, 1, null, ao);
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
    // The lighting shader consumes this per-vertex pair as sky light / block light.
    // Keep it attached to every solid, cutout, and water mesh; otherwise WebGL's
    // default disabled-attribute value leaves every face effectively unlit.
    g.setAttribute('aLight', new THREE.Float32BufferAttribute(buf.light, 2));
    g.setAttribute('aNormal', new THREE.Float32BufferAttribute(buf.normal, 3));
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
