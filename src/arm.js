// First-person player arm & held item model with classic Beta 1.7.3 swing animations.
import * as THREE from 'three';
import { isBlock, getBlock, ITEMS, TILES } from './world/blocks.js';

export class FirstPersonArm {
  constructor(camera, atlasTex, itemIconsCanvas) {
    this.camera = camera;
    this.atlasTex = atlasTex;
    this.itemIconsCanvas = itemIconsCanvas;

    // Root container attached directly to camera so it moves/rotates with view
    this.root = new THREE.Group();
    camera.add(this.root);

    // Pivot group positioned at classic Minecraft bottom-right
    // Default resting position relative to camera: right ~0.38, down ~-0.34, forward ~-0.52
    this.defaultPos = new THREE.Vector3(0.38, -0.34, -0.52);
    this.defaultRot = new THREE.Euler(0.2, -0.35, 0.1);

    this.pivot = new THREE.Group();
    this.pivot.position.copy(this.defaultPos);
    this.pivot.rotation.copy(this.defaultRot);
    this.root.add(this.pivot);

    // Create Steve's classic skin arm mesh
    this.armMesh = this.buildArmMesh();
    this.pivot.add(this.armMesh);

    // Animation state
    this.swingProgress = 0; // 0 to 1
    this.isSwinging = false;
    this.swingSpeed = 1.0;
    this.bobTimer = 0;

    // Held item tracking
    this.heldId = null;
    this.heldMesh = null;
  }

  buildArmMesh() {
    // Steve's classic skin: blue sleeve top, peach/skin bottom
    // Box dimensions: 0.18 width, 0.58 length, 0.18 depth
    const geo = new THREE.BoxGeometry(0.18, 0.58, 0.18);
    // Shift geometry center so the pivot is at the shoulder/top-back
    geo.translate(0, -0.22, 0);

    const skinMat = new THREE.MeshBasicMaterial({ color: 0xd6a47a }); // Steve skin
    const sleeveMat = new THREE.MeshBasicMaterial({ color: 0x00a8a8 }); // Cyan shirt sleeve

    // Face materials: +X, -X, +Y, -Y, +Z, -Z
    // 0: right, 1: left, 2: top (sleeve), 3: bottom (hand), 4: front, 5: back
    // Or simpler: vertex colors or group with sleeve cube and hand cube
    const armGroup = new THREE.Group();

    // Hand portion (lower)
    const handGeo = new THREE.BoxGeometry(0.18, 0.38, 0.18);
    handGeo.translate(0, -0.32, 0);
    const hand = new THREE.Mesh(handGeo, skinMat);

    // Sleeve portion (upper)
    const sleeveGeo = new THREE.BoxGeometry(0.19, 0.22, 0.19);
    sleeveGeo.translate(0, -0.09, 0);
    const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);

    armGroup.add(hand);
    armGroup.add(sleeve);
    return armGroup;
  }

  // Trigger a quick single swing (e.g. on block place, ~0.15s)
  triggerPlaceSwing() {
    this.isSwinging = true;
    this.swingProgress = 0.01;
    this.swingSpeed = 6.6; // 1 / 0.15 ≈ 6.66
  }

  // Update held item representation if player changed slot
  setHeldItem(stack) {
    const id = stack ? stack.id : null;
    if (id === this.heldId) return;
    this.heldId = id;

    if (this.heldMesh) {
      this.pivot.remove(this.heldMesh);
      if (this.heldMesh.geometry) this.heldMesh.geometry.dispose();
      this.heldMesh = null;
    }

    if (!id) {
      // Empty hand: show bare arm
      this.armMesh.visible = true;
    } else {
      // With item: can either hide arm or show arm holding item
      // In classic Minecraft, holding a block shows a mini-block in hand; holding a tool shows the tool.
      // Keeping the arm visible with item positioned near hand gives great feel!
      this.armMesh.visible = true;
      this.heldMesh = this.buildHeldMesh(id);
      if (this.heldMesh) {
        this.pivot.add(this.heldMesh);
      }
    }
  }

  buildHeldMesh(id) {
    if (isBlock(id)) {
      const bd = getBlock(id);
      const tile = (bd.tiles && bd.tiles[0]) || TILES.stone;
      const geo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
      // Map UVs for block
      const [u0, v0, u1, v1] = (() => {
        const tx = tile % 16, ty = Math.floor(tile / 16);
        const s = 1 / 16, e = 0.0005;
        return [tx * s + e, 1 - (ty + 1) * s + e, (tx + 1) * s - e, 1 - ty * s - e];
      })();
      const uvAttr = geo.getAttribute('uv');
      for (let i = 0; i < uvAttr.count; i++) {
        uvAttr.setXY(i, u0 + (uvAttr.getX(i) < 0.5 ? 0 : 1) * (u1 - u0), v0 + (uvAttr.getY(i) < 0.5 ? 0 : 1) * (v1 - v0));
      }
      const mat = new THREE.MeshBasicMaterial({ map: this.atlasTex });
      const mesh = new THREE.Mesh(geo, mat);
      // Position at hand: forward and slightly up
      mesh.position.set(-0.06, -0.32, -0.16);
      mesh.rotation.set(0.2, 0.4, 0);
      return mesh;
    }
    // Items (tools, etc.) - simple representation
    return null;
  }

  update(dt, playerMoving, leftDown) {
    // 1. Swing animation logic
    if (leftDown) {
      // Continuous mining swing at ~4.5 swings/sec
      this.isSwinging = true;
      this.swingSpeed = 4.5;
    }

    if (this.isSwinging) {
      this.swingProgress += dt * this.swingSpeed;
      if (this.swingProgress >= 1.0) {
        if (leftDown) {
          this.swingProgress = this.swingProgress % 1.0;
        } else {
          this.swingProgress = 0;
          this.isSwinging = false;
        }
      }
    } else {
      this.swingProgress = 0;
    }

    // Sinusoidal swing curve (classic Minecraft punch & rotation)
    // Progress 0 -> 1: sin(progress * PI) peaks at 0.5
    const swingSin = Math.sin(this.swingProgress * Math.PI);
    const swingFactor = Math.sin(Math.sqrt(this.swingProgress) * Math.PI);

    // 2. Idle and walking bobbing
    if (playerMoving) {
      this.bobTimer += dt * 10;
    } else {
      this.bobTimer += dt * 2; // subtle breathing
    }
    const bobX = Math.cos(this.bobTimer) * (playerMoving ? 0.015 : 0.003);
    const bobY = Math.sin(this.bobTimer * 2) * (playerMoving ? 0.012 : 0.004);

    // 3. Apply transformation
    this.pivot.position.set(
      this.defaultPos.x + bobX - swingSin * 0.15,
      this.defaultPos.y + bobY + swingSin * 0.08,
      this.defaultPos.z - swingSin * 0.22 // forward punch
    );

    // Rotations during swing: pitch down/up, yaw inward, roll
    this.pivot.rotation.set(
      this.defaultRot.x - swingFactor * 0.85,
      this.defaultRot.y + swingFactor * 0.55,
      this.defaultRot.z - swingFactor * 0.65
    );
  }
}
