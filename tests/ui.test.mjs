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

const { UI, suggestedMultiplayerRelay } = await import('../src/ui/ui.js');
const { sanitizeSettings } = await import('../src/settings.js');

let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (cond || !extra ? '' : '  → ' + extra));
  if (!cond) failures++;
}
check('local multiplayer uses the same-origin Vite WebSocket proxy', suggestedMultiplayerRelay({ hostname: 'localhost', host: 'localhost:5173', protocol: 'http:' }) === 'ws://localhost:5173/ws');
check('secure deployments automatically use same-origin WSS', suggestedMultiplayerRelay({ hostname: 'game.example', host: 'game.example', protocol: 'https:' }) === 'wss://game.example/ws');
check('static GitHub Pages does not pretend to provide a room service', suggestedMultiplayerRelay({ hostname: 'skid-ster.github.io', host: 'skid-ster.github.io', protocol: 'https:' }) === '');
const key = (code) => ({ code, preventDefault() {} });
const click = (button = 0) => ({ button, preventDefault() {} });
const visible = (id) => document.getElementById(id)?.style.display !== 'none';
const gone = (id) => !document.getElementById(id);
const btn = (id) => document.getElementById(id);

const calls = [];
let installedPacks = [{ id: 'pack-1710', name: 'Beta 1.7.10 Pack', count: 5 }];
let activePackId = null;
let testSavedWorlds = [];
const player = {
  sensitivity: 0.5,
  health: 20,
  air: 300,
  dead: false,
  pointerLocked: false,
  touchSupported: true,
  touchKeys: new Set(),
  touchPointers: new Set(),
  touchActive: false,
  bindings: { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sneak: 'ShiftLeft', attack: 'Mouse0', use: 'Mouse2' },
  mouseDX: 0,
  mouseDY: 0,
  leftDown: false,
  rightDown: false,
  mining: { active: false, progress: 0 },
  setTouchKey(code, down) { if (down) this.touchKeys.add(code); else this.touchKeys.delete(code); },
  setTouchPointer(id, active) { if (active) this.touchPointers.add(id); else this.touchPointers.delete(id); this.touchActive = this.touchPointers.size > 0; },
  clearTouchInput() { this.touchPointers.clear(); this.touchKeys.clear(); this.touchActive = false; this.leftDown = false; this.rightDown = false; this.mining.active = false; this.mining.progress = 0; },
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
  getResourcePackState: () => ({ packs: installedPacks, activeId: activePackId }),
  importResourcePack: async () => ({ id: 'pack-new', name: 'New Pack', count: 5, saved: true }),
  useResourcePack: async id => { activePackId = id; },
  useDefaultResourcePack: () => { activePackId = null; },
  deleteResourcePack: async id => { installedPacks = installedPacks.filter(pack => pack.id !== id); if (activePackId === id) activePackId = null; },
  resetResourcePack: () => calls.push(['resetResourcePack']),
  atlasCanvas: document.createElement('canvas'),
  itemIconsCanvas: document.createElement('canvas'),
  start: () => calls.push(['game.start']),
  listSavedWorlds: () => testSavedWorlds,
  openLocalWorld(seed, name, mode, worldId) {
    calls.push(['game.openLocalWorld', seed, name, mode, worldId]);
    ui.hide('title-screen'); ui.setMode('game'); this.start();
  },
  saveGame: () => { calls.push(['game.saveGame']); return true; },
  exportWorldSave: () => calls.push(['game.exportWorldSave']),
  importWorldSaveFile: async () => calls.push(['game.importWorldSaveFile']),
  respawn: () => calls.push(['game.respawn']),
};

const PLANKS = 5;
const STICK = 280;

let ui;
let threw = null;
try {
  ui = new UI(game);

  check('resource pack manager is available from the title screen', !!btn('btn-pack'));
  check('title keeps the classic game buttons and removes unfinished Realms/language controls', !!btn('btn-singleplayer') && !!btn('btn-multiplayer') && !btn('btn-realms') && !btn('btn-language') && !!btn('btn-pack') && !!btn('btn-saves') && !!btn('btn-quit'));
  check('title uses a two-column primary layout and explains no-account online play', document.querySelectorAll('.title-primary-stack .btn').length === 2 && document.querySelector('.title-multiplayer-hint')?.textContent.includes('no account'));
  btn('btn-help').click();
  check('How to Play opens an accessible guide with real keyboard and gameplay instructions', visible('help-screen') && btn('help-screen').getAttribute('role') === 'dialog' && document.querySelector('#help-screen').textContent.includes('virtual joystick'));
  check('How to Play moves keyboard focus into the guide', document.activeElement === btn('help-close'));
  const helpTab = new dom.window.KeyboardEvent('keydown', { code: 'Tab', bubbles: true, cancelable: true });
  document.dispatchEvent(helpTab);
  check('guide keeps keyboard focus inside its modal', helpTab.defaultPrevented && document.activeElement === btn('help-close'));
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true }));
  check('Escape closes How to Play and returns focus to its opener', !visible('help-screen') && document.activeElement === btn('btn-help'));
  btn('btn-saves').click();
  check('portable world-save screen opens from the title', visible('world-save-screen') && !!btn('save-import-file'));
  btn('save-export').click();
  check('save export control calls the game exporter', calls.some(call => call[0] === 'game.exportWorldSave'));
  btn('save-done').click();
  btn('btn-pack').click();
  check('texture pack manager opens with 1.7.10 support information', visible('texture-pack-screen') && document.querySelector('.pack-compat-note')?.textContent.includes('OptiFine'));
  check('installed texture packs and default textures are listed', document.querySelectorAll('.resource-pack-row').length === 2);
  document.querySelectorAll('.resource-pack-row')[1].querySelector('button').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  check('installed pack can be enabled', activePackId === 'pack-1710');
  document.querySelectorAll('.resource-pack-row')[0].querySelector('button').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  check('custom packs can be disabled without deleting them', activePackId === null && installedPacks.length === 1);
  document.querySelectorAll('.resource-pack-row')[1].querySelector('button').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  document.querySelectorAll('.resource-pack-row')[1].querySelectorAll('button')[1].click();
  await new Promise(resolve => setTimeout(resolve, 0));
  check('active texture pack can be deleted and falls back to built-in art', installedPacks.length === 0 && activePackId === null);
  btn('pack-done').click();
  check('texture pack menu returns to the title screen', !visible('texture-pack-screen'));

  // ---------- title: Options ----------
  btn('btn-options').click();
  check('Options button opens options screen', !!btn('options-screen'));
  btn('opt-difficulty').click();
  check('difficulty control cycles and applies the saved game setting', game.settings.difficulty === 3);
  btn('opt-video').click();
  check('video controls present', !!btn('opt-render') && !!btn('opt-fov') && !!btn('opt-shader'));
  btn('opt-shader').click(); btn('opt-shader').click();
  check('shader selection applies live to the game renderer', game.shaderStyle === 'cinematic');
  btn('opt-brightness').value = '120';
  btn('opt-brightness').dispatchEvent(new dom.window.Event('input'));
  check('brightness slider applies live', Math.abs(game.brightness - 1.2) < 1e-6);
  btn('opt-shader').click();
  check('Shader Lite preset applies immediately', game.shaderStyle === 'shader');
  btn('opt-shader').click();
  check('Minecraft PSX-compatible WebGL shader preset applies', game.shaderStyle === 'psx');
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

  // ---------- title: multiplayer lobby ----------
  check('Multiplayer button is enabled', !btn('btn-multiplayer').disabled);
  check('title clearly explains that multiplayer uses a unique temporary name and no account', document.querySelector('.title-multiplayer-hint')?.textContent.includes('unique name') && document.querySelector('.title-multiplayer-hint')?.textContent.includes('no account'));
  btn('btn-multiplayer').click();
  check('Multiplayer lobby opens as an accessible dialog and focuses the name field', document.getElementById('multiplayer-screen').style.display === 'flex' && document.getElementById('multiplayer-screen').getAttribute('role') === 'dialog' && document.activeElement === btn('mp-username'));
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true }));
  check('Escape closes Multiplayer and restores focus to its opener', document.getElementById('multiplayer-screen').style.display === 'none' && document.activeElement === btn('btn-multiplayer'));
  btn('btn-multiplayer').click();
  check('custom relay configuration is hidden under advanced settings by default', !!document.querySelector('.mp-custom-relay') && !document.querySelector('.mp-custom-relay').open);
  check('multiplayer has a unique-name field but no account or password controls', !!btn('mp-username') && !!btn('mp-claim') && !!btn('mp-release-name') && !btn('mp-auth-password') && !btn('mp-login') && !btn('mp-signup'));
  check('name rules explain the 3–20 character limit and connection-only reservation', btn('mp-username').minLength === 3 && btn('mp-username').maxLength === 20 && document.querySelector('#mp-name-panel').textContent.includes('held while connected'));
  check('multiplayer quick path keeps advanced options and player details collapsed', !document.querySelector('.mp-more-options').open && !document.querySelector('.mp-invite-options').open && !document.querySelector('#mp-online-panel').open);
  check('create and join are the primary lobby actions with useful defaults', btn('mp-world-name').value === 'My world' && btn('mp-mode').value === 'survival' && btn('mp-create').textContent === 'Create public world' && !!btn('mp-refresh'));
  check('public online player list is optional and can be expanded', !!btn('mp-online-list') && !!btn('mp-online-refresh') && !document.querySelector('#mp-online-panel').hidden);
  const fakeNameClient = {
    playerName: null,
    async claimPlayerName(name) { this.playerName = name; return { name }; },
    async releasePlayerName() { this.playerName = null; },
  };
  ui.prepareMultiplayerClient = async () => fakeNameClient;
  ui.multiplayerClient = fakeNameClient;
  btn('mp-username').value = 'FriendlyBuilder';
  await ui.claimMultiplayerName();
  check('claiming a name enables hosting and hides the name form', fakeNameClient.playerName === 'FriendlyBuilder' && btn('mp-name-active').hidden === false && btn('mp-create').disabled === false);
  ui.renderOnlinePlayers(['FriendlyBuilder', 'Visitor']);
  check('global online leaderboard lists all connected names and identifies me', btn('mp-online-count').textContent === '2 online' && btn('mp-online-list').textContent.includes('Visitor') && btn('mp-online-list').textContent.includes('You'));
  await ui.releaseMultiplayerName();
  check('releasing the temporary name disables room creation', fakeNameClient.playerName === null && btn('mp-name-panel').hidden === false && btn('mp-create').disabled);
  const lockedRoom = { name: 'Private world', code: 'ABC234', players: 1, maxPlayers: 5, gameMode: 'survival', passwordProtected: true, visualMode: 'individual' };
  const roomService = {
    playerName: 'FriendlyBuilder',
    async listRooms() { return { rooms: [lockedRoom] }; },
    async listOnlinePlayers() { return { players: ['FriendlyBuilder'] }; },
  };
  ui.multiplayerClient = roomService;
  ui.multiplayerName = 'FriendlyBuilder';
  ui.prepareMultiplayerClient = async () => roomService;
  ui.updateMultiplayerNameUI();
  await ui.refreshPublicRooms();
  check('public room list refreshes and displays a password hint', document.querySelector('.mp-room')?.textContent.includes('password required') && !document.querySelector('.mp-room').disabled);
  document.querySelector('.mp-room').click();
  check('choosing a protected public room opens invite details and focuses its password field', btn('mp-code').value === 'ABC234' && document.querySelector('.mp-invite-options').open && document.activeElement === btn('mp-join-password'));
  ui.openMultiplayer();
  check('static-only hosting links to the Azure multiplayer setup guide', document.getElementById('mp-status').textContent.includes('static hosting') && document.querySelector('.mp-deploy-link')?.href.endsWith('#deploy-to-azure'));
  check('deployment help states the five-room and five-player limits', document.querySelector('.mp-deploy-help')?.textContent.includes('5 rooms') && document.querySelector('.mp-deploy-help')?.textContent.includes('5 players per room'));
  check('host can choose individual or forced shader and texture settings', !!btn('mp-visual-policy') && !!btn('mp-visual-policy').querySelector('[value="forced"]'));
  installedPacks = [{ id: 'pack-share', name: 'Host Pack', count: 8 }];
  activePackId = 'pack-share';
  ui.openMultiplayer();
  game.getResourcePackForSharing = id => id ? { name: 'Host Pack', atlasData: 'data:image/png;base64,encoded-atlas' } : null;
  game.world = { edits: new Map([['1,2,3', 4], ['2,2,3', 5]]), metaEdits: new Map([['1,2,3', 1]]) };
  let createdVisuals = null;
  let publishedEdits = [];
  ui.multiplayerClient = {
    playerName: 'Host',
    async createRoom(options) { createdVisuals = options.visuals; return { name: 'Test room', gameMode: 'survival' }; },
    async request(type, payload) { if (type === 'world:snapshot') publishedEdits.push(...payload.entries); return { type: 'world:snapshot:accepted' }; },
    send() {},
  };
  ui.updateMultiplayerNameUI();
  ui.connectMultiplayer = async () => ({ playerName: 'Host' });
  ui.enterMultiplayer = async () => {};
  btn('mp-visual-policy').value = 'individual';
  btn('mp-visual-policy').dispatchEvent(new dom.window.Event('change'));
  check('individual visual policy leaves host shader and pack controls disabled', btn('mp-host-shader').disabled && btn('mp-host-texture-pack').disabled);
  await ui.createMultiplayerRoom();
  check('individual room creation leaves visual choices to each player', createdVisuals?.mode === 'individual' && !('resourcePack' in createdVisuals));
  check('host publishes saved world edits as compact metadata-preserving batches', publishedEdits.length === 2 && publishedEdits[0][1][0] === 4 && publishedEdits[0][1][1] === 1);
  btn('mp-visual-policy').value = 'forced';
  btn('mp-visual-policy').dispatchEvent(new dom.window.Event('change'));
  btn('mp-host-shader').value = 'psx';
  btn('mp-host-texture-pack').value = 'pack-share';
  check('forced policy enables explicit shader and texture-pack selection', !btn('mp-host-shader').disabled && !btn('mp-host-texture-pack').disabled);
  await ui.createMultiplayerRoom();
  check('forced room creation sends the selected shader and host texture pack', createdVisuals?.mode === 'forced' && createdVisuals.shaderStyle === 'psx' && createdVisuals.resourcePack?.name === 'Host Pack');
  check('Lobby offers public/private and survival/creative options',
    document.getElementById('mp-access').options.length === 2 && document.getElementById('mp-mode').options.length === 2);
  btn('mp-back').click();
  check('Back closes Multiplayer and returns keyboard focus to its opener', document.getElementById('multiplayer-screen').style.display === 'none' && document.activeElement === btn('btn-multiplayer'));
  game.networkRoom = { name: 'Test room', gameMode: 'survival', code: 'ABC234', id: 'host-id', playerName: 'Host', role: 'host', maxPlayers: 5,
    players: [{ id: 'host-id', name: 'Host', role: 'host' }, { id: 'guest-id', name: 'Guest', role: 'player' }] };
  game.remotePlayers = new Map([['guest-id', {}]]);
  game.multiplayerClient = { async ping() { return 23; } };
  ui.mode = 'game';
  ui.updateNetworkPanel();
  check('multiplayer HUD shows the actual five-player room capacity', document.getElementById('network-room-label').textContent.includes('2/5'));
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { code: 'Tab', bubbles: true, cancelable: true }));
  check('holding Tab opens a live multiplayer player roster', document.getElementById('network-player-list').style.display === 'block');
  check('player roster identifies the host, guest and room capacity', document.getElementById('network-player-count').textContent === '2 / 5' && document.getElementById('network-player-rows').textContent.includes('HOST · YOU') && document.getElementById('network-player-rows').textContent.includes('Guest'));
  document.dispatchEvent(new dom.window.KeyboardEvent('keyup', { code: 'Tab', bubbles: true }));
  check('releasing Tab closes the player roster', document.getElementById('network-player-list').style.display === 'none');
  document.getElementById('network-players').click();
  check('Players button pins the player roster open for touch users', document.getElementById('network-player-list').style.display === 'block');
  await new Promise(resolve => setTimeout(resolve, 0));
  check('player roster measures live relay round-trip latency', document.getElementById('network-ping').textContent.includes('23 ms'));
  document.getElementById('network-players').click();
  ui.mode = 'title';
  game.networkRoom = null;
  game.multiplayerClient = null;
  ui.updateNetworkPanel();

  // ---------- title: Singleplayer ----------
  testSavedWorlds = [{ id: 'save-id-1', seed: 'map-seed-1', name: 'Existing World', gameMode: 'survival' }];
  btn('btn-singleplayer').click();
  check('Singleplayer opens the saved-world selector', visible('world-select-screen') && !!btn('world-create'));
  check('saved worlds are listed with Play, Create, Rename, Delete, and Re-Create actions', document.querySelector('.world-list-row strong')?.textContent === 'Existing World' && !!btn('world-play') && !!btn('world-rename') && !!btn('world-delete') && !!btn('world-recreate'));
  btn('world-create').click();
  btn('new-world-name').value = 'Reference World';
  btn('new-world-name').dispatchEvent(new dom.window.Event('input'));
  btn('new-world-mode').click();
  btn('world-more-options').click();
  btn('new-world-seed').value = 'test-seed';
  check('world creator exposes name, game mode, and optional seed', visible('world-create-screen') && btn('new-world-mode').textContent.includes('Creative') && !btn('world-seed-field').hidden);
  btn('world-create-confirm').click();
  check('new world launches with the requested name, seed, and mode', calls.some(c => c[0] === 'game.openLocalWorld' && c[1] === 'test-seed' && c[2] === 'Reference World' && c[3] === 'creative' && c[4].startsWith('world-')));
  check('Singleplayer flow does not throw', threw === null);
  if (threw) console.log('      → ' + threw.message);
  check('audio initialised + click sound played',
    calls.some(c => c[0] === 'audio.init') && calls.some(c => c[0] === 'audio.click'));
  check('game.start() called', calls.some(c => c[0] === 'game.start'));
  check('title screen hidden', document.getElementById('title-screen').style.display === 'none');
  check('mode is game', ui.mode === 'game');
  check('HUD visible', document.getElementById('hud').style.display === 'block');
  check('game unpaused (uiPause false)', global.window.uiPause === false);
  check('touch gameplay controls appear in the active game', document.getElementById('touch-controls').style.display === 'block' && !!btn('touch-joystick') && !!btn('touch-mine') && !!btn('touch-use') && !!btn('touch-pause'));
  const touchPointerEvent = (type, pointerId = 77, clientX = 10, clientY = 10) => {
    const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { pointerId: { value: pointerId }, pointerType: { value: 'touch' }, clientX: { value: clientX }, clientY: { value: clientY } });
    return event;
  };
  btn('touch-jump').dispatchEvent(touchPointerEvent('pointerdown'));
  check('touch jump holds the configured jump input', player.touchActive && player.touchKeys.has('Space'));
  btn('touch-jump').dispatchEvent(touchPointerEvent('pointerup'));
  check('touch jump releases cleanly when the finger lifts', !player.touchActive && !player.touchKeys.has('Space'));
  btn('touch-mine').dispatchEvent(touchPointerEvent('pointerdown', 78));
  btn('touch-mine').dispatchEvent(touchPointerEvent('pointerdown', 82));
  check('touch mine holds attack input', player.leftDown && player.touchActive);
  btn('touch-mine').dispatchEvent(touchPointerEvent('pointercancel', 78));
  check('releasing one of two attack touches keeps the other held', player.leftDown && player.touchActive);
  btn('touch-mine').dispatchEvent(touchPointerEvent('pointerup', 82));
  check('cancelled touch mine releases attack input after the last finger lifts', !player.leftDown && !player.touchActive);
  btn('touch-use').dispatchEvent(touchPointerEvent('pointerdown', 79));
  check('touch use holds block-use input', player.rightDown && player.touchActive);
  btn('touch-use').dispatchEvent(touchPointerEvent('pointerup', 79));
  check('touch use releases on finger lift', !player.rightDown && !player.touchActive);
  const joystick = btn('touch-joystick');
  Object.defineProperty(joystick, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 100, height: 100 }) });
  joystick.dispatchEvent(touchPointerEvent('pointerdown', 80, 50, 50));
  joystick.dispatchEvent(touchPointerEvent('pointermove', 80, 50, 10));
  check('virtual joystick moves in the direction of the dragged finger', player.touchKeys.has('KeyW'));
  joystick.dispatchEvent(touchPointerEvent('pointerup', 80));
  check('virtual joystick releases movement and recentres', !player.touchKeys.has('KeyW') && btn('touch-joystick-knob').style.transform === 'translate(0, 0)');
  const lookZone = btn('touch-look-zone');
  lookZone.dispatchEvent(touchPointerEvent('pointerdown', 81, 100, 100));
  lookZone.dispatchEvent(touchPointerEvent('pointermove', 81, 112, 94));
  check('dragging the look zone updates camera rotation input', player.mouseDX === 27 && player.mouseDY === -13.5);
  lookZone.dispatchEvent(touchPointerEvent('pointerup', 81));
  btn('touch-jump').dispatchEvent(touchPointerEvent('pointerdown', 83));
  window.dispatchEvent(new dom.window.Event('blur'));
  check('window focus loss clears held touch keys and pointers', !player.touchActive && !player.touchKeys.has('Space'));
  btn('touch-pause').click();
  check('touch pause button opens pause menu and releases gameplay input', ui.mode === 'pause' && !player.touchActive && document.getElementById('touch-controls').style.display === 'none');
  btn('btn-back').click();
  check('resuming restores touch controls', ui.mode === 'game' && document.getElementById('touch-controls').style.display === 'block');

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
  check('inventory has a pointer-controlled player model preview canvas', !!btn('player-preview-canvas') && btn('player-preview-canvas').dataset.playerPreview === 'rotating');
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
  ui.setMode('inventory');
  check('touch users get a visible close control when gameplay controls are hidden in inventory', !btn('touch-panel-return').hidden && document.getElementById('touch-controls').style.display === 'none');
  btn('touch-panel-return').click();
  check('touch close control returns from inventory to the game', ui.mode === 'game' && btn('touch-panel-return').hidden);
  for (const panelMode of ['crafting', 'furnace', 'chest']) {
    ui.setMode(panelMode);
    check(`touch close control is available in ${panelMode} panels`, !btn('touch-panel-return').hidden);
    btn('touch-panel-return').click();
    check(`touch close control exits ${panelMode} panels`, ui.mode === 'game');
  }

  // Cake uses three milk buckets, which must be returned to the crafting grid.
  ui.setMode('crafting');
  ui.craftSlots = [335,335,335,353,344,353,296,296,296].map(id => ({ id, count: 1 }));
  ui.slotClick(click(0), 'out', 0);
  check('cake crafting returns the three empty buckets', player.cursorStack?.id === 354 && ui.craftSlots.slice(0, 3).every(s => s?.id === 325));
  player.cursorStack = null; ui.craftSlots.fill(null); ui.setMode('game');

  // ---------- pause menu ----------
  ui.onKey(key('Escape'));
  check('Escape opens pause', ui.mode === 'pause' && visible('pause-screen'));
  btn('btn-help-pause').click();
  check('paused players can open How to Play without resuming the simulation', visible('help-screen') && ui.mode === 'pause' && window.uiPause);
  btn('help-close').click();
  check('closing the guide returns to the paused menu', !visible('help-screen') && visible('pause-screen') && ui.mode === 'pause');
  btn('btn-save-now').click();
  check('pause menu can save the local world immediately', calls.some(c => c[0] === 'game.saveGame'));
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
