import * as THREE from 'three';
const logo = new URL('./logo.svg', import.meta.url).href;
const MULTIPLAYER_DEPLOY_URL = 'https://github.com/Skid-ster/AiSlopcraft#deploy-to-azure';
// UI: title screen, hotbar, hearts, armor, inventory, crafting table, furnace, chest,
// pause, death screen, F3 debug, hover tooltips, shift-click & 3D isometric icons.
import {
  ITEMS, itemName, getBlock, isBlock, itemStackLimit, TILES, WOOD_DOOR, IRON_DOOR,
} from '../world/blocks.js';
import { matchRecipe, smeltResult } from './recipes.js';
import { FUEL_TIMES, interactWithFurnaceSlot } from './furnace.js';
import { OptionsMenu } from './options.js';

function stackLimit(stack) {
  return itemStackLimit(stack.id);
}

export function suggestedMultiplayerRelay(location = window.location) {
  const { hostname, host, protocol } = location;
  // GitHub Pages is static hosting and cannot serve the WebSocket endpoint.
  if (hostname.endsWith('.github.io')) return '';
  // Keep browser traffic same-origin. Vite proxies /ws during development;
  // the production relay serves it directly. Never point browser code at localhost.
  return `${protocol === 'https:' ? 'wss:' : 'ws:'}//${host}/ws`;
}

function canStack(a, b) {
  return !!a && !!b && a.id === b.id && (a.damage || 0) === (b.damage || 0) && stackLimit(a) > 1;
}

const ARMOR_HINTS = [
  '<path d="M4 8V5l2-2h6l2 2v3l-2 1v3H6V9z"/><path d="M7 7h1m2 0h1"/>',
  '<path d="M5 3h3l1 2 1-2h3l3 3-2 3-1-1v6H5V8L4 9 2 6z"/>',
  '<path d="M5 3h8v5l-1 6H9V9H8v5H5L4 8z"/>',
  '<path d="M4 3h4v7H6v3H2v-3h2zm6 0h4v7h2v3h-4v-3h-2z"/>',
].map(path => `<svg viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="#555" stroke-width="1.3" stroke-linejoin="miter">${path}</svg>`);

export class UI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui');
    this.mode = 'title'; // title | game | inventory | crafting | furnace | chest | pause | death
    this.craftSlots = new Array(9).fill(null);
    this.craftSize = 2;
    this.furnaceData = null;
    this.showDebug = false;
    this.showHud = true;
    this.splash = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
    this._iconCache = new Map();
    this._mouseX = 0;
    this._mouseY = 0;
    this._hoveredStack = null;
    this.optionsMenu = null;
    this.playerListHeld = false;
    this.playerListPinned = false;
    this.playerPingTimer = null;
    this.playerPingInFlight = false;
    this.touchEnabled = Boolean(game.player?.touchSupported || window.matchMedia?.('(pointer: coarse)')?.matches || window.navigator?.maxTouchPoints > 0);
    this.touchPointerActions = new Map();
    this.touchLookPositions = new Map();
    this.joystickPointerId = null;
    this.joystickKeys = new Set();
    // Remove credentials left by older account-based versions; temporary names
    // never use or persist authentication tokens.
    try {
      window.localStorage.removeItem('aislopcraft:account-token');
      window.localStorage.removeItem('aislopcraft:account-name');
    } catch {}

    this.buildTitle();
    this.buildHud();
    this.buildLoading();
    this.buildPanels();
    this.buildDebug();
    this.buildTooltip();

    window.uiPause = true;

    document.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('keyup', e => this.onKeyUp(e));
    window.addEventListener('blur', () => {
      this.playerListHeld = false;
      this.releaseTouchInputs();
      this.updateNetworkPlayerList();
    });
    document.addEventListener('mousemove', (e) => {
      this._mouseX = e.clientX;
      this._mouseY = e.clientY;
      const cursorEl = document.getElementById('cursor-item');
      if (cursorEl) {
        cursorEl.style.left = (e.clientX - 18) + 'px';
        cursorEl.style.top = (e.clientY - 18) + 'px';
      }
      if (this.tooltipEl && this.tooltipEl.style.display === 'block') {
        this.positionTooltip(e.clientX, e.clientY);
      }
    });
    window.addEventListener('wheel', () => {}, { passive: true });
  }

  // ---------- title ----------
  buildTitle() {
    const div = document.createElement('div');
    div.className = 'screen title-screen';
    div.id = 'title-screen';
    div.innerHTML = `
      <div class="title-logo">
        <div class="title-main"><img src="${logo}" alt="AiSlopcraft"></div>
        <div class="title-sub">Java Edition Beta 1.7.3</div>
        <div class="splash">${this.splash}</div>
      </div>
      <div class="title-buttons">
        <div class="title-primary-stack">
          <button class="btn" id="btn-singleplayer">Singleplayer</button>
          <button class="btn" id="btn-multiplayer">Multiplayer</button>
          <small class="title-multiplayer-hint">Online play needs a unique name · no account or password</small>
        </div>
        <div class="title-button-row title-secondary-row title-controls-row">
          <button class="btn" id="btn-options">Options...</button>
          <button class="btn" id="btn-quit">Quit Game</button>
        </div>
        <div class="title-utility-row">
          <button class="title-link" id="btn-help">How to Play</button>
          <button class="title-link" id="btn-pack">Resource Packs...</button>
          <button class="title-link" id="btn-saves">World Saves...</button>
        </div>
      </div>
      <div class="title-status" id="title-status" role="status" aria-live="polite"></div>
      <div class="title-foot">AiSlopcraft · Beta 1.7.3-inspired</div>
      <div class="title-disclaimer">Independent browser game · not affiliated with Mojang</div>
    `;
    this.root.appendChild(div);
    const worldsScreen = document.createElement('div');
    worldsScreen.id = 'world-select-screen'; worldsScreen.className = 'screen world-menu-screen'; worldsScreen.style.display = 'none';
    worldsScreen.innerHTML = `<section class="world-menu-card">
      <h2>Select World</h2>
      <div id="world-list" class="world-list" role="listbox" aria-label="Saved worlds"></div>
      <div class="world-actions world-actions-primary">
        <button class="btn" id="world-play">Play Selected World</button>
        <button class="btn" id="world-create">Create New World</button>
      </div>
      <div class="world-actions world-actions-secondary">
        <button class="btn" id="world-rename">Rename</button>
        <button class="btn btn-danger" id="world-delete">Delete</button>
        <button class="btn" id="world-recreate">Re-Create</button>
        <button class="btn" id="world-cancel">Cancel</button>
      </div>
      <div class="world-actions world-actions-portable">
        <button class="title-link" id="world-export">Export Selected Save</button>
        <button class="title-link" id="world-import">Import Save File...</button>
      </div>
    </section>`;
    this.root.appendChild(worldsScreen);
    this.worldSelectScreen = worldsScreen;
    const createScreen = document.createElement('div');
    createScreen.id = 'world-create-screen'; createScreen.className = 'screen world-menu-screen'; createScreen.style.display = 'none';
    createScreen.innerHTML = `<section class="world-create-card">
      <h2>Create New World</h2>
      <label>World Name<input id="new-world-name" maxlength="48" value="New World" autocomplete="off"></label>
      <div class="world-save-location" id="world-save-location">Will be saved in New World</div>
      <button class="btn world-mode-button" id="new-world-mode">Game Mode: Survival</button>
      <div class="world-mode-description" id="world-mode-description">Explore, mine, build and craft to survive.</div>
      <button class="btn" id="world-more-options" aria-expanded="false">More World Options...</button>
      <label class="world-seed-field" id="world-seed-field" hidden>Seed for the World Generator<input id="new-world-seed" maxlength="128" placeholder="Leave blank for a random seed" autocomplete="off"></label>
      <div class="world-actions world-actions-primary">
        <button class="btn" id="world-create-confirm">Create New World</button>
        <button class="btn" id="world-create-cancel">Cancel</button>
      </div>
    </section>`;
    this.root.appendChild(createScreen);
    this.worldCreateScreen = createScreen;
    div.querySelector('#btn-singleplayer').addEventListener('click', () => {
      this.game.audio.init(); this.game.audio.click(); this.openWorldSelection();
    });
    div.querySelector('#btn-help').addEventListener('click', event => this.showHelp(event.currentTarget));
    const worldList = worldsScreen.querySelector('#world-list');
    const refreshWorldList = () => {
      const worlds = this.game.listSavedWorlds?.() || [];
      worldList.replaceChildren();
      if (!worlds.length) {
        const empty = document.createElement('div'); empty.className = 'world-list-empty';
        empty.textContent = 'No saved worlds found. Create a new world to begin.'; worldList.appendChild(empty);
        this.selectedWorld = null;
      } else {
        this.selectedWorld = worlds.find(world => world.id === this.selectedWorld?.id) || worlds[0];
        for (const world of worlds) {
          const row = document.createElement('button'); row.type = 'button'; row.className = 'world-list-row';
          row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(this.selectedWorld?.id === world.id));
          row.innerHTML = `<strong></strong><span></span>`;
          row.querySelector('strong').textContent = world.name;
          row.querySelector('span').textContent = `${world.gameMode === 'creative' ? 'Creative' : 'Survival'} · Seed: ${world.seed}`;
          row.addEventListener('click', () => { this.selectedWorld = world; refreshWorldList(); });
          worldList.appendChild(row);
        }
      }
      const active = !!this.selectedWorld;
      for (const id of ['world-play', 'world-rename', 'world-delete', 'world-recreate', 'world-export']) worldsScreen.querySelector(`#${id}`).disabled = !active;
    };
    this.refreshWorldList = refreshWorldList;
    worldsScreen.querySelector('#world-create').addEventListener('click', () => {
      this.game.audio.click(); worldsScreen.style.display = 'none'; createScreen.style.display = 'flex';
      createScreen.querySelector('#new-world-name').focus();
    });
    worldsScreen.querySelector('#world-play').addEventListener('click', () => this.playSelectedWorld());
    worldsScreen.querySelector('#world-cancel').addEventListener('click', () => {
      worldsScreen.style.display = 'none'; document.getElementById('title-screen').style.display = 'flex';
    });
    worldsScreen.querySelector('#world-rename').addEventListener('click', () => {
      const world = this.selectedWorld; if (!world) return;
      const name = window.prompt('Rename world', world.name);
      if (name?.trim()) { this.game.renameLocalWorld?.(world.id, name); refreshWorldList(); }
    });
    worldsScreen.querySelector('#world-delete').addEventListener('click', () => {
      const world = this.selectedWorld; if (!world) return;
      if (!window.confirm(`Delete “${world.name}”? This cannot be undone.`)) return;
      this.game.deleteLocalWorld?.(world.id); this.selectedWorld = null; refreshWorldList();
    });
    worldsScreen.querySelector('#world-recreate').addEventListener('click', () => {
      const world = this.selectedWorld; if (!world) return;
      if (!window.confirm(`Re-create “${world.name}” and erase its saved progress?`)) return;
      this.game.recreateLocalWorld?.(world.id, world.seed, world.name, world.gameMode);
    });
    worldsScreen.querySelector('#world-export').addEventListener('click', () => {
      if (!this.selectedWorld) return;
      try { this.game.exportWorldSave?.(this.selectedWorld.id); }
      catch (error) { this.notify(error.message, 4000); }
    });
    worldsScreen.querySelector('#world-import').addEventListener('click', () => {
      this._saveReturnScreen = 'worlds'; worldsScreen.style.display = 'none'; saves.style.display = 'flex';
    });
    createScreen.querySelector('#new-world-name').addEventListener('input', event => {
      createScreen.querySelector('#world-save-location').textContent = `Will be saved in ${event.target.value.trim() || 'New World'}`;
    });
    let newWorldMode = 'survival';
    createScreen.querySelector('#new-world-mode').addEventListener('click', event => {
      newWorldMode = newWorldMode === 'survival' ? 'creative' : 'survival';
      event.currentTarget.textContent = `Game Mode: ${newWorldMode === 'creative' ? 'Creative' : 'Survival'}`;
      createScreen.querySelector('#world-mode-description').textContent = newWorldMode === 'creative'
        ? 'Build freely with unlimited resources and instant block breaking.'
        : 'Explore, mine, build and craft to survive.';
    });
    createScreen.querySelector('#world-more-options').addEventListener('click', event => {
      const field = createScreen.querySelector('#world-seed-field');
      field.hidden = !field.hidden; event.currentTarget.setAttribute('aria-expanded', String(!field.hidden));
      event.currentTarget.textContent = field.hidden ? 'More World Options...' : 'Hide World Options';
    });
    createScreen.querySelector('#world-create-confirm').addEventListener('click', () => {
      const name = createScreen.querySelector('#new-world-name').value.trim() || 'New World';
      const suppliedSeed = createScreen.querySelector('#new-world-seed').value.trim();
      const unique = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const seed = suppliedSeed || `aislopcraft-${unique}`;
      this.game.openLocalWorld?.(seed, name, newWorldMode, `world-${unique}`);
    });
    createScreen.querySelector('#world-create-cancel').addEventListener('click', () => {
      createScreen.style.display = 'none'; worldsScreen.style.display = 'flex'; refreshWorldList();
    });
    const packs = document.createElement('div');
    packs.className = 'screen texture-pack-screen';
    packs.id = 'texture-pack-screen';
    packs.style.display = 'none';
    packs.innerHTML = `<section class="texture-pack-panel">
      <h2>Texture Packs</h2>
      <p>Import Java Edition 1.7.x packs, including 1.7.10, or a client JAR. Supported block textures are stored locally; packs can be switched or removed below.</p>
      <div class="resource-pack-list" id="pack-list" aria-live="polite"></div>
      <div class="texture-pack-actions">
        <button class="btn" id="pack-import">Open Pack File...</button>
        <input id="pack-file" type="file" accept=".zip,.jar,application/zip" hidden>
      </div>
      <p class="pack-compat-note">This browser game cannot load Java Forge mods or OptiFine shaderpacks. Use Video Settings for its built-in WebGL shader styles.</p>
      <div id="pack-status" role="status" aria-live="polite">Built-in textures active.</div>
      <button class="btn" id="pack-done">Done</button>
    </section>`;
    this.root.appendChild(packs);
    this.texturePackScreen = packs;
    const saves = document.createElement('div');
    saves.className = 'screen texture-pack-screen'; saves.id = 'world-save-screen'; saves.style.display = 'none';
    saves.innerHTML = `<section class="texture-pack-panel">
      <h2>World Saves</h2>
      <p>Worlds autosave in this browser by seed. Export a portable JSON save to keep a backup or move a world to another browser.</p>
      <div class="texture-pack-actions">
        <button class="btn" id="save-export">Download Current World</button>
        <button class="btn" id="save-import-button">Import World Save...</button>
        <input id="save-import-file" type="file" accept=".json,application/json" hidden>
      </div>
      <div id="save-status" role="status" aria-live="polite">Autosaves are stored only in this browser until exported.</div>
      <button class="btn" id="save-done">Done</button>
    </section>`;
    this.root.appendChild(saves);
    this.worldSaveScreen = saves;
    const saveStatus = saves.querySelector('#save-status');
    const saveInput = saves.querySelector('#save-import-file');
    div.querySelector('#btn-saves').addEventListener('click', () => { this._saveReturnScreen = null; saves.style.display = 'flex'; });
    saves.querySelector('#save-done').addEventListener('click', () => {
      saves.style.display = 'none';
      if (this._saveReturnScreen === 'worlds') this.worldSelectScreen.style.display = 'flex';
      this._saveReturnScreen = null;
    });
    saves.addEventListener('mousedown', event => { if (event.target === saves) saves.style.display = 'none'; });
    document.addEventListener('keydown', event => {
      if (event.code === 'Escape' && saves.style.display === 'flex') { event.preventDefault(); saves.style.display = 'none'; }
    }, true);
    saves.querySelector('#save-export').addEventListener('click', () => {
      try { this.game.exportWorldSave?.(); saveStatus.textContent = 'World save downloaded.'; }
      catch (error) { saveStatus.textContent = error.message; }
    });
    saves.querySelector('#save-import-button').addEventListener('click', () => saveInput.click());
    saveInput.addEventListener('change', async () => {
      const file = saveInput.files?.[0]; if (!file) return;
      saveStatus.textContent = 'Validating world save...';
      try { await this.game.importWorldSaveFile(file); saveStatus.textContent = 'Save imported. Reloading world...'; }
      catch (error) { saveStatus.textContent = `Could not import save: ${error.message}`; }
      saveInput.value = '';
    });
    const fileInput = packs.querySelector('#pack-file');
    const status = packs.querySelector('#pack-status');
    const packList = packs.querySelector('#pack-list');
    const renderPackList = () => {
      const state = this.game.getResourcePackState?.() || { packs: [], activeId: null };
      const forcedVisuals = this.game.networkRoom?.visuals?.mode === 'forced' ? this.game.networkRoom.visuals : null;
      packList.replaceChildren();
      const appendRow = (title, detail, active, use, remove = null, locked = false) => {
        const row = document.createElement('div'); row.className = 'resource-pack-row';
        const info = document.createElement('div'); info.className = 'resource-pack-info';
        const name = document.createElement('strong'); name.textContent = title;
        const meta = document.createElement('span'); meta.textContent = detail;
        info.append(name, meta);
        const actions = document.createElement('div'); actions.className = 'resource-pack-row-actions';
        const useButton = document.createElement('button'); useButton.className = 'btn'; useButton.textContent = locked ? 'Locked' : active ? 'In Use' : 'Use'; useButton.disabled = active || locked;
        useButton.addEventListener('click', async () => {
          useButton.disabled = true;
          try { await use(); this._iconCache.clear(); status.textContent = `${title} is now active.`; }
          catch (error) { status.textContent = `Could not use pack: ${error.message}`; }
          renderPackList();
        });
        actions.appendChild(useButton);
        if (remove) {
          const deleteButton = document.createElement('button'); deleteButton.className = 'btn'; deleteButton.textContent = 'Delete';
          deleteButton.addEventListener('click', async () => {
            await remove(); this._iconCache.clear(); status.textContent = `${title} was removed.`; renderPackList();
          });
          actions.appendChild(deleteButton);
        }
        row.append(info, actions); packList.appendChild(row);
      };
      if (forcedVisuals) {
        appendRow(`Server enforced · ${forcedVisuals.resourcePack?.name || 'Default textures'}`,
          `Shader: ${forcedVisuals.shaderStyle || 'classic'} · visuals locked for this room`, true, () => {}, null, true);
      }
      appendRow('Default textures', 'Built-in AiSlopcraft art', !forcedVisuals && state.activeId === null,
        () => this.game.useDefaultResourcePack?.() ?? this.game.resetResourcePack?.(), null, !!forcedVisuals);
      for (const pack of state.packs) {
        const details = `${pack.count ? `${pack.count} block textures` : 'Imported pack'}${pack.id === 'legacy' ? ' · older installation' : ''}`;
        appendRow(pack.name, details, !forcedVisuals && state.activeId === pack.id,
          () => this.game.useResourcePack(pack.id), forcedVisuals ? null : () => this.game.deleteResourcePack(pack.id), !!forcedVisuals);
      }
    };
    renderPackList();
    div.querySelector('#btn-pack').addEventListener('click', () => { renderPackList(); packs.style.display = 'flex'; });
    packs.querySelector('#pack-import').addEventListener('click', () => fileInput.click());
    packs.querySelector('#pack-done').addEventListener('click', () => { packs.style.display = 'none'; });
    packs.addEventListener('mousedown', event => { if (event.target === packs) packs.style.display = 'none'; });
    document.addEventListener('keydown', event => {
      if (event.code === 'Escape' && packs.style.display === 'flex') { event.preventDefault(); packs.style.display = 'none'; }
    }, true);
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0]; if (!file) return;
      status.textContent = 'Checking Java 1.7.x block textures...';
      try {
        const result = await this.game.importResourcePack(file);
        this._iconCache.clear();
        status.textContent = `${result.name}: installed ${result.count} supported block textures.${result.saved ? '' : ' Applied this session, but browser storage could not save it.'}`;
        renderPackList();
      } catch (error) { status.textContent = `Could not load pack: ${error.message}`; }
      fileInput.value = '';
    });
    div.querySelector('#btn-quit').addEventListener('click', () => {
      this.game.audio.click();
      window.close();
      div.querySelector('#title-status').textContent = 'You can close this browser tab to quit.';
    });
    div.querySelector('#btn-options').addEventListener('click', () => {
      this.game.audio.init();
      this.game.audio.click();
      this.showOptions();
    });

    const multiplayer = document.createElement('div');
    multiplayer.className = 'screen multiplayer-screen';
    multiplayer.id = 'multiplayer-screen';
    multiplayer.style.display = 'none';
    multiplayer.innerHTML = `
      <div class="multiplayer-card">
        <h2 id="mp-title">Multiplayer</h2>
        <p class="mp-connect-help">Pick a name, then create a world or join one. No account or password needed.</p>
        <details class="mp-custom-relay">
          <summary>Advanced: custom room service</summary>
          <label>WebSocket address
            <input id="mp-relay" type="url" placeholder="wss://your-server.example/ws" autocomplete="url">
          </label>
          <small>Only needed on static hosting. Most players can leave this alone.</small>
        </details>
        <section class="mp-name-panel" id="mp-name-panel">
          <h3>1. Choose a player name</h3>
          <p>Temporary name only—held while connected, with no email, account, or password.</p>
          <div class="mp-name-entry">
            <label class="mp-name-field">Player name
              <input id="mp-username" maxlength="20" minlength="3" pattern="[A-Za-z0-9_]{3,20}" placeholder="Builder42" autocomplete="nickname" aria-describedby="mp-name-help">
            </label>
            <button class="btn" id="mp-claim" type="button">Continue</button>
          </div>
          <small id="mp-name-help">3–20 letters, numbers, or underscores. Disconnect or release it to make it available again.</small>
        </section>
        <div class="mp-name-active" id="mp-name-active" hidden>
          <span id="mp-name-label"></span>
          <button class="btn" id="mp-release-name" type="button">Release name</button>
        </div>
        <div class="mp-columns">
          <section class="mp-action-card mp-create-card" aria-labelledby="mp-create-title">
            <h3 id="mp-create-title">2. Create a world</h3>
            <p class="mp-card-help">Start a public Survival world with one click, or change the basics.</p>
            <label>World name <input id="mp-world-name" maxlength="32" value="My world" placeholder="My world"></label>
            <label>Mode
              <select id="mp-mode"><option value="survival">Survival</option><option value="creative">Creative</option></select>
            </label>
            <button class="btn mp-primary-action" id="mp-create" type="button">Create public world</button>
            <details class="mp-more-options">
              <summary>More world options</summary>
              <label>Who can join?
                <select id="mp-access"><option value="public">Public — anyone can find it</option><option value="private">Private — invite code only</option></select>
              </label>
              <label>Password (optional) <input id="mp-password" type="password" maxlength="64" autocomplete="new-password" placeholder="Leave blank for no password"></label>
              <label>Visuals
                <select id="mp-visual-policy"><option value="individual">Each player chooses</option><option value="forced">Use my shader and texture pack</option></select>
              </label>
              <label>Shader
                <select id="mp-host-shader" data-forced-visual disabled>
                  <option value="classic">Classic</option><option value="vibrant">Vibrant</option><option value="cinematic">Cinematic</option><option value="shader">Shader Lite</option><option value="psx">PSX (1.7.10)</option>
                </select>
              </label>
              <label>Texture pack
                <select id="mp-host-texture-pack" data-forced-visual disabled><option value="__default__">Default textures</option></select>
              </label>
              <small class="mp-visual-help">When visuals are forced, personal visuals return when a player leaves.</small>
            </details>
          </section>
          <section class="mp-action-card mp-join-card" aria-labelledby="mp-join-title">
            <h3 id="mp-join-title">3. Join a world</h3>
            <div class="mp-room-heading"><span>Public worlds</span><button class="mp-text-action" id="mp-refresh" type="button">Refresh</button></div>
            <div class="mp-room-list" id="mp-room-list" aria-live="polite"><span>Loading public worlds…</span></div>
            <details class="mp-invite-options">
              <summary>Have an invite code?</summary>
              <label>6-character code <input id="mp-code" maxlength="6" placeholder="ABC123" autocomplete="off" autocapitalize="characters"></label>
              <label>Password (if needed) <input id="mp-join-password" type="password" maxlength="64" autocomplete="current-password"></label>
              <button class="btn" id="mp-join" type="button">Join with code</button>
            </details>
          </section>
        </div>
        <details class="mp-online-panel" id="mp-online-panel">
          <summary><span id="mp-online-title">Players online</span><span id="mp-online-count">0 online</span></summary>
          <ul id="mp-online-list" aria-live="polite"><li>Connect to see players online.</li></ul>
          <button class="btn" id="mp-online-refresh" type="button">Refresh player list</button>
          <small>These are connected players, not a score leaderboard.</small>
        </details>
        <div class="mp-status" id="mp-status" role="status" aria-live="polite">Checking the room service…</div>
        <div class="mp-footer"><button class="btn btn-half" id="mp-back" type="button">Back</button><span>Up to 5 rooms · 5 players each · the host stays connected.</span></div>
      </div>`;
    this.root.appendChild(multiplayer);
    this.multiplayerOpenButton = div.querySelector('#btn-multiplayer');
    this.multiplayerOpenButton.addEventListener('click', () => this.openMultiplayer());
    multiplayer.setAttribute('role', 'dialog');
    multiplayer.setAttribute('aria-modal', 'true');
    multiplayer.setAttribute('aria-labelledby', 'mp-title');
    multiplayer.querySelector('#mp-back').addEventListener('click', () => this.closeMultiplayer());
    multiplayer.querySelector('#mp-refresh').addEventListener('click', () => this.refreshPublicRooms());
    multiplayer.querySelector('#mp-online-refresh').addEventListener('click', () => this.refreshOnlinePlayers());
    multiplayer.querySelector('#mp-claim').addEventListener('click', () => this.claimMultiplayerName());
    multiplayer.querySelector('#mp-username').addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); this.claimMultiplayerName(); }
    });
    multiplayer.querySelector('#mp-release-name').addEventListener('click', () => this.releaseMultiplayerName());
    multiplayer.querySelector('#mp-create').addEventListener('click', () => this.createMultiplayerRoom());
    multiplayer.querySelector('#mp-join').addEventListener('click', () => this.joinMultiplayerRoom());
    for (const input of multiplayer.querySelectorAll('#mp-code, #mp-join-password')) {
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); this.joinMultiplayerRoom(); }
      });
    }
    multiplayer.querySelector('#mp-access').addEventListener('change', () => {
      multiplayer.querySelector('#mp-password').placeholder = multiplayer.querySelector('#mp-access').value === 'private' ? 'Optional (invite code also required)' : 'At least 4 characters, optional';
    });
    this.multiplayerScreen = multiplayer;
    multiplayer.querySelector('#mp-visual-policy').addEventListener('change', event => {
      for (const control of multiplayer.querySelectorAll('[data-forced-visual]')) control.disabled = event.target.value !== 'forced';
    });
    this.multiplayerClient = this.game.multiplayerClient || null;
    multiplayer.querySelector('#mp-relay').value = this.game.multiplayerRelay || window.localStorage.getItem('aislopcraft:multiplayer-relay') || '';
    multiplayer.querySelector('#mp-username').value = window.localStorage.getItem('aislopcraft:player-name') || '';
    this.multiplayerName = this.multiplayerClient?.playerName || null;
    this.updateMultiplayerNameUI();
    multiplayer.querySelector('#mp-code').value = new URLSearchParams(window.location.search).get('room') || '';
  }

  closeMultiplayer() {
    if (!this.multiplayerScreen || this.multiplayerScreen.style.display === 'none') return;
    this.multiplayerScreen.style.display = 'none';
    if (this.multiplayerReturnFocus?.isConnected) this.multiplayerReturnFocus.focus();
  }

  openWorldSelection() {
    this.selectedWorld = null;
    this.refreshWorldList?.();
    this.hide('title-screen');
    this.worldSelectScreen.style.display = 'flex';
  }

  playSelectedWorld() {
    const world = this.selectedWorld;
    if (!world) return;
    this.game.audio?.click?.();
    if (this.game.openLocalWorld) this.game.openLocalWorld(world.seed, world.name, world.gameMode, world.id);
    else {
      this.hide('title-screen'); this.setMode('game'); this.game.start?.();
    }
  }

  openMultiplayer() {
    const active = document.activeElement;
    this.multiplayerReturnFocus = active && this.multiplayerScreen.contains(active)
      ? this.multiplayerReturnFocus
      : (active === this.multiplayerOpenButton ? active : this.multiplayerOpenButton);
    this.multiplayerScreen.style.display = 'flex';
    const shader = this.multiplayerScreen.querySelector('#mp-host-shader');
    shader.value = [...shader.options].some(option => option.value === this.game.shaderStyle) ? this.game.shaderStyle : 'classic';
    const texturePack = this.multiplayerScreen.querySelector('#mp-host-texture-pack');
    const defaultOption = document.createElement('option');
    defaultOption.textContent = 'Default textures'; defaultOption.value = '__default__';
    texturePack.replaceChildren(defaultOption);
    const packState = this.game.getResourcePackState?.() || { packs: [], activeId: null };
    for (const pack of packState.packs) {
      const option = document.createElement('option');
      option.textContent = pack.name; option.value = pack.id;
      texturePack.appendChild(option);
    }
    texturePack.value = packState.activeId || '__default__';
    const policy = this.multiplayerScreen.querySelector('#mp-visual-policy');
    for (const control of this.multiplayerScreen.querySelectorAll('[data-forced-visual]')) control.disabled = policy.value !== 'forced';
    const status = this.multiplayerScreen.querySelector('#mp-status');
    if (this.game.multiplayerClient) this.multiplayerClient = this.game.multiplayerClient;
    this.multiplayerName = this.multiplayerClient?.playerName || this.multiplayerName || null;
    this.updateMultiplayerNameUI();
    const hasRelay = this.multiplayerScreen.querySelector('#mp-relay').value.trim() || this.game.multiplayerRelay || suggestedMultiplayerRelay();
    status.replaceChildren();
    if (!hasRelay) {
      this.multiplayerScreen.querySelector('#mp-room-list').textContent = 'No room service is configured for this site.';
      status.append('This copy is on static hosting, which cannot run online rooms.');
      if (window.location.hostname.endsWith('.github.io')) {
        status.append(document.createElement('br'));
        const deployLink = document.createElement('a');
        deployLink.className = 'mp-deploy-link';
        deployLink.href = MULTIPLAYER_DEPLOY_URL;
        deployLink.target = '_blank';
        deployLink.rel = 'noopener noreferrer';
        deployLink.textContent = 'Owner: set up the Azure game server';
        status.append(deployLink);
        const instructions = document.createElement('small');
        instructions.className = 'mp-deploy-help';
        instructions.textContent = 'One Azure server hosts up to 5 rooms, with 5 players per room.';
        status.append(document.createElement('br'), instructions);
      } else {
        status.append(' Add a reachable service under Advanced settings.');
      }
    } else {
      status.textContent = this.multiplayerName ? `Playing as ${this.multiplayerName}. Your name is reserved while connected.` : 'Choose an available player name to play online. No password or account needed.';
      this.multiplayerScreen.querySelector('#mp-room-list').textContent = 'Loading public worlds…';
      void this.refreshPublicRooms();
    }
    (this.multiplayerName ? this.multiplayerScreen.querySelector('#mp-create') : this.multiplayerScreen.querySelector('#mp-username')).focus();
  }

  updateMultiplayerNameUI() {
    if (!this.multiplayerScreen) return;
    const name = this.multiplayerClient?.playerName || this.multiplayerName || null;
    this.multiplayerName = name;
    this.multiplayerScreen.classList.toggle('mp-named', Boolean(name));
    this.multiplayerScreen.querySelector('#mp-name-panel').hidden = Boolean(name);
    this.multiplayerScreen.querySelector('#mp-name-active').hidden = !name;
    this.multiplayerScreen.querySelector('#mp-name-label').textContent = name ? `Playing as ${name}. This name is held only while you are connected.` : '';
    this.multiplayerScreen.querySelector('#mp-create').disabled = !name;
    this.multiplayerScreen.querySelector('#mp-join').disabled = !name;
    for (const room of this.multiplayerScreen.querySelectorAll('.mp-room')) room.disabled = !name;
    if (!name && !this.multiplayerScreen.querySelector('#mp-username').value) {
      try { this.multiplayerScreen.querySelector('#mp-username').value = window.localStorage.getItem('aislopcraft:player-name') || ''; } catch {}
    }
  }

  renderOnlinePlayers(players = []) {
    if (!this.multiplayerScreen) return;
    const list = this.multiplayerScreen.querySelector('#mp-online-list');
    const count = this.multiplayerScreen.querySelector('#mp-online-count');
    list.replaceChildren();
    count.textContent = `${players.length} online`;
    if (!players.length) {
      const empty = document.createElement('li'); empty.textContent = 'Nobody is online yet.'; list.appendChild(empty); return;
    }
    for (const name of players) {
      const row = document.createElement('li');
      const playerName = document.createElement('span'); playerName.textContent = name;
      const status = document.createElement('small'); status.textContent = name === this.multiplayerName ? 'You' : 'Online';
      row.append(playerName, status);
      list.appendChild(row);
    }
  }

  attachMultiplayerListeners(client) {
    if (this._onlinePlayersClient === client) return;
    this._onlinePlayersClient = client;
    client.on('players:list', message => this.renderOnlinePlayers(message.players));
    client.on('disconnected', () => {
      if (this.multiplayerClient !== client) return;
      this.multiplayerName = null;
      this.updateMultiplayerNameUI();
      if (this.multiplayerScreen) this.multiplayerScreen.querySelector('#mp-status').textContent = 'Disconnected. Your player name is available again; reconnect and claim it to play.';
    });
  }

  async prepareMultiplayerClient() {
    const screen = this.multiplayerScreen;
    const relay = screen.querySelector('#mp-relay').value.trim() || this.game.multiplayerRelay || suggestedMultiplayerRelay() || window.localStorage.getItem('aislopcraft:multiplayer-relay') || '';
    if (!relay) throw new Error('This static site cannot host rooms. Open the Azure setup guide or enter a custom WebSocket service under Advanced.');
    const { MultiplayerClient } = await import('../network/multiplayer.js');
    if (!this.multiplayerClient) this.multiplayerClient = new MultiplayerClient();
    this.attachMultiplayerListeners(this.multiplayerClient);
    await this.multiplayerClient.connect(relay);
    this.game.multiplayerRelay = relay;
    try { window.localStorage.setItem('aislopcraft:multiplayer-relay', relay); } catch {}
    return this.multiplayerClient;
  }

  async claimMultiplayerName() {
    const screen = this.multiplayerScreen;
    const status = screen.querySelector('#mp-status');
    const input = screen.querySelector('#mp-username');
    const name = input.value.trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) { status.textContent = 'Use 3–20 letters, numbers, or underscores for your player name.'; input.focus(); return; }
    const button = screen.querySelector('#mp-claim');
    button.disabled = true;
    status.textContent = 'Connecting and checking whether that name is free…';
    try {
      const client = await this.prepareMultiplayerClient();
      const result = await client.claimPlayerName(name);
      this.multiplayerName = result.name;
      try { window.localStorage.setItem('aislopcraft:player-name', result.name); } catch {}
      this.updateMultiplayerNameUI();
      status.textContent = `Welcome, ${result.name}. Create a world or choose one to join.`;
      screen.querySelector('#mp-create').focus();
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  }

  async refreshOnlinePlayers() {
    try {
      const client = await this.prepareMultiplayerClient();
      const result = await client.listOnlinePlayers();
      this.renderOnlinePlayers(result.players);
    } catch (error) {
      this.multiplayerScreen.querySelector('#mp-online-list').textContent = error.message;
    }
  }

  async releaseMultiplayerName() {
    const client = this.multiplayerClient;
    if (!client) return;
    try {
      await client.releasePlayerName();
      this.multiplayerName = null;
      this.updateMultiplayerNameUI();
      this.multiplayerScreen.querySelector('#mp-status').textContent = 'Name released. It is available for someone else to use.';
      this.multiplayerScreen.querySelector('#mp-username').focus();
    } catch (error) {
      this.multiplayerScreen.querySelector('#mp-status').textContent = `Could not release the player name: ${error.message}`;
    }
  }

  async connectMultiplayer() {
    const status = this.multiplayerScreen.querySelector('#mp-status');
    if (!this.multiplayerClient?.playerName && !this.multiplayerName) throw new Error('Choose an available player name first.');
    status.textContent = 'Connecting to the room service…';
    const client = await this.prepareMultiplayerClient();
    if (!client.playerName) throw new Error('Your name reservation ended. Claim an available name again.');
    return { playerName: client.playerName, status };
  }

  async refreshPublicRooms() {
    const screen = this.multiplayerScreen;
    const list = screen.querySelector('#mp-room-list');
    const status = screen.querySelector('#mp-status');
    const refreshButton = screen.querySelector('#mp-refresh');
    if (refreshButton.disabled) return;
    refreshButton.disabled = true;
    const refreshLabel = refreshButton.textContent;
    refreshButton.textContent = 'Checking…';
    try {
      const client = await this.prepareMultiplayerClient();
      const [result, online] = await Promise.all([client.listRooms(), client.listOnlinePlayers()]);
      this.renderOnlinePlayers(online.players);
      list.replaceChildren();
      if (!result.rooms.length) {
        list.textContent = 'No public worlds yet. Create one and invite your friends.';
        status.textContent = 'Room service connected. No public worlds are online right now.';
        return;
      }
      for (const room of result.rooms) {
        const button = document.createElement('button');
        button.className = 'mp-room';
        button.type = 'button';
        button.textContent = `${room.name} · ${room.players}/${room.maxPlayers} · ${room.gameMode}${room.passwordProtected ? ' · password required' : ' · Join'}${room.visualMode === 'forced' ? ' · host visuals' : ''}`;
        button.setAttribute('aria-label', `${room.name}, ${room.players} of ${room.maxPlayers} players, ${room.gameMode}${room.passwordProtected ? ', password required' : ', join now'}`);
        button.disabled = !this.multiplayerName;
        button.addEventListener('click', () => {
          if (!this.multiplayerName) {
            status.textContent = 'Choose a player name first, then select a world to join.';
            screen.querySelector('#mp-username').focus();
            return;
          }
          screen.querySelector('#mp-code').value = room.code;
          const inviteOptions = screen.querySelector('.mp-invite-options');
          if (room.passwordProtected) {
            inviteOptions.open = true;
            screen.querySelector('#mp-join-password').focus();
            status.textContent = `Enter the password for ${room.name}, then choose Join with code.`;
          } else {
            screen.querySelector('#mp-join-password').value = '';
            void this.joinMultiplayerRoom();
          }
        });
        list.appendChild(button);
      }
      status.textContent = `Found ${result.rooms.length} public world${result.rooms.length === 1 ? '' : 's'}.`;
    } catch (error) {
      list.textContent = `Could not load worlds: ${error.message}`;
      status.textContent = `Could not refresh public worlds: ${error.message}`;
    } finally {
      refreshButton.disabled = false;
      refreshButton.textContent = refreshLabel;
    }
  }

  async createMultiplayerRoom() {
    const screen = this.multiplayerScreen;
    const status = screen.querySelector('#mp-status');
    const button = screen.querySelector('#mp-create');
    if (button.disabled) return;
    button.disabled = true;
    try {
      const { playerName } = await this.connectMultiplayer();
      const password = screen.querySelector('#mp-password').value;
      const visualMode = screen.querySelector('#mp-visual-policy').value;
      const visuals = visualMode === 'forced' ? {
        mode: 'forced',
        shaderStyle: screen.querySelector('#mp-host-shader').value,
        resourcePack: this.game.getResourcePackForSharing?.(
          screen.querySelector('#mp-host-texture-pack').value === '__default__'
            ? null : screen.querySelector('#mp-host-texture-pack').value,
        ) || null,
      } : { mode: 'individual' };
      const result = await this.multiplayerClient.createRoom({
        playerName, name: screen.querySelector('#mp-world-name').value.trim(),
        gameMode: screen.querySelector('#mp-mode').value, access: screen.querySelector('#mp-access').value,
        password, seed: this.game.seed, visuals,
      });
      const entries = [...this.game.world.edits].map(([key, id]) => [key, [id, this.game.world.metaEdits.get(key) || 0]]);
      const batchSize = 1000;
      for (let index = 0; index < entries.length; index += batchSize) {
        status.textContent = `Preparing your world… ${Math.min(index + batchSize, entries.length).toLocaleString()} / ${entries.length.toLocaleString()} edits`;
        await this.multiplayerClient.request('world:snapshot', { entries: entries.slice(index, index + batchSize) });
      }
      this.multiplayerClient.send('chat', { text: `${playerName} opened ${result.gameMode} world “${result.name}”.` });
      await this.enterMultiplayer(result);
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  }

  async joinMultiplayerRoom() {
    const screen = this.multiplayerScreen;
    const status = screen.querySelector('#mp-status');
    const button = screen.querySelector('#mp-join');
    if (button.disabled) return;
    button.disabled = true;
    try {
      const { playerName } = await this.connectMultiplayer();
      const result = await this.multiplayerClient.joinRoom({
        code: screen.querySelector('#mp-code').value.trim().toUpperCase(),
        password: screen.querySelector('#mp-join-password').value, playerName,
      });
      await this.enterMultiplayer(result);
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  }

  async enterMultiplayer(room) {
    if (room.seed !== this.game.seed) {
      await this.multiplayerClient.leave();
      throw new Error(`This world uses seed “${room.seed}”. Open the same world seed with ?seed=${encodeURIComponent(room.seed)}, then join again.`);
    }
    const edits = room.worldEdits || [];
    this.game.applyNetworkEdits?.(edits);
    this.game.setMultiplayerRoom?.(room, this.multiplayerClient);
    try { await this.game.applyMultiplayerVisuals?.(room.visuals); }
    catch (error) {
      await this.game.leaveMultiplayer?.();
      throw new Error(`Could not apply the host's forced visuals: ${error.message}`);
    }
    this.multiplayerScreen.style.display = 'none';
    this.hide('title-screen');
    this.game.audio.init();
    this.game.audio.click();
    this.setMode('game');
    this.game.start();
    this.notify(`Joined ${room.name} · ${room.gameMode} · code ${room.code}`, 5000);
  }

  showOptions() {
    if (this.optionsMenu) return;
    this.optionsMenu = new OptionsMenu(this.game, () => {
      this.optionsMenu = null;
      this.game.saveSettings?.();
    });
  }

  buildLoading() {
    const screen = document.createElement('div');
    screen.id = 'loading-screen'; screen.className = 'screen loading-screen';
    screen.style.display = 'none';
    screen.innerHTML = '<div>Loading world</div><div>Building terrain</div>';
    this.root.appendChild(screen);
  }

  showLoading(show) {
    const screen = document.getElementById('loading-screen');
    if (screen) screen.style.display = show ? 'flex' : 'none';
  }

  // ---------- HUD ----------
  buildHud() {
    const div = document.createElement('div');
    div.className = 'hud';
    div.id = 'hud';
    div.style.display = 'none';
    div.innerHTML = `
      <div class="crosshair">+</div>
      <div class="hotbar" id="hotbar"></div>
      <div class="status-bars">
        <div class="hearts" id="hearts"></div>
        <div class="armor-bar" id="armor-bar" style="display:none"></div>
      </div>
      <div class="water-bar" id="water-bar" style="display:none"></div>
      <div class="held-name" id="held-name"></div>
      <div class="toast-msg" id="toast-msg"></div>
      <div class="hint" id="hint">Click to play &nbsp;|&nbsp; WASD move · Space jump · Shift sneak · Q drop · E inventory · F3 debug · Esc pause</div>
      <div class="network-panel" id="network-panel" style="display:none">
        <div class="network-room-line"><span id="network-room-label"></span><button id="network-players" type="button" aria-expanded="false">Players (Tab)</button><button id="network-copy" type="button">Invite</button><button id="network-leave" type="button">Leave</button></div>
        <div class="network-chat-log" id="network-chat-log" aria-live="polite"></div>
        <form id="network-chat-form" style="display:none"><input id="network-chat-input" maxlength="240" placeholder="Message…" autocomplete="off"><button type="submit">Send</button></form>
        <button id="network-chat-open" type="button">Chat (T)</button>
      </div>
      <section class="network-player-list" id="network-player-list" aria-label="Players in this world" aria-live="polite" style="display:none">
        <header><strong>PLAYERS</strong><span id="network-player-count">0 / 5</span></header>
        <div id="network-player-rows"></div>
        <footer id="network-ping">Connection check: ready</footer>
        <small>Hold Tab to view · use Players to pin open</small>
      </section>
      <div class="touch-controls" id="touch-controls" aria-label="Touch game controls">
        <div class="touch-look-zone" id="touch-look-zone" aria-label="Drag to look"><span>DRAG TO LOOK</span></div>
        <div class="touch-joystick" id="touch-joystick" role="group" aria-label="Move joystick"><div class="touch-joystick-knob" id="touch-joystick-knob"></div></div>
        <div class="touch-action-cluster">
          <button type="button" id="touch-mine" aria-label="Mine or attack">Mine</button>
          <button type="button" id="touch-use" aria-label="Place a block or use item">Use</button>
          <button type="button" id="touch-jump" aria-label="Jump">Jump</button>
          <button type="button" id="touch-sneak" aria-label="Sneak">Sneak</button>
          <button type="button" id="touch-inventory" aria-label="Open or close inventory">Inventory</button>
          <button type="button" id="touch-pause" aria-label="Pause game">Pause</button>
          <button type="button" id="touch-slot-prev" aria-label="Select previous hotbar slot">◀ Slot</button>
          <button type="button" id="touch-slot-next" aria-label="Select next hotbar slot">Slot ▶</button>
          <button type="button" id="touch-chat" aria-label="Open multiplayer chat" hidden>Chat</button>
        </div>
      </div>
    `;
    this.root.appendChild(div);
    this.touchPanelReturnEl = document.createElement('button');
    this.touchPanelReturnEl.type = 'button';
    this.touchPanelReturnEl.id = 'touch-panel-return';
    this.touchPanelReturnEl.className = 'btn touch-panel-return';
    this.touchPanelReturnEl.textContent = 'Back to game';
    this.touchPanelReturnEl.setAttribute('aria-label', 'Close panel and return to the game');
    this.touchPanelReturnEl.hidden = true;
    this.touchPanelReturnEl.addEventListener('click', () => {
      this.game.audio?.click?.();
      this.setMode('game');
    });
    this.root.appendChild(this.touchPanelReturnEl);
    this.hotbarEl = div.querySelector('#hotbar');
    this.heartsEl = div.querySelector('#hearts');
    this.armorBarEl = div.querySelector('#armor-bar');
    this.heldNameEl = div.querySelector('#held-name');
    this.toastEl = div.querySelector('#toast-msg');
    this.hintEl = div.querySelector('#hint');
    this.crosshair = div.querySelector('.crosshair');

    for (let i = 0; i < 9; i++) {
      const s = document.createElement('div');
      s.className = 'slot hotbar-slot';
      s.dataset.index = i;
      s.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (this.mode === 'game') {
          this.game.player.hotbarIndex = i;
          this.refresh();
        }
      });
      this.hotbarEl.appendChild(s);
    }
    const networkPanel = div.querySelector('#network-panel');
    div.querySelector('#network-copy').addEventListener('click', async () => {
      const room = this.game.networkRoom;
      if (!room) return;
      const invite = new URL(window.location.href);
      invite.searchParams.set('seed', room.seed);
      invite.searchParams.set('room', room.code);
      invite.searchParams.set('relay', this.game.multiplayerClient?.relayUrl || '');
      try { await navigator.clipboard.writeText(invite.toString()); this.notify('Invite link copied. Share the code and password separately.'); }
      catch { window.prompt('Copy this invite link:', invite.toString()); }
    });
    div.querySelector('#network-leave').addEventListener('click', () => this.game.leaveMultiplayer?.());
    div.querySelector('#network-players').addEventListener('click', () => {
      this.playerListPinned = !this.playerListPinned;
      this.updateNetworkPlayerList();
    });
    div.querySelector('#network-chat-open').addEventListener('click', () => this.openNetworkChat());
    div.querySelector('#network-chat-form').addEventListener('submit', event => {
      event.preventDefault();
      const input = div.querySelector('#network-chat-input');
      const text = input.value.trim();
      if (text) this.game.multiplayerClient?.send('chat', { text });
      input.value = '';
      div.querySelector('#network-chat-form').style.display = 'none';
      div.querySelector('#network-chat-open').style.display = 'block';
      input.blur();
      if (this.mode === 'game' && !this.touchEnabled) document.getElementById('game-canvas')?.requestPointerLock?.();
    });
    this.networkPanel = networkPanel;
    this.touchControlsEl = div.querySelector('#touch-controls');
    div.classList.toggle('touch-device', this.touchEnabled);
    this.initTouchControls();
  }

  initTouchControls() {
    const player = this.game.player;
    if (!this.touchEnabled || !player) return;
    const controls = this.touchControlsEl;
    const look = controls.querySelector('#touch-look-zone');
    const joystick = controls.querySelector('#touch-joystick');
    const knob = controls.querySelector('#touch-joystick-knob');
    const activePointer = event => {
      event.preventDefault();
      if (this.mode !== 'game') return false;
      player.setTouchPointer(event.pointerId, true);
      try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch {}
      return true;
    };
    const releasePointer = pointerId => {
      const action = this.touchPointerActions.get(pointerId);
      this.touchPointerActions.delete(pointerId);
      if (action === 'attack' && ![...this.touchPointerActions.values()].includes('attack')) {
        player.leftDown = false; player.mining.active = false; player.mining.progress = 0;
      }
      if (action === 'use' && ![...this.touchPointerActions.values()].includes('use')) player.rightDown = false;
      if (action?.startsWith('key:')) {
        const code = action.slice(4);
        const stillHeldByButton = [...this.touchPointerActions.values()].includes(action);
        if (!stillHeldByButton && !this.joystickKeys.has(code)) player.setTouchKey(code, false);
      }
      this.touchLookPositions.delete(pointerId);
      player.setTouchPointer(pointerId, false);
      if (this.joystickPointerId === pointerId) {
        this.joystickPointerId = null;
        for (const code of this.joystickKeys) {
          if (![...this.touchPointerActions.values()].includes(`key:${code}`)) player.setTouchKey(code, false);
        }
        this.joystickKeys.clear();
        knob.style.transform = 'translate(0, 0)';
      }
    };
    const releaseEvents = element => {
      element.addEventListener('pointerup', event => releasePointer(event.pointerId));
      element.addEventListener('pointercancel', event => releasePointer(event.pointerId));
      element.addEventListener('lostpointercapture', event => releasePointer(event.pointerId));
    };

    look.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' || !activePointer(event)) return;
      this.touchLookPositions.set(event.pointerId, { x: event.clientX, y: event.clientY });
    });
    look.addEventListener('pointermove', event => {
      const previous = this.touchLookPositions.get(event.pointerId);
      if (!previous) return;
      player.mouseDX += (event.clientX - previous.x) * 2.25;
      player.mouseDY += (event.clientY - previous.y) * 2.25;
      this.touchLookPositions.set(event.pointerId, { x: event.clientX, y: event.clientY });
    });
    releaseEvents(look);

    const updateJoystick = event => {
      const rect = joystick.getBoundingClientRect();
      const radius = Math.max(24, Math.min(rect.width || 96, rect.height || 96) * 0.42);
      const dx = event.clientX - (rect.left + (rect.width || 96) / 2);
      const dy = event.clientY - (rect.top + (rect.height || 96) / 2);
      const length = Math.hypot(dx, dy) || 1;
      const scale = Math.min(1, radius / length);
      const nx = dx / radius, ny = dy / radius;
      knob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
      const desired = new Set();
      if (ny < -0.28) desired.add(player.bindings.forward);
      if (ny > 0.28) desired.add(player.bindings.back);
      if (nx < -0.28) desired.add(player.bindings.left);
      if (nx > 0.28) desired.add(player.bindings.right);
      for (const code of this.joystickKeys) {
        if (!desired.has(code) && ![...this.touchPointerActions.values()].includes(`key:${code}`)) player.setTouchKey(code, false);
      }
      for (const code of desired) player.setTouchKey(code, true);
      this.joystickKeys = desired;
    };
    joystick.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' || !activePointer(event)) return;
      this.joystickPointerId = event.pointerId;
      updateJoystick(event);
    });
    joystick.addEventListener('pointermove', event => { if (event.pointerId === this.joystickPointerId) updateJoystick(event); });
    releaseEvents(joystick);

    const bindHold = (id, action, buttonNumber = 0) => {
      const button = controls.querySelector(`#${id}`);
      button.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' || !activePointer(event)) return;
        this.touchPointerActions.set(event.pointerId, action);
        if (action === 'attack') player.leftDown = true;
        else if (action === 'use') player.rightDown = true;
        else if (action.startsWith('key:')) player.setTouchKey(action.slice(4), true);
        else return;
        if (action === 'attack' || action === 'use') {
          const binding = action === 'attack' ? player.bindings.attack : player.bindings.use;
          const boundButton = /^Mouse([0-2])$/.exec(binding || '');
          const mouseButton = boundButton ? Number(boundButton[1]) : buttonNumber;
          document.dispatchEvent(new window.MouseEvent('mousedown', { button: mouseButton, bubbles: true, cancelable: true }));
        }
      });
      releaseEvents(button);
    };
    bindHold('touch-mine', 'attack', 0);
    bindHold('touch-use', 'use', 2);
    bindHold('touch-jump', `key:${player.bindings.jump}`);
    bindHold('touch-sneak', `key:${player.bindings.sneak}`);
    controls.querySelector('#touch-inventory').addEventListener('click', () => {
      if (this.mode === 'game') this.setMode('inventory');
      else if (['inventory', 'crafting', 'furnace', 'chest'].includes(this.mode)) this.setMode('game');
    });
    controls.querySelector('#touch-pause').addEventListener('click', () => {
      if (this.mode === 'game') this.setMode('pause');
    });
    controls.querySelector('#touch-slot-prev').addEventListener('click', () => {
      player.hotbarIndex = (player.hotbarIndex + 8) % 9; this.refresh();
    });
    controls.querySelector('#touch-slot-next').addEventListener('click', () => {
      player.hotbarIndex = (player.hotbarIndex + 1) % 9; this.refresh();
    });
    controls.querySelector('#touch-chat').addEventListener('click', () => this.openNetworkChat());
  }

  releaseTouchInputs() {
    const player = this.game.player;
    if (!player?.clearTouchInput) return;
    player.clearTouchInput();
    this.touchPointerActions.clear();
    this.touchLookPositions.clear();
    this.joystickPointerId = null;
    this.joystickKeys.clear();
    const knob = this.touchControlsEl?.querySelector('#touch-joystick-knob');
    if (knob) knob.style.transform = 'translate(0, 0)';
  }

  openNetworkChat() {
    if (!this.game.networkRoom) return;
    const form = this.networkPanel.querySelector('#network-chat-form');
    form.style.display = 'flex';
    this.networkPanel.querySelector('#network-chat-open').style.display = 'none';
    document.exitPointerLock?.();
    this.networkPanel.querySelector('#network-chat-input').focus();
  }

  appendNetworkChat(name, text) {
    const log = this.networkPanel?.querySelector('#network-chat-log');
    if (!log) return;
    const line = document.createElement('div');
    const author = document.createElement('strong');
    author.textContent = `${name}: `;
    const message = document.createElement('span');
    message.textContent = text;
    line.append(author, message);
    log.appendChild(line);
    while (log.children.length > 8) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
    this.networkPanel.style.display = 'block';
  }

  updateNetworkPanel() {
    const room = this.game.networkRoom;
    if (this.networkPanel) {
      this.networkPanel.style.display = room ? 'block' : 'none';
      if (room) {
        const count = room.players?.length || (this.game.remotePlayers?.size || 0) + 1;
        this.networkPanel.querySelector('#network-room-label').textContent = `${room.name} · ${room.gameMode} · ${count}/${room.maxPlayers || 5} · ${room.code}`;
      }
    }
    const saveNow = document.getElementById('btn-save-now');
    if (saveNow) saveNow.hidden = !!room;
    const saveQuit = document.getElementById('btn-save-quit');
    if (saveQuit) saveQuit.textContent = room ? 'Leave Multiplayer & Quit to Title' : 'Save & Quit to Title';
    if (this.hintEl && room) this.hintEl.textContent = 'Click to play · WASD move · Space jump · Shift sneak · Q drop · E inventory · Tab players · T chat · Esc pause';
    else if (this.hintEl) this.hintEl.textContent = 'Click to play · WASD move · Space jump · Shift sneak · Q drop · E inventory · F3 debug · Esc pause';
    this.updateNetworkPlayerList();
  }

  updateNetworkPlayerList() {
    const room = this.game.networkRoom;
    const list = document.getElementById('network-player-list');
    if (!list) return;
    if (!room) { this.playerListHeld = false; this.playerListPinned = false; }
    const touchChat = document.getElementById('touch-chat');
    if (touchChat) touchChat.hidden = !room;
    const open = Boolean(room && this.mode === 'game' && (this.playerListHeld || this.playerListPinned));
    list.style.display = open ? 'block' : 'none';
    const button = this.networkPanel?.querySelector('#network-players');
    button?.setAttribute('aria-expanded', String(open));
    const rows = list.querySelector('#network-player-rows');
    const players = [...(room?.players || [])];
    if (room && !players.some(player => player.id === room.id)) {
      players.push({ id: room.id, name: room.playerName || this.game.multiplayerClient?.playerName || 'You', role: room.role });
    }
    players.sort((a, b) => Number(b.role === 'host') - Number(a.role === 'host') || String(a.name).localeCompare(String(b.name)));
    list.querySelector('#network-player-count').textContent = `${players.length} / ${room?.maxPlayers || 5}`;
    rows.replaceChildren();
    if (!players.length) {
      const empty = document.createElement('div'); empty.className = 'network-player-empty'; empty.textContent = 'No players connected'; rows.appendChild(empty);
    }
    for (const player of players) {
      const row = document.createElement('div'); row.className = 'network-player-row';
      if (player.id === room?.id) row.classList.add('is-you');
      const name = document.createElement('span'); name.className = 'network-player-name'; name.textContent = String(player.name || 'Player').slice(0, 20);
      const badge = document.createElement('span'); badge.className = 'network-player-badge';
      if (player.role === 'host' || (player.id === room?.id && room.role === 'host')) badge.classList.add('is-host');
      badge.textContent = player.id === room?.id ? (room.role === 'host' ? 'HOST · YOU' : 'YOU') : player.role === 'host' ? 'HOST' : 'ONLINE';
      row.append(name, badge); rows.appendChild(row);
    }
    const ping = list.querySelector('#network-ping');
    if (open) {
      if (this.playerPingTimer === null) {
        this.checkPlayerConnection();
        this.playerPingTimer = setInterval(() => this.checkPlayerConnection(), 5000);
      }
    } else {
      if (this.playerPingTimer !== null) clearInterval(this.playerPingTimer);
      this.playerPingTimer = null;
      this.playerPingInFlight = false;
      ping.textContent = 'Connection check: ready';
    }
  }

  async checkPlayerConnection() {
    const ping = document.getElementById('network-ping');
    const client = this.game.multiplayerClient;
    if (!ping || this.playerPingInFlight || !this.game.networkRoom) return;
    if (typeof client?.ping !== 'function') { ping.textContent = 'Connection check: unavailable'; return; }
    this.playerPingInFlight = true;
    ping.textContent = 'Checking connection…';
    try {
      const latency = await client.ping();
      if (this.playerListHeld || this.playerListPinned) ping.textContent = `Connection: ${latency} ms round trip`;
    } catch {
      if (this.playerListHeld || this.playerListPinned) ping.textContent = 'Connection: reconnect required';
    } finally { this.playerPingInFlight = false; }
  }

  onKeyUp(e) {
    if (e.code !== 'Tab') return;
    this.playerListHeld = false;
    this.updateNetworkPlayerList();
  }

  notify(message, duration = 2400) {
    if (!this.toastEl) return;
    clearTimeout(this._toastTimer);
    this.toastEl.textContent = message;
    this.toastEl.style.opacity = '1';
    this._toastTimer = setTimeout(() => {
      if (this.toastEl) this.toastEl.style.opacity = '0';
    }, duration);
  }

  initPlayerPreview(canvas) {
    if (!canvas) return;
    try {
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
      renderer.setPixelRatio(1);
      renderer.setSize(120, 176, false);
      renderer.setClearColor(0x080808, 1);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x080808);
      const camera = new THREE.PerspectiveCamera(32, 120 / 176, 0.1, 20);
      camera.position.set(0, 1.05, 4.1); camera.lookAt(0, 1.05, 0);
      const avatar = new THREE.Group(); scene.add(avatar);
      const part = (w, h, d, color, x, y, z) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color }));
        mesh.position.set(x, y, z); avatar.add(mesh); return mesh;
      };
      // A small, original block-character preview, built from voxel shapes.
      part(.48, .68, .27, 0x167f9c, 0, 1.02, 0); // tunic
      part(.235, .71, .25, 0x253b83, -.13, .325, 0); // left leg
      part(.235, .71, .25, 0x253b83, .13, .325, 0); // right leg
      part(.19, .68, .23, 0xc78d67, -.36, 1.02, 0); // arms
      part(.19, .68, .23, 0xc78d67, .36, 1.02, 0);
      part(.47, .47, .47, 0xc78d67, 0, 1.62, 0); // head
      part(.475, .12, .48, 0x513927, 0, 1.91, 0); // hair cap
      part(.13, .045, .025, 0xeee7d5, -.105, 1.66, .247); // eyes
      part(.13, .045, .025, 0xeee7d5, .105, 1.66, .247);
      part(.055, .055, .012, 0x3c74a6, -.105, 1.66, .264);
      part(.055, .055, .012, 0x3c74a6, .105, 1.66, .264);
      this.playerPreviewRenderer = renderer;
      this.playerPreviewScene = scene; this.playerPreviewCamera = camera; this.playerPreviewAvatar = avatar;
      this.renderPlayerPreview();
      canvas.addEventListener('pointermove', event => {
        const rect = canvas.getBoundingClientRect();
        if (rect.width) avatar.rotation.y = Math.max(-1.25, Math.min(1.25, ((event.clientX - rect.left) / rect.width - .5) * 2.5));
        this.renderPlayerPreview();
      });
      canvas.addEventListener('pointerleave', () => { avatar.rotation.y = 0; this.renderPlayerPreview(); });
    } catch {
      // Keep the inventory usable on browsers without a second WebGL context.
      canvas.setAttribute('aria-label', 'Player preview unavailable on this device');
    }
  }

  renderPlayerPreview() {
    if (this.playerPreviewRenderer && this.playerPreviewScene && this.playerPreviewCamera) {
      this.playerPreviewRenderer.render(this.playerPreviewScene, this.playerPreviewCamera);
    }
  }

  buildTooltip() {
    const tip = document.createElement('div');
    tip.className = 'item-tooltip';
    tip.id = 'item-tooltip';
    tip.style.display = 'none';
    this.root.appendChild(tip);
    this.tooltipEl = tip;
  }

  positionTooltip(x, y) {
    if (!this.tooltipEl) return;
    this.tooltipEl.style.left = Math.min(window.innerWidth - 180, x + 14) + 'px';
    this.tooltipEl.style.top = Math.max(8, y - 34) + 'px';
  }

  showSlotTooltip(stack) {
    if (!this.tooltipEl) return;
    if (!stack) {
      this.tooltipEl.style.display = 'none';
      return;
    }
    const name = itemName(stack.id);
    const def = ITEMS[stack.id];
    const meta = [];
    if (def?.food) meta.push(`Heals ${(def.food / 2).toFixed(def.food % 2 ? 1 : 0)} ♥`);
    if (def?.defense) meta.push(`+${def.defense} Armor`);
    if (def?.damage) meta.push(`${def.damage} Attack Damage`);
    if (def?.durability) meta.push(`Durability: ${Math.max(1, def.durability - (stack.damage || 0))}/${def.durability}`);
    this.tooltipEl.innerHTML = `<div class="tt-name">${name}</div>` +
      (meta.length ? `<div class="tt-sub">${meta.join(' · ')}</div>` : '');
    this.tooltipEl.style.display = 'block';
    this.positionTooltip(this._mouseX, this._mouseY);
  }

  hideTooltip() {
    if (this.tooltipEl) this.tooltipEl.style.display = 'none';
  }

  bindSlotHover(slotEl, getStackFn) {
    slotEl.addEventListener('mouseenter', () => {
      if (this.mode === 'game' || this.mode === 'title') return;
      this.showSlotTooltip(getStackFn());
    });
    slotEl.addEventListener('mouseleave', () => this.hideTooltip());
  }

  bindBackdropDrop(screenEl) {
    screenEl.addEventListener('mousedown', (e) => {
      if (e.target !== screenEl) return;
      const p = this.game.player;
      if (!p.cursorStack) return;
      e.preventDefault();
      if (e.button === 2) {
        this.game.dropItem?.({ id: p.cursorStack.id, count: 1, damage: p.cursorStack.damage || 0 });
        p.cursorStack.count--;
        if (p.cursorStack.count <= 0) p.cursorStack = null;
      } else {
        this.game.dropItem?.({ ...p.cursorStack });
        p.cursorStack = null;
      }
      this.refresh();
      this.game.refreshContainers?.();
    });
    screenEl.addEventListener('contextmenu', e => e.preventDefault());
  }

  // ---------- panels (inventory / crafting / pause / death) ----------
  buildPanels() {
    const inv = document.createElement('div');
    inv.className = 'screen panel-screen';
    inv.id = 'inventory-screen';
    inv.style.display = 'none';
    inv.innerHTML = `
      <div class="panel inv-panel">
        <div class="inv-top-row">
          <div class="armor-section" id="armor-section">
            <div class="armor-layout"><div class="armor-grid" id="armor-grid"></div>
              <div class="player-preview"><canvas id="player-preview-canvas" data-player-preview="rotating" width="120" height="176" aria-label="Player model preview; move the pointer to rotate"></canvas></div></div>
          </div>
          <div class="craft-section">
            <div class="inv-title" id="craft-title">Crafting</div>
            <div class="craft-area">
              <div class="craft-grid" id="craft-grid"></div>
              <div class="craft-arrow">→</div>
              <div class="slot craft-out" id="craft-out"></div>
            </div>
          </div>
        </div>
        <div class="inv-title inventory-label">Inventory</div>
        <div class="inv-main" id="inv-main"></div>
        <div class="inv-hotbar" id="inv-hotbar"></div>
      </div>
    `;
    this.root.appendChild(inv);
    this.initPlayerPreview(inv.querySelector('#player-preview-canvas'));
    this.bindBackdropDrop(inv);

    // pause
    const pause = document.createElement('div');
    pause.className = 'screen pause-screen';
    pause.id = 'pause-screen';
    pause.style.display = 'none';
    pause.innerHTML = `
      <div class="pause-inner">
        <h2>Game menu</h2>
        <button class="btn btn-big" id="btn-back">Back to game</button>
        <button class="btn" id="btn-help-pause">How to Play</button>
        <button class="btn" id="btn-options2">Options...</button>
        <button class="btn" id="btn-respawn">Respawn</button>
        ${this.game.saveGame ? '<button class="btn" id="btn-save-now">Save World Now</button>' : ''}
        ${this.game.saveAndQuit ? '<button class="btn" id="btn-save-quit">Save & Quit to Title</button>' : ''}
        <div class="pause-hint">Beta 1.7.3 — no hunger, no sprint. Eat food or cake to heal!</div>
      </div>
    `;
    this.root.appendChild(pause);
    pause.querySelector('#btn-back').addEventListener('click', () => {
      this.game.audio.click();
      this.setMode('game');
    });
    pause.querySelector('#btn-help-pause').addEventListener('click', event => this.showHelp(event.currentTarget));
    pause.querySelector('#btn-options2').addEventListener('click', () => {
      this.game.audio.click();
      this.showOptions();
    });
    pause.querySelector('#btn-respawn').addEventListener('click', () => {
      this.game.audio.click();
      this.game.respawn();
      this.setMode('game');
    });
    pause.querySelector('#btn-save-now')?.addEventListener('click', () => {
      this.game.audio.click();
      const saved = this.game.saveGame?.();
      this.notify(saved ? 'World saved in this browser.' : 'World saves are unavailable during multiplayer.');
    });
    const saveQuitBtn = pause.querySelector('#btn-save-quit');
    if (saveQuitBtn) {
      saveQuitBtn.addEventListener('click', () => {
        this.game.audio.click();
        this.game.saveAndQuit?.();
      });
    }

    const help = document.createElement('div');
    help.id = 'help-screen';
    help.className = 'screen help-screen';
    help.style.display = 'none';
    help.setAttribute('role', 'dialog');
    help.setAttribute('aria-modal', 'true');
    help.setAttribute('aria-labelledby', 'help-title');
    help.setAttribute('aria-describedby', 'help-description');
    help.innerHTML = `
      <section class="help-card">
        <header class="help-heading"><div><h2 id="help-title">How to Play</h2><p id="help-description">A quick guide to getting started in AiSlopcraft.</p></div><button class="btn" id="help-close" type="button">Done</button></header>
        <div class="help-columns">
          <section><h3>Your first day</h3><ol>
            <li>Choose <strong>Singleplayer</strong>, then create a Survival world.</li>
            <li>Look around, break nearby trees, and turn logs into planks in your inventory.</li>
            <li>Make a crafting table, tools, and a small shelter before night.</li>
            <li>Explore for food and resources. This Beta-inspired game has <strong>no hunger or sprinting</strong>; food heals when used.</li>
          </ol></section>
          <section><h3>Controls</h3><dl class="help-controls">
            <div><dt>W A S D</dt><dd>Move</dd></div><div><dt>Mouse</dt><dd>Look around · click the game to capture</dd></div>
            <div><dt>Space / Shift</dt><dd>Jump / sneak</dd></div><div><dt>Left / right click</dt><dd>Mine or attack / place or use</dd></div>
            <div><dt>E</dt><dd>Inventory · close containers</dd></div><div><dt>1–9 / wheel</dt><dd>Select a hotbar slot</dd></div>
            <div><dt>Q / Ctrl+Q</dt><dd>Drop one item / drop a stack</dd></div><div><dt>Esc</dt><dd>Pause or close a screen</dd></div>
            <div><dt>F3 / F1</dt><dd>Debug details / hide HUD</dd></div>
            <div><dt>Tab / T</dt><dd>Multiplayer player list / chat</dd></div>
            <div><dt>Touch move/look</dt><dd>Left joystick to move · drag the open center to look</dd></div>
            <div><dt>Touch actions</dt><dd>Hold Mine to break · tap Use · hold Jump or Sneak</dd></div>
            <div><dt>Touch menu</dt><dd>Inventory, hotbar, multiplayer chat and Pause buttons</dd></div>
          </dl></section>
          <section><h3>Useful tips</h3><ul>
            <li>Use <strong>Options → Controls</strong> to change key bindings and mouse sensitivity.</li>
            <li>Use <strong>Options → Video Settings</strong> to lower render distance or render scale if performance is slow.</li>
            <li>Pause to save your local world. <strong>World Saves...</strong> exports a portable backup.</li>
            <li>In multiplayer, each player keeps their own inventory. Rooms are temporary and close if the host leaves or the server restarts.</li>
          </ul></section>
        </div>
        <p class="help-footnote">On touchscreens, use the virtual joystick to move and drag the open center to look. Hold Mine until the block breaks or an attack lands; Use acts on press. Landscape orientation leaves more room for play. Local worlds autosave; multiplayer rooms are temporary.</p>
      </section>`;
    this.root.appendChild(help);
    this.helpScreen = help;
    this.helpCloseButton = help.querySelector('#help-close');
    this.helpReturnMode = null;
    this.helpReturnFocus = null;
    this.helpCloseButton.addEventListener('click', () => this.closeHelp());
    help.addEventListener('click', event => { if (event.target === help) this.closeHelp(); });

    // death
    const death = document.createElement('div');
    death.className = 'screen death-screen';
    death.id = 'death-screen';
    death.style.display = 'none';
    death.innerHTML = `
      <h1 class="death-title">Game over!</h1>
      <div class="death-score">Score: <span id="death-score">0</span></div>
      <button class="btn btn-big" id="btn-respawn2">Respawn</button>
    `;
    this.root.appendChild(death);
    death.querySelector('#btn-respawn2').addEventListener('click', () => {
      this.game.audio.click();
      this.game.respawn();
      this.setMode('game');
    });

    this.buildInventoryGrids();
  }

  buildInventoryGrids() {
    const armorGrid = document.getElementById('armor-grid');
    armorGrid.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const s = document.createElement('div');
      s.className = 'slot armor-slot';
      s.dataset.armor = i;
      s.dataset.placeholder = `<span class="slot-placeholder">${ARMOR_HINTS[i]}</span>`;
      s.innerHTML = s.dataset.placeholder;
      s.addEventListener('mousedown', (e) => this.slotClick(e, 'armor', i));
      s.addEventListener('contextmenu', e => e.preventDefault());
      this.bindSlotHover(s, () => this.game.player.armor?.[i]);
      armorGrid.appendChild(s);
    }

    const craftGrid = document.getElementById('craft-grid');
    craftGrid.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('div');
      s.className = 'slot craft-slot';
      s.dataset.craft = i;
      s.addEventListener('mousedown', (e) => this.slotClick(e, 'craft', i));
      s.addEventListener('contextmenu', e => e.preventDefault());
      this.bindSlotHover(s, () => this.craftSlots[i]);
      craftGrid.appendChild(s);
    }

    const invMain = document.getElementById('inv-main');
    invMain.innerHTML = '';
    for (let i = 9; i < 36; i++) {
      const s = document.createElement('div');
      s.className = 'slot';
      s.dataset.inv = i;
      s.addEventListener('mousedown', (e) => this.slotClick(e, 'inv', i));
      s.addEventListener('contextmenu', e => e.preventDefault());
      this.bindSlotHover(s, () => this.game.player.inventory[i]);
      invMain.appendChild(s);
    }

    const invHot = document.getElementById('inv-hotbar');
    invHot.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('div');
      s.className = 'slot';
      s.dataset.inv = i;
      s.addEventListener('mousedown', (e) => this.slotClick(e, 'inv', i));
      s.addEventListener('contextmenu', e => e.preventDefault());
      this.bindSlotHover(s, () => this.game.player.inventory[i]);
      invHot.appendChild(s);
    }

    const out = document.getElementById('craft-out');
    out.addEventListener('mousedown', (e) => this.slotClick(e, 'out', 0));
    out.addEventListener('contextmenu', e => e.preventDefault());
    this.bindSlotHover(out, () => {
      const r = matchRecipe(this.craftSlots, this.craftSize);
      return r ? { id: r.id, count: r.count, damage: 0 } : null;
    });
  }

  _transferToRange(stack, slotsArray, start, end) {
    let remaining = stack.count;
    const limit = stackLimit(stack);
    if (limit > 1) {
      for (let i = start; i < end && remaining > 0; i++) {
        const s = slotsArray[i];
        if (!s || !canStack(s, stack) || s.count >= limit) continue;
        const add = Math.min(limit - s.count, remaining);
        s.count += add;
        remaining -= add;
      }
    }
    for (let i = start; i < end && remaining > 0; i++) {
      if (slotsArray[i]) continue;
      const add = Math.min(limit, remaining);
      slotsArray[i] = { id: stack.id, count: add, damage: stack.damage || 0 };
      remaining -= add;
    }
    return stack.count - remaining;
  }

  _handleShiftClickInv(index) {
    const player = this.game.player;
    const s = player.inventory[index];
    if (!s) return;

    // 1. If chest is open, move into chest
    if (this.mode === 'chest' && this.game.openChestData?.slots) {
      const moved = this._transferToRange(s, this.game.openChestData.slots, 0, 27);
      if (moved > 0) {
        s.count -= moved;
        if (s.count <= 0) player.inventory[index] = null;
        return;
      }
    }

    // 2. If furnace is open, move smeltable to input or fuel to fuel
    if (this.mode === 'furnace' && this.game.openFurnaceData?.f) {
      const f = this.game.openFurnaceData.f;
      if (smeltResult(s.id) != null) {
        if (!f.input) {
          f.input = { ...s };
          player.inventory[index] = null;
          return;
        } else if (canStack(f.input, s) && f.input.count < stackLimit(f.input)) {
          const add = Math.min(stackLimit(f.input) - f.input.count, s.count);
          f.input.count += add;
          s.count -= add;
          if (s.count <= 0) player.inventory[index] = null;
          return;
        }
      }
      if (FUEL_TIMES[s.id]) {
        if (!f.fuel) {
          f.fuel = { ...s };
          player.inventory[index] = null;
          return;
        } else if (canStack(f.fuel, s) && f.fuel.count < stackLimit(f.fuel)) {
          const add = Math.min(stackLimit(f.fuel) - f.fuel.count, s.count);
          f.fuel.count += add;
          s.count -= add;
          if (s.count <= 0) player.inventory[index] = null;
          return;
        }
      }
    }

    // 3. If armor item in inventory screen and armor slot empty, equip!
    const armorSlot = ITEMS[s.id]?.armorSlot;
    if (this.mode === 'inventory' && armorSlot != null && player.armor && !player.armor[armorSlot]) {
      player.armor[armorSlot] = { ...s, count: 1 };
      s.count--;
      if (s.count <= 0) player.inventory[index] = null;
      return;
    }

    // 4. Toggle between hotbar (0..8) and main inventory (9..35)
    const moved = index < 9
      ? this._transferToRange(s, player.inventory, 9, 36)
      : this._transferToRange(s, player.inventory, 0, 9);
    if (moved > 0) {
      s.count -= moved;
      if (s.count <= 0) player.inventory[index] = null;
    }
  }

  slotClick(e, type, index) {
    e.preventDefault();
    const player = this.game.player;
    const audio = this.game.audio;

    if (type === 'chest' && this.game.openChestData?.slots) {
      const slots = this.game.openChestData.slots;
      const stack = slots[index];
      if (e.shiftKey && stack) {
        const moved = this._transferToRange(stack, player.inventory, 0, 36);
        stack.count -= moved;
        if (stack.count <= 0) slots[index] = null;
      } else {
        const holder = { input: stack };
        const result = interactWithFurnaceSlot(holder, 'input', player.cursorStack, e.button);
        slots[index] = holder.input;
        player.cursorStack = result.cursorStack;
      }
      this.showSlotTooltip(slots[index]);
    } else if (type === 'inv') {
      if (e.shiftKey) {
        this._handleShiftClickInv(index);
        this.refresh();
        this.showSlotTooltip(player.inventory[index]);
        return;
      }
      const s = player.inventory[index];
      if (e.button === 2) {
        if (player.cursorStack && !s) {
          player.inventory[index] = { ...player.cursorStack, count: 1 };
          player.cursorStack.count--;
          if (player.cursorStack.count <= 0) player.cursorStack = null;
        } else if (!player.cursorStack && s) {
          const half = Math.ceil(s.count / 2);
          player.cursorStack = { ...s, count: half };
          s.count -= half;
          if (s.count <= 0) player.inventory[index] = null;
        } else if (player.cursorStack && canStack(s, player.cursorStack)) {
          if (s.count < stackLimit(s)) { s.count++; player.cursorStack.count--; }
          if (player.cursorStack.count <= 0) player.cursorStack = null;
        }
      } else {
        if (player.cursorStack && !s) {
          player.inventory[index] = player.cursorStack;
          player.cursorStack = null;
        } else if (!player.cursorStack && s) {
          player.cursorStack = s;
          player.inventory[index] = null;
        } else if (player.cursorStack && s) {
          if (canStack(s, player.cursorStack)) {
            const add = Math.min(stackLimit(s) - s.count, player.cursorStack.count);
            s.count += add;
            player.cursorStack.count -= add;
            if (player.cursorStack.count <= 0) player.cursorStack = null;
          } else {
            player.inventory[index] = player.cursorStack;
            player.cursorStack = s;
          }
        }
      }
      this.showSlotTooltip(player.inventory[index]);
    } else if (type === 'armor') {
      if (!player.armor) player.armor = new Array(4).fill(null);
      const s = player.armor[index];
      if (e.shiftKey && s) {
        const moved = this._transferToRange(s, player.inventory, 0, 36);
        if (moved > 0) player.armor[index] = null;
      } else if (!player.cursorStack && s) {
        player.cursorStack = s;
        player.armor[index] = null;
      } else if (player.cursorStack && ITEMS[player.cursorStack.id]?.armorSlot === index) {
        if (!s) {
          player.armor[index] = { ...player.cursorStack, count: 1 };
          player.cursorStack.count--;
          if (player.cursorStack.count <= 0) player.cursorStack = null;
        } else if (player.cursorStack.count === 1) {
          player.armor[index] = player.cursorStack;
          player.cursorStack = s;
        }
      }
      this.showSlotTooltip(player.armor[index]);
    } else if (type === 'craft') {
      const s = this.craftSlots[index];
      if (e.shiftKey && s) {
        const moved = this._transferToRange(s, player.inventory, 0, 36);
        if (moved > 0) {
          s.count -= moved;
          if (s.count <= 0) this.craftSlots[index] = null;
        }
      } else if (e.button === 2) {
        if (player.cursorStack && !s) {
          this.craftSlots[index] = { ...player.cursorStack, count: 1 };
          player.cursorStack.count--;
          if (player.cursorStack.count <= 0) player.cursorStack = null;
        } else if (!player.cursorStack && s) {
          const half = Math.ceil(s.count / 2);
          player.cursorStack = { ...s, count: half };
          s.count -= half;
          if (s.count <= 0) this.craftSlots[index] = null;
        } else if (player.cursorStack && canStack(s, player.cursorStack) && s.count < stackLimit(s)) {
          s.count++; player.cursorStack.count--;
          if (player.cursorStack.count <= 0) player.cursorStack = null;
        }
      } else {
        if (player.cursorStack && !s) {
          this.craftSlots[index] = player.cursorStack;
          player.cursorStack = null;
        } else if (!player.cursorStack && s) {
          player.cursorStack = s;
          this.craftSlots[index] = null;
        } else if (player.cursorStack && s) {
          if (canStack(s, player.cursorStack)) {
            const add = Math.min(stackLimit(s) - s.count, player.cursorStack.count);
            s.count += add;
            player.cursorStack.count -= add;
            if (player.cursorStack.count <= 0) player.cursorStack = null;
          } else {
            this.craftSlots[index] = player.cursorStack;
            player.cursorStack = s;
          }
        }
      }
      this.showSlotTooltip(this.craftSlots[index]);
    } else if (type === 'out') {
      if (e.shiftKey) {
        // Batch-craft directly into inventory
        let craftedAny = false;
        for (let iter = 0; iter < 64; iter++) {
          const result = matchRecipe(this.craftSlots, this.craftSize);
          if (!result) break;
          if (player.addItem && !player.addItem(result.id, result.count, 0)) break;
          for (let i = 0; i < 9; i++) {
            const s = this.craftSlots[i];
            if (s) {
              s.count--;
              if (s.count <= 0) this.craftSlots[i] = s.id === 335 ? { id: 325, count: 1, damage: 0 } : null;
              else if (s.id === 335) this.returnStack({ id: 325, count: 1, damage: 0 });
            }
          }
          craftedAny = true;
        }
        if (craftedAny) audio.pop();
      } else {
        const result = matchRecipe(this.craftSlots, this.craftSize);
        if (result) {
          const outputStack = { id: result.id, count: result.count, damage: 0 };
          const canReceive = !player.cursorStack ||
            (canStack(player.cursorStack, outputStack) && player.cursorStack.count + result.count <= stackLimit(player.cursorStack));
          if (canReceive) {
            if (player.cursorStack) player.cursorStack.count += result.count;
            else player.cursorStack = outputStack;
            for (let i = 0; i < 9; i++) {
              const s = this.craftSlots[i];
              if (s) {
                s.count--;
                if (s.count <= 0) this.craftSlots[i] = s.id === 335 ? { id: 325, count: 1, damage: 0 } : null;
                else if (s.id === 335) this.returnStack({ id: 325, count: 1, damage: 0 });
              }
            }
            audio.pop();
          }
        }
      }
    }
    this.refresh();
    if (this.mode === 'chest' || this.mode === 'furnace') this.game.syncSharedState?.();
  }

  showHelp(opener = document.activeElement) {
    if (!this.helpScreen || this.helpScreen.style.display === 'flex') return;
    this.helpReturnMode = this.mode;
    this.helpReturnFocus = opener?.isConnected ? opener : null;
    this.helpScreen.style.display = 'flex';
    window.uiPause = true;
    document.exitPointerLock?.();
    this.helpCloseButton.focus();
  }

  closeHelp() {
    if (!this.helpScreen || this.helpScreen.style.display === 'none') return;
    this.helpScreen.style.display = 'none';
    const returnMode = this.helpReturnMode;
    const returnFocus = this.helpReturnFocus;
    this.helpReturnMode = null;
    this.helpReturnFocus = null;
    window.uiPause = this.mode !== 'game';
    if (returnMode === 'game') this.setMode('game');
    else if (returnFocus?.isConnected) returnFocus.focus();
  }

  onKey(e) {
    if (this.multiplayerScreen?.style.display === 'flex') {
      if (e.code === 'Escape') {
        e.preventDefault();
        this.closeMultiplayer();
      } else if (e.code === 'Tab') {
        const focusable = [...this.multiplayerScreen.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), summary')]
          .filter(element => !element.closest('[hidden]') && (!element.closest('details:not([open])') || element.tagName === 'SUMMARY'));
        if (focusable.length) {
          const first = focusable[0], last = focusable.at(-1);
          if (e.shiftKey && (document.activeElement === first || !this.multiplayerScreen.contains(document.activeElement))) {
            e.preventDefault(); last.focus();
          } else if (!e.shiftKey && (document.activeElement === last || !this.multiplayerScreen.contains(document.activeElement))) {
            e.preventDefault(); first.focus();
          }
        }
      }
      return;
    }
    if (this.helpScreen?.style.display === 'flex') {
      if (e.code === 'Escape') {
        e.preventDefault();
        this.closeHelp();
      } else if (e.code === 'Tab') {
        const focusable = [...this.helpScreen.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')];
        if (focusable.length) {
          const first = focusable[0], last = focusable.at(-1);
          if (e.shiftKey && (document.activeElement === first || !this.helpScreen.contains(document.activeElement))) {
            e.preventDefault(); last.focus();
          } else if (!e.shiftKey && (document.activeElement === last || !this.helpScreen.contains(document.activeElement))) {
            e.preventDefault(); first.focus();
          }
        }
      }
      return;
    }
    if (e.target?.id === 'network-chat-input') {
      if (e.code === 'Escape') {
        e.preventDefault();
        this.networkPanel.querySelector('#network-chat-form').style.display = 'none';
        this.networkPanel.querySelector('#network-chat-open').style.display = 'block';
        e.target.blur();
        if (this.mode === 'game' && !this.touchEnabled) document.getElementById('game-canvas')?.requestPointerLock?.();
      }
      return;
    }
    if (e.code === 'Tab' && this.mode === 'game' && this.game.networkRoom) {
      e.preventDefault();
      this.playerListHeld = true;
      this.updateNetworkPlayerList();
      return;
    }
    if (e.code === 'KeyT' && this.mode === 'game' && this.game.networkRoom) {
      e.preventDefault();
      this.openNetworkChat();
      return;
    }
    if (e.code === (this.game.settings?.keys ? this.game.settings.keys.inventory : 'KeyE')) {
      if (this.mode === 'game') {
        e.preventDefault();
        this.setMode('inventory');
      } else if (this.mode === 'inventory' || this.mode === 'crafting' || this.mode === 'furnace' || this.mode === 'chest') {
        e.preventDefault();
        this.setMode('game');
      }
    }
    if (e.code === (this.game.settings?.keys ? this.game.settings.keys.drop : 'KeyQ') && this.mode === 'game' && !this.game.player.dead) {
      e.preventDefault();
      this.game.dropHeld?.(e.ctrlKey || e.metaKey);
    }
    if (e.code === 'Escape') {
      if (this.optionsMenu) return;
      if (this.mode === 'game') {
        this.setMode('pause');
      } else if (this.mode !== 'title' && this.mode !== 'death') {
        this.setMode('game');
      }
    }
    if (e.code === 'F3') {
      e.preventDefault();
      this.showDebug = !this.showDebug;
    }
    if (e.code === 'F1') {
      e.preventDefault();
      this.showHud = !this.showHud;
      const hud = document.getElementById('hud');
      if (hud && this.mode !== 'title') hud.style.display = this.showHud ? 'block' : 'none';
    }
  }

  hide(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  returnStack(stack) {
    if (!stack || !stack.count) return;
    const player = this.game.player;
    let inserted = 0;
    if (typeof player.insertItem === 'function') {
      inserted = player.insertItem(stack.id, stack.count, stack.damage || 0);
    } else {
      const result = player.addItem?.(stack.id, stack.count, stack.damage || 0);
      inserted = result === false ? 0 : stack.count;
    }
    const remainder = stack.count - inserted;
    if (remainder > 0 && this.game.dropItem) {
      this.game.dropItem({ ...stack, count: remainder });
    } else if (remainder > 0) {
      player.overflowStack = { ...stack, count: remainder };
    }
  }

  setMode(mode) {
    this.mode = mode;
    if (this.touchControlsEl) this.touchControlsEl.style.display = this.touchEnabled && mode === 'game' ? 'block' : 'none';
    if (this.touchPanelReturnEl) this.touchPanelReturnEl.hidden = !this.touchEnabled || !['inventory', 'crafting', 'furnace', 'chest'].includes(mode);
    if (mode !== 'game') {
      this.releaseTouchInputs();
      this.playerListHeld = false;
      this.playerListPinned = false;
      this.updateNetworkPlayerList();
    }
    if (mode === 'inventory') this.craftSize = 2;
    else if (mode === 'crafting') this.craftSize = 3;

    this.hideTooltip();

    const hud = document.getElementById('hud');
    const inv = document.getElementById('inventory-screen');
    const pause = document.getElementById('pause-screen');
    const death = document.getElementById('death-screen');
    const furnace = document.getElementById('furnace-screen');
    const chest = document.getElementById('chest-screen');
    const title = document.getElementById('title-screen');

    if (title) title.style.display = mode === 'title' ? 'flex' : 'none';
    hud.style.display = mode === 'title' ? 'none' : (this.showHud ? 'block' : 'none');
    inv.style.display = (mode === 'inventory' || mode === 'crafting') ? 'flex' : 'none';
    pause.style.display = mode === 'pause' ? 'flex' : 'none';
    death.style.display = mode === 'death' ? 'flex' : 'none';
    if (furnace) furnace.style.display = mode === 'furnace' ? 'flex' : 'none';
    if (chest) chest.style.display = mode === 'chest' ? 'flex' : 'none';

    const armorSection = document.getElementById('armor-section');
    if (armorSection) armorSection.style.display = mode === 'crafting' ? 'none' : 'block';
    const craftTitle = document.getElementById('craft-title');
    if (craftTitle) craftTitle.textContent = mode === 'crafting' ? 'Crafting Table' : 'Crafting';

    window.uiPause = mode !== 'game';

    if (mode === 'game') {
      const p = this.game.player;
      if (p.cursorStack) { this.returnStack(p.cursorStack); p.cursorStack = null; }
      for (let i = 0; i < 9; i++) {
        if (this.craftSlots[i]) {
          this.returnStack(this.craftSlots[i]);
          this.craftSlots[i] = null;
        }
      }
      if (!p.touchSupported && !p.pointerLocked && !p.dead) {
        document.getElementById('game-canvas')?.requestPointerLock?.();
      }
    } else {
      document.exitPointerLock?.();
    }
    this.refresh();
  }

  showDeath(score) {
    this.setMode('death');
    document.getElementById('death-score').textContent = score;
  }

  // ---------- rendering ----------
  refresh() {
    const player = this.game.player;
    // hotbar
    const slots = this.hotbarEl.children;
    for (let i = 0; i < 9; i++) {
      this.renderSlot(slots[i], player.inventory[i], i === player.hotbarIndex);
      const wantClass = 'slot hotbar-slot' + (i === player.hotbarIndex ? ' selected' : '');
      if (slots[i].className !== wantClass) slots[i].className = wantClass;
    }

    // hearts + armor + oxygen
    this.renderHearts();

    // Classic selected-slot tooltip: refresh when slot index or held item id changes
    const held = player.inventory[player.hotbarIndex];
    const heldSig = `${player.hotbarIndex}:${held ? held.id : 0}`;
    if (this._lastHeldSig !== heldSig) {
      const slotChanged = this._lastHotbarIndex !== player.hotbarIndex;
      this._lastHotbarIndex = player.hotbarIndex;
      this._lastHeldSig = heldSig;
      clearTimeout(this._nameTimer);
      if (held && (slotChanged || held.id)) {
        this.heldNameEl.textContent = itemName(held.id);
        this.heldNameEl.style.opacity = 1;
        this._nameTimer = setTimeout(() => { this.heldNameEl.style.opacity = 0; }, 2000);
      } else {
        this.heldNameEl.textContent = '';
        this.heldNameEl.style.opacity = 0;
      }
    }

    // inventory / crafting panel
    if (this.mode === 'inventory' || this.mode === 'crafting') {
      const craftGrid = document.getElementById('craft-grid');
      const size = this.craftSize;
      craftGrid.style.setProperty('--craft-size', size);
      craftGrid.style.gridTemplateColumns = `repeat(${size}, 44px)`;
      for (let i = 0; i < 9; i++) {
        const el = craftGrid.children[i];
        if (i < size * size) {
          if (el.style.display !== 'flex') el.style.display = 'flex';
          this.renderSlot(el, this.craftSlots[i]);
        } else if (el.style.display !== 'none') {
          el.style.display = 'none';
        }
      }
      const outEl = document.getElementById('craft-out');
      const result = matchRecipe(this.craftSlots, size);
      this.renderSlot(outEl, result ? { id: result.id, count: result.count } : null);

      if (this.mode === 'inventory') {
        const armorGrid = document.getElementById('armor-grid');
        if (armorGrid) {
          for (let i = 0; i < 4; i++) {
            this.renderSlot(armorGrid.children[i], player.armor?.[i] || null);
          }
        }
      }

      document.querySelectorAll('#inv-main .slot, #inv-hotbar .slot').forEach(el => {
        const idx = +el.dataset.inv;
        this.renderSlot(el, player.inventory[idx]);
      });
    }

    // cursor stack follow
    let cursorEl = document.getElementById('cursor-item');
    if (player.cursorStack) {
      if (!cursorEl) {
        cursorEl = document.createElement('div');
        cursorEl.id = 'cursor-item';
        cursorEl.className = 'cursor-item';
        cursorEl.style.left = (this._mouseX - 18) + 'px';
        cursorEl.style.top = (this._mouseY - 18) + 'px';
        this.root.appendChild(cursorEl);
      }
      this.renderSlot(cursorEl, player.cursorStack);
    } else if (cursorEl) {
      cursorEl.remove();
    }
  }

  renderHearts() {
    const player = this.game.player;
    const hp = player.health;
    if (this._lastHp !== hp) {
      this._lastHp = hp;
      let html = '';
      for (let i = 0; i < 10; i++) {
        const v = hp - i * 2;
        if (v >= 2) html += '<span class="heart full">♥</span>';
        else if (v >= 1) html += '<span class="heart half">♥</span>';
        else html += '<span class="heart empty">♡</span>';
      }
      this.heartsEl.innerHTML = html;
    }

    // Armor shields (Beta 1.7.3 shows armor icons only when armor > 0)
    const ap = player.armorPoints || 0;
    if (this.armorBarEl && this._lastAp !== ap) {
      this._lastAp = ap;
      if (ap > 0) {
        this.armorBarEl.style.display = 'flex';
        let aHtml = '';
        for (let i = 0; i < 10; i++) {
          const v = ap - i * 2;
          if (v >= 2) aHtml += '<span class="armor-icon full">◆</span>';
          else if (v >= 1) aHtml += '<span class="armor-icon half">◈</span>';
          else aHtml += '<span class="armor-icon empty">◇</span>';
        }
        this.armorBarEl.innerHTML = aHtml;
      } else {
        this.armorBarEl.style.display = 'none';
      }
    }

    // Oxygen bubbles
    const wb = document.getElementById('water-bar');
    const airBucket = player.air < 300 ? Math.ceil(player.air / 15) : 20;
    if (wb && this._lastAirBucket !== airBucket) {
      this._lastAirBucket = airBucket;
      if (player.air < 300) {
        wb.style.display = 'flex';
        let w = '';
        for (let i = 0; i < 10; i++) {
          const v = player.air / 30 - i;
          w += v >= 1 ? '<span class="bubble full">●</span>' : v > 0 ? '<span class="bubble half">●</span>' : '<span class="bubble empty">○</span>';
        }
        wb.innerHTML = w;
      } else {
        wb.style.display = 'none';
      }
    }
  }

  renderSlot(el, stack) {
    if (!el) return;
    const key = stack ? `${stack.id}:${stack.count}:${stack.damage || 0}` : 'empty';
    const hasClass = el.classList.contains('has-item');
    if (el._slotKey === key && (stack ? hasClass : !hasClass)) return;
    el._slotKey = key;

    if (!stack) {
      el.innerHTML = el.dataset.placeholder || '';
      el.classList.remove('has-item');
      return;
    }
    el.classList.add('has-item');
    const isB = isBlock(stack.id);
    const icon = isB
      ? `<canvas class="block-icon" width="32" height="32" data-block="${stack.id}"></canvas>`
      : `<canvas class="item-icon" width="32" height="32" data-item="${stack.id}"></canvas>`;
    let dmg = '';
    if (stack.damage) {
      const maxDur = ITEMS[stack.id]?.durability || 100;
      const pct = Math.max(0, Math.min(100, 100 - (stack.damage / maxDur) * 100));
      const col = pct > 55 ? '#44dd44' : pct > 25 ? '#e4cc22' : '#e03030';
      dmg = `<div class="durability-bg"><div class="durability" style="width:${pct}%;background:${col}"></div></div>`;
    }
    el.innerHTML = icon + (stack.count > 1 ? `<span class="count">${stack.count}</span>` : '') + dmg;
    this.drawIcon(el.querySelector('canvas'), stack.id);
  }

  drawIcon(canvas, id) {
    if (!canvas || canvas._drawn === id) return;
    canvas._drawn = id;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 32, 32);

    let cached = this._iconCache.get(id);
    if (!cached) {
      cached = document.createElement('canvas');
      cached.width = 32;
      cached.height = 32;
      const cctx = cached.getContext('2d');
      cctx.imageSmoothingEnabled = false;
      const atlas = this.game.atlasCanvas;
      const itemIcons = this.game.itemIconsCanvas;

      if (id === WOOD_DOOR || id === IRON_DOOR) {
        const idx = id === WOOD_DOOR ? 96 : 95;
        const sx = (idx % 16) * 16, sy = Math.floor(idx / 16) * 16;
        cctx.drawImage(itemIcons, sx, sy, 16, 16, 2, 2, 28, 28);
      } else if (isBlock(id)) {
        const bd = getBlock(id);
        const tiles = bd.tiles || [TILES.stone, TILES.stone, TILES.stone, TILES.stone, TILES.stone, TILES.stone];
        if (bd.cross || bd.render === 'cross' || bd.render === 'torch' || bd.render === 'flat') {
          const t = tiles[2];
          const sx = (t % 16) * 16, sy = Math.floor(t / 16) * 16;
          cctx.drawImage(atlas, sx, sy, 16, 16, 2, 2, 28, 28);
        } else {
          // True 3D isometric cube projection using 2D affine transforms
          const top = tiles[0];
          const left = tiles[2];
          const right = tiles[3] ?? tiles[2];
          const isSlab = bd.render === 'slab';
          const hScale = isSlab ? 0.44 : 0.82;
          const yDrop = isSlab ? 6 : 0;

          const drawFace = (tile, a, b, c, d, e, f, shadeAlpha) => {
            const sx = (tile % 16) * 16, sy = Math.floor(tile / 16) * 16;
            cctx.save();
            cctx.setTransform?.(a, b, c, d, e, f);
            cctx.drawImage(atlas, sx, sy, 16, 16, 0, 0, 16, 16);
            if (shadeAlpha > 0) {
              cctx.fillStyle = `rgba(0,0,0,${shadeAlpha})`;
              cctx.fillRect(0, 0, 16, 16);
            }
            cctx.restore();
          };

          // Top diamond: (16, 2+yDrop) -> right (29, 8.5+yDrop), left (3, 8.5+yDrop)
          drawFace(top, 0.8125, 0.40625, -0.8125, 0.40625, 16, 2 + yDrop, 0);
          // Left face: (3, 8.5+yDrop) -> (16, 15+yDrop) down
          drawFace(left, 0.8125, 0.40625, 0, hScale, 3, 8.5 + yDrop, 0.16);
          // Right front face: (16, 15+yDrop) -> (29, 8.5+yDrop) down
          drawFace(right, 0.8125, -0.40625, 0, hScale, 16, 15 + yDrop, 0.34);
        }
      } else {
        const idx = ITEM_ICON_INDEX[id] ?? 0;
        const sx = (idx % 16) * 16, sy = Math.floor(idx / 16) * 16;
        cctx.drawImage(itemIcons, sx, sy, 16, 16, 0, 0, 32, 32);
      }
      this._iconCache.set(id, cached);
    }

    ctx.drawImage(cached, 0, 0);
  }

  buildDebug() {
    const div = document.createElement('div');
    div.className = 'debug';
    div.id = 'debug';
    div.style.display = 'none';
    this.root.appendChild(div);
    this.debugEl = div;
  }

  updateDebug(info) {
    if (!this.showDebug) {
      if (this.debugEl.style.display !== 'none') this.debugEl.style.display = 'none';
      return;
    }
    this.debugEl.style.display = 'block';
    this.debugEl.innerHTML = info.map(l => `<div>${l}</div>`).join('');
  }

  update() {
    if (this.mode !== 'title' && performance.now() - (this._lastHudUpdate || 0) >= 100) {
      this._lastHudUpdate = performance.now();
      this.refresh();
    }
    const splash = this.splashEl || (this.splashEl = document.querySelector('.splash'));
    if (splash) {
      splash.style.transform = `rotate(${Math.sin(performance.now() / 500) * 4 - 14}deg) scale(${1 + Math.sin(performance.now() / 300) * 0.05})`;
    }
  }
}

// item icon atlas index mapping (matches buildItemIcons layout)
export const ITEM_ICON_INDEX = {
  280: 0,   // stick
  263: 1,   // coal
  264: 5,   // diamond
  265: 3,   // iron ingot
  266: 4,   // gold ingot
  260: 6,   // apple
  322: 7,   // golden apple
  319: 8,   // raw pork
  320: 9,   // cooked pork
  297: 10,  // bread
  296: 11,  // wheat
  295: 12,  // seeds
  287: 13,  // string
  288: 14,  // feather
  289: 15,  // gunpowder
  318: 16,  // flint
  334: 17,  // leather
  337: 18,  // clay ball
  336: 19,  // brick
  338: 77,  // sugar canes item
  339: 20,  // paper
  340: 21,  // book
  281: 22,  // bowl
  282: 23,  // mushroom stew
  325: 24,  // bucket
  326: 25,  // water bucket
  327: 26,  // lava bucket
  359: 27,  // shears
  262: 28,  // arrow
  352: 29,  // bone
  344: 30,  // egg
  332: 31,  // snowball
  353: 32,  // sugar
  360: 33,  // melon
  351: 34,  // lapis lazuli
  331: 35,  // redstone
  259: 36,  // flint&steel
  349: 66,  // raw fish
  350: 67,  // cooked fish
  357: 68,  // cookie
  354: 69,  // cake
  355: 70,  // bed
  358: 71,  // map
  341: 72,  // slimeball
  298: 73, 299: 74, 300: 75, 301: 76, // leather armor
  306: 78, 307: 79, 308: 80, 309: 81, // iron armor
  310: 82, 311: 83, 312: 84, 313: 85, // diamond armor
  314: 86, 315: 87, 316: 88, 317: 89, // gold armor
  348: 91, 367: 90, // glowstone dust, rotten flesh
  323: 61,  // sign
  328: 62,  // minecart
  342: 104, // storage minecart
  343: 105, // powered minecart
  329: 63,  // saddle
  345: 64,  // compass
  346: 65,  // fishing rod
  261: 60,  // bow
  333: 92,  // boat
  335: 93,  // milk bucket
  321: 94,  // painting
  330: 95,  // iron door
  368: 97,  // bone meal
  356: 98,  // redstone repeater
};
// tools: 40 + mat*5 + kind
const toolMap = {
  268: [0, 0], 269: [0, 1], 270: [0, 2], 271: [0, 3], 290: [0, 4],
  272: [1, 0], 273: [1, 1], 274: [1, 2], 275: [1, 3], 291: [1, 4],
  267: [2, 0], 256: [2, 1], 257: [2, 2], 258: [2, 3], 292: [2, 4],
  276: [3, 0], 277: [3, 1], 278: [3, 2], 279: [3, 3], 293: [3, 4],
  283: [4, 0], 284: [4, 1], 285: [4, 2], 286: [4, 3], 294: [4, 4],
};
for (const [id, [m, k]] of Object.entries(toolMap)) {
  ITEM_ICON_INDEX[+id] = m === 4 ? 99 + k : 40 + m * 5 + k;
}

const SPLASHES = [
  'Also try Terraria!', 'Made in Sweden!', '100% pure!', 'May contain nuts!',
  'Better than Prey!', 'More polygons!', 'Sniffer!', 'Woo, beta!',
  'As seen on TV!', 'Awesome!', '110803!', 'Kinda like Minecraft!',
  'Random splash!', 'Made by a robot!', 'Also try Minecraft!', 'Beta 1.7.3!',
  'The Work of Notch!', 'Now with blocks!', 'Water is wet!', 'No hunger bar!',
];
