// UI: title screen, hotbar, hearts, inventory, crafting table, furnace, pause,
// death screen, F3 debug. Classic beta look — dirt background, pixelated panels.
import { ITEMS, itemName, getBlock, isBlock, TILES } from '../world/blocks.js';
import { matchRecipe, smeltResult } from './recipes.js';

const SLOT = 36;
const SLOT_GAP = 2;

// ---------------------------------------------------------------------------
// Pixel art HUD sprites (9x9, like the beta GUI icons).
// ---------------------------------------------------------------------------
const HEART_MASK = [
  '.##...##.',
  '#########',
  '#########',
  '#########',
  '.#######.',
  '..#####..',
  '...###...',
  '....#....',
  '.........',
];

const BUBBLE_MASK = [
  '..#####..',
  '.##...##.',
  '##..#..##',
  '##.....##',
  '##.....##',
  '##.....##',
  '.##...##.',
  '..#####..',
  '.........',
];

const HEART_RED = '#d8342c';
const HEART_DARK = '#2a1414';
const BUBBLE_LIGHT = '#bfe6ff';
const BUBBLE_DARK = '#2a3a4a';

function drawMask(canvas, mask, colorAt) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = mask[0].length;
  const h = mask.length;
  canvas.width = w;
  canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y][x] !== '#') continue;
      const color = colorAt(x, y);
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function drawHeart(canvas, type) {
  drawMask(canvas, HEART_MASK, (x) => {
    if (type === 'empty') return HEART_DARK;
    if (type === 'half' && x >= 5) return HEART_DARK;
    return HEART_RED;
  });
}

function drawBubble(canvas, type) {
  drawMask(canvas, BUBBLE_MASK, (x, y) => {
    if (type === 'empty') return BUBBLE_DARK;
    if (type === 'half' && x >= 5) return BUBBLE_DARK;
    return (x === 3 && y === 2) ? '#ffffff' : BUBBLE_LIGHT;
  });
}

// Beta style flame used by the furnace screen.
const FLAME_MASK = [
  '....#....',
  '...###...',
  '...###...',
  '..#####..',
  '..#####..',
  '.#######.',
  '.#######.',
  '#########',
  '.........',
];

export function drawFlame(canvas, burning) {
  drawMask(canvas, FLAME_MASK, (x, y) => {
    if (y >= 7) return burning ? '#e8a33d' : '#6b4a22';
    if (y >= 5) return burning ? '#f0c04a' : '#8a5f2a';
    return burning ? '#fff2a0' : '#a87a3a';
  });
}

// ---------------------------------------------------------------------------
// Item / block icons.  Blocks are drawn as small isometric cubes so the
// hotbar reads like the beta inventory instead of a flat square.
// ---------------------------------------------------------------------------
export function drawBlockIcon(ctx, atlas, id) {
  if (!ctx || !atlas) return;
  const bd = getBlock(id);
  const tiles = bd.tiles || [TILES.stone, TILES.stone, TILES.stone, TILES.stone, TILES.stone, TILES.stone];
  if (bd.cross || bd.render === 'cross' || bd.render === 'torch' || bd.render === 'flat') {
    // flat items (grass, flowers, torches) show their side texture
    const tile = tiles[2];
    ctx.drawImage(atlas, (tile % 16) * 16, Math.floor(tile / 16) * 16, 16, 16, 8, 8, 16, 16);
    return;
  }
  const top = tiles[0], left = tiles[2], right = tiles[3] ?? tiles[2];
  const face = (tile, m) => {
    ctx.save();
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    if (m[6] && m[6] !== 1) ctx.filter = `brightness(${m[6]})`;
    ctx.drawImage(atlas, (tile % 16) * 16, Math.floor(tile / 16) * 16, 16, 16, 0, 0, 1, 1);
    ctx.restore();
  };
  // top face: (0,8) -> (16,0) -> (32,8) -> (16,16)
  face(top, [16, -8, 16, 8, 0, 8, 1.08]);
  // left face: (0,8) -> (16,16) -> (16,32) -> (0,24)
  face(left, [16, 8, 0, 16, 0, 8, 0.7]);
  // right face: (16,16) -> (32,8) -> (32,24) -> (16,32)
  face(right, [16, -8, 0, 16, 16, 16, 0.85]);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';
}

export function drawItemIcon(ctx, itemIcons, id) {
  if (!ctx || !itemIcons) return;
  const idx = ITEM_ICON_INDEX[id] ?? 0;
  ctx.drawImage(itemIcons, (idx % 16) * 16, Math.floor(idx / 16) * 16, 16, 16, 0, 0, 32, 32);
}

export { drawHeart, drawBubble };

function stackLimit(stack) {
  return ITEMS[stack.id]?.durability ? 1 : 64;
}

function canStack(a, b) {
  return !!a && !!b && a.id === b.id && (a.damage || 0) === (b.damage || 0) && stackLimit(a) > 1;
}

export class UI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui');
    this.mode = 'title'; // title | game | inventory | crafting | furnace | pause | death
    this.craftSlots = new Array(9).fill(null);
    this.craftSize = 2;
    this.furnaceData = null;
    this.showDebug = false;
    this.showHud = true;
    this.splash = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
    this.tooltip = null;

    this.buildTitle();
    this.buildHud();
    this.buildPanels();
    this.buildDebug();

    window.uiPause = true;

    document.addEventListener('keydown', (e) => this.onKey(e));
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
        <div class="title-sub">Minecraft Beta 1.7.3 Clone</div>
        <div class="splash">${this.splash}</div>
      </div>
      <button class="btn btn-big" id="btn-singleplayer">Singleplayer</button>
      <button class="btn" id="btn-options">Options...</button>
      <div class="title-foot">Not affiliated with Mojang. Made for fun.</div>
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
    div.innerHTML = `
      <div class="panel options-panel">
        <h2>Options</h2>
        <label>Render Distance: <span id="opt-rd">${this.game.renderDistance}</span> chunks
          <input type="range" min="2" max="12" value="${this.game.renderDistance}" id="opt-render"></label>
        <label>Sound Volume: <span id="opt-vol">${Math.round(this.game.audio.volume * 100)}</span>%
          <input type="range" min="0" max="100" value="${Math.round(this.game.audio.volume * 100)}" id="opt-volume"></label>
        <label>Mouse Sensitivity: <span id="opt-sens">${Math.round(this.game.player.sensitivity * 10000)}</span>
          <input type="range" min="5" max="80" value="${Math.round(this.game.player.sensitivity * 10000)}" id="opt-sens-in"></label>
        <button class="btn" id="opt-done">Done</button>
      </div>
    `;
    this.root.appendChild(div);
    div.querySelector('#opt-render').addEventListener('input', e => {
      this.game.renderDistance = +e.target.value;
      div.querySelector('#opt-rd').textContent = e.target.value;
    });
    div.querySelector('#opt-volume').addEventListener('input', e => {
      this.game.audio.setVolume(+e.target.value / 100);
      div.querySelector('#opt-vol').textContent = e.target.value;
    });
    div.querySelector('#opt-sens-in').addEventListener('input', e => {
      this.game.player.sensitivity = +e.target.value / 10000;
      div.querySelector('#opt-sens').textContent = e.target.value;
    });
    div.querySelector('#opt-done').addEventListener('click', () => {
      this.game.audio.click();
      div.remove();
    });
  }

  // ---------- HUD ----------
  buildHud() {
    const div = document.createElement('div');
    div.className = 'hud';
    div.id = 'hud';
    div.style.display = 'none';
    // The bottom HUD lives in one container so the hotbar, the hearts, the
    // air bubbles and the held item name always share the same centre line
    // and scale together on small screens.
    div.innerHTML = `
      <div class="crosshair">+</div>
      <div class="hud-bottom">
        <div class="held-name" id="held-name"></div>
        <div class="status-row">
          <div class="hearts" id="hearts"></div>
          <div class="water-bar" id="water-bar" style="display:none"></div>
        </div>
        <div class="hotbar" id="hotbar"></div>
      </div>
      <div class="hint" id="hint">Click to play &nbsp;|&nbsp; WASD move · Space jump · E inventory · F3 debug · Esc pause</div>
    `;
    this.root.appendChild(div);
    this.hotbarEl = div.querySelector('#hotbar');
    this.heartsEl = div.querySelector('#hearts');
    this.heldNameEl = div.querySelector('#held-name');
    this.hintEl = div.querySelector('#hint');
    this.crosshair = div.querySelector('.crosshair');

    // build hotbar slots
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('div');
      s.className = 'slot hotbar-slot';
      s.dataset.index = i;
      s.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (this.mode !== 'game') return;
        // swap cursor with hotbar slot on right click while playing? skip
      });
      this.hotbarEl.appendChild(s);
    }
  }

  // ---------- panels (inventory / crafting / furnace / pause / death) ----------
  buildPanels() {
    // inventory + crafting
    const inv = document.createElement('div');
    inv.className = 'screen panel-screen';
    inv.id = 'inventory-screen';
    inv.style.display = 'none';
    inv.innerHTML = `
      <div class="panel inv-panel">
        <div class="inv-title">Crafting</div>
        <div class="craft-area">
          <div class="craft-grid" id="craft-grid"></div>
          <div class="craft-arrow">→</div>
          <div class="slot craft-out" id="craft-out"></div>
        </div>
        <div class="inv-title">Inventory</div>
        <div class="inv-main" id="inv-main"></div>
        <div class="inv-hotbar" id="inv-hotbar"></div>
      </div>
    `;
    this.root.appendChild(inv);

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
        <div class="pause-hint">Beta 1.7.3 — no hunger, no sprint, no creative. Eat to heal!</div>
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
    const craftGrid = document.getElementById('craft-grid');
    craftGrid.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('div');
      s.className = 'slot craft-slot';
      s.dataset.craft = i;
      s.addEventListener('mousedown', (e) => this.slotClick(e, 'craft', i));
      s.addEventListener('contextmenu', e => e.preventDefault());
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
      invHot.appendChild(s);
    }
    const out = document.getElementById('craft-out');
    out.addEventListener('mousedown', (e) => this.slotClick(e, 'out', 0));
    out.addEventListener('contextmenu', e => e.preventDefault());
  }

  slotClick(e, type, index) {
    e.preventDefault();
    const player = this.game.player;
    const audio = this.game.audio;
    if (type === 'inv') {
      const s = player.inventory[index];
      if (e.button === 2) {
        // right click: drop one / place one
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
        // left click: swap
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
    } else if (type === 'craft') {
      const s = this.craftSlots[index];
      if (e.button === 2) {
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
    } else if (type === 'out') {
      const result = matchRecipe(this.craftSlots, this.craftSize);
      if (result) {
        const outputStack = { id: result.id, count: result.count, damage: 0 };
        const canReceive = !player.cursorStack ||
          (canStack(player.cursorStack, outputStack) && player.cursorStack.count + result.count <= stackLimit(player.cursorStack));
        if (canReceive) {
          if (player.cursorStack) player.cursorStack.count += result.count;
          else player.cursorStack = outputStack;
          // consume ingredients
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
    this.refresh();
  }

  onKey(e) {
    if (e.code === 'KeyE') {
      if (this.mode === 'game') {
        e.preventDefault();
        this.setMode('inventory');
      } else if (this.mode === 'inventory' || this.mode === 'crafting') {
        e.preventDefault();
        this.setMode('game');
      }
    }
    if (e.code === 'Escape') {
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
    const hud = document.getElementById('hud');
    const inv = document.getElementById('inventory-screen');
    const pause = document.getElementById('pause-screen');
    const death = document.getElementById('death-screen');
    const furnace = document.getElementById('furnace-screen');
    hud.style.display = mode === 'title' ? 'none' : (this.showHud ? 'block' : 'none');
    inv.style.display = (mode === 'inventory' || mode === 'crafting') ? 'flex' : 'none';
    pause.style.display = mode === 'pause' ? 'flex' : 'none';
    death.style.display = mode === 'death' ? 'flex' : 'none';
    if (furnace) furnace.style.display = mode === 'furnace' ? 'flex' : 'none';
    window.uiPause = mode !== 'game';

    if (mode === 'game') {
      // return cursor stack + craft grid items to inventory
      const p = this.game.player;
      if (p.cursorStack) { this.returnStack(p.cursorStack); p.cursorStack = null; }
      for (let i = 0; i < 9; i++) {
        if (this.craftSlots[i]) {
          this.returnStack(this.craftSlots[i]);
          this.craftSlots[i] = null;
        }
      }
      if (!p.pointerLocked && !p.dead) {
        document.getElementById('game-canvas').requestPointerLock?.();
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
      slots[i].className = 'slot hotbar-slot'
        + (player.inventory[i] ? ' has-item' : '')
        + (i === player.hotbarIndex ? ' selected' : '');
    }
    // hearts
    this.renderHearts();
    // Classic selected-slot tooltip: refresh even when two slots hold the
    // same item, and clear as soon as the selected slot is empty.
    const held = player.inventory[player.hotbarIndex];
    const heldKey = `${player.hotbarIndex}:${held ? held.id : ''}`;
    if (this._lastHotbarKey !== heldKey) {
      this._lastHotbarKey = heldKey;
      clearTimeout(this._nameTimer);
      if (held) {
        this.heldNameEl.textContent = itemName(held.id);
        this.heldNameEl.style.opacity = 1;
        this._nameTimer = setTimeout(() => { this.heldNameEl.style.opacity = 0; }, 2000);
      } else {
        this.heldNameEl.textContent = '';
        this.heldNameEl.style.opacity = 0;
      }
    }

    // inventory panel
    if (this.mode === 'inventory' || this.mode === 'crafting') {
      const craftGrid = document.getElementById('craft-grid');
      const size = this.craftSize;
      craftGrid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
      for (let i = 0; i < 9; i++) {
        const el = craftGrid.children[i];
        if (i < size * size) {
          el.style.display = 'flex';
          this.renderSlot(el, this.craftSlots[i]);
        } else {
          el.style.display = 'none';
        }
      }
      const outEl = document.getElementById('craft-out');
      const result = matchRecipe(this.craftSlots, size);
      this.renderSlot(outEl, result ? { id: result.id, count: result.count } : null);

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
        this.root.appendChild(cursorEl);
        document.addEventListener('mousemove', (e) => {
          cursorEl.style.left = (e.clientX - 18) + 'px';
          cursorEl.style.top = (e.clientY - 18) + 'px';
        });
      }
      this.renderSlot(cursorEl, player.cursorStack);
    } else if (cursorEl) {
      cursorEl.remove();
    }
  }

  renderHearts() {
    const hp = this.game.player.health;
    const air = this.game.player.air;
    // only rebuild the sprites when the values actually change — refresh()
    // runs every frame and the canvases are expensive to recreate
    const key = `${hp}:${air}`;
    if (this._heartsKey === key) return;
    this._heartsKey = key;
    this.heartsEl.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      const v = hp - i * 2;
      const type = v >= 2 ? 'full' : v >= 1 ? 'half' : 'empty';
      const c = document.createElement('canvas');
      c.className = 'heart ' + type;
      drawHeart(c, type);
      this.heartsEl.appendChild(c);
    }
    // water bar
    const wb = document.getElementById('water-bar');
    if (air < 300) {
      wb.style.display = 'flex';
      wb.innerHTML = '';
      for (let i = 0; i < 10; i++) {
        const v = air / 30 - i;
        const type = v >= 1 ? 'full' : v > 0 ? 'half' : 'empty';
        const c = document.createElement('canvas');
        c.className = 'bubble ' + type;
        drawBubble(c, type);
        wb.appendChild(c);
      }
    } else wb.style.display = 'none';
  }

  renderSlot(el, stack, selected) {
    if (!el) return;
    const id = stack ? stack.id : 0;
    const count = stack ? stack.count : 0;
    const damage = stack ? (stack.damage || 0) : 0;
    // skip the DOM churn when the slot did not change
    const key = `${id}:${count}:${damage}`;
    if (el._slotKey === key) return;
    el._slotKey = key;
    if (!stack) {
      el.innerHTML = '';
      el.classList.remove('has-item');
      return;
    }
    el.classList.add('has-item');
    const isB = isBlock(stack.id);
    let icon;
    if (isB) {
      icon = `<canvas class="block-icon" width="32" height="32" data-block="${stack.id}"></canvas>`;
    } else {
      icon = `<canvas class="item-icon" width="32" height="32" data-item="${stack.id}"></canvas>`;
    }
    const dmg = stack.damage ? `<div class="durability" style="width:${Math.max(0, 100 - (stack.damage / (ITEMS[stack.id]?.durability || 100)) * 100)}%"></div>` : '';
    el.innerHTML = icon + (stack.count > 1 ? `<span class="count">${stack.count}</span>` : '') + dmg;
    this.drawIcon(el.querySelector('canvas'), stack.id);
  }

  drawIcon(canvas, id) {
    if (canvas._drawn === id) return;
    canvas._drawn = id;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 32, 32);
    if (isBlock(id)) {
      drawBlockIcon(ctx, this.game.atlasCanvas, id);
    } else {
      drawItemIcon(ctx, this.game.itemIconsCanvas, id);
    }
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
      this.debugEl.style.display = 'none';
      return;
    }
    this.debugEl.style.display = 'block';
    this.debugEl.innerHTML = info.map(l => `<div>${l}</div>`).join('');
  }

  update() {
    if (this.mode !== 'title') {
      this.refresh();
    }
    // animate splash
    const splash = document.querySelector('.splash');
    if (splash) {
      splash.style.transform = `rotate(${Math.sin(performance.now() / 500) * 4}deg) scale(${1 + Math.sin(performance.now() / 300) * 0.04})`;
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
  351: 34,  // ink sac
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
  329: 63,  // saddle
  345: 64,  // compass
  346: 65,  // fishing rod
  261: 60,  // bow
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
