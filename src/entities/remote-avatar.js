import * as THREE from 'three';

const OUTFITS = [
  { shirt: 0x568b42, pants: 0x384b7e, skin: 0xc99a73, hair: 0x49352c },
  { shirt: 0x3f76a7, pants: 0x3d4771, skin: 0xe0b28a, hair: 0x563d2f },
  { shirt: 0x9c573f, pants: 0x574333, skin: 0xd19b73, hair: 0x302522 },
  { shirt: 0x8c70a7, pants: 0x354b66, skin: 0xe4bb92, hair: 0x5b4638 },
  { shirt: 0xc09b3c, pants: 0x48613a, skin: 0xb97855, hair: 0x28221e },
  { shirt: 0x4a8a83, pants: 0x564366, skin: 0xd59f78, hair: 0x61402c },
];

/** Build a classic six-part remote player at a feet-origin, suitable for lerped network movement. */
export function createRemoteAvatarModel(id, name, lighting) {
  const root = new THREE.Group();
  const hash = [...String(name || id)].reduce((value, char) => (value * 31 + char.charCodeAt(0)) | 0, 7) >>> 0;
  const colors = OUTFITS[hash % OUTFITS.length];
  const material = color => new THREE.MeshBasicMaterial({ color });
  const shirt = material(colors.shirt), pants = material(colors.pants), skin = material(colors.skin);
  const hair = material(colors.hair), eyes = material(0x201b18);
  const addBox = (parent, size, mat, position) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  };

  // Feet are at the network position: legs meet the torso at y=.72, and the
  // head meets the torso at y=1.44. This prevents the floating-leg gap.
  const torso = addBox(root, [0.56, 0.72, 0.30], shirt, [0, 1.08, 0]);
  const head = new THREE.Group();
  head.position.y = 1.62;
  root.add(head);
  addBox(head, [0.44, 0.44, 0.44], skin, [0, 0, 0]);
  addBox(head, [0.46, 0.08, 0.46], hair, [0, 0.20, 0]);
  addBox(head, [0.052, 0.052, 0.025], eyes, [-0.09, 0.035, -0.223]);
  addBox(head, [0.052, 0.052, 0.025], eyes, [0.09, 0.035, -0.223]);

  const makeLimb = (x, pivotY, size, mat) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, pivotY, 0);
    root.add(pivot);
    const mesh = addBox(pivot, size, mat, [0, -size[1] / 2, 0]);
    return { pivot, mesh };
  };
  const { pivot: leftArm, mesh: leftArmMesh } = makeLimb(-0.405, 1.42, [0.24, 0.72, 0.28], shirt);
  const { pivot: rightArm, mesh: rightArmMesh } = makeLimb(0.405, 1.42, [0.24, 0.72, 0.28], shirt);
  const { pivot: leftLeg, mesh: leftLegMesh } = makeLimb(-0.15, 0.72, [0.27, 0.72, 0.28], pants);
  const { pivot: rightLeg, mesh: rightLegMesh } = makeLimb(0.15, 0.72, [0.27, 0.72, 0.28], pants);

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
  label.position.y = 2.12;
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
