// Tiny WebAudio synth for Minecraft-ish sounds: steps, digs, place, hurt,
// explosions, mob noises. No external audio files.
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
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.5;
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      this.enabled = false;
    }
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  _noise(dur, freq, q, gain, type = 'bandpass', sweepTo = null) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  _tone(freq, dur, gain, type = 'square', slideTo = null) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  step(blockId = 2) {
    const now = performance.now();
    if (now - this._lastStep < 220) return;
    this._lastStep = now;
    // material-dependent
    let freq = 700, gain = 0.18;
    if (blockId === 12 || blockId === 13) { freq = 900; gain = 0.15; }
    else if (blockId === 1) { freq = 500; gain = 0.2; }
    else if (blockId === 5 || blockId === 17) { freq = 350; gain = 0.18; }
    this._noise(0.09, freq, 1.2, gain);
  }

  dig(blockId = 1) {
    this._noise(0.12, 420 + (blockId % 7) * 60, 1.5, 0.22);
  }

  breakBlock(blockId = 1) {
    this._noise(0.22, 380, 1.2, 0.32, 'bandpass', 140);
    this._tone(160, 0.12, 0.08, 'triangle', 80);
  }

  place(blockId = 1) {
    this._noise(0.1, 640, 1.4, 0.24, 'bandpass', 320);
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
  }

  splash() {
    this._noise(0.35, 900, 0.8, 0.2, 'bandpass', 300);
  }

  eat() {
    this._noise(0.12, 300, 1.0, 0.18);
    setTimeout(() => this._noise(0.12, 280, 1.0, 0.18), 160);
    setTimeout(() => this._noise(0.12, 260, 1.0, 0.18), 320);
  }

  click() {
    this._tone(900, 0.05, 0.12, 'square', 600);
  }

  pop() {
    this._tone(500, 0.07, 0.14, 'triangle', 900);
  }

  levelUp() {
    this._tone(440, 0.12, 0.12, 'triangle');
    setTimeout(() => this._tone(554, 0.12, 0.12, 'triangle'), 110);
    setTimeout(() => this._tone(659, 0.18, 0.12, 'triangle'), 220);
  }

  furnace() {
    this._noise(0.4, 200, 1, 0.08, 'lowpass');
  }
}
