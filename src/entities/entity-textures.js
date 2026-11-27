// Authentic 16px-per-block voxel entity skin & UV-mapped geometry system.
// Uses pure RGBA DataTextures (NearestFilter, SRGBColorSpace) so every mob,
// player avatar, first-person arm, vehicle, projectile, and XP orb renders with
// crisp pixel art in WebGL and remains deterministic in headless Node tests.
import * as THREE from 'three';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clampByte = v => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

export class PixelSheet {
  constructor(width = 64, height = 64, seed = 1337) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
    this.rnd = mulberry32(seed);
  }

  px(x, y, r, g, b, a = 255) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = clampByte(r);
    this.data[i + 1] = clampByte(g);
    this.data[i + 2] = clampByte(b);
    this.data[i + 3] = clampByte(a);
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return [0, 0, 0, 0];
    const i = (y * this.width + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  rect(x, y, w, h, r, g, b, a = 255) {
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) this.px(x + xx, y + yy, r, g, b, a);
    }
  }

  noise(x, y, w, h, [r, g, b], vary = 10, a = 255) {
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const d = (this.rnd() - 0.5) * 2 * vary;
        this.px(x + xx, y + yy, r + d, g + d, b + d, a);
      }
    }
  }

  dither(x, y, w, h, c1, c2, vary = 6) {
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const c = ((xx + yy) & 1) === 0 ? c1 : c2;
        const d = (this.rnd() - 0.5) * 2 * vary;
        this.px(x + xx, y + yy, c[0] + d, c[1] + d, c[2] + d, c[3] ?? 255);
      }
    }
  }

  border(x, y, w, h, r, g, b, a = 255) {
    for (let xx = 0; xx < w; xx++) {
      this.px(x + xx, y, r, g, b, a);
      this.px(x + xx, y + h - 1, r, g, b, a);
    }
    for (let yy = 0; yy < h; yy++) {
      this.px(x, y + yy, r, g, b, a);
      this.px(x + w - 1, y + yy, r, g, b, a);
    }
  }

  // Paint all 6 faces of a standard skin cuboid at (u, v) of pixel size (pw, ph, pd).
  paintBox(u, v, pw, ph, pd, baseColor, vary = 10, shadeEdges = true) {
    const faces = skinLayout(u, v, pw, ph, pd);
    for (const [faceName, [fx, fy, fw, fh]] of Object.entries(faces)) {
      const mult = faceName === 'top' ? 1.05 : faceName === 'bottom' ? 0.82 : 1.0;
      const col = [baseColor[0] * mult, baseColor[1] * mult, baseColor[2] * mult];
      this.noise(fx, fy, fw, fh, col, vary);
      if (shadeEdges && fw >= 3 && fh >= 3) {
        for (let xx = 0; xx < fw; xx++) {
          const [r, g, b, a] = this.get(fx + xx, fy + fh - 1);
          if (a > 0) this.px(fx + xx, fy + fh - 1, r * 0.91, g * 0.91, b * 0.91, a);
        }
      }
    }
    return faces;
  }

  toTexture() {
    const tex = new THREE.DataTexture(this.data, this.width, this.height, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.flipY = true;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }
}

export function skinLayout(u, v, pw, ph, pd) {
  return {
    top: [u + pd, v, pw, pd],
    bottom: [u + pd + pw, v, pw, pd],
    right: [u, v + pd, pd, ph],
    front: [u + pd, v + pd, pw, ph],
    left: [u + pd + pw, v + pd, pd, ph],
    back: [u + pd * 2 + pw, v + pd, pw, ph],
  };
}

const uvBoxCache = new Map();

/**
 * Build a BoxGeometry(w, h, d) whose 6 faces map cleanly to pixel rectangles
 * on a (texW × texH) DataTexture with NearestFilter inset protection.
 * BoxGeometry face group order: 0:+X(right), 1:-X(left), 2:+Y(top), 3:-Y(bottom), 4:+Z(back), 5:-Z(front).
 */
export function uvBox(w, h, d, faces, texW = 64, texH = 64) {
  const all = faces.all || [0, 0, 8, 8];
  const order = [
    faces.right || faces.side || all,
    faces.left || faces.side || all,
    faces.top || all,
    faces.bottom || faces.top || all,
    faces.back || faces.side || all,
    faces.front || faces.side || all,
  ];
  const key = `${w},${h},${d}|${texW}x${texH}|${order.map(r => r.join(',')).join(';')}`;
  if (uvBoxCache.has(key)) return uvBoxCache.get(key);

  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.getAttribute('uv');
  const eps = 0.035;

  // Each face in BoxGeometry has 4 consecutive vertices (24 vertices total):
  // v0=(0,1), v1=(1,1), v2=(0,0), v3=(1,0).
  for (let f = 0; f < 6; f++) {
    const [rx, ry, rw, rh] = order[f];
    let u0 = (rx + eps) / texW;
    let u1 = (rx + rw - eps) / texW;
    const v1 = 1 - (ry + eps) / texH;      // top of rect
    const v0 = 1 - (ry + rh - eps) / texH; // bottom of rect
    // On face 5 (-Z, entity front), BoxGeometry +X is u=0 and -X is u=1.
    // Flip u0/u1 on -Z and +X so pixel x=0..rw reads left-to-right when viewing the front!
    if (f === 5 || f === 0) [u0, u1] = [u1, u0];
    const base = f * 4;
    uv.setXY(base + 0, u0, v1);
    uv.setXY(base + 1, u1, v1);
    uv.setXY(base + 2, u0, v0);
    uv.setXY(base + 3, u1, v0);
  }
  uv.needsUpdate = true;
  uvBoxCache.set(key, geo);
  return geo;
}

export function skinBoxGeo(w, h, d, u, v, pw, ph, pd, texW = 64, texH = 64) {
  return uvBox(w, h, d, skinLayout(u, v, pw, ph, pd), texW, texH);
}

/* ------------------------------------------------------------------ */
/* Hand-Crafted Mob Pixel-Art Skins (64×64)                           */
/* ------------------------------------------------------------------ */

const mobSkinCache = new Map();
const mobSheetCache = new Map();

export function buildMobPixelSheet(variant) {
  if (mobSheetCache.has(variant)) return mobSheetCache.get(variant);
  const s = new PixelSheet(64, 64, [...String(variant)].reduce((a, c) => a * 131 + c.charCodeAt(0), 17));

  switch (variant) {
    case 'pig': {
      // Head (0,0) 8×8×8
      const head = s.paintBox(0, 0, 8, 8, 8, [234, 148, 152], 10);
      const [fx, fy] = head.front;
      // Forehead brow & rosy cheeks
      s.noise(fx + 1, fy + 1, 6, 2, [242, 166, 170], 6);
      // Classic wide-set pig eyes (white sclera outside, dark pupil inside)
      s.px(fx + 0, fy + 3, 250, 250, 252); s.px(fx + 1, fy + 3, 30, 24, 26);
      s.px(fx + 6, fy + 3, 30, 24, 26);    s.px(fx + 7, fy + 3, 250, 250, 252);
      // Ears on sides
      s.rect(head.left[0] + 2, head.left[1] + 1, 3, 3, 212, 120, 126);
      s.rect(head.right[0] + 3, head.right[1] + 1, 3, 3, 212, 120, 126);

      // Protruding 3D snout (32,0) 4×3×2
      const snout = s.paintBox(32, 0, 4, 3, 2, [242, 162, 166], 6);
      s.px(snout.front[0] + 0, snout.front[1] + 1, 118, 52, 58);
      s.px(snout.front[0] + 3, snout.front[1] + 1, 118, 52, 58);
      s.rect(snout.top[0], snout.top[1], 4, 1, 250, 182, 186);

      // Body (0,16) 10×8×14
      const body = s.paintBox(0, 16, 10, 8, 14, [228, 140, 146], 11);
      // Darker dorsal spine dither on top + warm belly on bottom + curly tail on back
      s.noise(body.top[0] + 3, body.top[1] + 1, 4, 12, [212, 122, 130], 9);
      s.noise(body.bottom[0] + 1, body.bottom[1] + 1, 8, 12, [206, 118, 126], 8);
      s.rect(body.back[0] + 4, body.back[1] + 2, 2, 1, 204, 110, 118);
      s.px(body.back[0] + 5, body.back[1] + 3, 204, 110, 118);
      s.rect(body.back[0] + 3, body.back[1] + 4, 2, 1, 204, 110, 118);

      // Legs (0,40) 4×6×4 with cloven dark-pink hooves
      const leg = s.paintBox(0, 40, 4, 6, 4, [222, 134, 140], 9);
      for (const face of [leg.front, leg.back, leg.left, leg.right]) {
        s.rect(face[0], face[1] + 4, 4, 2, 152, 78, 86);
      }
      s.px(leg.front[0] + 1, leg.front[1] + 5, 112, 52, 58);
      s.px(leg.front[0] + 2, leg.front[1] + 5, 112, 52, 58);
      break;
    }

    case 'cow': {
      // Head (0,0) 8×8×6
      const head = s.paintBox(0, 0, 8, 8, 6, [88, 62, 44], 10);
      const [fx, fy] = head.front;
      // White forehead diamond blaze
      s.rect(fx + 3, fy + 1, 2, 3, 236, 232, 224);
      s.rect(fx + 2, fy + 2, 4, 1, 236, 232, 224);
      // Outward cow eyes
      s.px(fx + 0, fy + 3, 246, 246, 248); s.px(fx + 1, fy + 3, 26, 22, 20);
      s.px(fx + 6, fy + 3, 26, 22, 20);    s.px(fx + 7, fy + 3, 246, 246, 248);

      // Muzzle (32,0) 6×3×2
      const muz = s.paintBox(32, 0, 6, 3, 2, [218, 168, 158], 7);
      s.px(muz.front[0] + 1, muz.front[1] + 1, 88, 48, 46);
      s.px(muz.front[0] + 4, muz.front[1] + 1, 88, 48, 46);

      // Horns (48,0) 2×4×2
      const horn = s.paintBox(48, 0, 2, 4, 2, [224, 214, 188], 6);
      for (const f of [horn.front, horn.back, horn.left, horn.right]) {
        s.rect(f[0], f[1], 2, 1, 246, 240, 222);
        s.rect(f[0], f[1] + 3, 2, 1, 148, 132, 106);
      }

      // Body (0,15) 10×8×14 — rich brown hide with cream-white organic dairy patches
      const body = s.paintBox(0, 15, 10, 8, 14, [84, 56, 38], 10);
      const paintSpot = (face, sx, sy, sw, sh) => {
        s.noise(face[0] + sx, face[1] + sy, sw, sh, [232, 228, 218], 8);
      };
      paintSpot(body.top, 1, 2, 5, 4);
      paintSpot(body.top, 4, 8, 5, 4);
      paintSpot(body.left, 2, 1, 5, 4);
      paintSpot(body.left, 9, 3, 4, 4);
      paintSpot(body.right, 1, 2, 4, 5);
      paintSpot(body.right, 8, 1, 4, 3);
      paintSpot(body.back, 2, 1, 5, 4);
      // Pink udder on underside
      s.noise(body.bottom[0] + 3, body.bottom[1] + 8, 4, 4, [232, 164, 168], 6);

      // Legs (0,39) 4×9×4
      const leg = s.paintBox(0, 39, 4, 9, 4, [82, 54, 36], 9);
      for (const f of [leg.front, leg.back, leg.left, leg.right]) {
        s.noise(f[0], f[1] + 3, 4, 3, [228, 224, 214], 7);
        s.rect(f[0], f[1] + 7, 4, 2, 42, 32, 26);
      }
      break;
    }

    case 'sheep':
    case 'sheep_sheared': {
      const sheared = variant === 'sheep_sheared';
      // Head (0,0) 7×7×7 — warm tan face with wool crown
      const head = s.paintBox(0, 0, 7, 7, 7, [238, 236, 230], 9);
      const [fx, fy] = head.front;
      // Tan face inset below wool bangs
      s.noise(fx + 1, fy + 2, 5, 5, [214, 180, 148], 7);
      s.px(fx + 1, fy + 3, 250, 250, 252); s.px(fx + 2, fy + 3, 28, 24, 22);
      s.px(fx + 4, fy + 3, 28, 24, 22);    s.px(fx + 5, fy + 3, 250, 250, 252);
      // Pink sheep nose/mouth
      s.rect(fx + 2, fy + 5, 3, 2, 226, 152, 154);

      const paintFluffyWool = (face) => {
        const [wx, wy, ww, wh] = face;
        for (let yy = 0; yy < wh; yy++) {
          for (let xx = 0; xx < ww; xx++) {
            const curl = ((xx * 3 + yy * 5) % 7);
            const c = curl === 0 ? [202, 198, 190] : curl < 3 ? [228, 225, 218] : [248, 247, 244];
            const d = (s.rnd() - 0.5) * 10;
            s.px(wx + xx, wy + yy, c[0] + d, c[1] + d, c[2] + d);
          }
        }
      };

      // Body (0,16) 10×8×14
      const body = s.paintBox(0, 16, 10, 8, 14, sheared ? [216, 182, 152] : [240, 238, 232], 9);
      if (!sheared) {
        for (const f of Object.values(body)) paintFluffyWool(f);
      } else {
        // Sheared tan hide with leftover wool tufts!
        for (const f of [body.top, body.left, body.right, body.back]) {
          for (let i = 0; i < 6; i++) {
            const tx = (s.rnd() * Math.max(1, f[2] - 2)) | 0;
            const ty = (s.rnd() * Math.max(1, f[3] - 2)) | 0;
            s.rect(f[0] + tx, f[1] + ty, 2, 2, 238, 236, 230);
          }
        }
      }

      // Legs (0,40) 4×9×4 — wool upper cuff + tan lower shin + dark hooves
      const leg = s.paintBox(0, 40, 4, 9, 4, [212, 178, 146], 7);
      for (const f of [leg.front, leg.back, leg.left, leg.right]) {
        if (!sheared) s.noise(f[0], f[1], 4, 4, [240, 238, 232], 10);
        s.rect(f[0], f[1] + 7, 4, 2, 68, 52, 42);
      }
      break;
    }

    case 'chicken': {
      // Head (0,0) 4×6×4
      const head = s.paintBox(0, 0, 4, 6, 4, [246, 246, 248], 6);
      const [fx, fy] = head.front;
      s.px(fx + 0, fy + 2, 24, 24, 28);
      s.px(fx + 3, fy + 2, 24, 24, 28);
      // Red comb (20,0) 2×2×3 & wattle (32,0) 2×2×2
      s.paintBox(20, 0, 2, 2, 3, [212, 38, 36], 8);
      s.paintBox(32, 0, 2, 2, 2, [206, 34, 34], 8);
      // Golden beak (42,0) 4×2×3
      const beak = s.paintBox(42, 0, 4, 2, 3, [234, 162, 42], 7);
      s.rect(beak.bottom[0], beak.bottom[1], 4, 3, 186, 118, 26);

      // Body (0,12) 6×6×8 — layered white plumage
      const body = s.paintBox(0, 12, 6, 6, 8, [244, 244, 246], 7);
      for (let z = 1; z < 7; z += 2) {
        s.rect(body.top[0] + 1, body.top[1] + z, 4, 1, 224, 226, 232);
      }
      // Wings (30,12) 2×4×6 with feather tip shading
      const wing = s.paintBox(30, 12, 2, 4, 6, [240, 240, 244], 6);
      for (const f of [wing.left, wing.right]) {
        for (let x = 0; x < 6; x += 2) s.px(f[0] + x, f[1] + 3, 206, 208, 216);
      }
      // Scaly yellow-orange legs (0,28) 2×5×2
      const leg = s.paintBox(0, 28, 2, 5, 2, [236, 168, 38], 8);
      for (const f of [leg.front, leg.back, leg.left, leg.right]) {
        for (let y = 1; y < 5; y += 2) s.rect(f[0], f[1] + y, 2, 1, 198, 128, 24);
      }
      break;
    }

    case 'creeper': {
      const paintCamo = (face) => {
        const [cx, cy, cw, ch] = face;
        const palette = [
          [78, 184, 68], [96, 204, 82], [62, 156, 54], [118, 218, 102], [46, 126, 40],
        ];
        for (let yy = 0; yy < ch; yy++) {
          for (let xx = 0; xx < cw; xx++) {
            const pick = palette[((xx * 7 + yy * 13 + ((s.rnd() * 5) | 0)) % palette.length)];
            const d = (s.rnd() - 0.5) * 14;
            s.px(cx + xx, cy + yy, pick[0] + d, pick[1] + d, pick[2] + d);
          }
        }
      };

      // Head (0,0) 8×8×8 with iconic pixel Creeper face!
      const head = skinLayout(0, 0, 8, 8, 8);
      for (const f of Object.values(head)) paintCamo(f);
      const [fx, fy] = head.front;
      // 2×2 eyes at (1,2) and (5,2) with dark shaded socket rim
      s.rect(fx + 1, fy + 2, 2, 2, 16, 20, 16);
      s.rect(fx + 5, fy + 2, 2, 2, 16, 20, 16);
      s.px(fx + 1, fy + 1, 40, 104, 36); s.px(fx + 6, fy + 1, 40, 104, 36);
      // Classic Creeper mouth: bridge (3..4, 4), full frown (2..5, 5..6), fangs (2,7) & (5,7)
      s.rect(fx + 3, fy + 4, 2, 1, 20, 24, 20);
      s.rect(fx + 2, fy + 5, 4, 2, 14, 18, 14);
      s.px(fx + 2, fy + 7, 18, 22, 18);
      s.px(fx + 5, fy + 7, 18, 22, 18);

      // Body (0,16) 8×12×4
      const body = skinLayout(0, 16, 8, 12, 4);
      for (const f of Object.values(body)) paintCamo(f);

      // Legs (0,32) 4×6×4 with dark mottled toes
      const leg = skinLayout(0, 32, 4, 6, 4);
      for (const f of Object.values(leg)) paintCamo(f);
      for (const f of [leg.front, leg.back, leg.left, leg.right]) {
        s.rect(f[0], f[1] + 5, 4, 1, 28, 52, 26);
        s.px(f[0] + 1, f[1] + 5, 18, 24, 18);
        s.px(f[0] + 3, f[1] + 5, 18, 24, 18);
      }
      break;
    }

    case 'zombie': {
      // Head (0,0) 8×8×8 — mossy green undead skin + dark unkempt scalp
      const head = s.paintBox(0, 0, 8, 8, 8, [82, 138, 72], 12);
      s.noise(head.top[0], head.top[1], 8, 8, [46, 78, 42], 9);
      for (const f of [head.front, head.back, head.left, head.right]) {
        s.noise(f[0], f[1], f[2], 2, [48, 82, 44], 8);
      }
      const [fx, fy] = head.front;
      // Sunken zombie eyes + dark nose + grimacing jaw
      s.rect(fx + 1, fy + 3, 2, 1, 36, 62, 34);
      s.rect(fx + 5, fy + 3, 2, 1, 36, 62, 34);
      s.rect(fx + 1, fy + 4, 2, 1, 16, 22, 16);
      s.rect(fx + 5, fy + 4, 2, 1, 16, 22, 16);
      s.rect(fx + 3, fy + 5, 2, 1, 52, 92, 46);
      s.rect(fx + 2, fy + 6, 4, 1, 34, 58, 32);

      // Torso (16,16) 8×12×4 — tattered cyan-teal shirt with V-collar & torn hem
      const body = s.paintBox(16, 16, 8, 12, 4, [44, 132, 146], 11);
      s.rect(body.front[0] + 3, body.front[1], 2, 2, 76, 128, 66); // exposed green neck
      s.px(body.front[0] + 1, body.front[1] + 11, 44, 62, 124);
      s.px(body.front[0] + 5, body.front[1] + 11, 44, 62, 124);

      // Arms (40,16) 4×12×4 — torn teal shoulder sleeve + green undead arms
      const arm = s.paintBox(40, 16, 4, 12, 4, [80, 136, 70], 11);
      for (const f of [arm.front, arm.back, arm.left, arm.right]) {
        s.noise(f[0], f[1], 4, 3, [44, 132, 146], 9);
      }
      s.noise(arm.top[0], arm.top[1], 4, 4, [44, 132, 146], 9);

      // Legs (0,16) 4×12×4 — indigo trousers + scuffed grey boots
      const leg = s.paintBox(0, 16, 4, 12, 4, [48, 62, 128], 10);
      for (const f of [leg.front, leg.back, leg.left, leg.right]) {
        s.noise(f[0], f[1] + 10, 4, 2, [68, 68, 72], 7);
      }
      break;
    }

    case 'skeleton': {
      // Skull (0,0) 8×8×8 — weathered bone ivory with hollow sockets, nasal cavity & teeth
      const head = s.paintBox(0, 0, 8, 8, 8, [218, 214, 204], 9);
      const [fx, fy] = head.front;
      s.rect(fx + 1, fy + 3, 2, 2, 24, 22, 22);
      s.rect(fx + 5, fy + 3, 2, 2, 24, 22, 22);
      s.rect(fx + 3, fy + 5, 2, 1, 38, 36, 34);
      for (let x = 1; x < 7; x++) {
        const tooth = (x & 1) === 0 ? [184, 180, 170] : [58, 54, 52];
        s.px(fx + x, fy + 6, ...tooth);
      }
      s.rect(fx + 1, fy + 7, 6, 1, 198, 194, 184);

      // Ribcage Torso (16,16) 8×12×4 — actual alpha-cutout ribs, sternum, spine & pelvis!
      const body = skinLayout(16, 16, 8, 12, 4);
      for (const f of Object.values(body)) s.rect(f[0], f[1], f[2], f[3], 0, 0, 0, 0);
      // Collarbone + top/bottom caps
      s.noise(body.top[0], body.top[1], 8, 4, [210, 206, 196], 7);
      s.noise(body.bottom[0], body.bottom[1], 8, 4, [196, 192, 182], 7);
      // Front: sternum + 4 pairs of ribs + pelvis
      const [bfx, bfy] = body.front;
      s.noise(bfx, bfy, 8, 2, [216, 212, 202], 7);       // clavicle
      s.noise(bfx + 3, bfy + 2, 2, 7, [212, 208, 198], 6); // sternum
      for (const ry of [3, 5, 7]) {
        s.noise(bfx + 1, bfy + ry, 6, 1, [206, 202, 192], 6);
      }
      s.noise(bfx + 1, bfy + 10, 6, 2, [208, 204, 194], 7); // pelvis
      // Back: spine + ribs + pelvis
      const [bbx, bby] = body.back;
      s.noise(bbx + 3, bby, 2, 12, [198, 194, 184], 7);
      for (const ry of [1, 3, 5, 7]) {
        s.noise(bbx + 1, bby + ry, 6, 1, [194, 190, 180], 6);
      }
      s.noise(bbx + 1, bby + 10, 6, 2, [200, 196, 186], 7);
      // Sides: rib bands
      for (const sf of [body.left, body.right]) {
        for (const ry of [0, 1, 3, 5, 7, 10, 11]) {
          s.noise(sf[0], sf[1] + ry, 4, 1, [198, 194, 184], 6);
        }
      }

      // Thin Bone Limbs (40,16) 2×12×2
      const limb = s.paintBox(40, 16, 2, 12, 2, [212, 208, 198], 8);
      for (const f of [limb.front, limb.back, limb.left, limb.right]) {
        s.rect(f[0], f[1], 2, 1, 232, 228, 218);
        s.rect(f[0], f[1] + 5, 2, 1, 178, 174, 164); // elbow / knee joint
        s.rect(f[0], f[1] + 11, 2, 1, 228, 224, 214);
      }

      // Bow (52,16) 2×12×2
      const bow = s.paintBox(52, 16, 2, 12, 2, [132, 92, 48], 8);
      s.rect(bow.back[0], bow.back[1], 2, 12, 228, 228, 232); // taut bowstring
      break;
    }

    case 'spider': {
      // Cephalothorax Head (0,0) 8×8×8 — dark chitin with multi-eye cluster
      const head = s.paintBox(0, 0, 8, 8, 8, [44, 34, 32], 8);
      const [fx, fy] = head.front;
      // Chelicerae fangs at bottom
      s.rect(fx + 2, fy + 6, 1, 2, 24, 16, 16);
      s.rect(fx + 5, fy + 6, 1, 2, 24, 16, 16);
      // Abdomen (0,16) 10×8×12 — chitinous brown-black with rusty red dorsal chevrons
      const abd = s.paintBox(0, 16, 10, 8, 12, [38, 28, 27], 9);
      for (const z of [2, 5, 8]) {
        s.rect(abd.top[0] + 3, abd.top[1] + z, 4, 2, 96, 38, 34);
        s.px(abd.top[0] + 2, abd.top[1] + z + 1, 78, 32, 28);
        s.px(abd.top[0] + 7, abd.top[1] + z + 1, 78, 32, 28);
      }
      // Banded Chitin Legs (0,38) 12×2×2
      const leg = s.paintBox(0, 38, 12, 2, 2, [42, 32, 30], 7);
      for (const f of [leg.front, leg.back, leg.top, leg.bottom]) {
        for (let x = 2; x < 12; x += 3) s.rect(f[0] + x, f[1], 1, 2, 68, 50, 46);
      }
      // Glowing Spider Eye Tile (48,0) 4×4
      s.rect(48, 0, 4, 4, 212, 24, 24);
      s.px(49, 1, 255, 96, 96);
      break;
    }

    case 'pigman': {
      // Head (0,0) 8×8×8 — left half porcine pink, right half exposed bone skull + rot!
      const head = s.paintBox(0, 0, 8, 8, 8, [224, 140, 146], 9);
      const [fx, fy] = head.front;
      // Right side exposed bleached skull + necrotic green margin
      s.noise(fx + 4, fy + 1, 4, 6, [228, 224, 210], 7);
      s.noise(fx + 3, fy + 1, 1, 6, [88, 146, 76], 8);
      s.noise(head.left[0], head.left[1] + 1, 6, 6, [222, 218, 204], 8);
      // Left eye (normal pig eye) & right eye (dark hollow skull socket with crimson glint)
      s.px(fx + 0, fy + 3, 248, 248, 250); s.px(fx + 1, fy + 3, 28, 22, 24);
      s.rect(fx + 5, fy + 3, 2, 2, 24, 18, 18);
      s.px(fx + 5, fy + 3, 224, 38, 38);
      // Snout & skull teeth
      s.rect(fx + 2, fy + 4, 2, 2, 238, 160, 164);
      s.px(fx + 2, fy + 5, 116, 52, 58);
      s.px(fx + 5, fy + 6, 64, 58, 54); s.px(fx + 7, fy + 6, 64, 58, 54);

      // Body (16,16) 8×12×4 — pink skin + exposed ribs + green rot + tattered loincloth
      const body = s.paintBox(16, 16, 8, 12, 4, [218, 134, 140], 10);
      const [bfx, bfy] = body.front;
      s.noise(bfx + 3, bfy + 1, 5, 7, [86, 144, 74], 10);
      for (const ry of [2, 4, 6]) s.rect(bfx + 4, bfy + ry, 3, 1, 224, 220, 206);
      for (const f of [body.front, body.back, body.left, body.right]) {
        s.noise(f[0], f[1] + 9, f[2], 3, [122, 86, 48], 8);
      }
      s.rect(bfx + 3, bfy + 9, 2, 2, 236, 196, 54); // gold belt clasp

      // Arms (40,16) 4×12×4 & Legs (0,16) 4×12×4
      const arm = s.paintBox(40, 16, 4, 12, 4, [218, 134, 140], 9);
      s.noise(arm.front[0], arm.front[1] + 3, 4, 5, [86, 144, 74], 9);
      const leg = s.paintBox(0, 16, 4, 12, 4, [214, 130, 136], 9);
      for (const f of [leg.front, leg.back, leg.left, leg.right]) {
        s.noise(f[0], f[1], 4, 3, [118, 82, 46], 7);
        s.noise(f[0], f[1] + 5, 4, 3, [84, 140, 72], 9);
        s.rect(f[0], f[1] + 10, 4, 2, 138, 72, 78);
      }

      // Golden Sword (56,16) 1×11×2
      const sword = s.paintBox(56, 16, 1, 11, 2, [246, 208, 52], 8);
      for (const f of [sword.left, sword.right]) {
        s.rect(f[0], f[1], 2, 8, 252, 224, 78);
        s.px(f[0], f[1] + 1, 255, 250, 178);
        s.rect(f[0], f[1] + 8, 2, 1, 188, 136, 28); // crossguard
        s.rect(f[0], f[1] + 9, 2, 2, 112, 74, 38);  // leather grip
      }
      break;
    }

    case 'blaze': {
      // Incandescent Blaze Head (0,0) 8×8×8
      const head = skinLayout(0, 0, 8, 8, 8);
      for (const f of Object.values(head)) {
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            const grad = y / 7;
            const r = 255 - grad * 38 + (s.rnd() - 0.5) * 18;
            const g = 216 - grad * 112 + (s.rnd() - 0.5) * 22;
            const b = 58 - grad * 42;
            s.px(f[0] + x, f[1] + y, r, g, b);
          }
        }
      }
      const [fx, fy] = head.front;
      // Smoky dark brow + white-hot blazing eyes
      s.rect(fx + 1, fy + 2, 2, 1, 78, 28, 12);
      s.rect(fx + 5, fy + 2, 2, 1, 78, 28, 12);
      s.px(fx + 1, fy + 3, 255, 255, 224); s.px(fx + 2, fy + 3, 255, 232, 92);
      s.px(fx + 5, fy + 3, 255, 232, 92);  s.px(fx + 6, fy + 3, 255, 255, 224);
      s.rect(fx + 2, fy + 6, 4, 1, 112, 38, 14);

      // Glowing Blaze Rods (32,0) 2×8×2
      const rod = skinLayout(32, 0, 2, 8, 2);
      for (const f of [rod.front, rod.back, rod.left, rod.right]) {
        for (let y = 0; y < 8; y++) {
          const hot = 1 - y / 8;
          s.rect(f[0], f[1] + y, 2, 1, 235 + hot * 20, 118 + hot * 126, 18 + hot * 86);
        }
      }
      s.rect(rod.top[0], rod.top[1], 2, 2, 255, 248, 168);
      s.rect(rod.bottom[0], rod.bottom[1], 2, 2, 212, 96, 16);
      break;
    }

    case 'ghast':
    case 'ghast_shooting': {
      const shooting = variant === 'ghast_shooting';
      // Pale Ghostly Cube (0,0) 16×16×16
      const body = s.paintBox(0, 0, 16, 16, 16, [242, 243, 247], 7);
      // Subtle ghostly grey mottling & side gill markings
      for (const sf of [body.left, body.right]) {
        for (let i = 0; i < 3; i++) {
          s.rect(sf[0] + 4 + i * 3, sf[1] + 5, 1, 5, 206, 210, 220);
        }
      }
      const [fx, fy] = body.front;
      // Sorrowful brow ridges
      s.rect(fx + 2, fy + 4, 4, 1, 168, 172, 184);
      s.rect(fx + 10, fy + 4, 4, 1, 168, 172, 184);
      if (shooting) {
        // Wide blazing crimson-amber eyes & roaring fireball mouth!
        s.rect(fx + 2, fy + 5, 4, 2, 218, 42, 32);
        s.rect(fx + 3, fy + 5, 2, 2, 255, 212, 72);
        s.rect(fx + 10, fy + 5, 4, 2, 218, 42, 32);
        s.rect(fx + 11, fy + 5, 2, 2, 255, 212, 72);
        s.rect(fx + 5, fy + 9, 6, 4, 92, 22, 24);
        s.rect(fx + 6, fy + 10, 4, 2, 248, 128, 36);
      } else {
        // Closed/sleepy dark eyes + silvery tear tracks + sad mouth
        s.rect(fx + 2, fy + 5, 4, 1, 58, 60, 68);
        s.rect(fx + 10, fy + 5, 4, 1, 58, 60, 68);
        s.rect(fx + 6, fy + 10, 4, 2, 74, 58, 64);
        s.px(fx + 5, fy + 11, 74, 58, 64);
        s.px(fx + 10, fy + 11, 74, 58, 64);
      }
      // Silvery tear tracks under eyes
      s.rect(fx + 3, fy + 6, 1, 5, 192, 202, 214);
      s.rect(fx + 12, fy + 6, 1, 5, 192, 202, 214);

      // Tentacles (0,34) 2×11×2
      const tent = s.paintBox(0, 34, 2, 11, 2, [224, 226, 234], 8);
      for (const f of [tent.front, tent.back, tent.left, tent.right]) {
        s.noise(f[0], f[1] + 7, 2, 4, [196, 200, 212], 7);
      }
      break;
    }
  }

  mobSheetCache.set(variant, s);
  return s;
}

export function getMobSkinTexture(variant) {
  if (!mobSkinCache.has(variant)) {
    mobSkinCache.set(variant, buildMobPixelSheet(variant).toTexture());
  }
  return mobSkinCache.get(variant);
}

/* ------------------------------------------------------------------ */
/* Player Avatar & First-Person Arm Pixel-Art Skins                   */
/* ------------------------------------------------------------------ */

export const PLAYER_OUTFITS = [
  { shirt: 0x568b42, pants: 0x384b7e, skin: [208, 158, 118], hair: [73, 53, 44], eye: [52, 108, 62] },
  { shirt: 0x3f76a7, pants: 0x3d4771, skin: [224, 178, 138], hair: [86, 61, 47], eye: [54, 110, 168] },
  { shirt: 0x9c573f, pants: 0x574333, skin: [209, 155, 115], hair: [48, 37, 34], eye: [92, 68, 44] },
  { shirt: 0x8c70a7, pants: 0x354b66, skin: [228, 187, 146], hair: [91, 70, 56], eye: [112, 74, 148] },
  { shirt: 0xc09b3c, pants: 0x48613a, skin: [185, 120, 85],  hair: [40, 34, 30], eye: [78, 56, 38] },
  { shirt: 0x4a8a83, pants: 0x564366, skin: [213, 159, 120], hair: [97, 64, 44], eye: [46, 126, 122] },
];

const hexToRgb = hex => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const playerSkinCache = new Map();

export function getPlayerSkinTextures(outfitIndex = 0) {
  const idx = ((outfitIndex % PLAYER_OUTFITS.length) + PLAYER_OUTFITS.length) % PLAYER_OUTFITS.length;
  if (playerSkinCache.has(idx)) return playerSkinCache.get(idx);

  const outfit = PLAYER_OUTFITS[idx];
  const pantsRgb = hexToRgb(outfit.pants);
  const s = new PixelSheet(64, 64, 4001 + idx * 97);

  // 1. Head (0,0) 8×8×8 — skin + full wraparound hair + expressive pixel face!
  const head = s.paintBox(0, 0, 8, 8, 8, outfit.skin, 7);
  s.noise(head.top[0], head.top[1], 8, 8, outfit.hair, 9);
  s.noise(head.back[0], head.back[1], 8, 6, outfit.hair, 9);
  for (const sf of [head.left, head.right]) {
    s.noise(sf[0], sf[1], 8, 3, outfit.hair, 8);
    s.noise(sf[0] + 3, sf[1] + 3, 5, 2, outfit.hair, 8);
  }
  const [fx, fy] = head.front;
  // Hair bangs across top 2 rows + sideburn pixels
  s.noise(fx, fy, 8, 2, outfit.hair, 8);
  s.px(fx + 0, fy + 2, ...outfit.hair);
  s.px(fx + 7, fy + 2, ...outfit.hair);
  // Eyes: white sclera + colored iris
  s.px(fx + 1, fy + 4, 246, 246, 250); s.px(fx + 2, fy + 4, ...outfit.eye);
  s.px(fx + 5, fy + 4, ...outfit.eye); s.px(fx + 6, fy + 4, 246, 246, 250);
  // Subtle nose & warm smile/mouth shading
  s.rect(fx + 3, fy + 5, 2, 1, outfit.skin[0] * 0.86, outfit.skin[1] * 0.82, outfit.skin[2] * 0.80);
  s.rect(fx + 2, fy + 6, 4, 1, outfit.skin[0] * 0.74, outfit.skin[1] * 0.62, outfit.skin[2] * 0.58);

  // 2. Neutral-white shaded cloth Torso (16,16) 8×12×4 (tinted by outfit.shirt so material.color == outfit.shirt!)
  const body = s.paintBox(16, 16, 8, 12, 4, [238, 238, 242], 12);
  // Collar V-neck, vertical placket seams, belt hem
  s.rect(body.front[0] + 3, body.front[1], 2, 2, 182, 182, 188);
  for (let y = 2; y < 10; y += 2) s.px(body.front[0] + 4, body.front[1] + y, 206, 206, 212);
  for (const f of [body.front, body.back, body.left, body.right]) {
    s.rect(f[0], f[1] + 10, f[2], 2, 168, 168, 176);
  }
  s.rect(body.front[0] + 3, body.front[1] + 10, 2, 2, 250, 236, 172);

  // 3. Arms (40,16) 4×12×4 — colored shirt sleeve top 5px + skin forearm & hand bottom 7px!
  const shirtRgb = hexToRgb(outfit.shirt);
  const arm = s.paintBox(40, 16, 4, 12, 4, outfit.skin, 7);
  s.noise(arm.top[0], arm.top[1], 4, 4, shirtRgb, 10);
  for (const f of [arm.front, arm.back, arm.left, arm.right]) {
    s.noise(f[0], f[1], 4, 4, shirtRgb, 10);
    s.rect(f[0], f[1] + 4, 4, 1, shirtRgb[0] * 0.82, shirtRgb[1] * 0.82, shirtRgb[2] * 0.82);
  }

  // 4. Legs (0,16) 4×12×4 — tailored trousers + dark leather boots!
  const leg = s.paintBox(0, 16, 4, 12, 4, pantsRgb, 9);
  for (const f of [leg.front, leg.back, leg.left, leg.right]) {
    s.noise(f[0], f[1] + 9, 4, 3, [58, 46, 40], 6);
  }
  s.rect(leg.front[0] + 1, leg.front[1] + 9, 2, 1, 92, 76, 66);

  const result = { outfit, texture: s.toTexture() };
  result.bodyTex = result.texture;
  result.shirtTex = result.texture;
  playerSkinCache.set(idx, result);
  return result;
}

let fpArmTextures = null;
export function getFirstPersonArmTextures() {
  if (fpArmTextures) return fpArmTextures;
  const s = new PixelSheet(32, 32, 9182);
  // Sleeve (0,0) 4×5×4 — woven teal-blue adventurer tunic
  const sleeve = s.paintBox(0, 0, 4, 5, 4, [36, 134, 162], 10);
  for (const f of [sleeve.front, sleeve.back, sleeve.left, sleeve.right]) {
    s.rect(f[0], f[1] + 4, 4, 1, 24, 98, 122);
  }
  // Hand/Forearm (0,12) 4×8×4 — warm shaded pixel skin with subtle knuckle highlight
  const hand = s.paintBox(0, 12, 4, 8, 4, [198, 148, 116], 8);
  s.noise(hand.bottom[0], hand.bottom[1], 4, 4, [178, 128, 98], 6);
  fpArmTextures = s.toTexture();
  return fpArmTextures;
}

/* ------------------------------------------------------------------ */
/* Vehicle Pixel-Art Atlas (Boat, Minecart, Chest Cart, Furnace Cart) */
/* ------------------------------------------------------------------ */

let vehicleAtlasTexture = null;
export function getVehicleTexture() {
  if (vehicleAtlasTexture) return vehicleAtlasTexture;
  const s = new PixelSheet(64, 64, 7711);

  // Region A (0,0..31,15): Oak Boat Planks with dark caulked seams & grain
  for (let y = 0; y < 16; y++) {
    const seam = (y & 3) === 0;
    for (let x = 0; x < 32; x++) {
      const joint = ((x + (y >> 2) * 7) & 15) === 0;
      const v = (s.rnd() - 0.5) * 12;
      if (seam || joint) s.px(x, y, 104 + v * 0.5, 74 + v * 0.5, 38 + v * 0.5);
      else s.px(x, y, 166 + v, 124 + v * 0.8, 68 + v * 0.6);
    }
  }
  // Region B (32,0..47,15): Dark aged oak bench/gunwale
  s.noise(32, 0, 16, 16, [118, 84, 44], 9);
  s.border(32, 0, 16, 16, 86, 60, 30);

  // Region C (0,16..31,31): Riveted Brushed Iron Minecart Hull
  s.noise(0, 16, 32, 16, [148, 152, 158], 10);
  s.border(0, 16, 32, 16, 92, 96, 102);
  for (const rx of [2, 14, 18, 29]) {
    s.px(rx, 18, 206, 210, 216);
    s.px(rx, 29, 76, 80, 86);
  }
  // Region D (32,16..47,31): Dark recessed minecart interior floor + wheel steel
  s.noise(32, 16, 16, 16, [68, 70, 76], 8);
  s.border(32, 16, 16, 16, 44, 46, 50);
  s.rect(38, 22, 4, 4, 168, 172, 178); // wheel hubcap

  // Region E (0,32..35,47): Mini Chest (10×8×8 -> width 36, height 16)
  const chest = s.paintBox(0, 32, 10, 8, 8, [168, 120, 58], 9);
  for (const f of [chest.front, chest.back, chest.left, chest.right]) {
    s.border(f[0], f[1], f[2], f[3], 88, 58, 28);
    s.rect(f[0], f[1] + 2, f[2], 1, 72, 48, 22); // lid seam
  }
  s.border(chest.top[0], chest.top[1], 10, 8, 88, 58, 28);
  s.rect(chest.front[0] + 4, chest.front[1] + 1, 2, 3, 218, 214, 192); // silver latch

  // Region F (0,48..31,63): Mini Powered Furnace (8×8×8 -> width 32, height 16)
  const furn = s.paintBox(0, 48, 8, 8, 8, [126, 126, 130], 11);
  for (const f of [furn.front, furn.back, furn.left, furn.right, furn.top]) {
    s.border(f[0], f[1], 8, 8, 84, 84, 88);
  }
  // Furnace front grate + glowing coal embers
  s.rect(furn.front[0] + 2, furn.front[1] + 2, 4, 2, 38, 38, 42);
  s.rect(furn.front[0] + 2, furn.front[1] + 5, 4, 2, 238, 118, 28);
  s.rect(furn.front[0] + 3, furn.front[1] + 5, 2, 1, 255, 216, 76);

  vehicleAtlasTexture = s.toTexture();
  return vehicleAtlasTexture;
}

/* ------------------------------------------------------------------ */
/* Projectile & XP Orb Pixel-Art Textures                             */
/* ------------------------------------------------------------------ */

const projectileTexCache = new Map();
export function getProjectileTexture(kind = 'arrow') {
  if (projectileTexCache.has(kind)) return projectileTexCache.get(kind);
  const s = new PixelSheet(16, 16, 5500 + kind.length * 37);

  if (kind === 'arrow') {
    // 16×16 pixel arrow: flint head at top/front, oak shaft, white feather fletching
    s.rect(7, 0, 2, 2, 212, 216, 222);
    s.rect(6, 2, 4, 2, 132, 136, 142);
    s.rect(7, 4, 2, 9, 158, 116, 62);
    s.rect(5, 12, 6, 3, 242, 244, 248);
    s.rect(6, 15, 4, 1, 212, 216, 224);
  } else if (kind === 'snowball') {
    s.noise(2, 2, 12, 12, [242, 248, 255], 8);
    s.border(2, 2, 12, 12, 198, 218, 242);
    s.rect(4, 4, 4, 3, 255, 255, 255);
  } else if (kind === 'egg') {
    s.noise(3, 2, 10, 12, [238, 226, 194], 7);
    s.border(3, 2, 10, 12, 198, 182, 146);
    s.rect(5, 4, 3, 3, 252, 246, 228);
  } else if (kind === 'xp_bottle') {
    s.noise(3, 3, 10, 10, [148, 246, 86], 14);
    s.border(3, 3, 10, 10, 88, 186, 52);
    s.rect(5, 5, 4, 4, 238, 255, 162);
  } else if (kind === 'fireball' || kind === 'ghast_fireball') {
    s.noise(1, 1, 14, 14, [234, 102, 22], 22);
    s.border(1, 1, 14, 14, 92, 32, 14);
    s.noise(4, 4, 8, 8, [255, 204, 52], 16);
    s.rect(6, 6, 4, 4, 255, 250, 188);
  } else if (kind === 'blaze_bolt') {
    s.noise(2, 2, 12, 12, [250, 142, 28], 18);
    s.border(2, 2, 12, 12, 186, 66, 14);
    s.rect(5, 5, 6, 6, 255, 232, 86);
    s.rect(6, 6, 4, 4, 255, 255, 214);
  } else if (kind === 'xp_orb') {
    // Glowing circular pixel XP orb!
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        if (d > 6.6) continue;
        if (d < 2.8) s.px(x, y, 246, 255, 168, 255);
        else if (d < 4.8) s.px(x, y, 168, 252, 58, 255);
        else s.px(x, y, 88, 198, 28, 235);
      }
    }
  }

  const tex = s.toTexture();
  projectileTexCache.set(kind, tex);
  return tex;
}
