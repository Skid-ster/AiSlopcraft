// First-person arm and voxel held-item models with Beta-style swing/bob/eat animations
// and a dedicated overlay render pass so held tools/blocks never clip into walls.
import * as THREE from 'three';
import { isBlock, getBlock, ITEMS, TILES, TORCH, REDSTONE_TORCH, GLOWSTONE, JACK_O_LANTERN } from './world/blocks.js';
import { ITEM_ICON_INDEX } from './ui/ui.js';

const TOOL_COLORS = {
  wood: 0x9c6b36,
  stone: 0x9a9a9a,
  iron: 0xd8d8dc,
  gold: 0xf4ce44,
  diamond: 0x5be0d8,
};

function applyBoxShading(geometry, baseTint = [1, 1, 1], faceTints = null) {
  // BoxGeometry groups: +X (0.6), -X (0.6), +Y (1.0), -Y (0.5), +Z (0.8), -Z (0.8)
  const shades = [0.65, 0.65, 1.0, 0.55, 0.84, 0.84];
  const count = geometry.getAttribute('position').count;
  const cols = new Float32Array(count * 3);
  for (const face of geometry.groups) {
    const s = shades[face.materialIndex] ?? 0.85;
    const t = faceTints?.[face.materialIndex] || baseTint;
    for (let i = face.start; i < face.start + face.count; i++) {
      // Note: groups index into geometry.index if indexed
      const vi = geometry.index ? geometry.index.getX(i) : i;
      cols[vi * 3] = t[0] * s;
      cols[vi * 3 + 1] = t[1] * s;
      cols[vi * 3 + 2] = t[2] * s;
    }
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
}

function setTileUVs(geometry, tile, atlasSize = 16) {
  const uv = geometry.getAttribute('uv');
  const tx = tile % atlasSize, ty = Math.floor(tile / atlasSize);
  const inset = 0.00045;
  const u0 = tx / atlasSize + inset;
  const u1 = (tx + 1) / atlasSize - inset;
  const v0 = 1 - (ty + 1) / atlasSize + inset;
  const v1 = 1 - ty / atlasSize - inset;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    uv.setXY(i, u0 + u * (u1 - u0), v0 + v * (v1 - v0));
  }
  uv.needsUpdate = true;
}

function makeShadedBox(group, w, h, d, x, y, z, hexColor) {
  const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const c = new THREE.Color(hexColor);
  const pos = geo.getAttribute('position');
  const norm = geo.getAttribute('normal');
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const nx = norm.getX(i), ny = norm.getY(i);
    const s = ny > 0.5 ? 1.0 : ny < -0.5 ? 0.55 : Math.abs(nx) > 0.5 ? 0.68 : 0.85;
    cols[i * 3] = c.r * s;
    cols[i * 3 + 1] = c.g * s;
    cols[i * 3 + 2] = c.b * s;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }));
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

export class FirstPersonArm {
  constructor(camera, atlasTex, itemIconsCanvas, itemIconIndex = ITEM_ICON_INDEX) {
    this.worldCamera = camera;
    this.atlasTex = atlasTex;
    this.itemIconsCanvas = itemIconsCanvas;
    this.itemIconIndex = itemIconIndex;

    // Dedicated overlay scene & camera so the hand/tool never clips through blocks
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, camera.aspect || 1.6, 0.04, 10);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.defaultPos = new THREE.Vector3(0.42, -0.36, -0.56);
    this.defaultRot = new THREE.Euler(0.18, -0.35, 0.08);
    this.pivot = new THREE.Group();
    this.pivot.position.copy(this.defaultPos);
    this.pivot.rotation.copy(this.defaultRot);
    this.root.add(this.pivot);

    this.armMesh = this.buildArmMesh();
    this.pivot.add(this.armMesh);
    this.swingProgress = 0;
    this.isSwinging = false;
    this.swingSpeed = 1;
    this.bobTimer = 0;
    this.equipOffset = 0;
    this.heldId = null;
    this.heldMesh = null;
    this._itemTexture = null;
  }

  buildArmMesh() {
    const arm = new THREE.Group();
    const hand = makeShadedBox(arm, 0.18, 0.38, 0.18, 0, -0.32, 0, 0xd8a57c);
    const sleeve = makeShadedBox(arm, 0.19, 0.22, 0.19, 0, -0.09, 0, 0x00a8a8);
    hand.name = 'hand';
    sleeve.name = 'sleeve';
    return arm;
  }

  triggerPlaceSwing() {
    this.isSwinging = true;
    this.swingProgress = 0.01;
    this.swingSpeed = 6.6;
  }

  triggerAttackSwing() {
    if (this.isSwinging && this.swingProgress < 0.35) return;
    this.isSwinging = true;
    this.swingProgress = 0.01;
    this.swingSpeed = 5.4;
  }

  setHeldItem(stack) {
    const id = stack ? stack.id : null;
    if (id === this.heldId) return;
    this.heldId = id;
    this.equipOffset = 0.18; // classic subtle dip when switching hotbar slot
    if (this.heldMesh) {
      this.pivot.remove(this.heldMesh);
      this.disposeHeldMesh(this.heldMesh);
      this.heldMesh = null;
    }
    this.armMesh.visible = true;
    if (id == null) return;
    this.heldMesh = this.buildHeldMesh(id);
    if (this.heldMesh) this.pivot.add(this.heldMesh);
  }

  disposeHeldMesh(root) {
    const geometries = new Set(), materials = new Set();
    root.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }

  buildHeldMesh(id) {
    const block = isBlock(id) ? getBlock(id) : null;
    if (block && id !== TORCH && id !== REDSTONE_TORCH && !['cross', 'flat', 'torch', 'door', 'none'].includes(block.render)) {
      return this.buildHeldBlock(block);
    }
    if (id === TORCH || id === REDSTONE_TORCH || block?.render === 'torch') return this.buildHeldTorch(id === REDSTONE_TORCH);
    if (block && ['cross', 'flat', 'door'].includes(block.render)) return this.buildBlockSprite(block);

    const item = ITEMS[id];
    if (id === 280) return this.buildStick();
    if (item?.tool && ['sword', 'pickaxe', 'axe', 'shovel', 'hoe', 'bow', 'shears', 'rod'].includes(item.tool)) {
      return this.buildTool(id, item.tool);
    }
    return this.buildItemSprite(id);
  }

  buildHeldBlock(block) {
    const rawGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
    const uv = rawGeo.getAttribute('uv');
    const tiles = block.tiles || [TILES.stone, TILES.stone, TILES.stone, TILES.stone, TILES.stone, TILES.stone];
    // BoxGeometry groups: +X, -X, +Y, -Y, +Z, -Z; block tiles: +Y, -Y, +Z, -Z, +X, -X.
    const faceTiles = [tiles[4], tiles[5], tiles[0], tiles[1], tiles[2], tiles[3]];
    for (const face of rawGeo.groups) {
      const tile = faceTiles[face.materialIndex] ?? tiles[0];
      const tx = tile % 16, ty = Math.floor(tile / 16), inset = 0.00045;
      const u0 = tx / 16 + inset, u1 = (tx + 1) / 16 - inset;
      const v0 = 1 - (ty + 1) / 16 + inset, v1 = 1 - ty / 16 - inset;
      for (let i = face.start; i < face.start + face.count; i++) {
        const u = uv.getX(i), v = uv.getY(i);
        uv.setXY(i, u0 + u * (u1 - u0), v0 + v * (v1 - v0));
      }
    }
    uv.needsUpdate = true;

    const geo = rawGeo.toNonIndexed();
    rawGeo.dispose();
    const pos = geo.getAttribute('position');
    const norm = geo.getAttribute('normal');
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const nx = norm.getX(i), ny = norm.getY(i);
      const s = ny > 0.5 ? 1.0 : ny < -0.5 ? 0.55 : Math.abs(nx) > 0.5 ? 0.65 : 0.84;
      cols[i * 3] = s;
      cols[i * 3 + 1] = s;
      cols[i * 3 + 2] = s;
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));

    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.atlasTex, vertexColors: true }));
    mesh.position.set(-0.02, -0.26, -0.14);
    mesh.rotation.set(0.24, 0.72, 0.06);
    return mesh;
  }

  buildItemSprite(id) {
    if (!this.itemIconsCanvas) return this.buildStick();
    if (!this._itemTexture) {
      this._itemTexture = new THREE.CanvasTexture(this.itemIconsCanvas);
      this._itemTexture.magFilter = THREE.NearestFilter;
      this._itemTexture.minFilter = THREE.NearestFilter;
      this._itemTexture.generateMipmaps = false;
      this._itemTexture.colorSpace = THREE.NoColorSpace;
    }
    const index = this.itemIconIndex[id] ?? 0;
    const plane = new THREE.PlaneGeometry(0.36, 0.36);
    setTileUVs(plane, index, 16);
    const mesh = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({
      map: this._itemTexture,
      transparent: true,
      alphaTest: 0.2,
      side: THREE.DoubleSide,
    }));
    mesh.position.set(-0.04, -0.26, -0.16);
    mesh.rotation.set(0.08, 0.22, 0.12);
    return mesh;
  }

  buildBlockSprite(block) {
    const tile = block.tiles?.[2] ?? TILES.stone;
    const plane = new THREE.PlaneGeometry(0.36, 0.42);
    setTileUVs(plane, tile);
    const mesh = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({
      map: this.atlasTex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide,
    }));
    mesh.position.set(-0.04, -0.26, -0.16);
    mesh.rotation.set(0.08, 0.2, 0.08);
    return mesh;
  }

  buildStick() {
    const group = new THREE.Group();
    makeShadedBox(group, 0.055, 0.48, 0.055, 0, 0, 0, 0x8b6037);
    group.position.set(-0.04, -0.28, -0.16);
    group.rotation.set(0.12, 0.08, -0.35);
    return group;
  }

  buildHeldTorch(redstone = false) {
    const group = new THREE.Group();
    makeShadedBox(group, 0.065, 0.34, 0.065, 0, -0.1, 0, 0x8b6037);
    makeShadedBox(group, 0.11, 0.11, 0.11, 0, 0.1, 0, redstone ? 0xe02828 : 0xffa22c);
    makeShadedBox(group, 0.075, 0.08, 0.075, 0, 0.15, 0, redstone ? 0xff7070 : 0xffdf54);
    group.position.set(-0.04, -0.28, -0.16);
    group.rotation.set(0.14, 0.18, -0.22);
    return group;
  }

  buildTool(id, kind) {
    if (kind === 'shears' || kind === 'rod') return this.buildItemSprite(id);
    const group = new THREE.Group();
    const material = materialForTool(id);
    const wood = TOOL_COLORS.wood;
    const part = (w, h, d, x, y, z, color = material) => makeShadedBox(group, w, h, d, x, y, z, color);
    if (kind === 'sword') {
      part(0.07, 0.2, 0.065, 0, -0.16, 0, wood);
      part(0.26, 0.055, 0.075, 0, -0.04, 0);
      part(0.13, 0.4, 0.05, 0, 0.19, 0);
      part(0.09, 0.075, 0.052, 0, 0.42, 0, shade(material, 1.15));
    } else if (kind === 'pickaxe') {
      part(0.06, 0.46, 0.06, 0, -0.01, 0, wood);
      part(0.34, 0.07, 0.07, 0, 0.21, 0);
      part(0.11, 0.075, 0.07, -0.14, 0.15, 0);
      part(0.11, 0.075, 0.07, 0.14, 0.15, 0);
    } else if (kind === 'axe') {
      part(0.06, 0.46, 0.06, 0, -0.01, 0, wood);
      part(0.15, 0.24, 0.08, 0.11, 0.17, 0);
      part(0.09, 0.11, 0.085, 0.02, 0.22, 0);
      part(0.17, 0.065, 0.085, 0.09, 0.29, 0, shade(material, 1.1));
    } else if (kind === 'shovel') {
      part(0.06, 0.47, 0.06, 0, -0.015, 0, wood);
      part(0.17, 0.19, 0.08, 0, 0.27, 0);
      part(0.11, 0.065, 0.085, 0, 0.37, 0, shade(material, 1.12));
    } else if (kind === 'hoe') {
      part(0.058, 0.47, 0.058, 0, -0.015, 0, wood);
      part(0.24, 0.065, 0.07, 0.07, 0.25, 0);
      part(0.075, 0.13, 0.07, 0.16, 0.17, 0);
    } else if (kind === 'bow') {
      for (let i = 0; i < 5; i++) part(0.065, 0.11, 0.05, Math.sin(i / 4 * Math.PI) * 0.11, -0.21 + i * 0.105, 0, wood);
      part(0.016, 0.48, 0.02, -0.01, 0, 0, 0xe8e8d0);
    }
    group.position.set(-0.04, -0.28, -0.18);
    group.rotation.set(0.14, 0.18, 0.32);
    return group;
  }

  update(dt, playerMoving, leftDown, eatingProgress = 0, brightness = 1) {
    this.camera.aspect = this.worldCamera.aspect;
    this.camera.updateProjectionMatrix();

    if (this.equipOffset > 0) {
      this.equipOffset = Math.max(0, this.equipOffset - dt * 1.4);
    }

    if (leftDown && !this.isSwinging) {
      this.isSwinging = true;
      this.swingProgress = 0.01;
      this.swingSpeed = 4.6;
    }
    if (this.isSwinging) {
      this.swingProgress += dt * this.swingSpeed;
      if (this.swingProgress >= 1) {
        if (leftDown) this.swingProgress %= 1;
        else { this.swingProgress = 0; this.isSwinging = false; }
      }
    } else this.swingProgress = 0;

    const swingSin = Math.sin(this.swingProgress * Math.PI);
    const swingFactor = Math.sin(Math.sqrt(this.swingProgress) * Math.PI);
    this.bobTimer += dt * (playerMoving ? 9.5 : 1.8);
    const bobX = Math.cos(this.bobTimer) * (playerMoving ? 0.016 : 0.003);
    const bobY = Math.sin(this.bobTimer * 2) * (playerMoving ? 0.013 : 0.003);

    const eating = eatingProgress > 0;
    const eatWave = eating ? Math.abs(Math.sin(eatingProgress * 26)) * 0.055 : 0;
    const eatInward = eating ? Math.min(1, eatingProgress * 5) : 0;

    this.pivot.position.set(
      this.defaultPos.x + bobX - swingSin * 0.15 - eatInward * 0.18,
      this.defaultPos.y + bobY + swingSin * 0.08 - this.equipOffset + eatInward * 0.09 + eatWave,
      this.defaultPos.z - swingSin * 0.22 + eatInward * 0.08,
    );
    this.pivot.rotation.set(
      this.defaultRot.x - swingFactor * 0.85 + eatInward * 0.35 + eatWave * 1.5,
      this.defaultRot.y + swingFactor * 0.55 + eatInward * 0.35,
      this.defaultRot.z - swingFactor * 0.65 - eatInward * 0.2,
    );

    const emitsLight = this.heldId === TORCH || this.heldId === REDSTONE_TORCH ||
      this.heldId === GLOWSTONE || this.heldId === JACK_O_LANTERN || this.heldId === 327;
    const b = emitsLight ? 1.0 : Math.max(0.3, Math.min(1.0, brightness));
    this.root.traverse(obj => {
      if (obj.material?.color) obj.material.color.setRGB(b, b, b);
    });
  }

  render(renderer) {
    if (!this.root.visible) return;
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = prevAutoClear;
  }
}

function materialForTool(id) {
  const name = ITEMS[id]?.name || '';
  if (/Diamond/i.test(name)) return TOOL_COLORS.diamond;
  if (/Iron/i.test(name)) return TOOL_COLORS.iron;
  if (/Gold/i.test(name)) return TOOL_COLORS.gold;
  if (/Stone/i.test(name)) return TOOL_COLORS.stone;
  return TOOL_COLORS.wood;
}

function shade(color, factor) {
  const c = new THREE.Color(color).multiplyScalar(factor);
  return c.getHex();
}
