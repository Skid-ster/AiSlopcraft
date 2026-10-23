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

export class Sky {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.time = 0.30; // start mid-morning (0.25 = dawn, 0.50 = noon)
    this.dayFactor = 1;
    this.sunDirection = new THREE.Vector3(1, 0, 0);

    // A camera-following, vertex-coloured sky dome replaces the flat color-only
    // backdrop with a gentle horizon-to-zenith gradient, while retaining the
    // crisp, low-poly pixel-art look.
    this.skyDomeGeometry = new THREE.SphereGeometry(480, 32, 16);
    this.skyDomeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(this.skyDomeGeometry.getAttribute('position').count * 3), 3));
    this.skyDome = new THREE.Mesh(this.skyDomeGeometry, new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }));
    this.skyDome.renderOrder = -20;
    scene.add(this.skyDome);

    // sun & moon
    const sunGeo = new THREE.PlaneGeometry(32, 32);
    const sunTex = this.makeSunTexture();
    this.sun = new THREE.Mesh(sunGeo, new THREE.MeshBasicMaterial({
      map: sunTex, transparent: true, depthWrite: false, depthTest: false, fog: false,
    }));
    this.sun.renderOrder = -10;
    scene.add(this.sun);

    const moonTex = this.makeMoonTexture();
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), new THREE.MeshBasicMaterial({
      map: moonTex, transparent: true, depthWrite: false, depthTest: false, fog: false,
    }));
    this.moon.renderOrder = -10;
    scene.add(this.moon);

    // stars
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    for (let i = 0; i < 750; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(320);
      starPos.push(v.x, v.y, v.z);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false,
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
    this.clouds.position.y = 108;
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
    t.colorSpace = THREE.NoColorSpace;
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
    t.colorSpace = THREE.NoColorSpace;
    return t;
  }

  makeCloudTexture() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    const cell = 4;
    const n = 128 / cell;
    const rand = (() => {
      let s = 98765;
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
    })();
    const grid = [];
    for (let y = 0; y < n; y++) {
      grid[y] = [];
      for (let x = 0; x < n; x++) grid[y][x] = rand() > 0.72;
    }
    const g2 = grid.map(r => r.slice());
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          count += grid[(y + dy + n) % n][(x + dx + n) % n] ? 1 : 0;
        }
        g2[y][x] = count >= 5;
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (g2[y][x]) ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.NoColorSpace;
    return t;
  }

  // time: 0.0 = midnight, 0.25 = dawn, 0.50 = noon, 0.75 = dusk
  update(dt, playerPos, renderDistance = 6) {
    this.time = (this.time + dt / DAY_LENGTH) % 1;

    const sunAngle = (this.time - 0.25) * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(sunAngle), Math.sin(sunAngle), 0.18).normalize();
    this.sunDirection.copy(sunDir);

    const elev = sunDir.y;
    this.dayFactor = Math.max(0, Math.min(1, (elev + 0.12) / 0.32));

    const center = playerPos.clone();
    this.sun.position.copy(center).add(sunDir.clone().multiplyScalar(280));
    this.sun.lookAt(center);
    this.moon.position.copy(center).sub(sunDir.clone().multiplyScalar(280));
    this.moon.lookAt(center);
    this.stars.position.copy(center);
    this.stars.rotation.z = sunAngle * 0.25;
    this.stars.material.opacity = Math.max(0, 1 - this.dayFactor * 1.8) * 0.9;

    // clouds drift & take day/sunset/night tint
    this.clouds.position.x = playerPos.x;
    this.clouds.position.z = playerPos.z;
    this.cloudMat.map.offset.x = (performance.now() * 0.0000045) % 1;
    this.cloudMat.opacity = 0.65 + this.dayFactor * 0.25;

    const sky = new THREE.Color();
    const fog = new THREE.Color();
    const cloud = new THREE.Color();
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
    this.skyDome.position.copy(center);
    const horizon = sky.clone().lerp(
      this.dayFactor > 0.32 ? new THREE.Color(0xdceaff) : new THREE.Color(0x4c5277),
      this.dayFactor > 0.32 ? 0.34 : 0.42,
    );
    const zenith = sky.clone().multiplyScalar(0.56);
    const nadir = sky.clone().multiplyScalar(0.68);
    const domePosition = this.skyDomeGeometry.getAttribute('position');
    const domeColor = this.skyDomeGeometry.getAttribute('color');
    for (let i = 0; i < domePosition.count; i++) {
      const h = domePosition.getY(i) / 480;
      const mix = h >= 0 ? Math.pow(h, 0.7) : -h;
      const end = h >= 0 ? zenith : nadir;
      domeColor.setXYZ(i,
        horizon.r + (end.r - horizon.r) * mix,
        horizon.g + (end.g - horizon.g) * mix,
        horizon.b + (end.b - horizon.b) * mix,
      );
    }
    domeColor.needsUpdate = true;
    if (this.scene.fog) {
      const far = Math.max(52, renderDistance * 16 - 4);
      this.scene.fog.color.copy(fog);
      this.scene.fog.near = far * 0.48;
      this.scene.fog.far = far;
    }

    return this.dayFactor;
  }

  isNight() {
    return this.dayFactor < 0.28;
  }

  get timeOfDay() { return this.time; }
}
