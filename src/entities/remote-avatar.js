import * as THREE from 'three';
import { PLAYER_OUTFITS, getPlayerSkinTextures, skinBoxGeo } from './entity-textures.js';

/** Build a classic six-part remote player at a feet-origin, suitable for lerped network movement. */
export function createRemoteAvatarModel(id, name, lighting) {
  const root = new THREE.Group();
  const hash = [...String(name || id)].reduce((value, char) => (value * 31 + char.charCodeAt(0)) | 0, 7) >>> 0;
  const outfitIndex = hash % PLAYER_OUTFITS.length;
  const colors = PLAYER_OUTFITS[outfitIndex];
  const { texture } = getPlayerSkinTextures(outfitIndex);

  const shirt = new THREE.MeshBasicMaterial({ color: colors.shirt, map: texture });
  const skinAndClothes = new THREE.MeshBasicMaterial({ color: 0xffffff, map: texture });

  const addSkinBox = (parent, size, u, v, pw, ph, pd, tw, th, mat, position) => {
    const geo = skinBoxGeo(size[0], size[1], size[2], u, v, pw, ph, pd, tw, th).clone();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  };

  // Feet are at the network position: legs meet the torso at y=.72, and the
  // head meets the torso at y=1.44. This prevents the floating-leg gap.
  const torso = addSkinBox(root, [0.56, 0.72, 0.30], 16, 16, 8, 12, 4, 64, 64, shirt, [0, 1.08, 0]);
  const head = new THREE.Group();
  head.position.y = 1.66;
  root.add(head);
  addSkinBox(head, [0.44, 0.44, 0.44], 0, 0, 8, 8, 8, 64, 64, skinAndClothes, [0, 0, 0]);

  const makeLimb = (x, pivotY, size, u, v, pw, ph, pd) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, pivotY, 0);
    root.add(pivot);
    const mesh = addSkinBox(pivot, size, u, v, pw, ph, pd, 64, 64, skinAndClothes, [0, -size[1] / 2, 0]);
    return { pivot, mesh };
  };
  const { pivot: leftArm, mesh: leftArmMesh } = makeLimb(-0.405, 1.42, [0.24, 0.72, 0.28], 40, 16, 4, 12, 4);
  const { pivot: rightArm, mesh: rightArmMesh } = makeLimb(0.405, 1.42, [0.24, 0.72, 0.28], 40, 16, 4, 12, 4);
  const { pivot: leftLeg, mesh: leftLegMesh } = makeLimb(-0.15, 0.72, [0.27, 0.72, 0.28], 0, 16, 4, 12, 4);
  const { pivot: rightLeg, mesh: rightLegMesh } = makeLimb(0.15, 0.72, [0.27, 0.72, 0.28], 0, 16, 4, 12, 4);

  const safeName = String(name || 'Player').slice(0, 20);
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 512; labelCanvas.height = 64;
  const context = labelCanvas.getContext('2d');
  if (context) {
    context.font = 'bold 30px Arial'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.lineWidth = 6; context.strokeStyle = '#171717'; context.fillStyle = '#fff';
    context.strokeText(safeName, 256, 32); context.fillText(safeName, 256, 32);
  }
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthTest: true, depthWrite: false }));
  label.position.y = 2.16;
  label.scale.set(Math.max(1.35, Math.min(2.8, safeName.length * 0.13)), 0.34, 1);
  root.add(label);

  lighting.prepare(root);
  lighting.setObjectLight(root, 15, 0);
  return {
    root, torso, target: new THREE.Vector3(), yaw: 0, pitch: 0, name: safeName, labelTexture,
    head, leftArm, rightArm, leftLeg, rightLeg, leftArmMesh, rightArmMesh, leftLegMesh, rightLegMesh,
    walkPhase: hash % 100, walkBlend: 0, dead: false, initialized: false,
  };
}

export function disposeRemoteAvatarModel(avatar, lighting) {
  if (!avatar) return;
  lighting.forget(avatar.root);
  const materials = new Set();
  avatar.root.traverse(object => {
    object.geometry?.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) materials.add(material);
  });
  for (const material of materials) material.dispose();
  avatar.labelTexture.dispose();
}
