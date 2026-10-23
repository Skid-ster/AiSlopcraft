// WebAudio synth for Beta-style sounds: material footsteps, digs, breaks, place,
// hurt, explosions, mob noises, doors, shears, liquid splash/hiss. Zero external assets.
import {
  SAND, GRAVEL, STONE, COBBLE, PLANKS, LOG, SNOW, SNOW_BLOCK, GLASS, ICE,
  LEAVES, TALL_GRASS, WOOL_BASE, IRON_BLOCK, GOLD_BLOCK, DIAMOND_BLOCK,
  CRAFTING_TABLE, CHEST, BOOKSHELF, FURNACE, FURNACE_LIT, BRICK, STONE_BRICK, OBSIDIAN,
} from './world/blocks.js';

function blockSoundCategory(id) {
  if (id === SAND) return 'sand';
  if (id === GRAVEL) return 'gravel';
  if (id === SNOW || id === SNOW_BLOCK) return 'snow';
  if (id === GLASS || id === ICE) return 'glass';
  if (id === PLANKS || id === LOG || id === CRAFTING_TABLE || id === CHEST || id === BOOKSHELF) return 'wood';
  if (id === LEAVES || id === TALL_GRASS) return 'grass';
  if (id >= WOOL_BASE && id < WOOL_BASE + 16) return 'cloth';
  if (id === IRON_BLOCK || id === GOLD_BLOCK || id === DIAMOND_BLOCK) return 'metal';
  if (id === STONE || id === COBBLE || id === FURNACE || id === FURNACE_LIT || id === BRICK || id === STONE_BRICK || id === OBSIDIAN) return 'stone';
  return 'grass';
}

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.volume = 0.5;
    this._lastStep = 0;
    this._noiseBuf = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 1.5);
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch (e) {
      this.enabled = false;
    }
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  _ensureReady() {
    if (!this.enabled || !this.ctx) return false;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return true;
  }

  _noise(dur, freq, q, gain, type = 'bandpass', sweepTo = null, delay = 0) {
    if (!this._ensureReady()) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(Math.max(40, freq), t);
    filter.Q.setValueAtTime(q, t);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.001, gain), t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.onended = () => {
      try { src.disconnect(); filter.disconnect(); g.disconnect(); } catch (_) {}
    };
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  _tone(freq, dur, gain, type = 'square', slideTo = null, delay = 0) {
    if (!this._ensureReady()) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, freq), t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.001, gain), t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.onended = () => {
      try { o.disconnect(); g.disconnect(); } catch (_) {}
    };
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  step(blockId = 2) {
    const now = performance.now();
    if (now - this._lastStep < 210) return;
    this._lastStep = now;
    const jitter = 0.92 + Math.random() * 0.16;
    const cat = blockSoundCategory(blockId);
    if (cat === 'sand') this._noise(0.09, 1050 * jitter, 1.4, 0.14);
    else if (cat === 'gravel') this._noise(0.11, 760 * jitter, 0.9, 0.18, 'bandpass', 420);
    else if (cat === 'snow') this._noise(0.09, 1450 * jitter, 1.6, 0.13);
    else if (cat === 'wood') {
      this._noise(0.08, 360 * jitter, 1.8, 0.18);
      this._tone(135 * jitter, 0.06, 0.05, 'triangle', 95);
    } else if (cat === 'stone' || cat === 'glass') {
      this._noise(0.075, 540 * jitter, 1.5, 0.18);
    } else if (cat === 'metal') {
      this._tone(420 * jitter, 0.07, 0.06, 'triangle', 310);
      this._noise(0.06, 900 * jitter, 1.8, 0.12);
    } else if (cat === 'cloth') {
      this._noise(0.08, 420 * jitter, 0.9, 0.11);
    } else {
      this._noise(0.09, 680 * jitter, 1.2, 0.16);
    }
  }

  dig(blockId = 1) {
    const jitter = 0.9 + Math.random() * 0.2;
    const cat = blockSoundCategory(blockId);
    if (cat === 'wood') this._noise(0.11, 380 * jitter, 1.6, 0.22);
    else if (cat === 'sand' || cat === 'snow') this._noise(0.1, 980 * jitter, 1.3, 0.19);
    else if (cat === 'glass') this._tone(1100 * jitter, 0.06, 0.07, 'sine', 900);
    else this._noise(0.11, (440 + (blockId % 5) * 45) * jitter, 1.5, 0.21);
  }

  breakBlock(blockId = 1) {
    const cat = blockSoundCategory(blockId);
    if (cat === 'glass') {
      this._noise(0.18, 2400, 1.8, 0.26, 'highpass', 1200);
      this._tone(1520, 0.09, 0.1, 'triangle', 920);
      this._tone(1180, 0.11, 0.09, 'triangle', 680, 0.04);
      return;
    }
    if (cat === 'wood') {
      this._noise(0.2, 340, 1.3, 0.3, 'bandpass', 140);
      this._tone(150, 0.12, 0.1, 'triangle', 75);
      return;
    }
    this._noise(0.22, 380, 1.2, 0.32, 'bandpass', 140);
    this._tone(160, 0.12, 0.08, 'triangle', 80);
  }

  place(blockId = 1) {
    const cat = blockSoundCategory(blockId);
    const base = cat === 'wood' ? 420 : cat === 'sand' ? 880 : 620;
    this._noise(0.1, base, 1.4, 0.24, 'bandpass', base * 0.55);
  }

  door(open = true) {
    this._tone(open ? 220 : 280, 0.14, 0.12, 'sawtooth', open ? 310 : 165);
    this._noise(0.1, 450, 1.4, 0.14);
  }

  shear() {
    this._noise(0.07, 2600, 2.5, 0.18, 'bandpass', 1800);
    this._tone(980, 0.05, 0.07, 'triangle', 1350);
  }

  fizz() {
    this._noise(0.38, 1900, 0.9, 0.24, 'bandpass', 700);
  }

  swing() {
    this._noise(0.08, 520, 0.9, 0.11, 'bandpass', 240);
  }

  hurt() {
    this._tone(320, 0.18, 0.2, 'square', 180);
    this._noise(0.16, 800, 1.0, 0.12);
  }

  mobHurt() {
    this._tone(240, 0.14, 0.12, 'square', 160);
  }

  mobDeath(type = 'mob') {
    const pitch = type === 'skeleton' ? 150 : type === 'spider' ? 120 : 180;
    this._tone(pitch, 0.24, 0.14, 'triangle', pitch * 0.55);
    this._noise(0.18, 360, 1.1, 0.12, 'bandpass', 180);
  }

  mobAttack() {
    this._noise(0.12, 500, 1.0, 0.2);
    this._tone(200, 0.1, 0.1, 'square', 120);
  }

  jump() {
    this._noise(0.07, 600, 1.0, 0.08);
  }

  explosion() {
    this._noise(0.65, 220, 0.7, 0.75, 'lowpass', 60);
    this._tone(60, 0.5, 0.4, 'sine', 30);
    this._noise(0.35, 1200, 0.5, 0.3, 'lowpass', 100);
  }

  fuse() {
    this._noise(0.5, 1800, 2, 0.1, 'bandpass', 2400);
  }

  bow() {
    this._tone(700, 0.1, 0.08, 'triangle', 300);
    this._noise(0.12, 1600, 2, 0.1);
  }

  arrowHit() {
    this._noise(0.08, 900, 1.5, 0.14);
    this._tone(540, 0.06, 0.06, 'triangle', 380);
  }

  splash() {
    this._noise(0.35, 900, 0.8, 0.2, 'bandpass', 300);
  }

  chew() {
    this._noise(0.08, 310 + Math.random() * 60, 1.1, 0.13);
  }

  eat() {
    this._noise(0.11, 310, 1.0, 0.18, 'bandpass', null, 0);
    this._noise(0.11, 285, 1.0, 0.18, 'bandpass', null, 0.14);
    this._noise(0.12, 260, 1.0, 0.18, 'bandpass', null, 0.28);
    this._tone(220, 0.1, 0.07, 'sine', 320, 0.36);
  }

  click() {
    this._tone(900, 0.05, 0.12, 'square', 600);
  }

  pop() {
    this._tone(500, 0.07, 0.14, 'triangle', 900);
  }

  levelUp() {
    this._tone(440, 0.12, 0.12, 'triangle', null, 0);
    this._tone(554, 0.12, 0.12, 'triangle', null, 0.11);
    this._tone(659, 0.18, 0.12, 'triangle', null, 0.22);
  }

  furnace() {
    this._noise(0.4, 200, 1, 0.08, 'lowpass');
  }
}
