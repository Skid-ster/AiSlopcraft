// Minecraft-style Options screen: stone buttons, sliders and paged sub-menus.
// Every control is wired to game.settings and applied immediately.
import { DEFAULT_KEYS, KEY_LABELS, keyLabel, rebindKey } from '../settings.js';

const SHADERS = ['classic', 'vibrant', 'cinematic', 'shader', 'psx'];
const SHADER_NAMES = { classic: 'Classic', vibrant: 'Vibrant', cinematic: 'Cinematic', shader: 'Shader Lite', psx: 'PSX (1.7.10)' };
const SHADER_HINTS = {
  classic: 'Minecraft 1.7.10-style lightmap, smooth AO, and fog, with no enhanced sun shadows.',
  vibrant: 'Brighter, more saturated colors. No sun-shadow pass.',
  cinematic: 'Warm color grading with soft, filtered block shadows.',
  shader: 'Shader Lite adds real sun-shadow mapping, 3×3 filtered shadows, reflective water, fine animated ripples and sun-lit caustic glints. External OptiFine shaderpacks are not supported by this WebGL renderer.',
  psx: 'PSX shader: affine textures, depth-scaled vertex snapping, 25% internal resolution, 24-color grading and ordered dithering. Adapted from an open-source pack tested on 1.7.10; not an arbitrary shader ZIP loader.',
};
const FPS_STEPS = [0, 30, 60, 90, 120, 144, 165, 240, 260];
const DIFFICULTIES = ['Peaceful', 'Easy', 'Normal', 'Hard'];

function pct(v) { return Math.round(v * 100); }
function onOff(v) { return v ? 'ON' : 'OFF'; }
function brightnessLabel(v) {
  const n = Math.round(Number(v));
  return n <= 50 ? 'Brightness: Moody' : n >= 150 ? 'Brightness: Bright' : `Brightness: ${n}%`;
}

export class OptionsMenu {
  constructor(game, onClose) {
    this.game = game;
    this.onClose = onClose;
    this.page = 'main';
    this.listening = null;
    this.el = document.createElement('div');
    this.el.className = 'screen options-screen';
    this.el.id = 'options-screen';
    document.getElementById('ui').appendChild(this.el);
    this._onKeyDown = e => this.handleKey(e);
    this._onMouseDown = e => this.handleMouse(e);
    document.addEventListener('keydown', this._onKeyDown, true);
    document.addEventListener('mousedown', this._onMouseDown, true);
    this.render();
  }

  get settings() { return this.game.settings; }

  apply(save = true) {
    this.game.applySettings?.();
    if (save) this.game.saveSettings?.();
  }

  close() {
    document.removeEventListener('keydown', this._onKeyDown, true);
    document.removeEventListener('mousedown', this._onMouseDown, true);
    this.el.remove();
    this.onClose?.();
  }

  handleKey(e) {
    if (this.listening) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.code === 'Escape') { this.listening = null; this.render(); return; }
      if (this.listening === 'attack' || this.listening === 'use') return;
      rebindKey(this.settings.keys, this.listening, e.code);
      this.listening = null;
      this.apply();
      this.render();
      return;
    }
    if (e.code === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (this.page !== 'main') { this.page = 'main'; this.render(); }
      else this.close();
    }
  }

  handleMouse(e) {
    if (!this.listening) return;
    // Attack/use accept mouse buttons; other actions accept keyboard keys.
    e.preventDefault(); e.stopImmediatePropagation();
    if (this.listening !== 'attack' && this.listening !== 'use') return;
    rebindKey(this.settings.keys, this.listening, `Mouse${e.button}`);
    this.listening = null;
    this.apply();
    this.render();
  }

  slider(id, label, min, max, step, value, format) {
    return `<div class="mc-slider" data-slider="${id}">
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}">
      <span class="mc-slider-label" id="${id}-label">${format(value)}</span>
    </div>`;
  }

  button(id, label, cls = '', disabled = false) {
    return `<button class="btn mc-btn ${cls}" id="${id}"${disabled ? ' disabled' : ''}>${label}</button>`;
  }

  render() {
    const focusedId = this.el.contains(document.activeElement) ? document.activeElement.id : '';
    const s = this.settings;
    const forcedVisuals = this.game.networkRoom?.visuals?.mode === 'forced' ? this.game.networkRoom.visuals : null;
    const shownShaderStyle = forcedVisuals?.shaderStyle || s.shaderStyle;
    let title = 'Options';
    let body = '';
    if (this.page === 'main') {
      body = `<div class="mc-grid">
        ${this.button('opt-difficulty', `Difficulty: ${DIFFICULTIES[s.difficulty]}`)}
        ${this.button('opt-video', 'Video Settings...')}
        ${this.button('opt-controls', 'Controls...')}
        ${this.button('opt-sound', 'Sound...')}
        ${this.button('opt-gameplay', 'Gameplay...')}
      </div>
      <div class="mc-done-row">${this.button('opt-done', 'Done')}</div>`;
    } else if (this.page === 'video') {
      title = 'Video Settings';
      const fpsIndex = Math.max(0, FPS_STEPS.indexOf(s.maxFps));
      body = `<div class="mc-grid">
        ${this.slider('opt-render', 'Render Distance', 2, 12, 1, s.renderDistance, v => `Render Distance: ${v} chunks`)}
        ${this.slider('opt-fps', 'Max Framerate', 0, FPS_STEPS.length - 1, 1, fpsIndex, v => `Max Framerate: ${FPS_STEPS[v] === 0 ? 'Unlimited' : FPS_STEPS[v] + ' fps'}`)}
        ${this.button('opt-graphics', `Graphics: ${s.graphics === 'fast' ? 'Fast' : 'Fancy'}`)}
        ${this.button('opt-smooth', `Smooth Lighting: ${onOff(s.smoothLighting !== false)}`)}
        <p class="performance-hint">Fast lowers render resolution and skips real-time sun shadows. Fancy uses your selected render scale and enables shadows in Cinematic and Shader Lite.</p>
        ${this.button('opt-particles', `Particles: ${s.particles === 'all' ? 'All' : s.particles === 'decreased' ? 'Decreased' : 'Minimal'}`)}
        ${this.button('opt-clouds', `Clouds: ${onOff(s.clouds)}`)}
        ${this.button('opt-bob', `View Bobbing: ${onOff(s.viewBobbing)}`)}
        ${this.slider('opt-fov', 'FOV', 30, 110, 1, s.fov, v => `FOV: ${v}`)}
        ${this.slider('opt-brightness', 'Brightness', 50, 150, 1, pct(s.brightness), brightnessLabel)}
        ${this.slider('opt-scale', 'Render Scale', 50, 100, 5, pct(s.renderScale), v => `Render Scale: ${v}%`)}
        ${this.button('opt-shader', `Shaders: ${SHADER_NAMES[shownShaderStyle]}${forcedVisuals ? ' (Server)' : ''}`, 'opt-shader-wide', !!forcedVisuals)}
        <p class="shader-hint" id="shader-hint">${forcedVisuals ? 'The host enforces this shader for the multiplayer room.' : SHADER_HINTS[shownShaderStyle]}</p>
      </div>
      <div class="mc-done-row">${this.button('opt-done', 'Done')}</div>`;
    } else if (this.page === 'controls') {
      title = 'Controls';
      body = `<div class="mc-grid">
        ${this.slider('opt-sens-in', 'Sensitivity', 1, 100, 1, s.sensitivity, v => `Sensitivity: ${v}%`)}
        ${this.button('opt-invert', `Invert Mouse: ${onOff(s.invertMouse)}`)}
      </div>
      <div class="mc-keys" id="mc-keys">
        ${Object.keys(DEFAULT_KEYS).map(action => {
          const listening = this.listening === action;
          return `<div class="mc-key-row">
            <span>${KEY_LABELS[action]}</span>
            <button class="btn mc-btn mc-key-btn ${listening ? 'listening' : ''}" data-action="${action}">${listening ? (action === 'attack' || action === 'use' ? '&gt; Click mouse &lt;' : '&gt; Press key &lt;') : keyLabel(s.keys[action])}</button>
          </div>`;
        }).join('')}
      </div>
      <div class="mc-done-row">
        ${this.button('opt-reset-keys', 'Reset Keys')}
        ${this.button('opt-done', 'Done')}
      </div>`;
    } else if (this.page === 'sound') {
      title = 'Sound';
      body = `<div class="mc-grid">
        ${this.slider('opt-volume', 'Volume', 0, 100, 1, pct(s.volume), v => `Volume: ${v}%`)}
      </div>
      <div class="mc-done-row">${this.button('opt-done', 'Done')}</div>`;
    } else if (this.page === 'gameplay') {
      title = 'Gameplay';
      body = `<div class="mc-grid">
        ${this.button('opt-keepinv', `Keep Inventory: ${onOff(s.keepInventory)}`)}
        ${this.game.resetWorld ? this.button('opt-reset', 'Reset Saved World...', 'mc-danger') : ''}
      </div>
      <div class="mc-done-row">${this.button('opt-done', 'Done')}</div>`;
    }
    this.el.innerHTML = `<div class="options-page mc-page-${this.page}">
      <h2 class="mc-title">${title}</h2>
      ${body}
    </div>`;
    this.bind();
    if (focusedId) this.el.querySelector(`#${focusedId}`)?.focus({ preventScroll: true });
  }

  bind() {
    const s = this.settings;
    const q = id => this.el.querySelector(`#${id}`);
    const click = (id, fn) => q(id)?.addEventListener('click', () => { this.game.audio?.click?.(); fn(); });
    const range = (id, fn) => {
      const el = q(id);
      if (!el) return;
      const updateThumb = () => el.parentElement.style.setProperty('--thumb', `${((+el.value - +el.min) / (+el.max - +el.min)) * 100}%`);
      updateThumb();
      el.addEventListener('input', () => {
        updateThumb();
        fn(+el.value);
        this.apply(false);
      });
      el.addEventListener('change', () => this.apply(true));
    };
    const label = (id, text) => { const l = q(`${id}-label`); if (l) l.textContent = text; };

    click('opt-difficulty', () => { s.difficulty = (s.difficulty + 1) % DIFFICULTIES.length; this.apply(); this.render(); });
    click('opt-video', () => { this.page = 'video'; this.render(); });
    click('opt-controls', () => { this.page = 'controls'; this.render(); });
    click('opt-sound', () => { this.page = 'sound'; this.render(); });
    click('opt-gameplay', () => { this.page = 'gameplay'; this.render(); });
    click('opt-done', () => {
      if (this.page === 'main') this.close();
      else { this.page = 'main'; this.render(); }
    });

    // Video
    range('opt-render', v => { s.renderDistance = v; label('opt-render', `Render Distance: ${v} chunks`); });
    range('opt-fps', v => { s.maxFps = FPS_STEPS[v]; label('opt-fps', `Max Framerate: ${s.maxFps === 0 ? 'Unlimited' : s.maxFps + ' fps'}`); });
    click('opt-graphics', () => { s.graphics = s.graphics === 'fast' ? 'fancy' : 'fast'; this.apply(); this.render(); });
    click('opt-smooth', () => { s.smoothLighting = s.smoothLighting === false; this.apply(); this.render(); });
    click('opt-particles', () => {
      const modes = ['all', 'decreased', 'minimal'];
      s.particles = modes[(modes.indexOf(s.particles) + 1) % modes.length];
      this.apply(); this.render();
    });
    click('opt-bob', () => { s.viewBobbing = !s.viewBobbing; this.apply(); this.render(); });
    click('opt-clouds', () => { s.clouds = !s.clouds; this.apply(); this.render(); });
    range('opt-brightness', v => { s.brightness = v / 100; label('opt-brightness', brightnessLabel(v)); });
    range('opt-fov', v => { s.fov = v; label('opt-fov', `FOV: ${v}`); });
    range('opt-scale', v => { s.renderScale = v / 100; label('opt-scale', `Render Scale: ${v}%`); });
    click('opt-shader', () => { s.shaderStyle = SHADERS[(SHADERS.indexOf(s.shaderStyle) + 1) % SHADERS.length]; this.apply(); this.render(); });

    // Controls
    range('opt-sens-in', v => { s.sensitivity = v; label('opt-sens-in', `Sensitivity: ${v}%`); });
    click('opt-invert', () => { s.invertMouse = !s.invertMouse; this.apply(); this.render(); });
    click('opt-reset-keys', () => { s.keys = { ...DEFAULT_KEYS }; this.apply(); this.render(); });
    this.el.querySelectorAll('.mc-key-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.listening = btn.dataset.action;
        this.render();
      });
    });

    // Sound
    range('opt-volume', v => { s.volume = v / 100; label('opt-volume', `Volume: ${v}%`); });

    // Gameplay
    click('opt-keepinv', () => { s.keepInventory = !s.keepInventory; this.apply(); this.render(); });
    click('opt-reset', () => {
      if (confirm('Reset your saved world? This cannot be undone.')) this.game.resetWorld();
    });
  }
}
