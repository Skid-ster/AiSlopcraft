// Sky: 20-minute day/night cycle, sun & moon, stars, classic cloud layer at y=108.
import * as THREE from 'three';

const DAY_LENGTH = 20 * 60; // seconds per full cycle (beta)

// Classic beta sky & cloud colors (day, sunset, night)
const SKY_DAY = new THREE.Color(0x78a7ff);
const SKY_SUNSET = new THREE.Color(0xff9248);
const SKY_NIGHT = new THREE.Color(0x070814);
const FOG_DAY = new THREE.Color(0xc0d8ff);
const FOG_SUNSET = new THREE.Color(0xf08c4e);
const FOG_NIGHT = new THREE.Color(0x070814);
const CLOUD_DAY = new THREE.Color(0xffffff);
const CLOUD_SUNSET = new THREE.Color(0xffb894);
const CLOUD_NIGHT = new THREE.Color(0x23273a);
const WATER_BLUE = new THREE.Color(0x174a9b);
const SKY_NETHER = new THREE.Color(0x330808);
const FOG_NETHER = new THREE.Color(0x3b0c0c);

export class Sky {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.dimension = 'overworld';
    this.time = 0.38; // mid-morning: the title backdrop opens in full daylight
    this.elapsed = 0;
    this.dayFactor = 1;
    this.sunDirection = new THREE.Vector3(1, 0, 0);
    this._skyColor = new THREE.Color();
    this._fogColor = new THREE.Color();
    this._cloudColor = new THREE.Color();
    this._waterColor = new THREE.Color();
    this._tmpVec = new THREE.Vector3();
    scene.background = this._skyColor;

    // Analytic gradient: no per-frame CPU vertex-buffer uploads or color pops.
    this.skyDomeGeometry = new THREE.SphereGeometry(480, 32, 16);
    this.skyUniforms = {
      uHorizon: { value: new THREE.Color() },
      uZenith: { value: new THREE.Color() },
      uNadir: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunGlow: { value: 0 },
      uUnderwater: { value: 0 },
      uWaterColor: { value: new THREE.Color() },
    };
    this.skyDome = new THREE.Mesh(this.skyDomeGeometry, new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uNadir; uniform vec3 uSunDir; uniform float uSunGlow; uniform float uUnderwater; uniform vec3 uWaterColor; varying vec3 vDir;
        void main() {
          vec3 dir = normalize(vDir);
          float h = max(dir.y, 0.0);
          vec3 c = mix(uHorizon, uZenith, pow(h, 0.68));
          c = mix(c, uNadir, max(-dir.y, 0.0));
          float mie = pow(max(dot(dir, normalize(uSunDir)), 0.0), 8.0) * (1.0 - smoothstep(0.0, 0.65, abs(dir.y)));
          c += vec3(1.0, 0.68, 0.38) * mie * uSunGlow * 0.28;
          gl_FragColor = vec4(mix(c, uWaterColor, uUnderwater), 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    this.skyDome.renderOrder = -20;
    scene.add(this.skyDome);

    // sun & moon
    const sunGeo = new THREE.PlaneGeometry(46, 46);
    const sunTex = this.makeSunTexture();
    this.sun = new THREE.Mesh(sunGeo, new THREE.MeshBasicMaterial({
      map: sunTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, fog: false,
    }));
    this.sun.renderOrder = -10;
    scene.add(this.sun);

    const moonTex = this.makeMoonTexture();
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), new THREE.MeshBasicMaterial({
      map: moonTex, transparent: true, depthWrite: false, depthTest: true, fog: false,
    }));
    this.moon.renderOrder = -10;
    scene.add(this.moon);

    // stars
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    for (let i = 0; i < 750; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(390);
      starPos.push(v.x, v.y, v.z);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, depthTest: true, fog: false,
    }));
    this.stars.renderOrder = -11;
    scene.add(this.stars);

    // clouds — flat white plane at y=108 with a procedural pixel texture
    const cloudTex = this.makeCloudTexture();
    cloudTex.magFilter = THREE.NearestFilter;
    cloudTex.minFilter = THREE.NearestFilter;
    cloudTex.generateMipmaps = false;
    cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
    cloudTex.repeat.set(16, 16);
    this.cloudMat = new THREE.MeshBasicMaterial({
      map: cloudTex, color: 0xffffff, transparent: true, opacity: 0.88, depthWrite: false,
      side: THREE.DoubleSide, fog: true, alphaTest: 0.5,
    });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(2048, 2048), this.cloudMat);
    this.clouds.rotation.x = -Math.PI / 2;
    // Non-integer Y above mountain terrain prevents Z-fighting with block tops.
    this.clouds.position.y = 132.15;
    this.clouds.renderOrder = -5;
    scene.add(this.clouds);

    scene.fog = new THREE.Fog(FOG_DAY.clone(), 52, 110);
  }

  makeSunTexture() {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 32, 32);
    for (const [r, color] of [[12, 'rgba(255,210,90,0.45)'], [9, 'rgba(255,236,145,0.92)'], [6, 'rgba(255,253,225,1)']]) {
      ctx.fillStyle = color;
      ctx.fillRect(16 - r, 16 - r, r * 2, r * 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  makeMoonTexture() {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#e8e8f4';
    ctx.fillRect(6, 6, 20, 20);
    ctx.fillStyle = '#c4c4d4';
    ctx.fillRect(9, 10, 5, 5);
    ctx.fillRect(17, 15, 6, 5);
    ctx.fillRect(11, 20, 4, 3);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  makeCloudTexture() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    // Sparse, broad rectangular cloud bands rather than a dense field of flecks.
    let seed = 98765;
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    for (let i = 0; i < 12; i++) {
      const x = Math.floor(rand() * 32) * 4, y = Math.floor(rand() * 32) * 4;
      const w = (3 + Math.floor(rand() * 7)) * 4, h = (1 + Math.floor(rand() * 2)) * 4;
      for (const dx of [-128, 0, 128]) for (const dy of [-128, 0, 128]) ctx.fillRect(x + dx, y + dy, w, h);
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // time: 0.0 = midnight, 0.25 = dawn, 0.50 = noon, 0.75 = dusk
  update(dt, playerPos, renderDistance = 6, { underwater = false, dimension = 'overworld' } = {}) {
    this.dimension = dimension === 'nether' ? 'nether' : 'overworld';
    this.time = (this.time + dt / DAY_LENGTH) % 1;
    this.elapsed += dt;

    if (this.dimension === 'nether') {
      this.dayFactor = 0.0;
      this.sunDirection.set(0, -1, 0);
      this._skyColor.copy(SKY_NETHER);
      this._fogColor.copy(FOG_NETHER);
      this.scene.background = this._skyColor;
      this.skyDome.position.copy(playerPos);
      this.skyUniforms.uHorizon.value.copy(FOG_NETHER);
      this.skyUniforms.uZenith.value.copy(SKY_NETHER);
      this.skyUniforms.uNadir.value.copy(SKY_NETHER);
      this.skyUniforms.uSunGlow.value = 0;
      this.skyUniforms.uUnderwater.value = 0;
      this.sun.visible = this.moon.visible = this.stars.visible = this.clouds.visible = false;
      if (this.scene.fog) {
        const far = Math.max(28, renderDistance * 14);
        this.scene.fog.color.copy(FOG_NETHER);
        this.scene.fog.near = Math.max(8, far * 0.25);
        this.scene.fog.far = far;
      }
      return this.dayFactor;
    }

    const sunAngle = (this.time - 0.25) * Math.PI * 2;
    this.sunDirection.set(Math.cos(sunAngle), Math.sin(sunAngle), 0.18).normalize();

    const elev = this.sunDirection.y;
    this.dayFactor = Math.max(0, Math.min(1, (elev + 0.12) / 0.32));

    this._tmpVec.copy(this.sunDirection).multiplyScalar(400);
    this.sun.position.copy(playerPos).add(this._tmpVec);
    this.sun.lookAt(playerPos);
    this.moon.position.copy(playerPos).sub(this._tmpVec);
    this.moon.lookAt(playerPos);
    this.stars.position.copy(playerPos);
    this.stars.rotation.z = sunAngle * 0.25;
    this.stars.material.opacity = Math.max(0, 1 - this.dayFactor * 1.8) * 0.9;

    // Snap cloud plane in 128-block tile steps so nearest-filtered cloud pixels
    // never sub-texel shimmer when the player moves.
    const snapX = Math.round(playerPos.x / 128) * 128;
    const snapZ = Math.round(playerPos.z / 128) * 128;
    this.clouds.position.x = snapX;
    this.clouds.position.z = snapZ;
    this.cloudMat.map.offset.x = (this.elapsed * 0.0015) % 1;
    this.cloudMat.map.offset.y = 0;
    this.cloudMat.opacity = 0.65 + this.dayFactor * 0.25;

    const sky = this._skyColor;
    const fog = this._fogColor;
    const cloud = this._cloudColor;
    if (this.dayFactor > 0.65) {
      sky.copy(SKY_DAY);
      fog.copy(FOG_DAY);
      cloud.copy(CLOUD_DAY);
    } else if (this.dayFactor > 0.25) {
      const t = (this.dayFactor - 0.25) / 0.4;
      sky.copy(SKY_SUNSET).lerp(SKY_DAY, t);
      fog.copy(FOG_SUNSET).lerp(FOG_DAY, t);
      cloud.copy(CLOUD_SUNSET).lerp(CLOUD_DAY, t);
    } else {
      const t = this.dayFactor / 0.25;
      sky.copy(SKY_NIGHT).lerp(SKY_SUNSET, t);
      fog.copy(FOG_NIGHT).lerp(FOG_SUNSET, t);
      cloud.copy(CLOUD_NIGHT).lerp(CLOUD_SUNSET, t);
    }
    this.cloudMat.color.copy(cloud);
    this.scene.background = sky;
    this.skyDome.position.copy(playerPos);
    this.skyUniforms.uHorizon.value.copy(fog);
    this.skyUniforms.uZenith.value.copy(sky).multiplyScalar(0.78);
    this.skyUniforms.uNadir.value.copy(sky).multiplyScalar(0.55);
    this.skyUniforms.uSunDir.value.copy(this.sunDirection);
    this.skyUniforms.uSunGlow.value = this.dayFactor;
    this.skyUniforms.uUnderwater.value = underwater ? 1 : 0;
    this._waterColor.copy(FOG_NIGHT).lerp(WATER_BLUE, this.dayFactor);
    this.skyUniforms.uWaterColor.value.copy(this._waterColor);
    this.sun.visible = this.moon.visible = this.stars.visible = !underwater;
    this.clouds.visible = !underwater && this.showClouds !== false;
    if (this.scene.fog) {
      if (underwater) {
        this.scene.fog.color.copy(this._waterColor);
        this.scene.fog.near = 0.5;
        this.scene.fog.far = 26;
      } else {
        const far = Math.max(24, renderDistance * 16 - 8);
        this.scene.fog.color.copy(fog);
        this.scene.fog.near = far * 0.70;
        this.scene.fog.far = far;
      }
    }

    return this.dayFactor;
  }

  isNight() {
    return this.dayFactor < 0.28;
  }

  get timeOfDay() { return this.time; }
}
