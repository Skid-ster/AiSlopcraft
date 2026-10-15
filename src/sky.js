// Sky: 20-minute day/night cycle, sun & moon, stars, classic cloud layer at y=108.
import * as THREE from 'three';

const DAY_LENGTH = 20 * 60; // seconds per full cycle (beta)

// Classic beta sky colors (day, sunset, night)
const SKY_DAY = new THREE.Color(0x78a7ff);
const SKY_SUNSET = new THREE.Color(0xff9a4d);
const SKY_NIGHT = new THREE.Color(0x070712);
const FOG_DAY = new THREE.Color(0x9ec4ff);
const FOG_SUNSET = new THREE.Color(0xe8a06a);
const FOG_NIGHT = new THREE.Color(0x070712);

// cloud layer: beta style 12x12 slabs floating at y=108
const CLOUD_CELL = 12;      // blocks per cloud slab
const CLOUD_HEIGHT = 4;     // slab thickness
const CLOUD_BASE = 108;     // bottom of the cloud layer
const CLOUD_GRID = 34;      // slabs per side around the player
const CLOUD_DENSITY = 0.11; // chance a slab exists
const CLOUD_NIGHT = new THREE.Color(0x3a4059);

// time: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
export function sunElevation(timeOfDay) {
  const t = ((timeOfDay % 1) + 1) % 1;
  return Math.sin((t - 0.25) * Math.PI * 2);
}

// 0 during the night, 1 in full day — smooth, no hard thresholds.
export function daylightFactor(timeOfDay) {
  const elevation = sunElevation(timeOfDay);
  return Math.max(0, Math.min(1, (elevation + 0.12) / 0.32));
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export class Sky {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.time = 0.35; // start mid-morning
    this.dayFactor = 1;
    this.renderDistance = 6;
    this._sky = new THREE.Color();
    this._fog = new THREE.Color();

    // sun & moon
    const sunTex = this.makeSunTexture();
    this.sun = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 26),
      new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, depthWrite: false, fog: false })
    );
    this.sun.renderOrder = -10;
    scene.add(this.sun);

    const moonTex = this.makeMoonTexture();
    this.moon = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 18),
      new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, depthWrite: false, fog: false })
    );
    this.moon.renderOrder = -10;
    scene.add(this.moon);

    // stars
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    const starRand = mulberry(0x51a2b3);
    for (let i = 0; i < 700; i++) {
      const v = new THREE.Vector3(starRand() - 0.5, starRand() - 0.5, starRand() - 0.5).normalize().multiplyScalar(320);
      starPos.push(v.x, v.y, v.z);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false
    }));
    this.stars.renderOrder = -11;
    scene.add(this.stars);

    // clouds — beta style 12x12 block slabs drifting in a layer at y=108.
    // Real slabs (instead of a textured plane) stay crisp at any distance.
    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: {
        uCloud: { value: new THREE.Color(0xffffff) },
        uSky: { value: new THREE.Color(0x78a7ff) },
        uFade: { value: new THREE.Vector2(60, 190) }
      },
      vertexShader: [
        'varying float vDist;',
        'void main() {',
        '  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);',
        '  vDist = length(mv.xyz);',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uCloud;',
        'uniform vec3 uSky;',
        'uniform vec2 uFade;',
        'varying float vDist;',
        'void main() {',
        '  float f = smoothstep(uFade.x, uFade.y, vDist);',
        '  gl_FragColor = vec4(mix(uCloud, uSky, f), 1.0);',
        '  #include <colorspace_fragment>',
        '}'
      ].join('\n'),
      fog: false
    });
    this.clouds = new THREE.InstancedMesh(
      new THREE.BoxGeometry(CLOUD_CELL, CLOUD_HEIGHT, CLOUD_CELL),
      this.cloudMat,
      CLOUD_GRID * CLOUD_GRID
    );
    this.clouds.frustumCulled = false;
    this.clouds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.clouds.position.y = 0;
    scene.add(this.clouds);
    this.cloudOrigin = new THREE.Vector2(NaN, NaN);
    this._cloudMat4 = new THREE.Matrix4();
    this._cloudVec = new THREE.Vector3();

    scene.fog = new THREE.Fog(FOG_DAY.clone(), 55, 185);
  }

  setRenderDistance(chunks) {
    this.renderDistance = Math.max(2, chunks | 0);
  }

  // Beta sun: a chunky square disc with a soft yellow rim.
  makeSunTexture() {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 16, 16);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const dx = x - 7.5, dy = y - 7.5;
        const d = Math.max(Math.abs(dx), Math.abs(dy)); // square distance
        if (d > 7.2) continue;
        const core = d <= 4.6;
        const edge = d <= 6.1;
        ctx.fillStyle = core ? 'rgb(255,252,224)' : edge ? 'rgb(255,232,150)' : 'rgba(255,214,110,0.55)';
        ctx.fillRect(x, y, 1, 1);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.NoColorSpace;
    return t;
  }

  // Beta moon: a pale square disc with craters.
  makeMoonTexture() {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 16, 16);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const dx = x - 7.5, dy = y - 7.5;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 7) continue;
        ctx.fillStyle = 'rgb(238,238,246)';
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.fillStyle = 'rgb(206,206,220)';
    ctx.fillRect(4, 5, 3, 2);
    ctx.fillRect(9, 3, 2, 2);
    ctx.fillRect(6, 10, 3, 2);
    ctx.fillRect(11, 9, 2, 1);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.NoColorSpace;
    return t;
  }

  // Classic blocky clouds: a world anchored grid of 12x12 slabs.  A slab is
  // filled when a deterministic hash says so; a second pass lets some cells
  // join a neighbour so the result reads as small rectangular clouds rather
  // than salt-and-pepper noise.
  updateClouds(playerPos) {
    const ox = Math.floor(playerPos.x / CLOUD_CELL) - (CLOUD_GRID >> 1);
    const oz = Math.floor(playerPos.z / CLOUD_CELL) - (CLOUD_GRID >> 1);
    if (ox === this.cloudOrigin.x && oz === this.cloudOrigin.y) return;
    this.cloudOrigin.set(ox, oz);

    const n = CLOUD_GRID;
    const solid = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (hash2(ox + i, oz + j) < CLOUD_DENSITY) solid[j * n + i] = 1;
      }
    }
    // let a few sparse cells stick to an existing cloud
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (solid[j * n + i]) continue;
        if (hash2(ox + i, oz + j) >= CLOUD_DENSITY + 0.16) continue;
        const left = i > 0 ? solid[j * n + i - 1] : 0;
        const right = i < n - 1 ? solid[j * n + i + 1] : 0;
        const up = j > 0 ? solid[(j - 1) * n + i] : 0;
        const down = j < n - 1 ? solid[(j + 1) * n + i] : 0;
        if (left || right || up || down) solid[j * n + i] = 1;
      }
    }

    let count = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (!solid[j * n + i]) continue;
        const cx = (ox + i) * CLOUD_CELL + CLOUD_CELL / 2;
        const cz = (oz + j) * CLOUD_CELL + CLOUD_CELL / 2;
        this._cloudMat4.makeTranslation(cx, CLOUD_BASE + CLOUD_HEIGHT / 2, cz);
        this.clouds.setMatrixAt(count++, this._cloudMat4);
      }
    }
    this.clouds.count = count;
    this.clouds.instanceMatrix.needsUpdate = true;
  }

  update(dt, playerPos) {
    this.time = (this.time + dt / DAY_LENGTH) % 1;

    // sun angle: rises at 0.25, noon 0.5, sets 0.75
    const sunAngle = (this.time - 0.25) * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(sunAngle), Math.sin(sunAngle), 0.18).normalize();

    // day factor: 1 at noon, 0 at night (smooth)
    const elev = sunDir.y;
    this.dayFactor = Math.max(0, Math.min(1, (elev + 0.12) / 0.32));

    // position sun/moon around player
    const center = playerPos.clone();
    this.sun.position.copy(center).add(sunDir.clone().multiplyScalar(280));
    this.sun.lookAt(center);
    this.moon.position.copy(center).sub(sunDir.clone().multiplyScalar(280));
    this.moon.lookAt(center);
    this.stars.position.copy(center);
    this.stars.rotation.z = sunAngle * 0.25;
    this.stars.material.opacity = Math.max(0, 1 - this.dayFactor * 1.8) * 0.9;

    // clouds: world anchored slabs around the player, dimmed at night and
    // faded into the sky colour with distance so they never pop
    this.updateClouds(playerPos);

    // sky & fog color — one smooth blend from night to day through sunset
    const day = smoothstep(-0.10, 0.20, elev);
    // a soft band around the horizon: strong at sunrise/sunset, gone by noon
    const sunset = Math.exp(-Math.pow(elev / 0.13, 2));
    this._sky.copy(SKY_NIGHT).lerp(SKY_DAY, day);
    this._sky.lerp(SKY_SUNSET, sunset * 0.8);
    this._fog.copy(FOG_NIGHT).lerp(FOG_DAY, day);
    this._fog.lerp(FOG_SUNSET, sunset * 0.8);
    this.scene.background = this._sky;
    let reach = this.renderDistance * 16;
    if (this.scene.fog) {
      this.scene.fog.color.copy(this._fog);
      // fog fades the terrain out before the render distance ends, so chunks
      // never pop into view
      this.scene.fog.near = reach * 0.55;
      this.scene.fog.far = reach * 0.98;
    }
    this.cloudMat.uniforms.uSky.value.copy(this._sky);
    this.cloudMat.uniforms.uCloud.value.setRGB(1, 1, 1).lerp(CLOUD_NIGHT, 1 - this.dayFactor);
    this.cloudMat.uniforms.uFade.value.set(reach * 1.05, reach * 2.6);

    return this.dayFactor;
  }

  isNight() {
    return this.dayFactor < 0.28;
  }

  get timeOfDay() { return this.time; }
}

// Deterministic hash of a cloud cell — same cells are always filled.
function hash2(x, z) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// Small deterministic PRNG so the cloud/sky art is stable between reloads.
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
