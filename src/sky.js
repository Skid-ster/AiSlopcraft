// Sky: 20-minute day/night cycle, sun & moon, stars, classic cloud layer at y=108.
import * as THREE from 'three';

const DAY_LENGTH = 20 * 60; // seconds per full cycle (beta)

// Classic beta sky colors (day, sunset, night)
const SKY_DAY = new THREE.Color(0x78a7ff);
const SKY_SUNSET = new THREE.Color(0xff9a4d);
const SKY_NIGHT = new THREE.Color(0x0a0a18);
const FOG_DAY = new THREE.Color(0xc0d8ff);
const FOG_NIGHT = new THREE.Color(0x0a0a18);

export class Sky {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.time = 0.28; // start mid-morning
    this.dayFactor = 1;

    // sun & moon
    const sunGeo = new THREE.PlaneGeometry(30, 30);
    const sunTex = this.makeSunTexture();
    this.sun = new THREE.Mesh(sunGeo, new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, depthWrite: false, fog: false }));
    this.sun.renderOrder = -10;
    scene.add(this.sun);

    const moonTex = this.makeMoonTexture();
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, depthWrite: false, fog: false }));
    this.moon.renderOrder = -10;
    scene.add(this.moon);

    // stars
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    for (let i = 0; i < 700; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(320);
      starPos.push(v.x, v.y, v.z);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false
    }));
    this.stars.renderOrder = -11;
    scene.add(this.stars);

    // clouds — flat white plane at y=108 with a procedural texture
    const cloudTex = this.makeCloudTexture();
    cloudTex.magFilter = THREE.NearestFilter;
    cloudTex.minFilter = THREE.NearestFilter;
    cloudTex.generateMipmaps = false;
    cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
    cloudTex.repeat.set(16, 16);
    this.cloudMat = new THREE.MeshBasicMaterial({
      map: cloudTex, transparent: true, opacity: 0.9, depthWrite: false,
      side: THREE.DoubleSide, fog: false, alphaTest: 0.5
    });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(2048, 2048), this.cloudMat);
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.position.y = 108;
    this.clouds.renderOrder = -9;
    scene.add(this.clouds);

    scene.fog = new THREE.Fog(FOG_DAY.clone(), 60, 190);
  }

  makeSunTexture() {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 32, 32);
    for (const [r, color] of [[12, 'rgba(255,210,90,0.6)'], [8, 'rgba(255,236,150,0.95)'], [4, 'rgba(255,252,220,1)']]) {
      ctx.fillStyle = color;
      ctx.fillRect(16 - r, 16 - r, r * 2, r * 2);
    }
    ctx.fillStyle = 'rgba(255,230,120,0.8)';
    for (const [x, y] of [[16, 0], [16, 28], [0, 16], [28, 16]]) ctx.fillRect(x, y, 4, 4);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    return t;
  }

  makeMoonTexture() {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#e8e8f0';
    ctx.fillRect(6, 6, 20, 20);
    ctx.fillStyle = '#c8c8d4';
    ctx.fillRect(9, 10, 5, 5);
    ctx.fillRect(17, 15, 6, 5);
    ctx.fillRect(11, 20, 4, 3);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    return t;
  }

  makeCloudTexture() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    // small, coherent pixel clouds: 4px cells, clustered
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
    // one smoothing pass: keep cells with enough neighbors (coherent clusters)
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
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) grid[y][x] = g2[y][x];
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (grid[y][x]) ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    return t;
  }

  // time: 0 = dawn, 0.25 = noon, 0.5 = dusk, 0.75 = midnight
  update(dt, playerPos) {
    this.time = (this.time + dt / DAY_LENGTH) % 1;

    // sun angle: rises at 0, noon 0.25, sets 0.5
    const sunAngle = (this.time - 0.25) * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(sunAngle), Math.sin(sunAngle), 0.18).normalize();

    // day factor: 1 at noon, 0 at night
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

    // clouds drift
    this.clouds.position.x = playerPos.x;
    this.clouds.position.z = playerPos.z;
    this.cloudMat.map.offset.x = (performance.now() * 0.0000045) % 1;
    this.cloudMat.opacity = 0.7 + this.dayFactor * 0.2;

    // sky & fog color
    const sky = new THREE.Color();
    const fog = new THREE.Color();
    if (this.dayFactor > 0.65) {
      sky.copy(SKY_DAY);
      fog.copy(FOG_DAY);
    } else if (this.dayFactor > 0.25) {
      const t = (this.dayFactor - 0.25) / 0.4;
      sky.copy(SKY_SUNSET).lerp(SKY_DAY, t);
      fog.copy(SKY_SUNSET).lerp(FOG_DAY, t);
    } else {
      const t = this.dayFactor / 0.25;
      sky.copy(SKY_NIGHT).lerp(SKY_SUNSET, t);
      fog.copy(FOG_NIGHT).lerp(SKY_SUNSET, t);
    }
    this.scene.background = sky;
    if (this.scene.fog) {
      this.scene.fog.color.copy(fog);
      this.scene.fog.near = 55;
      this.scene.fog.far = 185;
    }

    return this.dayFactor;
  }

  isNight() {
    return this.dayFactor < 0.28;
  }

  get timeOfDay() { return this.time; }
}
