// Shared native WebGL lighting for chunks, entities, drops, particles and the
// first-person hand. Everything uses the same sky/torch curves, fog, color space
// and preset uniforms; Shader Lite/Cinematic additionally sample a real sun
// shadow map rendered from the voxel geometry.
import * as THREE from 'three';

export const SHADER_STYLES = ['classic', 'vibrant', 'cinematic', 'shader', 'psx'];
export const shaderStyleId = style => Math.max(0, SHADER_STYLES.indexOf(style));

export function syncFogUniforms(materials, fog) {
  if (!fog?.color) return false;
  for (const material of materials) {
    const uniforms = material?.uniforms;
    if (!uniforms?.uFogColor || !uniforms?.uFogNear || !uniforms?.uFogFar) continue;
    uniforms.uFogColor.value.copy(fog.color);
    uniforms.uFogNear.value = fog.near;
    uniforms.uFogFar.value = fog.far;
  }
  return true;
}

const vertexShader = /* glsl */ `
  attribute vec4 aTint;
  uniform float uTime;
  uniform float uWater;
  uniform float uShaderStyle;
  uniform vec2 uScreenSize;
  uniform float uPsxSnap;
  #ifdef VOXEL_LIGHT
    attribute vec2 aLight;
    attribute vec3 aNormal;
  #else
    uniform vec2 uObjectLight;
  #endif
  #ifdef USE_INSTANCING
    attribute vec2 aInstanceLight;
    attribute float aInstanceEmission;
  #endif
  varying float vInstanceEmission;
  varying vec4 vTint;
  varying vec2 vUv;
  varying vec3 vAffineUv;
  varying vec2 vLight;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying float vFogDist;
  void main() {
    vTint = aTint;
    #ifdef USE_INSTANCING_COLOR
      vTint.rgb *= instanceColor;
    #endif
    vUv = uv;
    vAffineUv = vec3(uv, 1.0);
    vInstanceEmission = 0.0;
    vec3 objectNormal = normal;
    #ifdef VOXEL_LIGHT
      objectNormal = aNormal;
      vLight = aLight;
    #else
      vLight = uObjectLight;
    #endif
    vec4 local = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      objectNormal = mat3(instanceMatrix) * objectNormal;
      vLight = aInstanceLight;
      vInstanceEmission = aInstanceEmission;
    #endif
    vec4 world = modelMatrix * local;
    // Animate the actual water surface, including the matching side-top vertices.
    if (uWater > 0.5) {
      float surface = 1.0 - step(0.02, abs(fract(position.y) - 0.88));
      world.y += surface * (sin(world.x * 1.35 + uTime * 1.4) + cos(world.z * 1.1 - uTime * 1.1)) * 0.018;
    }
    vWorldPosition = world.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
    vec4 mv = viewMatrix * world;
    vFogDist = length(mv.xyz);
    vec4 clip = projectionMatrix * mv;
    if (uShaderStyle > 3.5) {
      float inaccuracy = uPsxSnap / sqrt(max(clip.w, 0.001)) + 0.1;
      vec2 snapGrid = max(uScreenSize * 0.75, vec2(1.0));
      vec2 ndc = floor((clip.xy / clip.w) * snapGrid / inaccuracy) * inaccuracy / snapGrid;
      clip.xy = ndc * clip.w;
      vAffineUv = vec3(uv * clip.w, clip.w);
    }
    gl_Position = clip;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D map;
  uniform float uHasMap;
  uniform sampler2D uEmissionMap;
  uniform float uHasEmissionMap;
  uniform float uEmission;
  uniform float uBrightness;
  uniform float uOpacity;
  uniform float uAlphaTest;
  uniform float uShaderStyle;
  uniform vec3 uTint;
  uniform float uSky;
  uniform vec3 uSkyTint;
  uniform vec3 uBlockTint;
  uniform vec3 uSunDirection;
  uniform float uSunIntensity;
  uniform float uTime;
  uniform float uWater;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uFogEnabled;
  uniform sampler2D uShadowMap;
  uniform mat4 uShadowMatrix;
  uniform float uShadowStrength;
  uniform float uShadowTexel;
  varying vec4 vTint;
  varying vec2 vUv;
  varying vec3 vAffineUv;
  varying vec2 vLight;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying float vFogDist;
  varying float vInstanceEmission;

  float sunShadow(vec3 normal, vec3 sunDir) {
    if (uShadowStrength <= 0.0) return 1.0;
    vec4 projected = uShadowMatrix * vec4(vWorldPosition, 1.0);
    vec3 coord = projected.xyz / projected.w;
    // Outside the light frustum there is no shadow data. Treat it as lit rather
    // than comparing against the depth texture's clamped border texels.
    if (coord.x <= 0.001 || coord.x >= 0.999 || coord.y <= 0.001 || coord.y >= 0.999 || coord.z <= 0.0 || coord.z >= 1.0) return 1.0;
    // Depth is normalized over a 189-block light range: a large fixed bias
    // visibly detaches shadows from the blocks that cast them.
    float bias = max(0.00018, 0.00072 * (1.0 - max(dot(normal, sunDir), 0.0)));
    float visibility = 0.0;
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        float depth = texture2D(uShadowMap, coord.xy + vec2(float(x), float(y)) * uShadowTexel).r;
        visibility += coord.z - bias <= depth ? 1.0 : 0.0;
      }
    }
    visibility /= 9.0;
    float edge = smoothstep(0.0, 0.08, min(min(coord.x, 1.0 - coord.x), min(coord.y, 1.0 - coord.y)));
    return 1.0 - (1.0 - visibility) * uShadowStrength * edge;
  }

  vec3 grade(vec3 color) {
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    if (uShaderStyle > 0.5 && uShaderStyle < 1.5) {
      color = mix(vec3(luminance), color, 1.22);
      color = (color - 0.18) * 1.05 + 0.18;
    } else if (uShaderStyle > 1.5 && uShaderStyle < 2.5) {
      color = (color - 0.18) * 1.08 + 0.18;
      float shadow = 1.0 - smoothstep(0.04, 0.35, luminance);
      float highlight = smoothstep(0.35, 1.0, luminance);
      color *= mix(vec3(1.0), vec3(0.90, 0.97, 1.10), shadow * 0.35);
      color *= mix(vec3(1.0), vec3(1.08, 1.01, 0.90), highlight * 0.30);
    } else if (uShaderStyle > 2.5 && uShaderStyle < 3.5) {
      color = mix(vec3(luminance), color, 1.06);
      color = (color - 0.18) * 1.03 + 0.18;
      color = color / (color + vec3(0.65)) * 1.65;
    }
    return max(color, vec3(0.0));
  }

  void main() {
    vec2 uv = vUv;
    if (uShaderStyle > 3.5) uv = vAffineUv.xy / max(vAffineUv.z, 0.0001);
    if (uWater > 0.5) uv += vec2(uTime * 0.006, uTime * 0.014);
    vec4 tex = mix(vec4(1.0), texture2D(map, uv), uHasMap);
    float alpha = tex.a * vTint.a * uOpacity;
    if (alpha < uAlphaTest) discard;
    vec3 normal = normalize(vWorldNormal);
    if (!gl_FrontFacing) normal = -normal;
    vec3 sunDir = normalize(uSunDirection);
    vec3 base = tex.rgb * vTint.rgb * uTint;

    float skyLevel = pow(clamp(vLight.x / 15.0, 0.0, 1.0), 1.35);
    float blockLevel = pow(clamp(vLight.y / 15.0, 0.0, 1.0), 1.60);
    float shadow = sunShadow(normal, sunDir);
    vec3 skyLight = uSkyTint * skyLevel * uSky * (0.52 + 0.18 * max(normal.y, 0.0)) * mix(1.0, shadow, 0.55);
    vec3 direct = uSkyTint * skyLevel * uSunIntensity * max(dot(normal, sunDir), 0.0) * shadow * 0.45;
    vec3 torchLight = uBlockTint * blockLevel;
    vec3 light = max(skyLight + direct, torchLight) + min(skyLight + direct, torchLight) * 0.18;
    light = max(light, vec3(0.010, 0.012, 0.018));
    vec3 rgb = base * light;

    // Emissive texels (flame, lava, glowstone, lit furnace/lantern faces) keep
    // their own light at night instead of being multiplied by cave darkness.
    float emissionMask = clamp(uEmission + vInstanceEmission, 0.0, 1.0) * mix(1.0, texture2D(uEmissionMap, vUv).r, uHasEmissionMap);
    rgb = mix(rgb, base, clamp(emissionMask, 0.0, 1.0));

    if (uWater > 0.5) {
      vec2 p = vWorldPosition.xz;
      vec3 ripple = vec3(
        cos(p.x * 1.7 + uTime * 1.3) * 0.055 + sin((p.x + p.y) * 0.8 - uTime) * 0.035
          + cos((p.x - p.y) * 4.1 + uTime * 2.0) * 0.018,
        0.0,
        sin(p.y * 1.5 - uTime * 1.1) * 0.055 + cos((p.x - p.y) * 0.9 + uTime * 0.7) * 0.035
          + sin((p.x + p.y) * 3.7 - uTime * 1.8) * 0.018
      );
      vec3 waterNormal = normalize(normal + ripple);
      vec3 viewDir = normalize(cameraPosition - vWorldPosition);
      float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(waterNormal, viewDir), 0.0), 5.0);
      vec3 reflected = reflect(-viewDir, waterNormal);
      vec3 reflection = mix(uFogColor, uSkyTint, clamp(reflected.y * 0.7 + 0.3, 0.0, 1.0));
      float strength = uShaderStyle > 2.5 && uShaderStyle < 3.5 ? 0.72 : 0.28;
      rgb = mix(rgb, reflection * (0.35 + 0.65 * uSky), fresnel * strength);
      float specular = pow(max(dot(waterNormal, normalize(sunDir + viewDir)), 0.0), 96.0);
      rgb += vec3(1.0, 0.90, 0.70) * specular * uSunIntensity * shadow * (uShaderStyle > 2.5 && uShaderStyle < 3.5 ? 0.9 : 0.25);
      float causticPattern = sin((p.x + p.y) * 3.2 + uTime * 1.7) * sin((p.x - p.y) * 2.4 - uTime * 1.1);
      float caustic = pow(max(causticPattern * 0.5 + 0.5, 0.0), 10.0)
        * max(dot(waterNormal, viewDir), 0.0) * uSunIntensity * shadow;
      rgb += vec3(0.10, 0.24, 0.28) * caustic * (uShaderStyle > 2.5 && uShaderStyle < 3.5 ? 0.75 : 0.22);
      alpha = mix(alpha, min(0.94, alpha + 0.16), fresnel);
    }

    rgb = grade(rgb * uBrightness);
    float fog = uFogEnabled * smoothstep(uFogNear, uFogFar, vFogDist);
    gl_FragColor = vec4(mix(rgb, uFogColor, fog), alpha);
    #include <colorspace_fragment>
  }
`;

function whiteTexture() {
  const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  tex.needsUpdate = true;
  return tex;
}

function ensureTint(geometry) {
  if (geometry.getAttribute('aTint')) return;
  const count = geometry.getAttribute('position').count;
  const color = geometry.getAttribute('color');
  const data = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    data[i * 4] = color ? color.getX(i) : 1;
    data[i * 4 + 1] = color ? color.getY(i) : 1;
    data[i * 4 + 2] = color ? color.getZ(i) : 1;
    data[i * 4 + 3] = color && color.itemSize === 4 ? color.getW(i) : 1;
  }
  geometry.setAttribute('aTint', new THREE.Float32BufferAttribute(data, 4));
}

export class Lighting {
  constructor({ atlasTexture, emissionTexture, shadowSize = 1024 } = {}) {
    this.white = whiteTexture();
    this.emissionTexture = emissionTexture || this.white;
    this.shadowSize = shadowSize;
    this.shadowTarget = new THREE.WebGLRenderTarget(shadowSize, shadowSize, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthTexture: new THREE.DepthTexture(shadowSize, shadowSize, THREE.UnsignedIntType),
    });
    this.shadowCamera = new THREE.OrthographicCamera(-42, 42, 42, -42, 1, 190);
    this.shadowCamera.layers.set(1);
    this.shadowMatrix = new THREE.Matrix4();
    this.depthMaterial = new THREE.MeshDepthMaterial({ map: atlasTexture || null, alphaTest: 0.45, side: THREE.DoubleSide });
    this.lastShadowTime = -Infinity;
    this.lastShadowPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
    this.lastShadowSunDirection = new THREE.Vector3(Infinity, Infinity, Infinity);
    this.shared = {
      uSky: { value: 1 },
      uSkyTint: { value: new THREE.Color(1, 1, 1) },
      uBlockTint: { value: new THREE.Color(1.0, 0.80, 0.55) },
      uShaderStyle: { value: 3 },
      uScreenSize: { value: new THREE.Vector2(1, 1) },
      uBrightness: { value: 1 },
      uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
      uSunIntensity: { value: 1 },
      uTime: { value: 0 },
      uFogColor: { value: new THREE.Color(0xc0d8ff) },
      uFogNear: { value: 50 },
      uFogFar: { value: 100 },
      uShadowMap: { value: this.shadowTarget.depthTexture },
      uShadowMatrix: { value: this.shadowMatrix },
      uShadowStrength: { value: 0 },
      uShadowTexel: { value: 1 / shadowSize },
    };
    this.materials = new Set();
    this._forward = new THREE.Vector3();
    this._center = new THREE.Vector3();
  }

  createMaterial(opts = {}) {
    const material = new THREE.ShaderMaterial({
      name: opts.name || 'VoxelLighting',
      vertexShader, fragmentShader,
      defines: opts.voxel ? { VOXEL_LIGHT: 1 } : {},
      uniforms: {
        ...this.shared,
        map: { value: opts.map || this.white },
        uHasMap: { value: opts.map ? 1 : 0 },
        uEmissionMap: { value: this.emissionTexture },
        uHasEmissionMap: { value: opts.emissionMap ? 1 : 0 },
        uEmission: { value: opts.emission ?? 0 },
        uOpacity: { value: opts.opacity ?? 1 },
        uPsxSnap: { value: opts.psxSnap ?? (opts.fog === false ? 10 : 15) },
        uAlphaTest: { value: opts.alphaTest ?? (opts.cutout ? 0.45 : 0) },
        uTint: { value: opts.tint?.isColor ? opts.tint.clone() : new THREE.Color(opts.tint ?? 0xffffff) },
        uObjectLight: { value: new THREE.Vector2(15, 0) },
        uWater: { value: opts.water ? 1 : 0 },
        uFogEnabled: { value: opts.fog === false ? 0 : 1 },
        // The hand is an overlay: it must not inherit world shadow coordinates.
        ...(opts.fog === false ? { uShadowStrength: { value: 0 } } : {}),
      },
      transparent: !!opts.transparent,
      side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
      depthWrite: opts.depthWrite !== false,
      depthTest: opts.depthTest !== false,
      blending: opts.blending ?? THREE.NormalBlending,
    });
    material.userData.baseTint = material.uniforms.uTint.value.clone();
    this.materials.add(material);
    return material;
  }

  // Convert legacy MeshBasic entity materials without losing vertex colors,
  // alpha cutouts, double-sided planes, or per-material base tints.
  prepare(root, opts = {}) {
    const converted = new Map();
    root.traverse(object => {
      if (!object.isMesh || object.userData.noLighting) return;
      if (opts.castShadow !== false) object.layers.enable(1);
      ensureTint(object.geometry);
      const convert = old => {
        if (old?.uniforms?.uObjectLight) return old;
        if (converted.has(old)) return converted.get(old);
        const material = this.createMaterial({
          map: old?.map || null,
          tint: old?.color || 0xffffff,
          opacity: old?.opacity ?? 1,
          alphaTest: old?.alphaTest ?? 0,
          transparent: old?.transparent || false,
          doubleSide: old?.side === THREE.DoubleSide,
          depthWrite: old?.depthWrite !== false,
          depthTest: old?.depthTest !== false,
          blending: old?.blending,
          emissionMap: !!opts.emissionMap,
          emission: object.userData.emissive ? 1 : (opts.emission ?? 0),
          fog: opts.fog,
        });
        converted.set(old, material);
        return material;
      };
      object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
    });
    return root;
  }

  setObjectLight(root, sky, block) {
    root.traverse(object => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material?.uniforms?.uObjectLight) material.uniforms.uObjectLight.value.set(sky, block);
      }
    });
  }

  refreshObject(root, world, position, yOffset = 0.9) {
    const packed = world.getLight(Math.floor(position.x), Math.floor(position.y + yOffset), Math.floor(position.z));
    this.setObjectLight(root, packed >> 4, packed & 15);
  }

  update({ sky, time, style, fog }) {
    const s = this.shared;
    const id = shaderStyleId(style);
    s.uShaderStyle.value = id;
    s.uTime.value = time;
    s.uSky.value = 0.035 + 0.965 * sky.dayFactor;
    s.uSunIntensity.value = sky.dayFactor;
    s.uSunDirection.value.copy(sky.sunDirection);
    const day = sky.dayFactor;
    if (day > 0.65) s.uSkyTint.value.setRGB(1, 1, 1);
    else if (day > 0.25) {
      const t = (day - 0.25) / 0.4;
      s.uSkyTint.value.setRGB(1, 0.62 + 0.38 * t, 0.40 + 0.60 * t);
    } else {
      const t = day / 0.25;
      s.uSkyTint.value.setRGB(0.42 + 0.58 * t, 0.52 + 0.10 * t, 0.85 - 0.45 * t);
    }
    if (fog) syncFogUniforms([{ uniforms: s }], fog);
    if (id < 2 || id === 4 || sky.sunDirection.y <= 0.06) s.uShadowStrength.value = 0;
  }

  updateShadows(renderer, scene, camera, sky, style, time, force = false, enabled = true) {
    const id = shaderStyleId(style);
    if (!enabled || id < 2 || id === 4 || sky.sunDirection.y <= 0.06) { this.shared.uShadowStrength.value = 0; return; }
    if (!force && time - this.lastShadowTime < 0.12) return;
    const cameraMoved = this.lastShadowPosition.distanceToSquared(camera.position) > 0.25;
    const sunMoved = this.lastShadowSunDirection.distanceToSquared(sky.sunDirection) > 0.000004;
    if (!force && !cameraMoved && !sunMoved && time - this.lastShadowTime < 1.0) return;
    this.lastShadowTime = time;
    this.lastShadowPosition.copy(camera.position);
    this.lastShadowSunDirection.copy(sky.sunDirection);
    camera.getWorldDirection(this._forward);
    this._center.copy(camera.position).addScaledVector(this._forward, 18);
    this.shadowCamera.position.copy(this._center).addScaledVector(sky.sunDirection, 95);
    this.shadowCamera.lookAt(this._center);
    this.shadowCamera.updateMatrixWorld(true);
    // Snap the light-space camera to shadow texels. This prevents block edges
    // and contact shadows from crawling when the player moves by tiny amounts.
    const texelWorldSize = (this.shadowCamera.right - this.shadowCamera.left) / this.shadowSize;
    const matrix = this.shadowCamera.matrixWorld.elements;
    const right = new THREE.Vector3(matrix[0], matrix[1], matrix[2]);
    const up = new THREE.Vector3(matrix[4], matrix[5], matrix[6]);
    const snapAxis = (axis) => {
      const offset = this._center.dot(axis);
      return Math.round(offset / texelWorldSize) * texelWorldSize - offset;
    };
    const shiftRight = snapAxis(right), shiftUp = snapAxis(up);
    this._center.addScaledVector(right, shiftRight).addScaledVector(up, shiftUp);
    this.shadowCamera.position.addScaledVector(right, shiftRight).addScaledVector(up, shiftUp);
    this.shadowCamera.lookAt(this._center);
    this.shadowCamera.updateMatrixWorld(true);
    this.shadowMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.shadowMatrix.multiply(this.shadowCamera.projectionMatrix).multiply(this.shadowCamera.matrixWorldInverse);
    this.shared.uShadowStrength.value = id === 3 ? 0.78 : 0.50;

    const target = renderer.getRenderTarget();
    const override = scene.overrideMaterial;
    const autoClear = renderer.autoClear;
    const clearColor = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();
    try {
      scene.overrideMaterial = this.depthMaterial;
      renderer.autoClear = true;
      renderer.setClearColor(0xffffff, 1);
      renderer.setRenderTarget(this.shadowTarget);
      renderer.clear(true, true, false);
      renderer.render(scene, this.shadowCamera);
    } finally {
      renderer.setRenderTarget(target);
      renderer.setClearColor(clearColor, clearAlpha);
      renderer.autoClear = autoClear;
      scene.overrideMaterial = override;
    }
  }

  forget(root) {
    root.traverse(object => {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material) this.materials.delete(material);
      }
    });
  }

  dispose() {
    this.shadowTarget.dispose();
    this.depthMaterial.dispose();
    this.white.dispose();
    for (const material of this.materials) material.dispose();
    this.materials.clear();
  }
}

// Downsampled final pass adapted from the PSX shaderpack workflow: low internal
// resolution, a 24-step palette, and a 4x4 ordered dither. The world/material
// shader above also supplies affine UV interpolation and depth-scaled vertex
// snapping. This is a native Three.js pass, not a runtime OptiFine loader.
export class PSXPostProcess {
  constructor(scale = 0.25) {
    this.scale = Math.max(0.1, Math.min(1, scale));
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.target.texture.generateMipmaps = false;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uScene: { value: this.target.texture },
        uResolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uScene;
        uniform vec2 uResolution;
        varying vec2 vUv;
        float bayer4(vec2 p) {
          float x = mod(floor(p.x), 4.0);
          float y = mod(floor(p.y), 4.0);
          if (y < 1.0) {
            if (x < 1.0) return 0.0; if (x < 2.0) return 8.0;
            if (x < 3.0) return 2.0; return 10.0;
          }
          if (y < 2.0) {
            if (x < 1.0) return 12.0; if (x < 2.0) return 4.0;
            if (x < 3.0) return 14.0; return 6.0;
          }
          if (y < 3.0) {
            if (x < 1.0) return 3.0; if (x < 2.0) return 11.0;
            if (x < 3.0) return 1.0; return 9.0;
          }
          if (x < 1.0) return 15.0; if (x < 2.0) return 7.0;
          if (x < 3.0) return 13.0; return 5.0;
        }
        void main() {
          vec2 pixel = floor(vUv * uResolution) + 0.5;
          vec2 sampleUv = pixel / uResolution;
          vec3 color = texture2D(uScene, sampleUv).rgb;
          color = clamp(1.2 * (color - 0.5) + 0.5, 0.0, 1.0);
          float dither = (bayer4(pixel) - 7.5) * 0.035;
          color = floor(clamp(color * 24.0 + dither, 0.0, 23.0)) / 24.0;
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }
      `,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(quad);
    this.camera = new THREE.Camera();
    this._bufferSize = new THREE.Vector2();
    this._previousTarget = null;
  }

  setSize(width, height) {
    const w = Math.max(1, Math.round(width * this.scale));
    const h = Math.max(1, Math.round(height * this.scale));
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
    this.material.uniforms.uResolution.value.set(w, h);
    return this.material.uniforms.uResolution.value;
  }

  render(renderer, scene, camera, overlays) {
    renderer.getDrawingBufferSize(this._bufferSize);
    const resolution = this.setSize(this._bufferSize.x, this._bufferSize.y);
    this._previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    try {
      renderer.setRenderTarget(this.target);
      renderer.autoClear = true;
      renderer.clear(true, true, true);
      renderer.render(scene, camera);
      overlays?.(renderer);
      renderer.setRenderTarget(this._previousTarget);
      renderer.autoClear = true;
      this.material.uniforms.uScene.value = this.target.texture;
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.setRenderTarget(this._previousTarget);
      renderer.autoClear = previousAutoClear;
    }
    return resolution;
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
    this.scene.traverse(object => object.geometry?.dispose());
  }
}
