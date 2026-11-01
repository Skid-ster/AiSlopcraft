// Procedural 16x16 pixel-art texture atlas mimicking Minecraft Beta 1.7.3 textures.
import * as THREE from 'three';
import { TILES } from './blocks.js';
import { applyClassicTextures } from './classic-textures.js';

const TS = 16;
const COLS = 16;

function px(ctx, x, y, r, g, b, a = 255) {
  if (a === 0) { ctx.clearRect(x, y, 1, 1); return; }
  ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${a / 255})`;
  ctx.fillRect(x, y, 1, 1);
}

// Deterministic per-tile RNG so textures are stable
function tileRand(seed) {
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13; s |= 0;
    s ^= s >>> 17;
    s ^= s << 5; s |= 0;
    return ((s >>> 0) / 4294967296);
  };
}

function noiseFill(ctx, ox, oy, base, vary, rnd, alpha = 255) {
  for (let y = 0; y < TS; y++) {
    for (let x = 0; x < TS; x++) {
      const v = (rnd() - 0.5) * 2 * vary;
      px(ctx, ox + x, oy + y, base[0] + v, base[1] + v, base[2] + v, alpha);
    }
  }
}

function blob(ctx, ox, oy, cx, cy, r, color, rnd) {
  for (let y = 0; y < TS; y++) {
    for (let x = 0; x < TS; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy) + (rnd() - 0.5) * 1.6;
      if (d < r) px(ctx, ox + x, oy + y, color[0], color[1], color[2], color[3] ?? 255);
    }
  }
}

export function buildAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * TS;
  canvas.height = COLS * TS;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const put = (tile, drawFn) => {
    const ox = (tile % COLS) * TS, oy = Math.floor(tile / COLS) * TS;
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, TS, TS); ctx.clip();
    drawFn(ox, oy, tileRand(tile * 7919 + 17));
    ctx.restore();
  };

  // --- terrain ---
  put(TILES.grass_top, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [126, 192, 68], 16, rnd);
    for (let i = 0; i < 14; i++) {
      const x = (rnd() * TS) | 0, y = (rnd() * TS) | 0;
      px(ctx, ox + x, oy + y, 102, 166, 50, 235);
    }
  });
  put(TILES.grass_side, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [134, 96, 67], 16, rnd);
    // grass fringe on top
    for (let x = 0; x < TS; x++) {
      const h = 2 + ((rnd() * 3) | 0);
      for (let y = 0; y < h; y++) {
        const v = (rnd() - 0.5) * 20;
        px(ctx, ox + x, oy + y, 122 + v, 186 + v, 64 + v);
      }
    }
  });
  put(TILES.dirt, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [134, 96, 67], 18, rnd);
    for (let i = 0; i < 8; i++) {
      const x = (rnd() * TS) | 0, y = (rnd() * TS) | 0;
      px(ctx, ox + x, oy + y, 108, 74, 48);
    }
  });
  put(TILES.stone, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [125, 125, 125], 12, rnd);
    for (let i = 0; i < 10; i++) {
      const x = (rnd() * TS) | 0, y = (rnd() * TS) | 0;
      px(ctx, ox + x, oy + y, 100, 100, 100);
      if (rnd() > 0.5) px(ctx, ox + x + 1, oy + y, 108, 108, 108);
    }
    for (let i = 0; i < 6; i++) {
      const x = (rnd() * TS) | 0, y = (rnd() * TS) | 0;
      px(ctx, ox + x, oy + y, 148, 148, 148);
    }
  });
  put(TILES.cobble, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [110, 110, 110], 8, rnd);
    // chunky rocks
    for (let i = 0; i < 9; i++) {
      const x = 1 + (rnd() * (TS - 4)) | 0, y = 1 + (rnd() * (TS - 4)) | 0;
      const w = 2 + (rnd() * 4) | 0, h = 2 + (rnd() * 4) | 0;
      const shade = 128 + (rnd() * 40 - 20);
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        const v = (rnd() - 0.5) * 16;
        px(ctx, ox + x + xx, oy + y + yy, shade + v, shade + v, shade + v);
      }
      // dark outline
      for (let xx = 0; xx < w; xx++) px(ctx, ox + x + xx, oy + y + h, 70, 70, 70);
      for (let yy = 0; yy < h; yy++) px(ctx, ox + x + w, oy + y + yy, 70, 70, 70);
    }
  });
  put(TILES.mossy_cobble, (ox, oy, rnd) => {
    // cobble base
    noiseFill(ctx, ox, oy, [100, 110, 90], 8, rnd);
    for (let i = 0; i < 9; i++) {
      const x = 1 + (rnd() * (TS - 4)) | 0, y = 1 + (rnd() * (TS - 4)) | 0;
      const w = 2 + (rnd() * 4) | 0, h = 2 + (rnd() * 4) | 0;
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        const moss = rnd() > 0.45;
        const v = (rnd() - 0.5) * 14;
        if (moss) px(ctx, ox + x + xx, oy + y + yy, 82 + v, 118 + v, 56 + v);
        else px(ctx, ox + x + xx, oy + y + yy, 118 + v, 118 + v, 108 + v);
      }
    }
  });
  put(TILES.bedrock, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [70, 70, 70], 30, rnd);
    for (let i = 0; i < 12; i++) {
      const x = (rnd() * TS) | 0, y = (rnd() * TS) | 0, w = 1 + (rnd() * 4) | 0;
      const dark = rnd() > 0.5;
      for (let xx = 0; xx < w; xx++) px(ctx, ox + x + xx, oy + y, dark ? 30 : 120, dark ? 30 : 120, dark ? 30 : 120);
    }
  });
  put(TILES.sand, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [219, 207, 163], 12, rnd);
    for (let i = 0; i < 10; i++) {
      const x = (rnd() * TS) | 0, y = (rnd() * TS) | 0;
      px(ctx, ox + x, oy + y, 196, 184, 140);
    }
  });
  put(TILES.gravel, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [126, 124, 122], 16, rnd);
    for (let i = 0; i < 22; i++) {
      const x = (rnd() * TS) | 0, y = (rnd() * TS) | 0;
      const s = 150 + rnd() * 50 - 25;
      const w = 1 + (rnd() * 3) | 0;
      for (let xx = 0; xx < w; xx++) {
        px(ctx, ox + x + xx, oy + y, s, s - 4, s - 8);
      }
    }
  });
  put(TILES.log_side, (ox, oy, rnd) => {
    for (let x = 0; x < TS; x++) {
      const base = x % 4 === 0 ? 88 : x % 4 === 2 ? 122 : 104;
      for (let y = 0; y < TS; y++) {
        const v = (rnd() - 0.5) * 14;
        px(ctx, ox + x, oy + y, base + v, (base * 0.72) + v, (base * 0.42) + v);
      }
    }
    for (let i = 0; i < 5; i++) {
      const x = (rnd() * TS) | 0, y0 = (rnd() * TS) | 0;
      for (let y = 0; y < 5; y++) px(ctx, ox + x, oy + ((y0 + y) % TS), 72, 50, 28);
    }
  });
  put(TILES.log_top, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [154, 126, 82], 10, rnd);
    // rings
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      const ring = Math.sin(d * 2.1) > 0.25;
      if (ring) {
        const v = (rnd() - 0.5) * 10;
        px(ctx, ox + x, oy + y, 122 + v, 96 + v, 58 + v);
      }
    }
  });
  put(TILES.leaves, (ox, oy, rnd) => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const r = rnd();
      if (r < 0.22) { px(ctx, ox + x, oy + y, 0, 0, 0, 0); } // holes for fancy leaves
      else {
        const v = (rnd() - 0.5) * 28;
        px(ctx, ox + x, oy + y, 76 + v, 152 + v, 46 + v);
      }
    }
  });
  put(TILES.planks, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [156, 128, 78], 10, rnd);
    for (let y = 0; y < TS; y++) {
      if (y % 4 === 3) for (let x = 0; x < TS; x++) px(ctx, ox + x, oy + y, 116, 92, 52);
      const knotX = (rnd() * TS) | 0;
      if (y % 4 === 1) {
        px(ctx, ox + knotX, oy + y, 130, 104, 62);
        px(ctx, ox + (knotX + 1) % TS, oy + y, 124, 98, 58);
      }
    }
  });
  put(TILES.glass, (ox, oy, rnd) => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const edge = x === 0 || y === 0 || x === TS - 1 || y === TS - 1;
      const streak = (x + y === 10 || x + y === 11 || x - y === 4);
      if (edge) px(ctx, ox + x, oy + y, 220, 236, 240, 200);
      else if (streak) px(ctx, ox + x, oy + y, 240, 250, 252, 120);
      else px(ctx, ox + x, oy + y, 255, 255, 255, 0);
    }
  });
  put(TILES.water, (ox, oy, rnd) => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const v = (rnd() - 0.5) * 22;
      const wave = Math.sin((x + y * 1.7) * 0.9) * 8;
      px(ctx, ox + x, oy + y, 40 + v + wave, 78 + v + wave, 190 + v + wave, 175);
    }
  });
  put(TILES.lava, (ox, oy, rnd) => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const v = rnd();
      const wave = Math.sin(x * 0.8) * Math.cos(y * 0.7) * 20;
      if (v < 0.18) px(ctx, ox + x, oy + y, 255, 220, 80);
      else px(ctx, ox + x, oy + y, 207 + wave + v * 40, 92 + v * 60, 16);
    }
  });
  put(TILES.sandstone_top, (ox, oy, rnd) => noiseFill(ctx, ox, oy, [216, 204, 158], 8, rnd));
  put(TILES.sandstone_bottom, (ox, oy, rnd) => noiseFill(ctx, ox, oy, [196, 182, 136], 10, rnd));
  put(TILES.sandstone_side, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [216, 204, 158], 8, rnd);
    for (let x = 0; x < TS; x++) { px(ctx, ox + x, oy + 3, 180, 166, 122); px(ctx, ox + x, oy + 11, 186, 172, 128); }
    for (let i = 0; i < 6; i++) px(ctx, ox + (rnd() * TS) | 0, oy + (rnd() * TS) | 0, 188, 174, 130);
  });

  // --- wool colors ---
  const woolBase = {
    [TILES.wool_white]: [222, 222, 222], [TILES.wool_red]: [160, 44, 36],
    [TILES.wool_orange]: [216, 128, 24], [TILES.wool_yellow]: [202, 186, 48],
    [TILES.wool_lime]: [108, 168, 32], [TILES.wool_green]: [82, 108, 40],
    [TILES.wool_cyan]: [36, 132, 148], [TILES.wool_lightblue]: [100, 140, 200],
    [TILES.wool_blue]: [48, 56, 142], [TILES.wool_purple]: [116, 44, 168],
    [TILES.wool_magenta]: [186, 62, 186], [TILES.wool_pink]: [222, 140, 162],
    [TILES.wool_gray]: [68, 68, 68], [TILES.wool_lightgray]: [142, 142, 142],
    [TILES.wool_brown]: [106, 68, 36], [TILES.wool_black]: [32, 32, 32],
  };
  for (const [tile, base] of Object.entries(woolBase)) {
    put(Number(tile), (ox, oy, rnd) => {
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
        const v = ((x + y) % 2 === 0 ? 1 : -1) * 6 + (rnd() - 0.5) * 10;
        px(ctx, ox + x, oy + y, base[0] + v, base[1] + v, base[2] + v);
      }
    });
  }

  // --- ores ---
  const oreTile = (tile, color) => put(tile, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [125, 125, 125], 12, rnd);
    for (let i = 0; i < 7; i++) {
      const x = 1 + (rnd() * (TS - 3)) | 0, y = 1 + (rnd() * (TS - 3)) | 0;
      const w = 2 + (rnd() * 3) | 0, h = 2 + (rnd() * 3) | 0;
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        if (rnd() > 0.2) {
          const v = (rnd() - 0.5) * 18;
          px(ctx, ox + x + xx, oy + y + yy, color[0] + v, color[1] + v, color[2] + v);
        }
      }
    }
  });
  oreTile(TILES.coal_ore, [32, 32, 32]);
  oreTile(TILES.iron_ore, [200, 166, 130]);
  oreTile(TILES.gold_ore, [246, 216, 72]);
  oreTile(TILES.diamond_ore, [96, 226, 220]);
  oreTile(TILES.redstone_ore, [222, 36, 36]);
  oreTile(TILES.lapis_ore, [48, 76, 188]);

  // --- misc blocks ---
  put(TILES.clay, (ox, oy, rnd) => noiseFill(ctx, ox, oy, [158, 164, 176], 10, rnd));
  put(TILES.snow, (ox, oy, rnd) => noiseFill(ctx, ox, oy, [238, 246, 250], 8, rnd));
  put(TILES.snow_block, (ox, oy, rnd) => noiseFill(ctx, ox, oy, [236, 244, 250], 7, rnd));
  put(TILES.ice, (ox, oy, rnd) => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const v = (rnd() - 0.5) * 14;
      px(ctx, ox + x, oy + y, 146 + v, 182 + v, 238 + v, 218);
    }
  });
  put(TILES.obsidian, (ox, oy, rnd) => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const v = rnd() * 18;
      px(ctx, ox + x, oy + y, 12 + v, 8 + v, 22 + v);
    }
    for (let i = 0; i < 8; i++) px(ctx, ox + (rnd() * TS) | 0, oy + (rnd() * TS) | 0, 48, 32, 82);
  });
  put(TILES.glowstone, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [180, 140, 84], 14, rnd);
    for (let i = 0; i < 16; i++) {
      const x = (rnd() * TS) | 0, y = (rnd() * TS) | 0;
      px(ctx, ox + x, oy + y, 255, 220, 140);
      px(ctx, ox + (x + 1) % TS, oy + y, 250, 210, 130);
    }
  });
  put(TILES.netherrack, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [122, 52, 52], 16, rnd);
    for (let i = 0; i < 12; i++) px(ctx, ox + (rnd() * TS) | 0, oy + (rnd() * TS) | 0, 88, 32, 32);
  });
  put(TILES.slow_sand, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [116, 92, 68], 12, rnd);
    for (let i = 0; i < 10; i++) px(ctx, ox + (rnd() * TS) | 0, oy + (rnd() * TS) | 0, 82, 62, 44);
  });
  put(TILES.stone_brick, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [122, 122, 122], 10, rnd);
    for (let x = 0; x < TS; x++) {
      px(ctx, ox + x, oy + 7, 92, 92, 92); px(ctx, ox + x, oy + 8, 92, 92, 92);
      px(ctx, ox + x, oy + 0, 100, 100, 100); px(ctx, ox + x, oy + 15, 100, 100, 100);
    }
    for (let y = 0; y < 8; y++) px(ctx, ox + 7, oy + y, 92, 92, 92);
    for (let y = 8; y < 16; y++) px(ctx, ox + 12, oy + y, 92, 92, 92);
    for (let y = 8; y < 16; y++) px(ctx, ox + 3, oy + y, 92, 92, 92);
  });
  put(TILES.iron_block, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [220, 220, 220], 12, rnd);
    for (let x = 0; x < TS; x++) { px(ctx, ox + x, oy, 180, 180, 180); px(ctx, ox + x, oy + 15, 180, 180, 180); }
  });
  put(TILES.gold_block, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [248, 212, 64], 12, rnd);
    for (let x = 0; x < TS; x++) { px(ctx, ox + x, oy, 212, 172, 42); px(ctx, ox + x, oy + 15, 212, 172, 42); }
  });
  put(TILES.diamond_block, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [108, 230, 220], 12, rnd);
    for (let i = 0; i < 6; i++) {
      const x = (rnd() * TS) | 0, y = (rnd() * TS) | 0;
      px(ctx, ox + x, oy + y, 220, 255, 252);
    }
  });
  put(TILES.bookshelf, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [156, 128, 78], 8, rnd);
    const cols = [[160, 44, 36], [48, 56, 142], [82, 108, 40], [202, 186, 48], [116, 44, 168], [36, 132, 148]];
    for (let shelf = 0; shelf < 2; shelf++) {
      const y0 = shelf * 8 + 1;
      let x = 1;
      while (x < TS - 1) {
        const w = 2 + ((rnd() * 2) | 0);
        const c = cols[(rnd() * cols.length) | 0];
        for (let xx = 0; xx < w && x + xx < TS - 1; xx++) {
          for (let yy = 0; yy < 5; yy++) px(ctx, ox + x + xx, oy + y0 + yy, c[0], c[1], c[2]);
        }
        x += w + 1;
      }
      for (let xx = 0; xx < TS; xx++) px(ctx, ox + xx, oy + y0 + 6, 116, 92, 52);
    }
  });
  put(TILES.brick, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [158, 88, 72], 10, rnd);
    for (let x = 0; x < TS; x++) {
      px(ctx, ox + x, oy + 0, 196, 196, 196); px(ctx, ox + x, oy + 7, 196, 196, 196);
      px(ctx, ox + x, oy + 8, 196, 196, 196); px(ctx, ox + x, oy + 15, 196, 196, 196);
    }
    for (let y = 1; y < 7; y++) px(ctx, ox + 7, oy + y, 196, 196, 196);
    for (let y = 9; y < 15; y++) { px(ctx, ox + 3, oy + y, 196, 196, 196); px(ctx, ox + 12, oy + y, 196, 196, 196); }
  });
  put(TILES.tnt_top, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [180, 48, 40], 12, rnd);
    for (let i = 0; i < 24; i++) px(ctx, ox + (rnd() * TS) | 0, oy + (rnd() * TS) | 0, 232, 214, 214);
  });
  put(TILES.tnt_bottom, (ox, oy, rnd) => noiseFill(ctx, ox, oy, [140, 40, 34], 12, rnd));
  put(TILES.tnt_side, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [180, 48, 40], 10, rnd);
    for (let y = 3; y < 12; y++) for (let x = 0; x < TS; x++) {
      px(ctx, ox + x, oy + y, 222, 222, 222);
    }
    // "TNT" letter blocks
    const letter = [
      [1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1],
      [0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1],
      [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 1],
    ];
    for (let ly = 0; ly < 3; ly++) for (let lx = 0; lx < 13; lx++) {
      if (letter[ly][lx]) {
        for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++)
          px(ctx, ox + 1 + lx * 2 + xx, oy + 5 + ly * 2 + yy, 40, 24, 20);
      }
    }
  });
  put(TILES.crafting_top, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [156, 128, 78], 8, rnd);
    for (let x = 0; x < TS; x++) { px(ctx, ox + x, oy, 110, 88, 50); px(ctx, ox + x, oy + 15, 110, 88, 50); }
    for (let y = 0; y < TS; y++) { px(ctx, ox, oy + y, 110, 88, 50); px(ctx, ox + 15, oy + y, 110, 88, 50); }
    // grid lines
    for (let i = 0; i < TS; i++) {
      px(ctx, ox + 5, oy + i, 110, 88, 50); px(ctx, ox + 10, oy + i, 110, 88, 50);
      px(ctx, ox + i, oy + 5, 110, 88, 50); px(ctx, ox + i, oy + 10, 110, 88, 50);
    }
  });
  put(TILES.crafting_side, (ox, oy, rnd) => {
    putPlanks: {
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
        const v = (rnd() - 0.5) * 10;
        px(ctx, ox + x, oy + y, 156 + v, 128 + v, 78 + v);
      }
    }
    for (let x = 0; x < TS; x++) px(ctx, ox + x, oy + 8, 110, 88, 50);
  });
  put(TILES.crafting_front, (ox, oy, rnd) => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const v = (rnd() - 0.5) * 10;
      px(ctx, ox + x, oy + y, 156 + v, 128 + v, 78 + v);
    }
    // saw + hammer marks
    for (let y = 3; y < 12; y++) for (let x = 2; x < 13; x++) {
      if ((x + y) % 5 === 0) px(ctx, ox + x, oy + y, 112, 88, 52);
    }
    for (let x = 0; x < TS; x++) px(ctx, ox + x, oy + 8, 110, 88, 50);
  });
  put(TILES.furnace_top, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [110, 110, 110], 10, rnd);
    for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) px(ctx, ox + x, oy + y, 92, 92, 92);
  });
  put(TILES.furnace_side, (ox, oy, rnd) => noiseFill(ctx, ox, oy, [116, 116, 116], 12, rnd));
  put(TILES.furnace_front, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [116, 116, 116], 12, rnd);
    for (let y = 4; y < 13; y++) for (let x = 3; x < 13; x++) px(ctx, ox + x, oy + y, 42, 42, 42);
    for (let y = 10; y < 13; y++) for (let x = 4; x < 12; x++) px(ctx, ox + x, oy + y, 62, 62, 62);
    for (let x = 3; x < 13; x++) px(ctx, ox + x, oy + 4, 88, 88, 88);
  });
  put(TILES.furnace_front_lit, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [116, 116, 116], 12, rnd);
    for (let y = 4; y < 13; y++) for (let x = 3; x < 13; x++) px(ctx, ox + x, oy + y, 62, 42, 22);
    for (let y = 9; y < 13; y++) for (let x = 4; x < 12; x++) {
      const v = rnd();
      px(ctx, ox + x, oy + y, 248, 168 + v * 60, 40);
    }
    for (let x = 3; x < 13; x++) px(ctx, ox + x, oy + 4, 88, 88, 88);
  });
  put(TILES.pumpkin_side, (ox, oy, rnd) => {
    for (let x = 0; x < TS; x++) {
      const ridge = x % 4 === 0;
      for (let y = 0; y < TS; y++) {
        const v = (rnd() - 0.5) * 14;
        if (ridge) px(ctx, ox + x, oy + y, 168 + v, 88 + v, 18 + v);
        else px(ctx, ox + x, oy + y, 204 + v, 118 + v, 28 + v);
      }
    }
  });
  put(TILES.pumpkin_top, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [196, 112, 26], 12, rnd);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
      if (d > 6) px(ctx, ox + x, oy + y, 150, 78, 18);
    }
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) px(ctx, ox + x, oy + y, 96, 122, 40);
  });
  put(TILES.pumpkin_face, (ox, oy, rnd) => {
    for (let x = 0; x < TS; x++) {
      const ridge = x % 4 === 0;
      for (let y = 0; y < TS; y++) {
        const v = (rnd() - 0.5) * 14;
        if (ridge) px(ctx, ox + x, oy + y, 168 + v, 88 + v, 18 + v);
        else px(ctx, ox + x, oy + y, 204 + v, 118 + v, 28 + v);
      }
    }
    // carved face
    const eye = (x0, y0) => {
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
        if (!(x === 2 && y === 0) && !(x === 0 && y === 2)) px(ctx, ox + x0 + x, oy + y0 + y, 48, 30, 12);
      }
    };
    eye(3, 4); eye(10, 4);
    for (let y = 9; y < 12; y++) for (let x = 4; x < 12; x++) {
      const mouth = y === 9 ? (x >= 5 && x <= 10) : y === 10 ? (x === 4 || x === 11 || (x >= 5 && x <= 10)) : (x === 5 || x === 10);
      if (mouth) px(ctx, ox + x, oy + y, 48, 30, 12);
    }
  });
  put(TILES.cactus_side, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [66, 122, 38], 10, rnd);
    for (let y = 0; y < TS; y++) {
      px(ctx, ox + 1, oy + y, 42, 88, 26); px(ctx, ox + 14, oy + y, 42, 88, 26);
      px(ctx, ox + 2, oy + y, 88, 148, 52);
    }
    for (let i = 0; i < 8; i++) px(ctx, ox + 4 + (rnd() * 8) | 0, oy + (rnd() * TS) | 0, 150, 190, 110);
  });
  put(TILES.cactus_top, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [88, 148, 52], 10, rnd);
    for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) px(ctx, ox + x, oy + y, 66, 122, 38);
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) px(ctx, ox + x, oy + y, 48, 92, 28);
  });
  put(TILES.sugarcane, (ox, oy, rnd) => {
    for (let x = 0; x < TS; x++) for (let y = 0; y < TS; y++) px(ctx, ox + x, oy + y, 0, 0, 0, 0);
    for (let x = 4; x < 12; x++) for (let y = 0; y < TS; y++) {
      const edge = x === 4 || x === 11;
      const v = (rnd() - 0.5) * 12;
      px(ctx, ox + x, oy + y, edge ? 108 + v : 148 + v, edge ? 172 + v : 210 + v, edge ? 82 + v : 118 + v);
      if (y % 5 === 0) px(ctx, ox + x, oy + y, 110, 172, 82);
    }
  });
  put(TILES.rose, (ox, oy, rnd) => {
    for (let x = 0; x < TS; x++) for (let y = 0; y < TS; y++) px(ctx, ox + x, oy + y, 0, 0, 0, 0);
    for (let y = 8; y < 16; y++) px(ctx, ox + 8, oy + y, 56, 118, 36);
    px(ctx, ox + 7, oy + 11, 56, 118, 36); px(ctx, ox + 9, oy + 13, 56, 118, 36);
    for (let y = 3; y < 8; y++) for (let x = 5; x < 11; x++) {
      if (rnd() > 0.25) px(ctx, ox + x, oy + y, 188 + (rnd() * 30), 30, 34);
    }
    px(ctx, ox + 7, oy + 5, 255, 90, 90); px(ctx, ox + 8, oy + 5, 255, 90, 90);
  });
  put(TILES.dandelion, (ox, oy, rnd) => {
    for (let x = 0; x < TS; x++) for (let y = 0; y < TS; y++) px(ctx, ox + x, oy + y, 0, 0, 0, 0);
    for (let y = 8; y < 16; y++) px(ctx, ox + 8, oy + y, 56, 118, 36);
    px(ctx, ox + 7, oy + 12, 56, 118, 36);
    for (let y = 4; y < 8; y++) for (let x = 5; x < 11; x++) {
      if (rnd() > 0.2) px(ctx, ox + x, oy + y, 238 + (rnd() * 20), 216, 48);
    }
    px(ctx, ox + 7, oy + 5, 255, 240, 120);
  });
  put(TILES.tall_grass, (ox, oy, rnd) => {
    for (let x = 0; x < TS; x++) for (let y = 0; y < TS; y++) px(ctx, ox + x, oy + y, 0, 0, 0, 0);
    for (let i = 0; i < 9; i++) {
      const x0 = 2 + (rnd() * 12) | 0;
      const h = 7 + (rnd() * 8) | 0;
      for (let y = 0; y < h; y++) {
        const x = x0 + ((y / h) * (rnd() > 0.5 ? 1 : -1)) | 0;
        px(ctx, ox + Math.max(0, Math.min(15, x)), oy + 15 - y, 96 + rnd() * 44, 158 + rnd() * 44, 50);
      }
    }
  });
  put(TILES.mushroom_red, (ox, oy, rnd) => {
    for (let x = 0; x < TS; x++) for (let y = 0; y < TS; y++) px(ctx, ox + x, oy + y, 0, 0, 0, 0);
    for (let y = 4; y < 8; y++) for (let x = 3; x < 13; x++) px(ctx, ox + x, oy + y, 188, 36, 32);
    for (let y = 8; y < 11; y++) for (let x = 5; x < 11; x++) px(ctx, ox + x, oy + y, 228, 218, 196);
    for (let i = 0; i < 6; i++) px(ctx, ox + 4 + (rnd() * 8) | 0, oy + 4 + (rnd() * 3) | 0, 238, 228, 210);
  });
  put(TILES.mushroom_brown, (ox, oy, rnd) => {
    for (let x = 0; x < TS; x++) for (let y = 0; y < TS; y++) px(ctx, ox + x, oy + y, 0, 0, 0, 0);
    for (let y = 5; y < 9; y++) for (let x = 3; x < 13; x++) px(ctx, ox + x, oy + y, 142, 104, 68);
    for (let y = 9; y < 12; y++) for (let x = 5; x < 11; x++) px(ctx, ox + x, oy + y, 218, 204, 180);
    for (let i = 0; i < 5; i++) px(ctx, ox + 4 + (rnd() * 8) | 0, oy + 5 + (rnd() * 3) | 0, 180, 142, 100);
  });
  put(TILES.sapling, (ox, oy, rnd) => {
    for (let x = 0; x < TS; x++) for (let y = 0; y < TS; y++) px(ctx, ox + x, oy + y, 0, 0, 0, 0);
    for (let y = 10; y < 16; y++) px(ctx, ox + 8, oy + y, 96, 72, 40);
    for (let i = 0; i < 30; i++) {
      const x = 4 + (rnd() * 8) | 0, y = 3 + (rnd() * 8) | 0;
      px(ctx, ox + x, oy + y, 48 + rnd() * 30, 112 + rnd() * 40, 36);
    }
    for (let y = 5; y < 10; y++) for (let x = 6; x < 11; x++) {
      if (rnd() > 0.35) px(ctx, ox + x, oy + y, 56, 122, 40);
    }
  });
  put(TILES.torch, (ox, oy, rnd) => {
    for (let x = 0; x < TS; x++) for (let y = 0; y < TS; y++) px(ctx, ox + x, oy + y, 0, 0, 0, 0);
    for (let y = 6; y < 16; y++) { px(ctx, ox + 7, oy + y, 120, 92, 52); px(ctx, ox + 8, oy + y, 148, 116, 68); }
    for (let y = 3; y < 7; y++) for (let x = 6; x < 10; x++) px(ctx, ox + x, oy + y, 242, 180 + rnd() * 60, 52);
    px(ctx, ox + 7, oy + 2, 255, 220, 120); px(ctx, ox + 8, oy + 2, 255, 210, 100);
  });
  put(TILES.redstone_torch_off, (ox, oy) => {
    for (let x = 0; x < TS; x++) for (let y = 0; y < TS; y++) px(ctx, ox + x, oy + y, 0, 0, 0, 0);
    for (let y = 6; y < 16; y++) { px(ctx, ox + 7, oy + y, 100, 70, 48); px(ctx, ox + 8, oy + y, 120, 86, 56); }
    for (let y = 3; y < 7; y++) for (let x = 6; x < 10; x++) px(ctx, ox + x, oy + y, 72, 24, 22);
  });
  put(TILES.ladder, (ox, oy, rnd) => {
    for (let x = 0; x < TS; x++) for (let y = 0; y < TS; y++) px(ctx, ox + x, oy + y, 0, 0, 0, 0);
    for (let y = 0; y < TS; y++) {
      px(ctx, ox + 2, oy + y, 122, 94, 52); px(ctx, ox + 3, oy + y, 142, 112, 66);
      px(ctx, ox + 12, oy + y, 122, 94, 52); px(ctx, ox + 13, oy + y, 142, 112, 66);
    }
    for (const yy of [2, 7, 12]) for (let x = 3; x < 13; x++) px(ctx, ox + x, oy + yy, 142, 112, 66);
  });
  put(TILES.rail, (ox, oy, rnd) => {
    for (let x = 0; x < TS; x++) for (let y = 0; y < TS; y++) px(ctx, ox + x, oy + y, 0, 0, 0, 0);
    for (let y = 0; y < TS; y++) {
      px(ctx, ox + 3, oy + y, 130, 130, 130); px(ctx, ox + 12, oy + y, 130, 130, 130);
    }
    for (const yy of [1, 5, 9, 13]) for (let x = 2; x < 14; x++) px(ctx, ox + x, oy + yy, 110, 86, 52);
  });
  put(TILES.jukebox_side, (ox, oy, rnd) => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const v = (rnd() - 0.5) * 10;
      px(ctx, ox + x, oy + y, 120 + v, 92 + v, 58 + v);
    }
    for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) px(ctx, ox + x, oy + y, 82, 58, 36);
  });
  put(TILES.jukebox_top, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [120, 92, 58], 10, rnd);
    for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) {
      const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
      if (d < 5) px(ctx, ox + x, oy + y, 40, 30, 22);
    }
    px(ctx, ox + 7, oy + 7, 90, 70, 40); px(ctx, ox + 8, oy + 7, 90, 70, 40);
    px(ctx, ox + 7, oy + 8, 90, 70, 40); px(ctx, ox + 8, oy + 8, 90, 70, 40);
  });
  put(TILES.cobweb, (ox, oy, rnd) => {
    for (let x = 0; x < TS; x++) for (let y = 0; y < TS; y++) px(ctx, ox + x, oy + y, 0, 0, 0, 0);
    for (let i = 0; i < TS; i++) {
      px(ctx, ox + i, oy + i, 235, 235, 235, 210);
      px(ctx, ox + (TS - 1 - i), oy + i, 235, 235, 235, 210);
      px(ctx, ox + i, oy + 0, 235, 235, 235, 200);
      px(ctx, ox + 0, oy + i, 235, 235, 235, 200);
    }
    for (let i = 0; i < 6; i++) {
      const c = (rnd() * TS) | 0;
      for (let y = 0; y < TS; y++) px(ctx, ox + c, oy + y, 235, 235, 235, 140);
    }
  });
  put(TILES.farmland, (ox, oy, rnd) => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const v = (rnd() - 0.5) * 14;
      px(ctx, ox + x, oy + y, 96 + v, 62 + v, 38 + v);
    }
    for (let x = 0; x < TS; x++) {
      px(ctx, ox + x, oy + 3, 62, 38, 22); px(ctx, ox + x, oy + 8, 62, 38, 22); px(ctx, ox + x, oy + 13, 62, 38, 22);
    }
  });

  // --- destroy stage overlay (cracks) ---
  // Precompute a single set of crack segments with a stable seed so each
  // successive stage adds to the same pattern instead of jumping.
  const crackSegments = [];
  {
    const r = tileRand(TILES.destroy0 * 7919 + 17);
    for (let i = 0; i < 12; i++) {
      const cx = 8 + (r() * 6 - 3);
      const cy = 8 + (r() * 6 - 3);
      const dx = r() * 2 - 1;
      const dy = r() * 2 - 1;
      const len = 5 + r() * 9;
      crackSegments.push({ cx, cy, dx, dy, len });
    }
  }
  for (let stage = 0; stage < 10; stage++) {
    put(TILES.destroy0 + stage, (ox, oy, rnd) => {
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
        px(ctx, ox + x, oy + y, 0, 0, 0, 0);
      }
      const n = 3 + stage;
      for (let i = 0; i < n; i++) {
        const seg = crackSegments[i];
        let x = seg.cx, y = seg.cy;
        for (let s = 0; s < seg.len; s++) {
          const px_ = Math.round(x), py_ = Math.round(y);
          if (px_ >= 0 && px_ < TS && py_ >= 0 && py_ < TS) {
            px(ctx, ox + px_, oy + py_, 20, 16, 12, 210);
            // thicken slightly for visibility
            if (px_ + 1 < TS) px(ctx, ox + px_ + 1, oy + py_, 20, 16, 12, 150);
          }
          x += seg.dx + (rnd() - 0.5) * 0.4;
          y += seg.dy + (rnd() - 0.5) * 0.4;
        }
      }
    });
  }

  // --- extended Beta blocks (chest, doors, crops, bed, farmland_wet, jack_o_lantern, cake) ---
  put(TILES.chest_top, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [168, 122, 54], 10, rnd);
    for (let i = 0; i < TS; i++) {
      px(ctx, ox + i, oy, 82, 56, 24); px(ctx, ox + i, oy + 15, 82, 56, 24);
      px(ctx, ox, oy + i, 82, 56, 24); px(ctx, ox + 15, oy + i, 82, 56, 24);
    }
  });
  put(TILES.chest_side, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [164, 118, 52], 10, rnd);
    for (let i = 0; i < TS; i++) {
      px(ctx, ox + i, oy, 82, 56, 24); px(ctx, ox + i, oy + 15, 82, 56, 24);
      px(ctx, ox, oy + i, 82, 56, 24); px(ctx, ox + 15, oy + i, 82, 56, 24);
      px(ctx, ox + i, oy + 5, 58, 38, 16);
    }
  });
  put(TILES.chest_front, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [164, 118, 52], 10, rnd);
    for (let i = 0; i < TS; i++) {
      px(ctx, ox + i, oy, 82, 56, 24); px(ctx, ox + i, oy + 15, 82, 56, 24);
      px(ctx, ox, oy + i, 82, 56, 24); px(ctx, ox + 15, oy + i, 82, 56, 24);
      px(ctx, ox + i, oy + 5, 48, 32, 14);
    }
    for (let y = 4; y < 8; y++) for (let x = 7; x < 9; x++) px(ctx, ox + x, oy + y, 214, 214, 222);
    px(ctx, ox + 7, oy + 7, 150, 150, 160); px(ctx, ox + 8, oy + 7, 150, 150, 160);
  });
  put(TILES.door_wood, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [152, 118, 68], 10, rnd);
    for (let i = 0; i < TS; i++) {
      px(ctx, ox + i, oy, 108, 80, 44); px(ctx, ox + i, oy + 15, 108, 80, 44);
      px(ctx, ox, oy + i, 108, 80, 44); px(ctx, ox + 15, oy + i, 108, 80, 44);
    }
    for (let y = 2; y < 7; y++) for (let x = 3; x < 7; x++) px(ctx, ox + x, oy + y, 0, 0, 0, 0);
    for (let y = 2; y < 7; y++) for (let x = 9; x < 13; x++) px(ctx, ox + x, oy + y, 0, 0, 0, 0);
    px(ctx, ox + 12, oy + 9, 68, 54, 34); px(ctx, ox + 13, oy + 9, 68, 54, 34);
  });
  put(TILES.door_iron, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [196, 196, 202], 10, rnd);
    for (let i = 0; i < TS; i++) {
      px(ctx, ox + i, oy, 138, 138, 144); px(ctx, ox + i, oy + 15, 138, 138, 144);
      px(ctx, ox, oy + i, 138, 138, 144); px(ctx, ox + 15, oy + i, 138, 138, 144);
    }
    for (let y = 2; y < 7; y++) for (let x = 3; x < 7; x++) px(ctx, ox + x, oy + y, 0, 0, 0, 0);
    for (let y = 2; y < 7; y++) for (let x = 9; x < 13; x++) px(ctx, ox + x, oy + y, 0, 0, 0, 0);
  });
  put(TILES.redstone_wire, (ox, oy) => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      if ((x >= 6 && x <= 9) || (y >= 6 && y <= 9)) px(ctx, ox+x, oy+y, 190, 26, 20);
    }
  });
  put(TILES.lever, (ox, oy) => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(ctx, ox+x, oy+y, 130, 110, 80);
  });
  put(TILES.repeater, (ox, oy) => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(ctx, ox+x, oy+y, 155, 155, 155);
    for (let y = 3; y < 13; y++) for (let x = 7; x < 9; x++) px(ctx, ox+x, oy+y, 180, 30, 20);
  });
  for (let stage = 0; stage < 8; stage++) {
    put(TILES.crops0 + stage, (ox, oy, rnd) => {
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(ctx, ox + x, oy + y, 0, 0, 0, 0);
      const h = 3 + stage * 1.7;
      const golden = stage >= 7;
      for (const sx of [2, 5, 8, 11, 13]) {
        const sh = Math.min(15, Math.max(2, Math.round(h + (rnd() - 0.5) * 2)));
        for (let y = 0; y < sh; y++) {
          const tip = y >= sh - 2;
          const r = golden ? (tip ? 228 : 186) : 76 + stage * 12;
          const g = golden ? (tip ? 198 : 162) : 148 + stage * 4;
          const b = golden ? 52 : 42;
          px(ctx, ox + sx, oy + 15 - y, r, g, b);
          if (tip && stage >= 4 && sx + 1 < TS) px(ctx, ox + sx + 1, oy + 15 - y, r, g, b);
        }
      }
    });
  }
  put(TILES.bed_foot, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [172, 42, 38], 8, rnd);
    for (let x = 0; x < TS; x++) { px(ctx, ox+x, oy, 132, 28, 26); px(ctx, ox+x, oy+15, 132, 28, 26); }
  });
  put(TILES.bed_top, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [172, 42, 38], 8, rnd);
    for (let y = 0; y < 5; y++) for (let x = 1; x < 15; x++) px(ctx, ox + x, oy + y, 236, 236, 238);
    for (let x = 0; x < TS; x++) px(ctx, ox + x, oy + 5, 132, 28, 26);
  });
  put(TILES.bed_side, (ox, oy, rnd) => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(ctx, ox + x, oy + y, 0, 0, 0, 0);
    for (let y = 6; y < 11; y++) for (let x = 0; x < TS; x++) {
      if (x < 4) px(ctx, ox + x, oy + y, 232, 232, 236);
      else px(ctx, ox + x, oy + y, 172, 42, 38);
    }
    for (let y = 11; y < 14; y++) for (let x = 0; x < TS; x++) px(ctx, ox + x, oy + y, 148, 116, 68);
    for (let y = 14; y < 16; y++) {
      px(ctx, ox + 1, oy + y, 116, 88, 48); px(ctx, ox + 2, oy + y, 116, 88, 48);
      px(ctx, ox + 13, oy + y, 116, 88, 48); px(ctx, ox + 14, oy + y, 116, 88, 48);
    }
  });
  put(TILES.bed_end, (ox, oy) => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(ctx, ox + x, oy + y, 0, 0, 0, 0);
    for (let y = 6; y < 11; y++) for (let x = 0; x < TS; x++) px(ctx, ox + x, oy + y, 172, 42, 38);
    for (let y = 11; y < 14; y++) for (let x = 0; x < TS; x++) px(ctx, ox + x, oy + y, 148, 116, 68);
    for (let y = 14; y < 16; y++) {
      px(ctx, ox + 1, oy + y, 116, 88, 48); px(ctx, ox + 2, oy + y, 116, 88, 48);
      px(ctx, ox + 13, oy + y, 116, 88, 48); px(ctx, ox + 14, oy + y, 116, 88, 48);
    }
  });
  put(TILES.farmland_wet, (ox, oy, rnd) => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const v = (rnd() - 0.5) * 10;
      px(ctx, ox + x, oy + y, 64 + v, 38 + v, 20 + v);
    }
    for (let x = 0; x < TS; x++) {
      px(ctx, ox + x, oy + 3, 42, 24, 12); px(ctx, ox + x, oy + 8, 42, 24, 12); px(ctx, ox + x, oy + 13, 42, 24, 12);
    }
  });
  put(TILES.jack_o_lantern, (ox, oy, rnd) => {
    for (let x = 0; x < TS; x++) {
      const ridge = x % 4 === 0;
      for (let y = 0; y < TS; y++) {
        const v = (rnd() - 0.5) * 14;
        if (ridge) px(ctx, ox + x, oy + y, 168 + v, 88 + v, 18 + v);
        else px(ctx, ox + x, oy + y, 204 + v, 118 + v, 28 + v);
      }
    }
    const eye = (x0, y0) => {
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
        if (!(x === 2 && y === 0) && !(x === 0 && y === 2)) px(ctx, ox + x0 + x, oy + y0 + y, 255, 232, 110);
      }
    };
    eye(3, 4); eye(10, 4);
    for (let y = 9; y < 12; y++) for (let x = 4; x < 12; x++) {
      const mouth = y === 9 ? (x >= 5 && x <= 10) : y === 10 ? (x === 4 || x === 11 || (x >= 5 && x <= 10)) : (x === 5 || x === 10);
      if (mouth) px(ctx, ox + x, oy + y, 255, 224, 92);
    }
  });
  put(TILES.cake_top, (ox, oy, rnd) => {
    noiseFill(ctx, ox, oy, [242, 238, 234], 6, rnd);
    for (const [cx, cy] of [[4, 4], [11, 4], [7, 8], [4, 11], [11, 11]]) {
      px(ctx, ox + cx, oy + cy, 212, 34, 34); px(ctx, ox + cx + 1, oy + cy, 212, 34, 34);
    }
  });
  put(TILES.cake_side, (ox, oy, rnd) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < TS; x++) px(ctx, ox + x, oy + y, 0, 0, 0, 0);
    for (let y = 8; y < 11; y++) for (let x = 0; x < TS; x++) px(ctx, ox + x, oy + y, 240, 236, 232);
    for (let y = 11; y < 16; y++) for (let x = 0; x < TS; x++) {
      const v = (rnd() - 0.5) * 10;
      px(ctx, ox + x, oy + y, 198 + v, 138 + v, 72 + v);
    }
  });
  put(TILES.cake_bottom, (ox, oy, rnd) => noiseFill(ctx, ox, oy, [184, 124, 62], 8, rnd));

  applyClassicTextures(ctx);
  return canvas;
}

// Item icon art (256 items use pixel art on transparent background)
// A tiny companion atlas marks only the pixels that emit their own light.
// Stone borders on a lit furnace and the wooden stem of a torch stay shaded.
export function buildEmissionAtlas(atlasCanvas) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 256, 256);
  const source = atlasCanvas.getContext('2d');
  const paint = (tile, test) => {
    const ox = (tile % 16) * 16, oy = Math.floor(tile / 16) * 16;
    const img = source.getImageData(ox, oy, 16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      const value = test(x, y, img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]);
      if (value > 0) {
        const v = Math.round(Math.min(1, value) * 255);
        ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  };
  paint(TILES.lava, () => 1);
  paint(TILES.glowstone, (x, y, r, g) => r > 220 && g > 180 ? 1 : 0.72);
  paint(TILES.torch, (x, y, r, g, b, a) => a > 0 && y < 7 && x >= 6 && x < 10 ? 1 : 0);
  paint(TILES.furnace_front_lit, (x, y, r, g) => y >= 9 && y < 13 && x >= 4 && x < 12 && r > 200 ? 1 : 0);
  paint(TILES.jack_o_lantern, (x, y, r, g) => r > 240 && g > 200 ? 1 : 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

export function buildItemIcons() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const draw = (idx, fn) => {
    const ox = (idx % 16) * 16, oy = Math.floor(idx / 16) * 16;
    ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, 16, 16); ctx.clip();
    fn(ox, oy, tileRand(idx * 31 + 7));
    ctx.restore();
  };

  const rect = (ox, oy, x, y, w, h, r, g, b, a = 255) => {
    ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
    ctx.fillRect(ox + x, oy + y, w, h);
  };

  // stick
  draw(0, (ox, oy) => {
    for (let i = 0; i < 9; i++) rect(ox, oy, 4 + i, 11 - i, 2, 2, 122, 92, 52);
    rect(ox, oy, 11, 3, 2, 2, 98, 74, 42);
  });
  // coal
  draw(1, (ox, oy, rnd) => {
    for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) {
      const v = rnd() * 18;
      rect(ox, oy, x, y, 1, 1, 24 + v, 24 + v, 24 + v);
    }
    rect(ox, oy, 6, 5, 2, 1, 60, 60, 60); rect(ox, oy, 8, 8, 2, 1, 8, 8, 8);
  });
  // charcoal (darker)
  draw(2, (ox, oy, rnd) => {
    for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) {
      const v = rnd() * 14;
      rect(ox, oy, x, y, 1, 1, 16 + v, 16 + v, 18 + v);
    }
  });
  // iron ingot
  draw(3, (ox, oy) => {
    rect(ox, oy, 3, 6, 10, 5, 200, 200, 200);
    rect(ox, oy, 4, 5, 8, 1, 230, 230, 230);
    rect(ox, oy, 3, 11, 10, 1, 150, 150, 150);
  });
  // gold ingot
  draw(4, (ox, oy) => {
    rect(ox, oy, 3, 6, 10, 5, 242, 208, 64);
    rect(ox, oy, 4, 5, 8, 1, 255, 236, 120);
    rect(ox, oy, 3, 11, 10, 1, 196, 156, 36);
  });
  // diamond
  draw(5, (ox, oy) => {
    rect(ox, oy, 5, 5, 6, 2, 120, 232, 228);
    rect(ox, oy, 4, 7, 8, 3, 96, 216, 212);
    rect(ox, oy, 6, 10, 4, 2, 72, 190, 190);
    rect(ox, oy, 7, 4, 2, 1, 200, 255, 252);
  });
  // apple
  draw(6, (ox, oy) => {
    rect(ox, oy, 5, 6, 6, 6, 210, 36, 36);
    rect(ox, oy, 4, 7, 8, 4, 210, 36, 36);
    rect(ox, oy, 6, 5, 4, 1, 232, 60, 60);
    rect(ox, oy, 9, 3, 1, 3, 96, 72, 40);
    rect(ox, oy, 10, 3, 3, 2, 72, 132, 44);
    rect(ox, oy, 6, 7, 2, 2, 240, 90, 80);
  });
  // golden apple
  draw(7, (ox, oy) => {
    rect(ox, oy, 5, 6, 6, 6, 232, 190, 40);
    rect(ox, oy, 4, 7, 8, 4, 232, 190, 40);
    rect(ox, oy, 6, 5, 4, 1, 255, 224, 96);
    rect(ox, oy, 9, 3, 1, 3, 96, 72, 40);
    rect(ox, oy, 6, 7, 2, 2, 255, 240, 140);
  });
  // raw porkchop
  draw(8, (ox, oy) => {
    rect(ox, oy, 3, 5, 9, 7, 228, 132, 132);
    rect(ox, oy, 4, 4, 7, 1, 228, 132, 132);
    rect(ox, oy, 5, 6, 4, 3, 248, 172, 172);
    rect(ox, oy, 9, 9, 3, 2, 198, 102, 102);
  });
  // cooked porkchop
  draw(9, (ox, oy) => {
    rect(ox, oy, 3, 5, 9, 7, 168, 102, 58);
    rect(ox, oy, 4, 4, 7, 1, 168, 102, 58);
    rect(ox, oy, 5, 6, 4, 3, 198, 132, 82);
  });
  // bread
  draw(10, (ox, oy) => {
    rect(ox, oy, 2, 6, 12, 5, 182, 132, 58);
    rect(ox, oy, 3, 5, 10, 1, 182, 132, 58);
    rect(ox, oy, 3, 4, 8, 1, 202, 152, 78);
    for (let i = 0; i < 4; i++) rect(ox, oy, 3 + i * 3, 6, 1, 3, 152, 102, 42);
  });
  // wheat
  draw(11, (ox, oy) => {
    for (let i = 0; i < 5; i++) {
      rect(ox, oy, 4 + i * 2, 3 + (i % 2) * 2, 2, 9, 198, 172, 62);
      rect(ox, oy, 3 + i * 2, 2 + (i % 2) * 2, 2, 2, 218, 192, 82);
    }
    rect(ox, oy, 6, 11, 6, 2, 152, 122, 42);
  });
  // seeds
  draw(12, (ox, oy) => {
    for (let i = 0; i < 8; i++) rect(ox, oy, 3 + (i * 2.2 | 0), 4 + (i * 1.7 | 0), 2, 3, 122, 162, 52);
  });
  // string
  draw(13, (ox, oy) => {
    for (let i = 0; i < 12; i++) rect(ox, oy, 3 + i, 3 + (Math.sin(i * 1.2) * 3 | 0) + 3, 1, 1, 232, 232, 232);
    rect(ox, oy, 3, 3, 1, 1, 232, 232, 232); rect(ox, oy, 13, 12, 1, 1, 232, 232, 232);
  });
  // feather
  draw(14, (ox, oy) => {
    for (let i = 0; i < 10; i++) {
      rect(ox, oy, 4 + i, 12 - i, 3 - (i > 5 ? 1 : 0), 2, 232, 232, 232);
      if (i % 2) rect(ox, oy, 4 + i, 11 - i, 1, 1, 200, 200, 200);
    }
    rect(ox, oy, 11, 2, 2, 2, 190, 190, 190);
  });
  // gunpowder
  draw(15, (ox, oy, rnd) => {
    for (let i = 0; i < 22; i++) rect(ox, oy, 3 + (rnd() * 10) | 0, 3 + (rnd() * 10) | 0, 2, 2, 88 + rnd() * 30, 88 + rnd() * 30, 88 + rnd() * 30);
  });
  // flint
  draw(16, (ox, oy) => {
    rect(ox, oy, 4, 5, 8, 6, 68, 68, 72);
    rect(ox, oy, 5, 4, 6, 1, 68, 68, 72);
    rect(ox, oy, 6, 6, 3, 2, 98, 98, 102);
    rect(ox, oy, 4, 11, 8, 1, 48, 48, 52);
  });
  // leather
  draw(17, (ox, oy) => {
    rect(ox, oy, 3, 4, 10, 8, 180, 108, 58);
    rect(ox, oy, 4, 3, 8, 1, 180, 108, 58);
    rect(ox, oy, 5, 6, 6, 4, 202, 130, 78);
  });
  // clay ball
  draw(18, (ox, oy) => {
    rect(ox, oy, 5, 5, 6, 6, 158, 164, 176);
    rect(ox, oy, 4, 6, 8, 4, 158, 164, 176);
    rect(ox, oy, 6, 6, 3, 2, 182, 188, 198);
  });
  // brick item
  draw(19, (ox, oy) => {
    rect(ox, oy, 3, 5, 10, 6, 158, 88, 72);
    rect(ox, oy, 3, 5, 10, 1, 196, 196, 196);
    rect(ox, oy, 3, 8, 10, 1, 196, 196, 196);
    rect(ox, oy, 8, 5, 1, 3, 196, 196, 196);
    rect(ox, oy, 5, 8, 1, 3, 196, 196, 196);
    rect(ox, oy, 11, 8, 1, 3, 196, 196, 196);
  });
  // paper
  draw(20, (ox, oy) => {
    rect(ox, oy, 3, 3, 10, 10, 232, 232, 232);
    rect(ox, oy, 4, 4, 8, 8, 250, 250, 250);
    for (let i = 0; i < 3; i++) rect(ox, oy, 5, 6 + i * 2, 6, 1, 190, 190, 190);
  });
  // book
  draw(21, (ox, oy) => {
    rect(ox, oy, 3, 3, 10, 10, 152, 62, 42);
    rect(ox, oy, 4, 4, 8, 8, 222, 222, 212);
    rect(ox, oy, 3, 3, 1, 10, 122, 42, 28);
    rect(ox, oy, 5, 5, 6, 1, 182, 182, 172);
    rect(ox, oy, 5, 7, 6, 1, 182, 182, 172);
    rect(ox, oy, 5, 9, 6, 1, 182, 182, 172);
  });
  // bowl
  draw(22, (ox, oy) => {
    rect(ox, oy, 3, 7, 10, 2, 122, 92, 52);
    rect(ox, oy, 4, 9, 8, 2, 122, 92, 52);
    rect(ox, oy, 5, 11, 6, 1, 98, 74, 42);
    rect(ox, oy, 4, 6, 8, 1, 148, 116, 68);
  });
  // mushroom stew
  draw(23, (ox, oy) => {
    rect(ox, oy, 3, 7, 10, 2, 122, 92, 52);
    rect(ox, oy, 4, 9, 8, 2, 122, 92, 52);
    rect(ox, oy, 4, 6, 8, 1, 198, 132, 62);
    rect(ox, oy, 5, 5, 2, 1, 218, 218, 198); rect(ox, oy, 9, 5, 2, 1, 218, 218, 198);
  });
  // bucket
  draw(24, (ox, oy) => {
    rect(ox, oy, 4, 5, 8, 2, 190, 190, 190);
    rect(ox, oy, 4, 7, 8, 5, 150, 150, 150);
    rect(ox, oy, 5, 12, 6, 1, 120, 120, 120);
    rect(ox, oy, 3, 5, 1, 7, 120, 120, 120); rect(ox, oy, 12, 5, 1, 7, 120, 120, 120);
    rect(ox, oy, 5, 3, 6, 1, 190, 190, 190); rect(ox, oy, 4, 4, 1, 2, 190, 190, 190); rect(ox, oy, 11, 4, 1, 2, 190, 190, 190);
  });
  // water bucket
  draw(25, (ox, oy) => {
    rect(ox, oy, 4, 5, 8, 2, 190, 190, 190);
    rect(ox, oy, 4, 7, 8, 5, 48, 92, 212);
    rect(ox, oy, 5, 12, 6, 1, 120, 120, 120);
    rect(ox, oy, 3, 5, 1, 7, 120, 120, 120); rect(ox, oy, 12, 5, 1, 7, 120, 120, 120);
  });
  // lava bucket
  draw(26, (ox, oy) => {
    rect(ox, oy, 4, 5, 8, 2, 190, 190, 190);
    rect(ox, oy, 4, 7, 8, 5, 228, 108, 22);
    rect(ox, oy, 5, 12, 6, 1, 120, 120, 120);
    rect(ox, oy, 3, 5, 1, 7, 120, 120, 120); rect(ox, oy, 12, 5, 1, 7, 120, 120, 120);
    rect(ox, oy, 6, 8, 3, 2, 255, 200, 60);
  });
  // shears
  draw(27, (ox, oy) => {
    for (let i = 0; i < 8; i++) { rect(ox, oy, 3 + i, 12 - i, 2, 2, 180, 180, 185); rect(ox, oy, 11 - i, 12 - i, 2, 2, 180, 180, 185); }
    rect(ox, oy, 3, 11, 3, 3, 210, 210, 215); rect(ox, oy, 10, 11, 3, 3, 210, 210, 215);
    rect(ox, oy, 3, 11, 3, 3, 210, 60, 60, 120); rect(ox, oy, 10, 11, 3, 3, 210, 60, 60, 120);
  });
  // arrow
  draw(28, (ox, oy) => {
    for (let i = 0; i < 10; i++) rect(ox, oy, 3 + i, 12 - i, 1, 1, 122, 92, 52);
    rect(ox, oy, 11, 2, 2, 2, 120, 120, 120);
    rect(ox, oy, 3, 11, 2, 2, 232, 232, 232); rect(ox, oy, 4, 12, 2, 2, 232, 232, 232);
  });
  // bone
  draw(29, (ox, oy) => {
    for (let i = 0; i < 10; i++) rect(ox, oy, 3 + i, 12 - i, 2, 2, 232, 232, 222);
    rect(ox, oy, 2, 11, 3, 3, 232, 232, 222); rect(ox, oy, 11, 2, 3, 3, 232, 232, 222);
    rect(ox, oy, 1, 12, 2, 2, 232, 232, 222); rect(ox, oy, 13, 1, 2, 2, 232, 232, 222);
  });
  // egg
  draw(30, (ox, oy) => {
    rect(ox, oy, 5, 4, 6, 9, 222, 212, 182);
    rect(ox, oy, 6, 3, 4, 1, 222, 212, 182);
    rect(ox, oy, 4, 6, 8, 5, 222, 212, 182);
    rect(ox, oy, 7, 5, 2, 3, 242, 232, 202);
    for (let i = 0; i < 5; i++) rect(ox, oy, 5 + (i * 2 | 0), 6 + (i * 1.4 | 0), 1, 1, 190, 172, 132);
  });
  // snowball
  draw(31, (ox, oy) => {
    rect(ox, oy, 5, 5, 6, 6, 238, 246, 250);
    rect(ox, oy, 4, 6, 8, 4, 238, 246, 250);
    rect(ox, oy, 6, 6, 3, 2, 252, 255, 255);
    rect(ox, oy, 4, 4, 3, 1, 210, 220, 228);
  });
  // sugar
  draw(32, (ox, oy) => {
    for (let i = 0; i < 12; i++) rect(ox, oy, 3 + (i * 1.3 | 0), 4 + (i * 1.1 | 0), 2, 2, 242, 242, 242);
  });
  // melon
  draw(33, (ox, oy) => {
    rect(ox, oy, 3, 5, 10, 7, 122, 182, 52);
    rect(ox, oy, 3, 5, 10, 1, 82, 132, 32);
    rect(ox, oy, 3, 11, 10, 1, 82, 132, 32);
    rect(ox, oy, 5, 6, 6, 5, 222, 72, 72);
  });
  // lapis lazuli
  draw(34, (ox, oy) => {
    rect(ox, oy, 5, 4, 6, 8, 42, 74, 198);
    rect(ox, oy, 4, 6, 8, 5, 42, 74, 198);
    rect(ox, oy, 6, 5, 3, 3, 92, 134, 242);
    rect(ox, oy, 5, 11, 6, 1, 28, 48, 148);
  });
  // redstone dust
  draw(35, (ox, oy) => {
    for (let i = 0; i < 14; i++) rect(ox, oy, 3 + (i * 1.2 | 0) % 10, 4 + (i * 2.1 | 0) % 10, 2, 2, 222, 36, 36);
    rect(ox, oy, 7, 7, 3, 3, 255, 80, 80);
  });
  // flint&steel
  draw(36, (ox, oy) => {
    rect(ox, oy, 4, 4, 8, 3, 160, 160, 165);
    rect(ox, oy, 4, 7, 3, 6, 92, 92, 98);
    rect(ox, oy, 8, 6, 3, 6, 222, 122, 32);
    rect(ox, oy, 9, 4, 3, 3, 255, 190, 60);
  });
  // bowl of icons for tools & swords drawn generically below (rows 2-5)
  const toolMats = {
    0: [122, 92, 52],    // wood
    1: [125, 125, 125],  // stone
    2: [200, 200, 200],  // iron
    3: [96, 226, 220],   // diamond
    4: [242, 208, 64],   // gold
  };
  const drawHandle = (ox, oy, ang) => {
    if (ang === 'diag') {
      for (let i = 0; i < 8; i++) rect(ox, oy, 4 + i, 11 - i, 2, 2, 122, 92, 52);
    } else {
      for (let i = 0; i < 9; i++) rect(ox, oy, 7, 4 + i, 2, 2, 122, 92, 52);
    }
  };
  // swords at idx 40 + mat*1 ... we generate all tool icons in one loop:
  // layout: row-major idx = 40 + mat*5 + kind where kind 0=sword,1=shovel,2=pickaxe,3=axe,4=hoe
  for (let mat = 0; mat < 5; mat++) {
    const baseIcon = mat === 4 ? 99 : 40 + mat * 5;
    const c = toolMats[mat];
    const cd = c.map(v => Math.max(0, v - 30));
    const cl = c.map(v => Math.min(255, v + 30));
    // sword
    draw(baseIcon + 0, (ox, oy) => {
      for (let i = 0; i < 7; i++) rect(ox, oy, 9 - i, 3 + i, 3, 3, c[0], c[1], c[2]);
      rect(ox, oy, 9, 2, 3, 3, cl[0], cl[1], cl[2]);
      rect(ox, oy, 2, 11, 5, 2, 122, 92, 52);
      rect(ox, oy, 4, 9, 3, 2, 98, 74, 42);
    });
    // shovel
    draw(baseIcon + 1, (ox, oy) => {
      drawHandle(ox, oy, 'diag');
      rect(ox, oy, 8, 2, 5, 5, c[0], c[1], c[2]);
      rect(ox, oy, 9, 1, 3, 1, cl[0], cl[1], cl[2]);
      rect(ox, oy, 10, 6, 3, 1, cd[0], cd[1], cd[2]);
    });
    // pickaxe
    draw(baseIcon + 2, (ox, oy) => {
      drawHandle(ox, oy, 'diag');
      rect(ox, oy, 4, 2, 9, 2, c[0], c[1], c[2]);
      rect(ox, oy, 3, 3, 2, 2, c[0], c[1], c[2]);
      rect(ox, oy, 12, 3, 2, 2, c[0], c[1], c[2]);
      rect(ox, oy, 4, 2, 9, 1, cl[0], cl[1], cl[2]);
    });
    // axe
    draw(baseIcon + 3, (ox, oy) => {
      drawHandle(ox, oy, 'diag');
      rect(ox, oy, 6, 2, 5, 4, c[0], c[1], c[2]);
      rect(ox, oy, 5, 3, 2, 3, c[0], c[1], c[2]);
      rect(ox, oy, 6, 2, 5, 1, cl[0], cl[1], cl[2]);
    });
    // hoe
    draw(baseIcon + 4, (ox, oy) => {
      drawHandle(ox, oy, 'diag');
      rect(ox, oy, 8, 2, 6, 2, c[0], c[1], c[2]);
      rect(ox, oy, 12, 4, 2, 2, c[0], c[1], c[2]);
      rect(ox, oy, 8, 2, 6, 1, cl[0], cl[1], cl[2]);
    });
  }
  // bow
  draw(60, (ox, oy) => {
    for (let i = 0; i < 10; i++) rect(ox, oy, 3 + Math.abs(i - 4.5) * 1.2 | 0, 3 + i, 2, 1, 122, 92, 52);
    for (let i = 0; i < 10; i++) rect(ox, oy, 11, 3 + i, 1, 1, 232, 232, 232);
  });
  // sign
  draw(61, (ox, oy) => {
    rect(ox, oy, 2, 3, 12, 8, 122, 92, 52);
    rect(ox, oy, 3, 4, 10, 6, 148, 116, 68);
    rect(ox, oy, 7, 11, 2, 4, 98, 74, 42);
  });
  // minecart
  draw(62, (ox, oy) => {
    rect(ox, oy, 2, 5, 12, 6, 150, 150, 150);
    rect(ox, oy, 3, 6, 10, 4, 120, 120, 120);
    rect(ox, oy, 2, 11, 3, 3, 90, 90, 90); rect(ox, oy, 11, 11, 3, 3, 90, 90, 90);
    rect(ox, oy, 1, 4, 2, 2, 150, 150, 150); rect(ox, oy, 13, 4, 2, 2, 150, 150, 150);
  });
  // saddle
  draw(63, (ox, oy) => {
    rect(ox, oy, 3, 5, 10, 5, 152, 62, 42);
    rect(ox, oy, 4, 4, 8, 1, 152, 62, 42);
    rect(ox, oy, 5, 6, 6, 3, 182, 82, 52);
    rect(ox, oy, 2, 6, 1, 4, 122, 42, 28); rect(ox, oy, 13, 6, 1, 4, 122, 42, 28);
  });
  // compass
  draw(64, (ox, oy) => {
    rect(ox, oy, 3, 3, 10, 10, 180, 180, 180);
    rect(ox, oy, 4, 4, 8, 8, 222, 222, 222);
    rect(ox, oy, 7, 5, 2, 6, 222, 36, 36);
    rect(ox, oy, 5, 7, 6, 2, 42, 42, 42);
    rect(ox, oy, 7, 7, 2, 2, 222, 36, 36);
  });
  // fishing rod
  draw(65, (ox, oy) => {
    for (let i = 0; i < 11; i++) rect(ox, oy, 2 + i, 13 - i, 2, 2, 122, 92, 52);
    for (let i = 0; i < 6; i++) rect(ox, oy, 13 - i, 2 + i, 1, 1, 232, 232, 232);
    rect(ox, oy, 11, 9, 2, 2, 222, 36, 36);
  });
  // cooked fish / raw fish
  draw(66, (ox, oy) => {
    rect(ox, oy, 2, 6, 11, 5, 142, 162, 122);
    rect(ox, oy, 12, 5, 3, 3, 142, 162, 122);
    rect(ox, oy, 2, 11, 4, 3, 142, 162, 122);
    rect(ox, oy, 4, 7, 6, 2, 172, 192, 152);
    rect(ox, oy, 4, 7, 1, 1, 22, 22, 22);
  });
  draw(67, (ox, oy) => {
    rect(ox, oy, 2, 6, 11, 5, 192, 122, 62);
    rect(ox, oy, 12, 5, 3, 3, 192, 122, 62);
    rect(ox, oy, 2, 11, 4, 3, 192, 122, 62);
    rect(ox, oy, 4, 7, 6, 2, 222, 152, 92);
  });
  // cookie
  draw(68, (ox, oy) => {
    rect(ox, oy, 3, 5, 10, 7, 198, 142, 72);
    rect(ox, oy, 4, 4, 8, 1, 198, 142, 72);
    for (let i = 0; i < 6; i++) rect(ox, oy, 4 + (i * 2 | 0), 6 + (i % 3) * 2, 2, 2, 122, 72, 32);
  });
  // cake
  draw(69, (ox, oy) => {
    rect(ox, oy, 2, 6, 12, 7, 222, 212, 182);
    rect(ox, oy, 2, 5, 12, 2, 232, 232, 232);
    rect(ox, oy, 2, 9, 12, 1, 212, 62, 62);
    for (let i = 0; i < 4; i++) rect(ox, oy, 3 + i * 3, 4, 2, 2, 222, 36, 36);
  });
  // bed
  draw(70, (ox, oy) => {
    rect(ox, oy, 1, 6, 14, 6, 152, 62, 42);
    rect(ox, oy, 1, 5, 14, 2, 222, 222, 222);
    rect(ox, oy, 2, 5, 5, 2, 232, 232, 232);
  });
  // map
  draw(71, (ox, oy) => {
    rect(ox, oy, 2, 3, 12, 11, 198, 172, 112);
    rect(ox, oy, 3, 4, 10, 9, 222, 202, 142);
    rect(ox, oy, 5, 6, 3, 3, 122, 162, 82);
    rect(ox, oy, 9, 8, 3, 3, 82, 132, 182);
  });
  // slimeball
  draw(72, (ox, oy) => {
    rect(ox, oy, 5, 5, 6, 6, 112, 192, 82);
    rect(ox, oy, 4, 6, 8, 4, 112, 192, 82);
    rect(ox, oy, 6, 6, 2, 2, 162, 232, 132);
  });
  // leather armor pieces row
  const armor = [
    [[5, 4, 6, 2], [4, 6, 8, 5]],       // helmet
    [[3, 3, 10, 8], [2, 5, 1, 5]],      // chestplate
    [[4, 3, 8, 10], [3, 4, 2, 8]],      // leggings
    [[4, 8, 8, 5], [3, 10, 2, 3]],      // boots
  ];
  armor.forEach((shape, i) => {
    draw(73 + i, (ox, oy) => {
      shape.forEach(([x, y, w, h]) => rect(ox, oy, x, y, w, h, 180, 108, 58));
      rect(ox, oy, 5, 5, 2, 2, 202, 130, 78);
    });
  });
  const armorColors = [[188, 188, 188], [88, 220, 214], [242, 208, 64]];
  armorColors.forEach(([r, g, b], material) => {
    armor.forEach((shape, piece) => {
      draw(78 + material * 4 + piece, (ox, oy) => {
        shape.forEach(([x, y, w, h]) => rect(ox, oy, x, y, w, h, r, g, b));
        rect(ox, oy, 5, 5, 2, 2, Math.min(255, r + 35), Math.min(255, g + 35), Math.min(255, b + 35));
      });
    });
  });
  // rotten flesh
  draw(90, (ox, oy) => {
    rect(ox, oy, 3, 5, 10, 7, 142, 48, 40);
    rect(ox, oy, 4, 4, 8, 1, 184, 68, 48);
    rect(ox, oy, 5, 7, 5, 3, 172, 82, 54);
    rect(ox, oy, 7, 9, 2, 1, 104, 36, 36);
  });
  draw(91, (ox, oy, rnd) => {
    for (let i = 0; i < 12; i++) rect(ox, oy, 4 + (rnd() * 8 | 0), 4 + (rnd() * 8 | 0), 2, 2, 226, 214, 78);
  });
  // mushroom stew icon already; reeds/sugar cane item
  draw(77, (ox, oy) => {
    for (let x = 4; x < 12; x++) for (let y = 1; y < 15; y++) {
      const edge = x === 4 || x === 11;
      rect(ox, oy, x, y, 1, 1, edge ? 108 : 148, edge ? 172 : 210, edge ? 82 : 118);
      if (y % 5 === 0) rect(ox, oy, x, y, 1, 1, 110, 172, 82);
    }
  });
  // reeds item name sugar canes
  // boat (92)
  draw(92, (ox, oy) => {
    rect(ox, oy, 2, 7, 12, 5, 148, 112, 62);
    rect(ox, oy, 3, 6, 10, 2, 116, 86, 46);
    rect(ox, oy, 3, 12, 10, 1, 108, 78, 42);
    rect(ox, oy, 1, 6, 2, 4, 148, 112, 62); rect(ox, oy, 13, 6, 2, 4, 148, 112, 62);
  });
  // milk bucket (93)
  draw(93, (ox, oy) => {
    rect(ox, oy, 4, 5, 8, 2, 190, 190, 190);
    rect(ox, oy, 4, 7, 8, 5, 246, 246, 250);
    rect(ox, oy, 5, 12, 6, 1, 120, 120, 120);
    rect(ox, oy, 3, 5, 1, 7, 120, 120, 120); rect(ox, oy, 12, 5, 1, 7, 120, 120, 120);
  });
  // painting (94)
  draw(94, (ox, oy) => {
    rect(ox, oy, 2, 3, 12, 10, 118, 86, 46);
    rect(ox, oy, 3, 4, 10, 8, 92, 148, 212);
    rect(ox, oy, 3, 9, 10, 3, 86, 156, 62);
    rect(ox, oy, 10, 5, 2, 2, 250, 224, 92);
  });
  // iron door item (95)
  draw(95, (ox, oy) => {
    rect(ox, oy, 4, 1, 8, 14, 196, 196, 202);
    rect(ox, oy, 5, 2, 2, 4, 52, 52, 58); rect(ox, oy, 9, 2, 2, 4, 52, 52, 58);
    rect(ox, oy, 5, 8, 6, 5, 168, 168, 174);
  });
  // wood door item (96)
  draw(96, (ox, oy) => {
    rect(ox, oy, 4, 1, 8, 14, 152, 118, 68);
    rect(ox, oy, 5, 2, 2, 4, 52, 38, 22); rect(ox, oy, 9, 2, 2, 4, 52, 38, 22);
    rect(ox, oy, 5, 8, 6, 5, 126, 94, 52);
  });
  // bone meal (97)
  draw(97, (ox, oy, rnd) => {
    for (let i = 0; i < 16; i++) rect(ox, oy, 4 + (rnd() * 8 | 0), 5 + (rnd() * 7 | 0), 2, 2, 238, 238, 232);
    rect(ox, oy, 6, 6, 4, 4, 250, 250, 246);
  });
  // redstone repeater (98)
  draw(98, (ox, oy) => {
    rect(ox, oy, 2, 9, 12, 4, 142, 142, 142);
    rect(ox, oy, 5, 6, 2, 3, 222, 36, 36); rect(ox, oy, 9, 6, 2, 3, 222, 36, 36);
    rect(ox, oy, 4, 10, 8, 1, 182, 32, 32);
  });
  // Distinct variants, rather than reusing the plain cart icon.
  for (const [idx, chest] of [[104, true], [105, false]]) draw(idx, (ox, oy) => {
    rect(ox, oy, 3, 2, 10, 7, ...(chest ? [160, 115, 55] : [125, 125, 125]));
    rect(ox, oy, 3, 2, 10, 1, ...(chest ? [91, 63, 32] : [175, 175, 175]));
    if (chest) { rect(ox, oy, 3, 5, 10, 1, 80, 55, 30); rect(ox, oy, 7, 4, 2, 3, 216, 212, 192); }
    else { rect(ox, oy, 5, 4, 6, 3, 52, 52, 52); rect(ox, oy, 5, 7, 6, 1, 189, 189, 189); }
    rect(ox, oy, 2, 8, 12, 4, 154, 154, 154);
    rect(ox, oy, 3, 9, 10, 2, 118, 118, 118);
    rect(ox, oy, 3, 12, 3, 2, 76, 76, 76); rect(ox, oy, 10, 12, 3, 2, 76, 76, 76);
  });
  return canvas;
}

// Mob skin canvases (simple classic-style textures)
export function buildMobTexture(name) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const ctx = c.getContext('2d');
  const rnd = tileRand(name.length * 991 + 13);
  const fill = (x, y, w, h, r, g, b, a = 255) => {
    ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
    ctx.fillRect(x, y, w, h);
  };
  const noise = (x, y, w, h, base, vary) => {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const v = (rnd() - 0.5) * 2 * vary;
      fill(x + xx, y + yy, 1, 1, base[0] + v, base[1] + v, base[2] + v);
    }
  };
  switch (name) {
    case 'pig':
      noise(0, 0, 64, 32, [222, 132, 140], 12); // base pink
      noise(8, 8, 8, 8, [222, 132, 140], 10);
      fill(8, 8, 8, 8, 232, 160, 162); // snout area
      fill(10, 10, 2, 2, 192, 102, 112); fill(14, 10, 2, 2, 192, 102, 112);
      fill(8, 10, 2, 2, 32, 32, 32); fill(12, 10, 2, 2, 32, 32, 32); // eyes
      break;
    case 'cow':
      noise(0, 0, 64, 32, [122, 82, 52], 12);
      noise(8, 8, 8, 8, [152, 112, 72], 10);
      fill(10, 10, 2, 2, 232, 232, 232); fill(14, 10, 2, 2, 232, 232, 232);
      // patches
      for (let i = 0; i < 6; i++) fill((rnd() * 56) | 0, (rnd() * 24) | 0, 5, 4, 82, 52, 32);
      break;
    case 'sheep':
      noise(0, 0, 64, 32, [232, 232, 232], 10);
      noise(8, 8, 8, 8, [212, 182, 142], 8); // face
      fill(10, 12, 2, 2, 32, 32, 32); fill(14, 12, 2, 2, 32, 32, 32);
      break;
    case 'chicken':
      noise(0, 0, 64, 32, [232, 232, 232], 8);
      fill(0, 0, 64, 2, 182, 42, 42); // comb region at top-left of head
      fill(10, 10, 2, 2, 32, 32, 32); fill(14, 10, 2, 2, 32, 32, 32);
      fill(11, 12, 4, 3, 222, 142, 42); // beak
      break;
    case 'zombie':
      noise(0, 0, 64, 32, [62, 122, 62], 10);
      noise(8, 8, 8, 8, [82, 152, 72], 8); // head
      fill(9, 10, 2, 2, 12, 12, 12); fill(13, 10, 2, 2, 12, 12, 12);
      noise(16, 16, 24, 16, [42, 72, 132], 10); // shirt
      break;
    case 'skeleton':
      noise(0, 0, 64, 32, [182, 182, 182], 10);
      noise(8, 8, 8, 8, [202, 202, 202], 8);
      fill(9, 11, 2, 3, 22, 22, 22); fill(13, 11, 2, 3, 22, 22, 22);
      fill(10, 15, 4, 1, 22, 22, 22);
      // ribs
      for (let i = 0; i < 5; i++) fill(18, 18 + i * 2, 20, 1, 122, 122, 122);
      break;
    case 'creeper':
      noise(0, 0, 64, 32, [82, 182, 72], 14);
      noise(8, 8, 8, 8, [92, 192, 82], 12);
      fill(9, 10, 2, 3, 22, 22, 22); fill(13, 10, 2, 3, 22, 22, 22);
      fill(10, 14, 4, 3, 22, 22, 22); // mouth
      // dark camo squares
      for (let i = 0; i < 10; i++) fill((rnd() * 56) | 0, (rnd() * 26) | 0, 3, 3, 52, 132, 42);
      break;
    case 'spider':
      noise(0, 0, 64, 32, [42, 32, 32], 10);
      fill(9, 10, 2, 2, 182, 22, 22); fill(13, 10, 2, 2, 182, 22, 22);
      fill(6, 12, 2, 2, 182, 22, 22); fill(16, 12, 2, 2, 182, 22, 22);
      break;
    default:
      noise(0, 0, 64, 32, [182, 182, 182], 20);
  }
  return c;
}
