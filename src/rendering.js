// Shared native WebGL lighting for chunks, entities, drops, particles and the
// first-person hand. Supports two clean modes:
//   - 'classic' ("Normal"): crisp, steady 1.7.10 voxel lightmap, smooth AO, still water.
//   - 'shader'  ("Shader"): stabilized 1536px Poisson sun shadows, warm sun / cool sky
//     hemispheric lighting, foliage subsurface translucency + gentle breeze, reflective
//     caustic water, atmospheric Mie sun-haze, and ACES filmic tone mapping.
import * as THREE from 'three';
import { BLOCK_OPAQUE } from './world/blocks.js';

export const SHADER_STYLES = ['classic', 'shader'];
export const shaderStyleId = style => (style === 'shader' ? 1 : 0);

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
  uniform float uFoliage;
  uniform float uShaderStyle;
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
  varying vec2 vLight;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying float vFogDist;
  void main() {
    vTint = aTint;
    #ifdef VOXEL_LIGHT
      // Terrain vertex colors store 1.7.10 perceptual face shading, AO, and biome tint.
      // Convert them from sRGB to linear before multiplying linear atlas textures.
      vTint.rgb = pow(max(aTint.rgb, vec3(0.0)), vec3(2.2));
    #endif
    #ifdef USE_INSTANCING_COLOR
      vTint.rgb *= instanceColor;
    #endif
    vUv = uv;
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
    // Normal mode keeps still, pixelated water and static foliage.
    // Shader mode adds subtle water waves and gentle wind sway on outdoor foliage.
    if (uWater > 0.5 && uShaderStyle > 0.5) {
      float surface = 1.0 - step(0.02, abs(fract(position.y) - 0.88));
      world.y += surface * (
        sin(world.x * 1.45 + uTime * 1.6) * 0.016 +
        cos(world.z * 1.25 - uTime * 1.25) * 0.014
      );
    } else if (uFoliage > 0.5 && uShaderStyle > 0.5) {
      float outdoor = smoothstep(4.0, 13.0, vLight.x);
      float phase = world.x * 0.85 + world.z * 0.65 + world.y * 0.35;
      world.x += sin(uTime * 1.85 + phase) * 0.018 * outdoor;
      world.z += cos(uTime * 1.45 + phase * 1.1) * 0.014 * outdoor;
    }
    vWorldPosition = world.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
    vec4 mv = viewMatrix * world;
    vFogDist = length(mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D map;
  uniform float uHasMap;
  uniform sampler2D uEmissionMap;
  uniform float uHasEmissionMap;
  uniform float uEmission;
  uniform float uBrightness;
  uniform float uEntityShade;
  uniform float uOpacity;
  uniform float uAlphaTest;
  uniform float uShaderStyle;
  uniform vec3 uTint;
  uniform float uSky;
  uniform vec3 uSkyTint;
  uniform vec3 uBlockTint;
  uniform vec3 uAmbientFloor;
  uniform vec3 uSunDirection;
  uniform float uSunIntensity;
  uniform float uTime;
  uniform float uWater;
  uniform float uFoliage;
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
  varying vec2 vLight;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying float vFogDist;
  varying float vInstanceEmission;

  float sunShadow(vec3 normal, vec3 sunDir) {
    if (uShadowStrength <= 0.0) return 1.0;
    // Normal-offset bias prevents striped self-shadowing (shadow acne flicker)
    // on sunlit voxel faces while keeping contact shadows tight at block bases.
    float ndotl = max(dot(normal, sunDir), 0.0);
    vec3 sampleWorld = vWorldPosition + normal * (0.042 * (1.0 - ndotl * 0.55));
    vec4 projected = uShadowMatrix * vec4(sampleWorld, 1.0);
    vec3 coord = projected.xyz / projected.w;
    // Points outside or before the shadow frustum remain cleanly lit.
    if (coord.x <= 0.002 || coord.x >= 0.998 || coord.y <= 0.002 || coord.y >= 0.998 || coord.z <= 0.0 || coord.z >= 1.0) return 1.0;
    float bias = max(0.00020, 0.00072 * (1.0 - ndotl));
    float radius = uShadowTexel * 1.35;
    float visibility = 0.0;
    visibility += coord.z - bias <= texture2D(uShadowMap, coord.xy + vec2(-0.9420, -0.3991) * radius).r ? 1.0 : 0.0;
    visibility += coord.z - bias <= texture2D(uShadowMap, coord.xy + vec2( 0.9456, -0.7689) * radius).r ? 1.0 : 0.0;
    visibility += coord.z - bias <= texture2D(uShadowMap, coord.xy + vec2(-0.0942, -0.9294) * radius).r ? 1.0 : 0.0;
    visibility += coord.z - bias <= texture2D(uShadowMap, coord.xy + vec2( 0.3450,  0.2939) * radius).r ? 1.0 : 0.0;
    visibility += coord.z - bias <= texture2D(uShadowMap, coord.xy + vec2(-0.9159,  0.4577) * radius).r ? 1.0 : 0.0;
    visibility += coord.z - bias <= texture2D(uShadowMap, coord.xy + vec2(-0.8154, -0.8791) * radius).r ? 1.0 : 0.0;
    visibility += coord.z - bias <= texture2D(uShadowMap, coord.xy + vec2( 0.9748,  0.7565) * radius).r ? 1.0 : 0.0;
    visibility += coord.z - bias <= texture2D(uShadowMap, coord.xy + vec2( 0.1998,  0.9612) * radius).r ? 1.0 : 0.0;
    visibility += coord.z - bias <= texture2D(uShadowMap, coord.xy).r ? 1.0 : 0.0;
    visibility /= 9.0;
    float edge = smoothstep(0.0, 0.09, min(min(coord.x, 1.0 - coord.x), min(coord.y, 1.0 - coord.y)));
    return 1.0 - (1.0 - visibility) * uShadowStrength * edge;
  }

  vec3 acesFilmic(vec3 x) {
    // Narkowicz ACES fitted curve, scaled so neutral diffuse albedos keep crisp exposure
    // while bright sun highlights, clouds, sand, and emissives roll off smoothly.
    vec3 v = x * 1.16;
    return clamp((v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14), 0.0, 1.0);
  }

  vec3 grade(vec3 color) {
    if (uShaderStyle < 0.5) return max(color, vec3(0.0));
    color = acesFilmic(max(color, vec3(0.0)));
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(luminance), color, 1.12);
    return max(color, vec3(0.0));
  }

  void main() {
    vec2 uv = vUv;
    if (uWater > 0.5 && uShaderStyle > 0.5) uv += vec2(uTime * 0.006, uTime * 0.014);
    vec4 tex = mix(vec4(1.0), texture2D(map, uv), uHasMap);
    float alpha = tex.a * vTint.a * uOpacity;
    if (alpha < uAlphaTest) discard;
    vec3 normal = normalize(vWorldNormal);
    if (!gl_FrontFacing) normal = -normal;
    vec3 sunDir = normalize(uSunDirection);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    vec3 base = tex.rgb * vTint.rgb * uTint;

    // Minecraft 1.7.10 WorldProvider.generateLightBrightnessTable() curve:
    // L(i) = (i/15) / (4 - 3 * (i/15)).
    float nSky = clamp(vLight.x / 15.0, 0.0, 1.0);
    float nBlk = clamp(vLight.y / 15.0, 0.0, 1.0);
    float skyLevel = nSky / (4.0 - 3.0 * nSky);
    float blockLevel = nBlk / (4.0 - 3.0 * nBlk);
    float shadow = sunShadow(normal, sunDir);

    // Keep exposed terrain legible through the full day cycle: Minecraft's
    // classic lightmap has a real night floor, not a hard drop to black.
    float daylight = max(uSky, 0.12);
    float sunBrightness = clamp((daylight - 0.12) / 0.88 * 0.78 + 0.22, 0.22, 1.0);

    // Classic 1.7.10 terrain bakes directional face shading (1.0/0.8/0.6/0.5) in
    // mesher.js; entities without baked shading receive standard 1.7.10 box shade.
    float entityShade = mix(1.0,
      normal.y > 0.5 ? 1.0 : normal.y < -0.5 ? 0.55 : abs(normal.x) > 0.5 ? 0.68 : 0.84,
      uEntityShade);

    vec3 skyLight = uSkyTint * skyLevel * sunBrightness;
    vec3 direct = vec3(0.0);
    if (uShaderStyle > 0.5) {
      // Hemispheric cool sky dome in shadows + warm golden sunlight on direct faces.
      float skyUp = normal.y * 0.5 + 0.5;
      vec3 coolAmbient = mix(vec3(0.84, 0.79, 0.74), vec3(0.76, 0.89, 1.08), skyUp);
      skyLight *= mix(coolAmbient * 0.74, vec3(0.96), shadow);
      float sunElev = clamp(sunDir.y, 0.0, 1.0);
      vec3 sunColor = mix(vec3(1.0, 0.56, 0.28), vec3(1.0, 0.95, 0.85), smoothstep(0.04, 0.48, sunElev));
      float ndotl = max(dot(normal, sunDir), 0.0);
      direct = sunColor * skyLevel * uSunIntensity * ndotl * shadow * 0.46;
      // Subsurface translucency for backlit leaves, grass, saplings, and crops.
      if (uFoliage > 0.5) {
        float backScatter = pow(max(dot(-viewDir, sunDir), 0.0), 3.0) * 0.55 + 0.25 * max(sunDir.y, 0.0);
        direct += sunColor * skyLevel * uSunIntensity * shadow * backScatter * 0.34;
      }
    }

    // Steady warm torch/lava/glowstone curve (no sinusoidal time flicker).
    float blkB = blockLevel;
    vec3 torchColor = vec3(
      blkB,
      blkB * ((blkB * 0.6 + 0.4) * 0.6 + 0.4),
      blkB * (blkB * blkB * 0.6 + 0.4)
    );
    vec3 torchTint = uShaderStyle > 0.5 ? vec3(1.06, 0.84, 0.62) : uBlockTint;
    vec3 torchLight = torchTint * torchColor;
    vec3 lightSrgb = clamp((skyLight + direct + torchLight) * 0.96 + uAmbientFloor, uAmbientFloor, vec3(1.28));

    // 1.7.10 Brightness/Gamma slider (Moody .. Bright) lifts caves & shadows
    // via 1 - (1 - c)^4 without overexposing sunlit blocks.
    float gammaSetting = clamp(uBrightness - 0.5, 0.0, 1.0);
    vec3 clampedSrgb = clamp(lightSrgb, vec3(0.0), vec3(1.0));
    vec3 invLight = 1.0 - clampedSrgb;
    vec3 brightLight = 1.0 - invLight * invLight * invLight * invLight;
    vec3 liftedSrgb = mix(clampedSrgb, brightLight, mix(0.0, 0.85, pow(gammaSetting, 1.4))) + max(lightSrgb - vec3(1.0), vec3(0.0));
    vec3 light = pow(max(liftedSrgb * entityShade, vec3(0.0)), vec3(2.2));
    vec3 rgb = base * light;

    // Emissive texels (flame, lava, glowstone, lit furnace/lantern/portal faces)
    // keep crisp self-illumination at night instead of being darkened by cave light.
    float texEmission = uHasEmissionMap > 0.5 ? texture2D(uEmissionMap, uv).r : 0.0;
    float emissionMask = clamp(max(uEmission + vInstanceEmission, texEmission), 0.0, 1.0);
    vec3 emissiveBoost = uShaderStyle > 0.5 ? base * 1.24 : base;
    rgb = mix(rgb, emissiveBoost, emissionMask);

    if (uWater > 0.5 && uShaderStyle > 0.5) {
      vec2 p = vWorldPosition.xz;
      vec3 ripple = vec3(
        cos(p.x * 1.7 + uTime * 1.35) * 0.052 + sin((p.x + p.y) * 0.85 - uTime * 1.05) * 0.034
          + cos((p.x - p.y) * 4.1 + uTime * 2.0) * 0.018,
        0.0,
        sin(p.y * 1.5 - uTime * 1.15) * 0.052 + cos((p.x - p.y) * 0.9 + uTime * 0.75) * 0.034
          + sin((p.x + p.y) * 3.7 - uTime * 1.8) * 0.018
      );
      vec3 waterNormal = normalize(normal + ripple);
      float fresnel = 0.03 + 0.97 * pow(1.0 - max(dot(waterNormal, viewDir), 0.0), 4.5);
      vec3 reflected = reflect(-viewDir, waterNormal);
      vec3 skyReflect = mix(uFogColor, uSkyTint * vec3(0.68, 0.86, 1.12), clamp(reflected.y * 0.75 + 0.25, 0.0, 1.0));
      // Subtle teal-azure absorption tint before blending sky reflection.
      rgb = mix(rgb * vec3(0.72, 0.95, 1.08), skyReflect * (0.32 + 0.68 * uSky), fresnel * 0.58);
      vec3 halfVec = normalize(sunDir + viewDir);
      float specTight = pow(max(dot(waterNormal, halfVec), 0.0), 128.0);
      float specBroad = pow(max(dot(waterNormal, halfVec), 0.0), 24.0) * 0.14;
      rgb += vec3(1.0, 0.90, 0.72) * (specTight * 0.85 + specBroad) * uSunIntensity * shadow;
      float causticPattern = sin((p.x + p.y) * 3.2 + uTime * 1.7) * sin((p.x - p.y) * 2.4 - uTime * 1.1);
      float caustic = pow(max(causticPattern * 0.5 + 0.5, 0.0), 9.0)
        * max(dot(waterNormal, viewDir), 0.0) * uSunIntensity * shadow;
      rgb += vec3(0.10, 0.26, 0.32) * caustic * 0.52;
      alpha = mix(alpha, min(0.95, alpha + 0.14), fresnel);
    }

    rgb = grade(rgb);

    float fog = uFogEnabled * smoothstep(uFogNear, uFogFar, vFogDist);
    vec3 fogTarget = uFogColor;
    if (uShaderStyle > 0.5 && uSunIntensity > 0.01) {
      // Forward Mie sun-haze warms distant horizon fog when looking toward the sun.
      float sunAlign = pow(max(dot(-viewDir, sunDir), 0.0), 6.0);
      vec3 mieTint = mix(vec3(1.0, 0.62, 0.34), vec3(1.0, 0.94, 0.82), clamp(sunDir.y * 2.0, 0.0, 1.0));
      fogTarget = mix(uFogColor, mieTint, sunAlign * uSunIntensity * 0.32);
    }
    gl_FragColor = vec4(mix(rgb, fogTarget, fog), alpha);
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
  constructor({ atlasTexture, emissionTexture, shadowSize = 1536 } = {}) {
    this.white = whiteTexture();
    this.emissionTexture = emissionTexture || this.white;
    this.shadowSize = shadowSize;
    this.shadowTarget = new THREE.WebGLRenderTarget(shadowSize, shadowSize, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthTexture: new THREE.DepthTexture(shadowSize, shadowSize, THREE.UnsignedIntType),
    });
    this.shadowCamera = new THREE.OrthographicCamera(-44, 44, 44, -44, 1, 192);
    this.shadowCamera.layers.set(1);
    this.shadowMatrix = new THREE.Matrix4();
    this.depthMaterial = new THREE.MeshDepthMaterial({ map: atlasTexture || null, alphaTest: 0.45, side: THREE.DoubleSide });
    this.lastShadowTime = -Infinity;
    this.shadowDirty = true;
    this.lastShadowPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
    this.lastShadowSunDirection = new THREE.Vector3(Infinity, Infinity, Infinity);
    this.lastShadowForward = new THREE.Vector3(Infinity, Infinity, Infinity);
    this.shared = {
      uSky: { value: 1 },
      uSkyTint: { value: new THREE.Color(1, 1, 1) },
      uBlockTint: { value: new THREE.Color(1.0, 0.96, 0.88) },
      uAmbientFloor: { value: new THREE.Color(0.03, 0.03, 0.03) },
      uShaderStyle: { value: 0 },
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
    this._quantizedSun = new THREE.Vector3();
  }

  invalidateShadows() {
    this.shadowDirty = true;
  }

  createMaterial(opts = {}) {
    const isCutoutVoxel = Boolean(opts.voxel && (opts.cutout || (opts.alphaTest ?? 0) > 0.1));
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
        uEntityShade: { value: Number(opts.entityShade ?? (opts.voxel ? 0 : 1)) },
        uOpacity: { value: opts.opacity ?? 1 },
        uAlphaTest: { value: opts.alphaTest ?? (opts.cutout ? 0.45 : 0) },
        uTint: { value: opts.tint?.isColor ? opts.tint.clone() : new THREE.Color(opts.tint ?? 0xffffff) },
        uObjectLight: { value: new THREE.Vector2(15, 0) },
        uWater: { value: opts.water ? 1 : 0 },
        uFoliage: { value: opts.foliage ?? (isCutoutVoxel ? 1 : 0) },
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
      const hasVertexColors = !!object.geometry?.getAttribute?.('color');
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
          entityShade: opts.entityShade ?? !hasVertexColors,
          foliage: 0,
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

  // Smooth trilinear non-opaque light sampling prevents entities, drops, and the
  // first-person hand from snapping across voxel grid lines or flashing black next to walls.
  refreshObject(root, world, position, yOffset = 0.9) {
    const sx = position.x - 0.5;
    const sy = position.y + yOffset - 0.5;
    const sz = position.z - 0.5;
    const x0 = Math.floor(sx), y0 = Math.floor(sy), z0 = Math.floor(sz);
    const fx = sx - x0, fy = sy - y0, fz = sz - z0;
    const hasBlock = typeof world.getBlock === 'function';

    let sumSky = 0, sumBlk = 0, sumW = 0;
    let maxSky = 0, maxBlk = 0;
    for (let dz = 0; dz <= 1; dz++) {
      const wz = dz ? fz : 1 - fz;
      for (let dy = 0; dy <= 1; dy++) {
        const wy = dy ? fy : 1 - fy;
        for (let dx = 0; dx <= 1; dx++) {
          const cx = x0 + dx, cy = y0 + dy, cz = z0 + dz;
          const packed = world.getLight(cx, cy, cz);
          const s = packed >> 4, b = packed & 15;
          if (s > maxSky) maxSky = s;
          if (b > maxBlk) maxBlk = b;
          if (hasBlock && BLOCK_OPAQUE[world.getBlock(cx, cy, cz)]) continue;
          const w = (dx ? fx : 1 - fx) * wy * wz;
          sumSky += s * w;
          sumBlk += b * w;
          sumW += w;
        }
      }
    }

    let targetSky, targetBlk;
    if (sumW > 1e-4) {
      targetSky = sumSky / sumW;
      targetBlk = sumBlk / sumW;
    } else {
      const packed = world.getLight(Math.floor(position.x), Math.floor(position.y + yOffset), Math.floor(position.z));
      targetSky = Math.max(packed >> 4, maxSky);
      targetBlk = Math.max(packed & 15, maxBlk);
    }

    let state = root.userData?._smoothLight;
    if (!state) {
      state = { sky: targetSky, blk: targetBlk };
      if (root.userData) root.userData._smoothLight = state;
    } else {
      state.sky += (targetSky - state.sky) * 0.32;
      state.blk += (targetBlk - state.blk) * 0.32;
    }
    this.setObjectLight(root, state.sky, state.blk);
  }

  update({ sky, time, style, fog }) {
    const s = this.shared;
    const id = shaderStyleId(style);
    s.uShaderStyle.value = id;
    s.uTime.value = time;
    s.uSky.value = 0.12 + 0.88 * sky.dayFactor;
    s.uSunIntensity.value = sky.dayFactor;
    s.uSunDirection.value.copy(sky.sunDirection);
    const day = sky.dayFactor;
    if (day > 0.65) s.uSkyTint.value.setRGB(1, 1, 1);
    else if (day > 0.25) {
      const t = (day - 0.25) / 0.4;
      s.uSkyTint.value.setRGB(1, 0.72 + 0.28 * t, 0.50 + 0.50 * t);
    } else {
      const t = day / 0.25;
      s.uSkyTint.value.setRGB(0.52 + 0.48 * t, 0.66 + 0.06 * t, 1.0 - 0.50 * t);
    }
    const isNether = sky.dimension === 'nether';
    s.uAmbientFloor.value.setRGB(isNether ? 0.26 : 0.03, isNether ? 0.16 : 0.03, isNether ? 0.14 : 0.03);
    if (fog) syncFogUniforms([{ uniforms: s }], fog);
    if (isNether || id < 1 || sky.sunDirection.y <= 0.06) s.uShadowStrength.value = 0;
  }

  updateShadows(renderer, scene, camera, sky, style, time, force = false, enabled = true) {
    const id = shaderStyleId(style);
    if (!enabled || sky.dimension === 'nether' || id < 1 || sky.sunDirection.y <= 0.06) {
      this.shared.uShadowStrength.value = 0;
      return;
    }
    const wasDisabled = this.shared.uShadowStrength.value === 0;
    // Smoothly fade shadow strength near dawn/dusk horizon so shadows never pop on or off abruptly.
    const horizonFade = Math.min(1, Math.max(0, (sky.sunDirection.y - 0.06) / 0.12));
    this.shared.uShadowStrength.value = 0.76 * horizonFade;

    // Quantize shadow sun direction into small discrete steps so the light-space
    // texel basis does not rotate sub-pixel every frame (eliminates shadow swimming).
    const step = 0.004;
    this._quantizedSun.set(
      Math.round(sky.sunDirection.x / step) * step,
      Math.round(sky.sunDirection.y / step) * step,
      Math.round(sky.sunDirection.z / step) * step,
    ).normalize();

    const dirty = this.shadowDirty;
    if (!force && !wasDisabled && !dirty && time - this.lastShadowTime < 0.08) return;
    camera.getWorldDirection(this._forward);
    const cameraMoved = this.lastShadowPosition.distanceToSquared(camera.position) > 0.25;
    const cameraTurned = this.lastShadowForward.distanceToSquared(this._forward) > 0.015;
    const sunMoved = this.lastShadowSunDirection.distanceToSquared(this._quantizedSun) > 1e-7;
    if (!force && !wasDisabled && !dirty && !cameraMoved && !cameraTurned && !sunMoved && time - this.lastShadowTime < 1.0) return;

    this.shadowDirty = false;
    this.lastShadowTime = time;
    this.lastShadowPosition.copy(camera.position);
    this.lastShadowForward.copy(this._forward);
    this.lastShadowSunDirection.copy(this._quantizedSun);

    this._center.copy(camera.position).addScaledVector(this._forward, 14);
    this.shadowCamera.position.copy(this._center).addScaledVector(this._quantizedSun, 96);
    this.shadowCamera.lookAt(this._center);
    this.shadowCamera.updateMatrixWorld(true);

    // Snap the light-space camera to exact shadow texels to prevent edge crawl when moving.
    const texelWorldSize = (this.shadowCamera.right - this.shadowCamera.left) / this.shadowSize;
    const matrix = this.shadowCamera.matrixWorld.elements;
    const right = new THREE.Vector3(matrix[0], matrix[1], matrix[2]);
    const up = new THREE.Vector3(matrix[4], matrix[5], matrix[6]);
    const snapAxis = axis => {
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
