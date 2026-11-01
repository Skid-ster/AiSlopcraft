// Persistent, sanitised game settings + default key bindings.
// Shared by the Options UI, Player input and the renderer so every control
// actually changes the game and survives a reload.

export const DEFAULT_KEYS = Object.freeze({
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sneak: 'ShiftLeft',
  inventory: 'KeyE',
  drop: 'KeyQ',
  attack: 'Mouse0',
  use: 'Mouse2',
  hotbar1: 'Digit1',
  hotbar2: 'Digit2',
  hotbar3: 'Digit3',
  hotbar4: 'Digit4',
  hotbar5: 'Digit5',
  hotbar6: 'Digit6',
  hotbar7: 'Digit7',
  hotbar8: 'Digit8',
  hotbar9: 'Digit9',
});

export const KEY_LABELS = Object.freeze({
  forward: 'Forward', back: 'Back', left: 'Left', right: 'Right',
  jump: 'Jump', sneak: 'Sneak', inventory: 'Inventory', drop: 'Drop',
  attack: 'Attack', use: 'Use / Place',
  hotbar1: 'Hotbar 1', hotbar2: 'Hotbar 2', hotbar3: 'Hotbar 3',
  hotbar4: 'Hotbar 4', hotbar5: 'Hotbar 5', hotbar6: 'Hotbar 6',
  hotbar7: 'Hotbar 7', hotbar8: 'Hotbar 8', hotbar9: 'Hotbar 9',
});

export const DEFAULT_SETTINGS = Object.freeze({
  renderDistance: 6,
  fov: 70,
  guiScale: 0,            // 0 = auto
  brightness: 1,          // 0.5 .. 1.5
  shaderStyle: 'classic', // classic | vibrant | cinematic | shader
  graphics: 'fancy',      // fast | fancy
  smoothLighting: true,
  viewBobbing: true,
  particles: 'all',       // all | decreased | minimal
  clouds: true,
  maxFps: 0,              // 0 = unlimited / display sync
  renderScale: 1,         // 0.5 .. 1
  volume: 0.5,
  sensitivity: 50,        // 0 .. 100 (percent)
  invertMouse: false,
  keepInventory: true,
  keys: { ...DEFAULT_KEYS },
});

const SHADER_STYLES = ['classic', 'vibrant', 'cinematic', 'shader'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v, fallback) => Number.isFinite(+v) ? +v : fallback;

export function sanitizeSettings(raw = {}) {
  const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) };
  s.renderDistance = Math.round(clamp(num(s.renderDistance, 6), 2, 12));
  s.fov = Math.round(clamp(num(s.fov, 70), 30, 110));
  s.guiScale = Math.round(clamp(num(s.guiScale, 0), 0, 4));
  s.brightness = clamp(num(s.brightness, 1), 0.5, 1.5);
  s.shaderStyle = SHADER_STYLES.includes(s.shaderStyle) ? s.shaderStyle : 'classic';
  s.graphics = s.graphics === 'fast' ? 'fast' : 'fancy';
  s.smoothLighting = s.smoothLighting !== false;
  s.viewBobbing = s.viewBobbing !== false;
  s.particles = ['all', 'decreased', 'minimal'].includes(s.particles) ? s.particles : 'all';
  s.clouds = s.clouds !== false;
  s.maxFps = Math.round(clamp(num(s.maxFps, 0), 0, 260));
  s.renderScale = clamp(num(s.renderScale, 1), 0.5, 1);
  s.volume = clamp(num(s.volume, 0.5), 0, 1);
  s.sensitivity = Math.round(clamp(num(s.sensitivity, 50), 1, 100));
  s.invertMouse = !!s.invertMouse;
  s.keepInventory = s.keepInventory !== false;
  s.keys = { ...DEFAULT_KEYS };
  if (raw?.keys && typeof raw.keys === 'object') {
    for (const action of Object.keys(DEFAULT_KEYS)) {
      const code = raw.keys[action];
      if (code === null || (typeof code === 'string' && code.length > 0 && code.length < 32)) s.keys[action] = code;
    }
  }
  return s;
}

// Minecraft-style sensitivity percent -> radians per pixel.
export function sensitivityToRadians(percent) {
  return 0.0044 * clamp(num(percent, 50), 1, 100) / 100;
}

export function loadSettings(storage, worldFallback = null) {
  try {
    const global = JSON.parse(storage?.getItem?.('aislopcraft:settings') || 'null');
    if (global && typeof global === 'object') return sanitizeSettings(global);
  } catch { /* ignore corrupt storage */ }
  return sanitizeSettings(worldFallback || {});
}

export function persistSettings(storage, settings) {
  try {
    storage?.setItem?.('aislopcraft:settings', JSON.stringify(sanitizeSettings(settings)));
    return true;
  } catch { return false; }
}

export function keyLabel(code) {
  if (!code) return '---';
  if (code.startsWith('Mouse')) {
    const n = +code.slice(5);
    return n === 0 ? 'Left Click' : n === 1 ? 'Middle Click' : n === 2 ? 'Right Click' : `Mouse ${n + 1}`;
  }
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const names = {
    Space: 'SPACE', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT',
    ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', AltLeft: 'L-ALT', AltRight: 'R-ALT',
    ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
    Enter: 'ENTER', Tab: 'TAB', Backspace: 'BACKSPACE', CapsLock: 'CAPS',
  };
  return names[code] || code.toUpperCase();
}

// Assign a binding, clearing any conflicting action so two actions never share
// the same physical key. Returns the mutated keys object.
export function rebindKey(keys, action, code) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_KEYS, action)) return keys;
  for (const other of Object.keys(keys)) {
    if (other !== action && keys[other] === code) keys[other] = null;
  }
  keys[action] = code;
  return keys;
}
