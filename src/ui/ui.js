// UI: title screen, hotbar, hearts, armor, inventory, crafting table, furnace, chest,
// pause, death screen, F3 debug, hover tooltips, shift-click & 3D isometric icons.
import {
  ITEMS, itemName, getBlock, isBlock, TILES, WOOD_DOOR, IRON_DOOR,
} from '../world/blocks.js';
import { matchRecipe, smeltResult } from './recipes.js';
import { FUEL_TIMES } from './furnace.js';

function stackLimit(stack) {
  return ITEMS[stack.id]?.durability ? 1 : 64;
}

function canStack(a, b) {
  return !!a && !!b && a.id === b.id && (a.damage || 0) === (b.damage || 0) && stackLimit(a) > 1;
}

const ARMOR_HINTS = ['⛑', '👕', '👖', '👢'];

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

    this.buildTitle();
    this.buildHud();
    this.buildPanels();
    this.buildDebug();
    this.buildTooltip();

    window.uiPause = true;

    document.addEventListener('keydown', (e) => this.onKey(e));
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
        <div class="title-main">AiSlopcraft</div>
        <div class="title-sub">Minecraft Beta 1.7.3</div>
        <div class="splash">${this.splash}</div>
      </div>
      <button class="btn btn-big" id="btn-singleplayer">Singleplayer</button>
      <button class="btn" id="btn-options">Options...</button>
      <div class="title-foot">Minecraft Beta 1.7.3 Clone · Procedural WebGL + WebAudio · Not affiliated with Mojang</div>
    `;
    this.root.appendChild(div);
    div.querySelector('#btn-singleplayer').addEventListener('click', () => {
      this.game.audio.init();
      this.game.audio.click();
      this.hide('title-screen');
      this.setMode('game');
      this.game.start();
    });
    div.querySelector('#btn-options').addEventListener('click', () => {
      this.game.audio.init();
      this.game.audio.click();
      this.showOptions();
    });
  }

  showOptions() {
    if (document.getElementById('options-screen')) return;
    const div = document.createElement('div');
    div.className = 'screen options-screen';
    div.id = 'options-screen';
    const bobbing = this.game.player.viewBobbing !== false;
    const keepInv = this.game.keepInventory !== false;
    const shaderStyle = this.game.shaderStyle || 'classic';
    const shaderDescriptions = {
      classic: 'Classic pixel lighting, true to the original look.',
      vibrant: 'Richer colors and a little extra contrast.',
      cinematic: 'Cool shadows with a gentle, warm highlight grade.',
      shader: 'Directional sun, contact shading, animated water glints, and atmospheric fog.',
    };
    div.innerHTML = `
      <div class="panel options-panel">
        <header class="options-heading">
          <div class="options-eyebrow">WORLD CONFIGURATION</div>
          <h2>Settings</h2>
          <p>Make your world feel just right.</p>
        </header>
        <section class="settings-section">
          <div class="settings-section-title"><span class="settings-icon">✦</span><div><b>Graphics</b><small>Shape the look of your world</small></div></div>
          <label class="setting-card shader-setting" for="opt-shader">
            <span class="setting-copy"><b>Shader style</b><small id="opt-shader-desc">${shaderDescriptions[shaderStyle] || shaderDescriptions.classic}</small></span>
            <select id="opt-shader" aria-label="Shader style">
              <option value="classic" ${shaderStyle === 'classic' ? 'selected' : ''}>Classic</option>
              <option value="vibrant" ${shaderStyle === 'vibrant' ? 'selected' : ''}>Vibrant</option>
              <option value="cinematic" ${shaderStyle === 'cinematic' ? 'selected' : ''}>Cinematic</option>
              <option value="shader" ${shaderStyle === 'shader' ? 'selected' : ''}>Shader Lite</option>
            </select>
          </label>
          <div class="setting-card range-setting">
            <label for="opt-render"><span class="setting-copy"><b>Render distance</b><small>How far the landscape is drawn</small></span><span class="setting-value"><strong id="opt-rd">${this.game.renderDistance}</strong><small>chunks</small></span></label>
            <input type="range" min="2" max="12" value="${this.game.renderDistance}" id="opt-render" aria-label="Render distance">
            <div class="range-ends"><span>Near · faster</span><span>Far · richer view</span></div>
          </div>
        </section>
        <section class="settings-section">
          <div class="settings-section-title"><span class="settings-icon">♫</span><div><b>Audio & controls</b><small>Fine-tune your adventure</small></div></div>
          <div class="setting-card range-setting">
            <label for="opt-volume"><span class="setting-copy"><b>Sound volume</b><small>Game sounds and ambience</small></span><span class="setting-value"><strong id="opt-vol">${Math.round(this.game.audio.volume * 100)}</strong><small>%</small></span></label>
            <input type="range" min="0" max="100" value="${Math.round(this.game.audio.volume * 100)}" id="opt-volume" aria-label="Sound volume">
          </div>
          <div class="setting-card range-setting">
            <label for="opt-sens-in"><span class="setting-copy"><b>Mouse sensitivity</b><small>How quickly the camera turns</small></span><span class="setting-value"><strong id="opt-sens">${Math.round(this.game.player.sensitivity * 10000)}</strong><small>%</small></span></label>
            <input type="range" min="5" max="80" value="${Math.round(this.game.player.sensitivity * 10000)}" id="opt-sens-in" aria-label="Mouse sensitivity">
          </div>
          <div class="options-toggles">
            <button class="toggle-card" id="opt-bob"><span><b>View bobbing</b><small>Subtle movement while walking</small></span><i>${bobbing ? 'ON' : 'OFF'}</i></button>
            <button class="toggle-card" id="opt-keepinv"><span><b>Keep inventory</b><small>Keep items when you fall</small></span><i>${keepInv ? 'ON' : 'OFF'}</i></button>
          </div>
        </section>
        <footer class="options-footer">
          ${this.game.resetWorld ? '<button class="btn btn-danger" id="opt-reset">Reset saved world</button>' : ''}
          <button class="btn options-done" id="opt-done">Done <span>↵</span></button>
        </footer>
      </div>
    `;
    this.root.appendChild(div);
    div.querySelector('#opt-shader').addEventListener('change', e => {
      this.game.audio.click();
      this.game.setShaderStyle?.(e.target.value);
      div.querySelector('#opt-shader-desc').textContent = shaderDescriptions[e.target.value] || shaderDescriptions.classic;
      this.game.saveSettings?.();
    });
    div.querySelector('#opt-render').addEventListener('input', e => {
      this.game.renderDistance = +e.target.value;
      div.querySelector('#opt-rd').textContent = e.target.value;
      this.game.onRenderDistanceChange?.();
      this.game.saveSettings?.();
    });
    div.querySelector('#opt-volume').addEventListener('input', e => {
      this.game.audio.setVolume(+e.target.value / 100);
      div.querySelector('#opt-vol').textContent = e.target.value;
      this.game.saveSettings?.();
    });
    div.querySelector('#opt-sens-in').addEventListener('input', e => {
      this.game.player.sensitivity = +e.target.value / 10000;
      div.querySelector('#opt-sens').textContent = e.target.value;
      this.game.saveSettings?.();
    });
    div.querySelector('#opt-bob').addEventListener('click', e => {
      this.game.audio.click();
      this.game.player.viewBobbing = !(this.game.player.viewBobbing !== false);
      e.target.querySelector('i').textContent = this.game.player.viewBobbing ? 'ON' : 'OFF';
      this.game.saveSettings?.();
    });
    div.querySelector('#opt-keepinv').addEventListener('click', e => {
      this.game.audio.click();
      this.game.keepInventory = !(this.game.keepInventory !== false);
      e.target.querySelector('i').textContent = this.game.keepInventory ? 'ON' : 'OFF';
      this.game.saveSettings?.();
    });
    const resetBtn = div.querySelector('#opt-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.game.audio.click();
        if (resetBtn.dataset.confirm !== '1') {
          resetBtn.dataset.confirm = '1';
          resetBtn.textContent = 'Click again to confirm reset';
          return;
        }
        div.remove();
        this.game.resetWorld?.();
      });
    }
    div.querySelector('#opt-done').addEventListener('click', () => {
      this.game.audio.click();
      this.game.saveSettings?.();
      div.remove();
    });
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
    `;
    this.root.appendChild(div);
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
            <div class="inv-title">Armor</div>
            <div class="armor-grid" id="armor-grid"></div>
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
        <div class="inv-title">Inventory <span class="inv-hint">(Shift-click to quick move)</span></div>
        <div class="inv-main" id="inv-main"></div>
        <div class="inv-hotbar" id="inv-hotbar"></div>
      </div>
    `;
    this.root.appendChild(inv);
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
        <button class="btn" id="btn-options2">Options...</button>
        <button class="btn" id="btn-respawn">Respawn</button>
        ${this.game.saveAndQuit ? '<button class="btn" id="btn-save-quit">Save & Quit to Title</button>' : ''}
        <div class="pause-hint">Beta 1.7.3 — no hunger, no sprint. Eat food or cake to heal!</div>
      </div>
    `;
    this.root.appendChild(pause);
    pause.querySelector('#btn-back').addEventListener('click', () => {
      this.game.audio.click();
      this.setMode('game');
    });
    pause.querySelector('#btn-options2').addEventListener('click', () => {
      this.game.audio.click();
      this.showOptions();
    });
    pause.querySelector('#btn-respawn').addEventListener('click', () => {
      this.game.audio.click();
      this.game.respawn();
      this.setMode('game');
    });
    const saveQuitBtn = pause.querySelector('#btn-save-quit');
    if (saveQuitBtn) {
      saveQuitBtn.addEventListener('click', () => {
        this.game.audio.click();
        this.game.saveAndQuit?.();
      });
    }

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

    if (type === 'inv') {
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
              if (s.count <= 0) this.craftSlots[i] = null;
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
                if (s.count <= 0) this.craftSlots[i] = null;
              }
            }
            audio.pop();
          }
        }
      }
    }
    this.refresh();
  }

  onKey(e) {
    if (e.code === 'KeyE') {
      if (this.mode === 'game') {
        e.preventDefault();
        this.setMode('inventory');
      } else if (this.mode === 'inventory' || this.mode === 'crafting' || this.mode === 'furnace' || this.mode === 'chest') {
        e.preventDefault();
        this.setMode('game');
      }
    }
    if (e.code === 'KeyQ' && this.mode === 'game' && !this.game.player.dead) {
      e.preventDefault();
      this.game.dropHeld?.(e.ctrlKey || e.metaKey);
    }
    if (e.code === 'Escape') {
      const optScreen = document.getElementById('options-screen');
      if (optScreen) {
        optScreen.remove();
        return;
      }
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
      if (!p.pointerLocked && !p.dead) {
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
    if (this.mode !== 'title') {
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
  342: 62,  // storage minecart
  343: 62,  // powered minecart
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
  ITEM_ICON_INDEX[+id] = 40 + m * 5 + k;
}

const SPLASHES = [
  'Also try Terraria!', 'Made in Sweden!', '100% pure!', 'May contain nuts!',
  'Better than Prey!', 'More polygons!', 'Sniffer!', 'Woo, beta!',
  'As seen on TV!', 'Awesome!', '110803!', 'Kinda like Minecraft!',
  'Random splash!', 'Made by a robot!', 'Also try Minecraft!', 'Beta 1.7.3!',
  'The Work of Notch!', 'Now with blocks!', 'Water is wet!', 'No hunger bar!',
];
