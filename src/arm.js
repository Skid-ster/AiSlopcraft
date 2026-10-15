// First-person arm and voxel held-item models with Beta-style swing/bob animations.
import * as THREE from 'three';
import { isBlock, getBlock, ITEMS, TILES, TORCH } from './world/blocks.js';
import { ITEM_ICON_INDEX } from './ui/ui.js';

const TOOL_COLORS = {
  wood: 0x8b5a2b,
  stone: 0x999999,
  iron: 0xd3d3d3,
  gold: 0xf0c840,
  diamond: 0x55d9d1,
};

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

function makeBox(group, w, h, d, x, y, z, color, material = null) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    material || new THREE.MeshBasicMaterial({ color }),
  );
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

export class FirstPersonArm {
  constructor(camera, atlasTex, itemIconsCanvas, itemIconIndex = ITEM_ICON_INDEX) {
    this.camera = camera;
    this.atlasTex = atlasTex;
    this.itemIconsCanvas = itemIconsCanvas;
    this.itemIconIndex = itemIconIndex;

    this.root = new THREE.Group();
    camera.add(this.root);
    this.defaultPos = new THREE.Vector3(0.38, -0.34, -0.52);
    this.defaultRot = new THREE.Euler(0.2, -0.35, 0.1);
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
    this.heldId = null;
    this.heldMesh = null;
    this._itemTexture = null;
  }

  buildArmMesh() {
    const arm = new THREE.Group();
    const skin = new THREE.MeshBasicMaterial({ color: 0xd6a47a });
    const sleeve = new THREE.MeshBasicMaterial({ color: 0x00a8a8 });
    const handGeometry = new THREE.BoxGeometry(0.18, 0.38, 0.18);
    handGeometry.translate(0, -0.32, 0);
    arm.add(new THREE.Mesh(handGeometry, skin));
    const sleeveGeometry = new THREE.BoxGeometry(0.19, 0.22, 0.19);
    sleeveGeometry.translate(0, -0.09, 0);
    arm.add(new THREE.Mesh(sleeveGeometry, sleeve));
    return arm;
  }

  triggerPlaceSwing() {
    this.isSwinging = true;
    this.swingProgress = 0.01;
    this.swingSpeed = 6.6;
  }

  triggerAttackSwing() {
    this.isSwinging = true;
    this.swingProgress = 0.01;
    this.swingSpeed = 5.2;
  }

  setHeldItem(stack) {
    const id = stack ? stack.id : null;
    if (id === this.heldId) return;
    this.heldId = id;
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
    if (block && id !== TORCH && !['cross', 'flat', 'torch', 'none'].includes(block.render)) {
      return this.buildHeldBlock(block);
    }
    if (id === TORCH || block?.render === 'torch') return this.buildHeldTorch();
    if (block && ['cross', 'flat'].includes(block.render)) return this.buildBlockSprite(block);

    const item = ITEMS[id];
    if (id === 280) return this.buildStick();
    if (item?.tool && ['sword', 'pickaxe', 'axe', 'shovel', 'hoe', 'bow'].includes(item.tool)) {
      return this.buildTool(id, item.tool);
    }
    return this.buildItemSprite(id);
  }

  buildHeldBlock(block) {
    const geo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
    const uv = geo.getAttribute('uv');
    const tiles = block.tiles || [TILES.stone, TILES.stone, TILES.stone, TILES.stone, TILES.stone, TILES.stone];
    // BoxGeometry groups are ordered +X, -X, +Y, -Y, +Z, -Z;
    // block tile definitions use +Y, -Y, +Z, -Z, +X, -X.
    const faceTiles = [tiles[4], tiles[5], tiles[0], tiles[1], tiles[2], tiles[3]];
    for (const face of geo.groups) {
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
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.atlasTex }));
    mesh.position.set(-0.04, -0.36, -0.18);
    mesh.rotation.set(0.22, 0.42, 0.08);
    return mesh;
  }

  buildItemSprite(id) {
    if (!this.itemIconsCanvas) return this.buildStick();
    if (!this._itemTexture) {
      this._itemTexture = new THREE.CanvasTexture(this.itemIconsCanvas);
      this._itemTexture.magFilter = THREE.NearestFilter;
      this._itemTexture.minFilter = THREE.NearestFilter;
      this._itemTexture.colorSpace = THREE.SRGBColorSpace;
    }
    const index = this.itemIconIndex[id] ?? 0;
    const plane = new THREE.PlaneGeometry(0.34, 0.34);
    setTileUVs(plane, index, 16);
    const mesh = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({
      map: this._itemTexture,
      transparent: true,
      alphaTest: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    }));
    mesh.position.set(-0.05, -0.36, -0.19);
    mesh.rotation.set(0.08, 0.12, 0.12);
    return mesh;
  }

  buildBlockSprite(block) {
    const tile = block.tiles?.[2] ?? TILES.stone;
    const plane = new THREE.PlaneGeometry(0.34, 0.44);
    setTileUVs(plane, tile);
    const mesh = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: this.atlasTex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide }));
    mesh.position.set(-0.05, -0.36, -0.19);
    return mesh;
  }

  buildStick() {
    const group = new THREE.Group();
    makeBox(group, 0.055, 0.5, 0.055, 0, 0, 0, 0x8b6037);
    group.position.set(-0.04, -0.38, -0.19);
    group.rotation.set(0.12, 0.08, -0.35);
    return group;
  }

  buildHeldTorch() {
    const group = new THREE.Group();
    makeBox(group, 0.07, 0.32, 0.07, 0, -0.12, 0, 0x8b6037).rotation.z = -0.18;
    makeBox(group, 0.13, 0.13, 0.12, 0.02, 0.09, 0, 0xffa22c);
    makeBox(group, 0.08, 0.09, 0.09, 0.02, 0.14, 0, 0xffdf54);
    group.position.set(-0.04, -0.38, -0.19);
    group.rotation.set(0.1, 0.18, -0.28);
    return group;
  }

  buildTool(id, kind) {
    const group = new THREE.Group();
    const material = materialForTool(id);
    const wood = TOOL_COLORS.wood;
    const part = (w, h, d, x, y, z, color = material) => makeBox(group, w, h, d, x, y, z, color);
    if (kind === 'sword') {
      part(0.075, 0.22, 0.07, 0, -0.17, 0, wood);
      part(0.28, 0.06, 0.08, 0, -0.04, 0);
      part(0.14, 0.42, 0.055, 0, 0.2, -0.015);
      part(0.1, 0.08, 0.06, 0, 0.44, -0.015, shade(material, 1.16));
    } else if (kind === 'pickaxe') {
      part(0.065, 0.48, 0.065, 0, -0.01, 0, wood);
      part(0.36, 0.075, 0.075, 0, 0.22, 0);
      part(0.12, 0.08, 0.075, -0.15, 0.16, 0);
      part(0.12, 0.08, 0.075, 0.15, 0.16, 0);
    } else if (kind === 'axe') {
      part(0.065, 0.48, 0.065, 0, -0.01, 0, wood);
      part(0.16, 0.26, 0.09, 0.12, 0.18, 0);
      part(0.1, 0.12, 0.095, 0.02, 0.24, 0);
      part(0.19, 0.07, 0.095, 0.1, 0.31, 0, shade(material, 1.1));
    } else if (kind === 'shovel') {
      part(0.065, 0.49, 0.065, 0, -0.015, 0, wood);
      part(0.18, 0.2, 0.09, 0, 0.29, 0);
      part(0.12, 0.07, 0.095, 0, 0.39, 0, shade(material, 1.12));
    } else if (kind === 'hoe') {
      part(0.06, 0.49, 0.06, 0, -0.015, 0, wood);
      part(0.26, 0.07, 0.075, 0.08, 0.27, 0);
      part(0.08, 0.14, 0.075, 0.18, 0.18, 0);
    } else if (kind === 'bow') {
      for (let i = 0; i < 5; i++) part(0.07, 0.12, 0.055, Math.sin(i / 4 * Math.PI) * 0.12, -0.22 + i * 0.11, 0, wood);
      part(0.015, 0.52, 0.025, -0.015, 0, -0.015, 0xe8e8d0);
    }
    group.position.set(-0.04, -0.38, -0.2);
    group.rotation.set(0.14, 0.12, 0.36);
    return group;
  }

  update(dt, playerMoving, leftDown) {
    if (leftDown && !this.isSwinging) {
      this.isSwinging = true;
      this.swingProgress = 0.01;
      this.swingSpeed = 4.5;
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
    this.bobTimer += dt * (playerMoving ? 10 : 2);
    const bobX = Math.cos(this.bobTimer) * (playerMoving ? 0.015 : 0.003);
    const bobY = Math.sin(this.bobTimer * 2) * (playerMoving ? 0.012 : 0.004);
    this.pivot.position.set(
      this.defaultPos.x + bobX - swingSin * 0.15,
      this.defaultPos.y + bobY + swingSin * 0.08,
      this.defaultPos.z - swingSin * 0.22,
    );
    this.pivot.rotation.set(
      this.defaultRot.x - swingFactor * 0.85,
      this.defaultRot.y + swingFactor * 0.55,
      this.defaultRot.z - swingFactor * 0.65,
    );
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
