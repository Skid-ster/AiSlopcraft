// Headless regression tests for the UI surface: clicking "Singleplayer" must
// hide the title screen, enter game mode and start the game; plus full
// walkthrough coverage (options, inventory, crafting, pause, death, F3 debug).
// Guards against calls to UI methods that don't exist (e.g. the missing
// this.hide() that made the Singleplayer button silently no-op) and against
// broken interactions anywhere on the title/HUD/panel surface. Run: npm test
import { JSDOM } from 'jsdom';

const dom = new JSDOM(
  `<!doctype html><html><body>
     <canvas id="game-canvas"></canvas>
     <div id="ui"></div>
   </body></html>`,
  { url: 'https://skid-ster.github.io/AiSlopcraft/', pretendToBeVisual: true }
);

global.window = dom.window;
global.document = dom.window.document;
// NOTE: do NOT alias global.performance to dom.window.performance — it makes
// jsdom's Performance.now wrapper recurse (RangeError) once ui.update() runs.
// Node's own global `performance` is what ui.js's performance.now() resolves to.

// jsdom has no 2d canvas context without the native `canvas` package; ui.js's
// drawIcon only needs a permissive no-op 2d context.
dom.window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
  get: () => () => {},
  set: () => true,
});

const { UI } = await import('../src/ui/ui.js');
const { sanitizeSettings } = await import('../src/settings.js');

let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (cond || !extra ? '' : '  → ' + extra));
  if (!cond) failures++;
}
const key = (code) => ({ code, preventDefault() {} });
const click = (button = 0) => ({ button, preventDefault() {} });
const visible = (id) => document.getElementById(id)?.style.display !== 'none';
const gone = (id) => !document.getElementById(id);
const btn = (id) => document.getElementById(id);

const calls = [];
const player = {
  sensitivity: 0.5,
  health: 20,
  air: 300,
  dead: false,
  pointerLocked: false,
  hotbarIndex: 0,
  cursorStack: null,
  inventory: new Array(36).fill(null),
  addItem(id, count) { calls.push(['addItem', id, count]); },
};
const game = {
  settings: sanitizeSettings(),
  applySettings() { this.renderDistance = this.settings.renderDistance; this.shaderStyle = this.settings.shaderStyle; this.brightness = this.settings.brightness; },
  renderDistance: 6,
  shaderStyle: 'classic',
  brightness: 1,
  setShaderStyle(style) { this.shaderStyle = style; },
  setBrightness(value) { this.brightness = value; },
  audio: {
    volume: 0.5,
    init: () => calls.push(['audio.init']),
    click: () => calls.push(['audio.click']),
    pop: () => calls.push(['audio.pop']),
    setVolume: () => {},
  },
  player,
  importResourcePack: async () => ({ count: 5, saved: true }),
  resetResourcePack: () => calls.push(['resetResourcePack']),
  atlasCanvas: document.createElement('canvas'),
  itemIconsCanvas: document.createElement('canvas'),
  start: () => calls.push(['game.start']),
  respawn: () => calls.push(['game.respawn']),
};

const PLANKS = 5;
const STICK = 280;

let ui;
let threw = null;
try {
  ui = new UI(game);

  check('resource pack import control is present', !!btn('btn-pack') && !!btn('pack-file'));
  btn('btn-pack-reset').click();
  check('resource pack reset is wired', calls.some(call => call[0] === 'resetResourcePack'));

  // ---------- title: Options ----------
  btn('btn-options').click();
  check('Options button opens options screen', !!btn('options-screen'));
  btn('opt-video').click();
  check('video controls present', !!btn('opt-render') && !!btn('opt-fov') && !!btn('opt-shader'));
  btn('opt-shader').click(); btn('opt-shader').click();
  check('shader selection applies live to the game renderer', game.shaderStyle === 'cinematic');
  btn('opt-brightness').value = '120';
  btn('opt-brightness').dispatchEvent(new dom.window.Event('input'));
  check('brightness slider applies live', Math.abs(game.brightness - 1.2) < 1e-6);
  btn('opt-shader').click();
  check('Shader Lite preset applies immediately', game.shaderStyle === 'shader');
  btn('opt-render').value = '8';
  btn('opt-render').dispatchEvent(new dom.window.Event('input'));
  check('render distance slider applies', game.renderDistance === 8);
  btn('opt-done').click();
  btn('opt-controls').click();
  check('control settings present', !!btn('opt-sens-in'));
  document.querySelector('[data-action="forward"]').click();
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { code: 'KeyI', bubbles: true }));
  check('key binding updates', game.settings.keys.forward === 'KeyI');
  btn('opt-done').click();
  btn('opt-sound').click();
  check('sound settings present', !!btn('opt-volume'));
  btn('opt-done').click();
  btn('opt-done').click();
  check('Options Done closes screen', gone('options-screen'));

  // Chest clicks support splitting, placing and shift transfers.
  game.openChestData = { slots: new Array(27).fill(null) };
  game.openChestData.slots[0] = { id: 5, count: 5 };
  ui.mode = 'chest';
  ui.slotClick(click(2), 'chest', 0);
  check('right-click splits chest stack', player.cursorStack?.count === 3 && game.openChestData.slots[0].count === 2);
  ui.slotClick(click(0), 'chest', 1);
  check('chest accepts cursor stack', !player.cursorStack && game.openChestData.slots[1].count === 3);
  ui.slotClick({ ...click(0), shiftKey: true }, 'chest', 1);
  check('shift-click transfers chest stack to inventory', !game.openChestData.slots[1] && player.inventory.some(s => s?.id === 5 && s.count === 3));
  player.inventory.fill(null);
  ui.mode = 'title';

  // ---------- title: Singleplayer ----------
  btn('btn-singleplayer').click();
  check('Singleplayer click does not throw', threw === null);
  if (threw) console.log('      → ' + threw.message);
  check('audio initialised + click sound played',
    calls.some(c => c[0] === 'audio.init') && calls.some(c => c[0] === 'audio.click'));
  check('game.start() called', calls.some(c => c[0] === 'game.start'));
  check('title screen hidden', document.getElementById('title-screen').style.display === 'none');
  check('mode is game', ui.mode === 'game');
  check('HUD visible', document.getElementById('hud').style.display === 'block');
  check('game unpaused (uiPause false)', global.window.uiPause === false);

  // ---------- hotbar tooltip ----------
  player.inventory[1] = { id: PLANKS, count: 2, damage: 0 };
  player.hotbarIndex = 1;
  ui.refresh();
  check('switching hotbar slots shows the selected item name',
    document.getElementById('held-name').textContent === 'Oak Planks' && document.getElementById('held-name').style.opacity === '1');
  player.inventory[2] = { id: PLANKS, count: 1, damage: 0 };
  player.hotbarIndex = 2;
  ui.refresh();
  check('tooltip refreshes when changing to a different slot with the same item',
    document.getElementById('held-name').style.opacity === '1');
  player.hotbarIndex = 0;
  player.inventory[1] = null;
  player.inventory[2] = null;
  ui.refresh();
  check('empty hotbar slots clear stale item names', document.getElementById('held-name').textContent === '');

  // ---------- inventory + crafting ----------
  player.inventory[9] = { id: PLANKS, count: 3, damage: 0 };
  ui.onKey(key('KeyE'));
  check('E opens inventory', ui.mode === 'inventory' && visible('inventory-screen'));
  ui.refresh();
  check('inv slot renders item', document.querySelector('#inv-main .slot')?.classList.contains('has-item'));

  ui.slotClick(click(0), 'inv', 9);
  check('left-click picks stack up to cursor',
    player.cursorStack?.id === PLANKS && player.inventory[9] === null);
  check('cursor item element shown', !!document.getElementById('cursor-item'));

  ui.slotClick(click(2), 'craft', 0);
  ui.slotClick(click(2), 'craft', 2);
  check('right-click places singles into craft grid',
    ui.craftSlots[0]?.count === 1 && ui.craftSlots[2]?.count === 1);

  // cursor still holds 1 plank; the game must REFUSE to take sticks (ids differ)
  ui.slotClick(click(0), 'out', 0);
  check('result refused while cursor holds a different item',
    player.cursorStack?.id === PLANKS && ui.craftSlots[0] !== null);

  // deposit the plank, then take the craft result with an empty cursor
  ui.slotClick(click(0), 'inv', 10);
  check('cursor plank deposited back to inventory',
    player.cursorStack === null && player.inventory[10]?.id === PLANKS);

  ui.slotClick(click(0), 'out', 0);
  check('crafting 2 planks column yields 4 sticks to cursor',
    player.cursorStack?.id === STICK && player.cursorStack?.count === 4,
    JSON.stringify(player.cursorStack));
  check('craft ingredients consumed', ui.craftSlots[0] === null && ui.craftSlots[2] === null);
  check('craft pop sound played', calls.some(c => c[0] === 'audio.pop'));

  ui.onKey(key('KeyE'));
  check('E closes inventory, back to game', ui.mode === 'game' && !visible('inventory-screen'));
  check('cursor stack returned via addItem on close',
    calls.some(c => c[0] === 'addItem' && c[1] === STICK && c[2] === 4));

  // Cake uses three milk buckets, which must be returned to the crafting grid.
  ui.setMode('crafting');
  ui.craftSlots = [335,335,335,353,344,353,296,296,296].map(id => ({ id, count: 1 }));
  ui.slotClick(click(0), 'out', 0);
  check('cake crafting returns the three empty buckets', player.cursorStack?.id === 354 && ui.craftSlots.slice(0, 3).every(s => s?.id === 325));
  player.cursorStack = null; ui.craftSlots.fill(null); ui.setMode('game');

  // ---------- pause menu ----------
  ui.onKey(key('Escape'));
  check('Escape opens pause', ui.mode === 'pause' && visible('pause-screen'));
  btn('btn-options2').click();
  check('pause Options opens', !!btn('options-screen'));
  btn('opt-done').click();
  check('pause Options Done closes', gone('options-screen'));
  btn('btn-respawn').click();
  check('pause Respawn works', calls.some(c => c[0] === 'game.respawn') && ui.mode === 'game');

  ui.onKey(key('Escape'));
  btn('btn-back').click();
  check('Back to game works', ui.mode === 'game' && !visible('pause-screen'));

  ui.onKey(key('Escape'));
  ui.onKey(key('Escape'));
  check('Escape toggles pause/resume', ui.mode === 'game');

  // ---------- death screen ----------
  ui.showDeath(7);
  check('death screen shows with score', ui.mode === 'death' && visible('death-screen')
    && btn('death-score').textContent === '7');
  btn('btn-respawn2').click();
  check('death Respawn works', ui.mode === 'game' && !visible('death-screen'));

  // ---------- F3 debug + update loop ----------
  ui.onKey(key('F3'));
  ui.updateDebug(['pos: 8 64 8', 'fps: 60']);
  check('F3 debug renders lines', visible('debug') && btn('debug').innerHTML.includes('fps: 60'));
  ui.onKey(key('F3'));
  ui.updateDebug([]);
  check('F3 again hides debug', !visible('debug'));

  ui.update();
  check('update() refresh loop runs without crashing', true);
  check('splash animated', (document.querySelector('.splash')?.style.transform || '').includes('rotate'));

  // ---------- edges ----------
  ui.mode = 'title';
  ui.onKey(key('KeyE'));
  check('E ignored on title screen', ui.mode === 'title');
} catch (e) {
  threw = e;
  check('no uncaught exception in full UI walkthrough', false, (e && (e.stack || e.message)) || String(e));
}

console.log(failures === 0 && !threw ? '\nALL UI TESTS PASSED' : `\n${failures} UI FAILURES`);
process.exit(failures ? 1 : 0);
