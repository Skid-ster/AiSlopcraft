import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function title(page, path = '/') {
  await page.goto(path);
  await expect(page.locator('#btn-singleplayer')).toBeVisible();
  await page.evaluate(() => {
    const { game } = window;
    Object.assign(game.settings, { renderDistance: 2, difficulty: 0, graphics: 'fast', renderScale: 0.5, clouds: false });
    game.applySettings();
    game.saveSettings();
  });
}

async function newWorld(page, name) {
  await page.locator('#btn-singleplayer').click();
  await page.locator('#world-create').click();
  await page.locator('#new-world-name').fill(name);
  await page.locator('#world-more-options').click();
  await page.locator('#new-world-seed').fill('release-smoke');
  await page.locator('#world-create-confirm').click();
  await playing(page);
}

async function playing(page) {
  await expect.poll(() => page.evaluate(() => Boolean(window.game?.started && !window.game.loading && !window.uiPause))).toBe(true);
}

async function pause(page) {
  if (!await page.locator('#pause-screen').isVisible()) await page.keyboard.press('Escape');
  await expect(page.locator('#pause-screen')).toBeVisible();
}

test('one main menu offers singleplayer and multiplayer with Survival and Creative', async ({ page }) => {
  await title(page);
  await expect(page.locator('#btn-multiplayer')).toBeVisible();
  await expect(page.locator('#btn-classic, #btn-beta')).toHaveCount(0);
  await page.locator('#btn-multiplayer').click();
  await expect(page.locator('#mp-mode')).toBeVisible();
  await expect(page.locator('#mp-mode option')).toHaveText(['Survival', 'Creative']);
  const warning = page.getByText(/Inventory is not fully synchronized/);
  const box = await warning.boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(600);
});

test('title splash does not obscure the edition subtitle on desktop or phone', async ({ page }) => {
  await title(page);
  await page.evaluate(() => { document.querySelector('.splash').textContent = 'Built one block at a time!'; });
  for (const viewport of [{ width: 800, height: 600 }, { width: 390, height: 700 }]) {
    await page.setViewportSize(viewport);
    const overlap = await page.evaluate(() => {
      const a = document.querySelector('.splash').getBoundingClientRect();
      const b = document.querySelector('.title-sub').getBoundingClientRect();
      return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    });
    expect(overlap, JSON.stringify(viewport)).toBe(false);
  }
});

test('Survival food is held to eat and hunger survives a world reload', async ({ page }) => {
  await title(page);
  await newWorld(page, 'Food and save');
  await page.locator('#game-canvas').click({ position: { x: 400, y: 300 } });
  await expect.poll(() => page.evaluate(() => window.game.player.pointerLocked)).toBe(true);
  await page.evaluate(() => {
    const player = window.game.player;
    player.bindings = { ...player.bindings, use: 'KeyK' };
    player.hunger = 10; player.saturation = 0; player.health = 15;
    player.inventory[0] = { id: 297, count: 1, damage: 0 }; player.hotbarIndex = 0;
  });
  await page.keyboard.down('k');
  try { await expect.poll(() => page.evaluate(() => window.game.player.hunger)).toBe(15); }
  finally { await page.keyboard.up('k'); }
  await expect.poll(() => page.evaluate(() => window.game.player.heldStack)).toBeNull();
  await expect(page.locator('#hunger-bar')).toBeVisible();
  await pause(page);
  await page.locator('#btn-save-now').click();
  await page.reload();
  await playing(page);
  await expect.poll(() => page.evaluate(() => window.game.player.hunger)).toBe(15);
});

test('Creative catalog, flight, high-altitude edits and inventory survive the expected save lifecycle', async ({ page }) => {
  await title(page);
  await page.locator('#btn-singleplayer').click();
  await page.locator('#world-create').click();
  await page.locator('#new-world-name').fill('Creative starter');
  await page.locator('#new-world-mode').click();
  await page.locator('#world-create-confirm').click();
  await playing(page);
  expect(await page.evaluate(() => window.game.player.gameMode)).toBe('creative');
  await expect.poll(() => page.evaluate(() => window.game.player.inventory[0]?.id)).toBe(1);
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.game.player.flying)).toBe(true);
  await page.keyboard.press('e');
  await page.getByRole('searchbox', { name: 'Search Creative items' }).fill('Diamond Pickaxe');
  await expect(page.locator('#creative-items button')).toHaveCount(1);
  await page.getByRole('button', { name: 'Diamond Pickaxe' }).click();
  expect(await page.evaluate(() => window.game.player.heldStack)).toEqual({ id: 278, count: 1, damage: 0 });
  await page.getByRole('button', { name: 'Back to game', exact: true }).click();
  await page.evaluate(() => { window.game.player.pos.y = -40; });
  await expect.poll(() => page.evaluate(() => window.game.player.pos.y)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.game.world.setBlock(8, 255, 8, 5, 2))).toBe(true);
  await page.evaluate(() => { window.game.player.inventory[0] = null; });
  await pause(page);
  await page.locator('#btn-save-now').click();
  await page.reload();
  await playing(page);
  expect(await page.evaluate(() => window.game.player.inventory[0])).toBeNull();
  expect(await page.evaluate(() => window.game.player.inventory[1]?.id)).toBe(3);
  expect(await page.evaluate(() => [window.game.world.getBlock(8, 255, 8), window.game.world.getMeta(8, 255, 8), window.game.player.flying])).toEqual([5, 2, false]);
});

test('a saved Beta generator takes precedence over a new-world URL', async ({ page }) => {
  await title(page);
  await page.evaluate(() => localStorage.setItem('aislopcraft:world:legacy-fixture', JSON.stringify({
    version: 1, worldId: 'legacy-fixture', seed: 'compat-fixture', edition: 'beta', gameMode: 'survival',
    edits: [['1,127,1', 5, 2]], player: { pos: [8.5, 80, 8.5], inventory: Array(36).fill(null), armor: Array(4).fill(null) },
  })));
  await page.goto('/?seed=compat-fixture&id=legacy-fixture&terrain=overworld-v1&launch=1');
  await playing(page);
  expect(await page.evaluate(() => {
    const { world } = window.game;
    return [world.height, world.getBlock(1, 127, 1), world.getMeta(1, 127, 1), world.setBlock(1, 128, 1, 1)];
  })).toEqual([128, 5, 2, false]);
  await pause(page);
  await page.locator('#btn-save-now').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('aislopcraft:world:legacy-fixture')).version)).toBe(1);
});

test('the selector opens either version when an old build creates a same-ID save', async ({ page }) => {
  await title(page);
  await page.evaluate(() => {
    const save = { worldId: 'same-id', seed: 'release-smoke', edition: 'beta', gameMode: 'survival',
      player: { pos: [8.5, 80, 8.5], inventory: Array(36).fill(null), armor: Array(4).fill(null) } };
    localStorage.setItem('aislopcraft:world:same-id', JSON.stringify({ ...save, version: 1, worldName: 'Collision Beta', edits: [['1,127,1', 1, 0]] }));
    localStorage.setItem('aislopcraft:world-v2:same-id', JSON.stringify({ ...save, version: 2, terrain: 'overworld-v1', worldName: 'Collision Overworld', edits: [['1,255,1', 5, 2]] }));
  });
  expect(await page.evaluate(async () => {
    const keys = ['aislopcraft:world:same-id', 'aislopcraft:world-v2:same-id'];
    const before = keys.map(key => localStorage.getItem(key));
    const backup = new File([JSON.stringify({ format: 'aislopcraft-world-save', version: 2, world: JSON.parse(before[1]) })], 'copy.json');
    const setItem = Storage.prototype.setItem;
    let attemptedKey, message;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('aislopcraft:world-v2:')) {
        attemptedKey = key;
        throw new DOMException('Full', 'QuotaExceededError');
      }
      return setItem.call(this, key, value);
    };
    try { await window.game.importWorldSaveFile(backup); }
    catch (error) { message = error.message; }
    finally { Storage.prototype.setItem = setItem; }
    return { failedForCopy: attemptedKey?.startsWith('aislopcraft:world-v2:import-'), keptBoth: keys.every((key, i) => localStorage.getItem(key) === before[i]), message };
  })).toEqual({ failedForCopy: true, keptBoth: true, message: expect.stringContaining('Browser storage is full') });
  await page.locator('#btn-singleplayer').click();
  const legacy = page.getByRole('option', { name: /Collision Beta/ });
  const modern = page.getByRole('option', { name: /Collision Overworld/ });
  await modern.click();
  await expect(modern).toHaveAttribute('aria-selected', 'true');
  await expect(legacy).toHaveAttribute('aria-selected', 'false');
  await page.locator('#world-play').click();
  await playing(page);
  expect(await page.evaluate(() => window.game.world.getMeta(1, 255, 1))).toBe(2);
  await pause(page);
  await page.locator('#btn-save-quit').click();
  await page.locator('#btn-singleplayer').click();
  await legacy.click();
  await page.locator('#world-play').click();
  await playing(page);
  expect(await page.evaluate(() => [window.game.world.height, window.game.world.getBlock(1, 127, 1)])).toEqual([128, 1]);
});

test('Survival: mine, place, craft, die, respawn, and round-trip a portable save', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await title(page);
  await newWorld(page, 'Release smoke');
  await expect.poll(() => page.evaluate(() => window.game.renderer.info.render.calls)).toBeGreaterThan(0);
  await page.locator('#game-canvas').click({ position: { x: 400, y: 300 } });
  await expect.poll(() => page.evaluate(() => window.game.player.pointerLocked)).toBe(true);
  // Pin the target and supplies; use keybindings so headless pointer-lock mouse
  // coordinate events do not move the camera between setting up and mining.
  const [x, y, z] = await page.evaluate(() => {
    const { world, player } = window.game;
    const [x, y, z] = player.pos.toArray().map(Math.floor);
    player.yaw = player.pitch = player.mouseDX = player.mouseDY = 0;
    player.pos.set(x + 0.5, y + 0.001, z + 0.5);
    player.vel.set(0, 0, 0);
    player.bindings = { ...player.bindings, attack: 'KeyJ', use: 'KeyK' };
    world.setBlock(x, y - 1, z, 1);
    world.setBlock(x, y, z, 0);
    world.setBlock(x, y + 1, z, 0);
    world.setBlock(x, y + 1, z - 1, 0);
    world.setBlock(x, y + 1, z - 2, 3);
    world.setBlock(x, y + 1, z - 3, 3);
    player.inventory[0] = { id: 5, count: 3, damage: 0 };
    player.inventory[1] = { id: 17, count: 1, damage: 0 };
    return [x, y + 1, z - 2];
  });
  const block = () => page.evaluate(([x, y, z]) => window.game.world.getBlock(x, y, z), [x, y, z]);
  const aim = () => page.evaluate(() => {
    const { player, world } = window.game;
    const hit = player.raycast(world, 5);
    return hit && [hit.x, hit.y, hit.z];
  });
  await expect.poll(aim).toEqual([x, y, z]);
  await page.keyboard.down('j');
  try { await expect.poll(block).toBe(0); } finally { await page.keyboard.up('j'); }
  await expect.poll(aim).toEqual([x, y, z - 1]);
  await page.keyboard.down('k');
  try { await expect.poll(block).toBe(5); } finally { await page.keyboard.up('k'); }

  await page.keyboard.press('e');
  const craft = page.locator('#craft-grid .slot');
  await expect(craft.first()).toBeVisible();
  await page.locator('#inv-hotbar .slot').nth(1).click();
  await craft.first().click();
  await page.locator('#craft-out').click();
  await expect.poll(() => page.evaluate(() => window.game.player.cursorStack?.count)).toBe(4);
  await page.keyboard.press('e');
  await page.evaluate(() => window.game.player.damage(100, window.game.audio, true));
  await expect(page.locator('#death-screen')).toBeVisible();
  await page.locator('#btn-respawn2').click();
  await playing(page);
  await expect.poll(() => page.evaluate(() => window.game.player.health)).toBe(20);

  await pause(page);
  await page.locator('#btn-options2').click();
  await page.getByRole('button', { name: 'Video Settings...' }).click();
  const distance = page.getByRole('slider', { name: /render distance/i });
  await distance.fill('3');
  await expect.poll(() => page.evaluate(() => window.game.settings.renderDistance)).toBe(3);
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('#btn-save-now').click();
  await expect(page.getByText('World saved in this browser.')).toBeVisible();
  await page.reload();
  await playing(page);
  await expect.poll(block).toBe(5);
  await expect.poll(() => page.evaluate(() => window.game.settings.renderDistance)).toBe(3);
  await pause(page);
  await page.locator('#btn-save-quit').click();
  await page.locator('#btn-saves').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#save-export').click();
  const download = await downloadPromise;
  const data = await readFile(await download.path());

  await page.locator('#save-import-file').setInputFiles({ name: 'world.json', mimeType: 'application/json', buffer: data });
  await expect(page).toHaveURL(/id=import-/);
  await playing(page);
  await expect.poll(block).toBe(5);
  expect(errors).toEqual([]);
});

test.describe('small portrait touchscreen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 700 }, deviceScaleFactor: 1 });
  test('opens inventory, returns to play and pauses using touch', async ({ page }) => {
    await title(page);
    await newWorld(page, 'Pocket world');
    await expect(page.locator('#touch-fly')).toBeHidden();
    await page.getByRole('button', { name: 'Open or close inventory' }).tap();
    await expect(page.locator('#craft-out')).toBeVisible();
    await page.locator('#touch-panel-return').tap();
    await page.getByRole('button', { name: 'Pause game' }).tap();
    await expect(page.getByRole('button', { name: 'Back to game' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to game' }).tap();
    await playing(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
  test('toggles Creative flight and chooses a catalog block using touch', async ({ page }) => {
    await title(page);
    await page.goto('/?seed=release-smoke&id=touch-creative&mode=creative&launch=1');
    await playing(page);
    const fly = page.getByRole('button', { name: 'Toggle flight' });
    await fly.tap();
    await expect(fly).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Open or close inventory' }).tap();
    await page.getByRole('searchbox', { name: 'Search Creative items' }).fill('Glass');
    await page.getByRole('button', { name: 'Glass', exact: true }).tap();
    await expect(page.locator('#creative-feedback')).toHaveText(/Glass selected/);
    await page.locator('#creative-close').tap();
    await fly.tap();
    await expect(fly).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => window.game.player.heldStack)).toEqual({ id: 20, count: 64, damage: 0 });
  });
  test('touch eating completes on hold and cancels on release or pause', async ({ page }) => {
    await title(page);
    await newWorld(page, 'Touch food');
    await page.evaluate(() => {
      const player = window.game.player;
      player.hunger = 10;
      player.saturation = 0;
      player.inventory[0] = { id: 297, count: 2, damage: 0 };
      player.hotbarIndex = 0;
      const use = document.querySelector('#touch-use');
      use.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', pointerId: 41, bubbles: true }));
      use.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', pointerId: 41, bubbles: true }));
      use.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', pointerId: 42, bubbles: true }));
      document.querySelector('#touch-pause').click();
    });
    await expect(page.locator('#pause-screen')).toBeVisible();
    expect(await page.evaluate(() => [window.game.player.hunger, window.game.player.heldStack.count, window.game.player.rightDown])).toEqual([10, 2, false]);
    await page.locator('#btn-back').tap();
    await page.evaluate(() => {
      const use = document.querySelector('#touch-use');
      use.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', pointerId: 43, bubbles: true }));
    });
    try { await expect.poll(() => page.evaluate(() => window.game.player.hunger)).toBe(15); }
    finally {
      await page.evaluate(() => document.querySelector('#touch-use').dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', pointerId: 43, bubbles: true })));
    }
  });
});

for (const mode of ['survival', 'creative']) test(`Multiplayer ${mode}: names, create, join, shared edits and leave`, async ({ page, browser }) => {
  test.setTimeout(300_000);
  const guestContext = await browser.newContext({ viewport: { width: 800, height: 600 } });
  try {
    const guest = await guestContext.newPage();
    for (const client of [page, guest]) {
      await title(client, '/?seed=release-smoke');
      await client.locator('#btn-multiplayer').click();
    }
    async function claim(client, name) {
      await client.locator('#mp-username').fill(name);
      await client.locator('#mp-claim').click();
    }
    await claim(page, 'SmokeHost');
    await expect(page.locator('#mp-name-label')).toContainText('SmokeHost');
    await claim(guest, 'smokehost');
    await expect(guest.locator('#mp-status')).toContainText(/already taken/i);
    await page.locator('#mp-release-name').click();
    await expect(page.locator('#mp-status')).toContainText('Name released');
    await claim(guest, 'smokehost');
    await expect(guest.locator('#mp-name-label')).toContainText('smokehost');
    await claim(page, 'OtherHost');
    await expect(page.locator('#mp-name-label')).toContainText('OtherHost');
    await page.locator('#mp-world-name').fill('Smoke room');
    await page.locator('#mp-mode').selectOption(mode);
    await page.locator('#mp-create').click();
    await playing(page);
    await guest.locator('#mp-refresh').click();
    await guest.getByRole('button', { name: /Smoke room, 1 of 5 players/ }).click();
    await playing(guest);
    await expect.poll(() => guest.evaluate(() => window.game.networkRoom?.role)).toBe('guest');
    await expect.poll(() => page.evaluate(() => window.game.networkRoom?.players?.length)).toBe(2);
    await expect.poll(() => guest.evaluate(() => window.game.player.gameMode)).toBe(mode);
    await pause(page);
    const pausedTime = await page.evaluate(() => window.game.sky.timeOfDay);
    await expect.poll(() => page.evaluate(() => window.game.sky.timeOfDay)).not.toBe(pausedTime);
    await page.locator('#btn-back').click();
    const edit = await page.evaluate(() => {
      const { player, world } = window.game;
      const x = Math.floor(player.pos.x), y = 255, z = Math.floor(player.pos.z);
      world.setBlock(x, y, z, 5);
      return [x, y, z];
    });
    await expect.poll(() => guest.evaluate(([x, y, z]) => window.game.world.getBlock(x, y, z), edit)).toBe(5);
    if (mode === 'survival') {
      const chest = await page.evaluate(() => {
        const { player, world } = window.game;
        player.pointerLocked = true;
        const [x, y, z] = player.pos.toArray().map(Math.floor);
        player.pos.set(x + 0.5, y + 0.001, z + 0.5);
        player.vel.set(0, 0, 0);
        player.yaw = player.pitch = player.mouseDX = player.mouseDY = 0;
        player.inventory[0] = { id: 5, count: 3, damage: 0 };
        player.hotbarIndex = 0;
        world.setBlock(x, y - 1, z, 1);
        world.setBlock(x, y, z, 0);
        world.setBlock(x, y + 1, z, 0);
        world.setBlock(x, y + 1, z - 1, 0);
        world.setBlock(x, y + 1, z - 2, 54);
        return [x, y, z];
      });
      await expect.poll(() => page.evaluate(() => window.game.player.raycast(window.game.world, 5)?.block)).toBe(54);
      await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true })));
      await expect(page.locator('#chest-screen')).toBeVisible();
      await page.locator('#chest-hotbar [data-inv="0"]').click();
      await page.locator('#chest-slots [data-chest="0"]').click();
      await expect.poll(() => page.evaluate(() => window.game.openChestData.slots[0])).toMatchObject({ id: 5, count: 3 });

      await expect.poll(() => guest.evaluate(([x, y, z]) => window.game.world.getBlock(x, y + 1, z - 2), chest)).toBe(54);
      await guest.evaluate(([x, y, z]) => {
        const player = window.game.player;
        player.pointerLocked = true;
        player.pos.set(x + 0.5, y + 0.001, z + 0.5);
        player.vel.set(0, 0, 0);
        player.yaw = player.pitch = player.mouseDX = player.mouseDY = 0;
      }, chest);
      await expect.poll(() => guest.evaluate(() => window.game.player.raycast(window.game.world, 5)?.block)).toBe(54);
      await guest.evaluate(() => document.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true })));
      await expect(guest.locator('#chest-screen')).toBeVisible();
      await expect.poll(() => guest.evaluate(() => window.game.openChestData?.slots?.[0])).toMatchObject({ id: 5, count: 3 });
      await guest.locator('#chest-slots [data-chest="0"]').click();
      await expect.poll(() => page.evaluate(() => window.game.openChestData?.slots?.[0])).toBeNull();
      await expect.poll(() => guest.evaluate(() => window.game.player.cursorStack)).toMatchObject({ id: 5, count: 3 });
      await guest.locator('#chest-hotbar [data-inv="0"]').click();
      await guest.keyboard.press('Escape');
      await page.keyboard.press('Escape');
    }
    await pause(guest);
    await guest.locator('#btn-save-quit').click();
    await expect(guest.locator('#btn-multiplayer')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.game.networkRoom?.players?.length)).toBe(1);
    await pause(page);
    await page.locator('#btn-save-quit').click();
    await expect(page.locator('#btn-multiplayer')).toBeVisible();
  } finally { await guestContext.close(); }
});

test('Multiplayer guests can open shared chests, furnaces, and storage minecarts', async ({ page }) => {
  await title(page);
  await newWorld(page, 'Shared containers');
  await page.locator('#game-canvas').click({ position: { x: 400, y: 300 } });
  await expect.poll(() => page.evaluate(() => window.game.player.pointerLocked)).toBe(true);
  const target = await page.evaluate(() => {
    const game = window.game, { player, world } = game;
    game.networkRoom = { role: 'guest', players: [] };
    const [x, y, z] = player.pos.toArray().map(Math.floor);
    player.pos.set(x + 0.5, y + 0.001, z + 0.5);
    player.vel.set(0, 0, 0);
    player.yaw = player.pitch = player.mouseDX = player.mouseDY = 0;
    world.setBlock(x, y - 1, z, 1);
    for (const dz of [0, -1, -2]) {
      for (const dy of [0, 1, 2]) world.setBlock(x, y + dy, z + dz, 0);
    }
    world.setBlock(x, y, z - 2, 1);
    return [x, y + 1, z - 2];
  });
  await page.evaluate(([x, y, z]) => {
    const { player, world } = window.game;
    player.pointerLocked = true;
    player.yaw = player.pitch = player.mouseDX = player.mouseDY = 0;
    world.setBlock(x, y, z, 54);
  }, target);
  await expect.poll(() => page.evaluate(() => window.game.player.raycast(window.game.world, 5)?.block)).toBe(54);
  await page.evaluate(() => {
    window.game.player.pointerLocked = true;
    document.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
  });
  await expect(page.locator('#chest-screen')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.evaluate(([x, y, z]) => {
    const { player, world } = window.game;
    player.pointerLocked = true;
    player.yaw = player.pitch = player.mouseDX = player.mouseDY = 0;
    world.setBlock(x, y, z, 61);
  }, target);
  await expect.poll(() => page.evaluate(() => window.game.player.raycast(window.game.world, 5)?.block)).toBe(61);
  await page.evaluate(() => {
    window.game.player.pointerLocked = true;
    document.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
  });
  await expect(page.locator('#furnace-screen')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.evaluate(([x, y, z]) => {
    const { player, world, vehicles } = window.game;
    player.pointerLocked = true;
    player.yaw = player.pitch = player.mouseDX = player.mouseDY = 0;
    world.setBlock(x, y, z, 0);
    vehicles.create('storage', x + 0.5, y + 0.1, z + 0.5);
  }, target);
  await expect.poll(() => page.evaluate(() => window.game.vehicles.target(window.game.player)?.type)).toBe('storage');
  await page.evaluate(() => {
    window.game.player.pointerLocked = true;
    document.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
  });
  await expect(page.locator('#chest-screen')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('XP progression, Enchanting Table, and Nether Portal travel work end-to-end', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(String(err)));
  await title(page);
  await newWorld(page, 'Nether and Enchanting');
  await page.locator('#game-canvas').click({ position: { x: 400, y: 300 } });
  await expect.poll(() => page.evaluate(() => window.game.player.pointerLocked)).toBe(true);

  const origin = await page.evaluate(() => {
    const { player, world } = window.game;
    player.addXp(900);
    player.inventory[0] = { id: 278, count: 1, damage: 0 }; // Diamond Pickaxe
    player.hotbarIndex = 0;
    const [x, y, z] = player.pos.toArray().map(Math.floor);
    player.pos.set(x + 0.5, y + 0.001, z + 0.5);
    player.vel.set(0, 0, 0);
    player.yaw = player.pitch = player.mouseDX = player.mouseDY = 0;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -3; dz <= 1; dz++) {
        for (let dy = 0; dy <= 4; dy++) world.setBlock(x + dx, y + dy, z + dz, 0);
      }
    }
    world.setBlock(x, y - 1, z, 1);
    world.setBlock(x, y + 1, z - 2, 116); // Enchanting Table
    world.setBlock(x - 2, y + 1, z - 2, 47); // Bookshelf
    world.setBlock(x + 2, y + 1, z - 2, 47); // Bookshelf
    return [x, y, z];
  });
  await expect.poll(() => page.evaluate(() => window.game.player.xpLevel)).toBeGreaterThanOrEqual(30);
  await expect(page.locator('#xp-bar-wrap')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.game.player.raycast(window.game.world, 5)?.block)).toBe(116);
  await page.evaluate(() => {
    window.game.player.pointerLocked = true;
    document.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
  });
  await expect(page.locator('#enchant-screen')).toBeVisible();

  await page.locator('#ench-inv-hotbar [data-inv="0"]').click();
  await page.locator('#enchant-item-slot').click();
  await expect(page.locator('#enchant-offers .enchant-offer-btn:not([disabled])').first()).toBeVisible();
  await page.locator('#enchant-offers .enchant-offer-btn:not([disabled])').first().click();
  expect(await page.evaluate(() => Boolean(window.game.ui.enchantItem?.enchants))).toBe(true);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => Boolean(window.game.player.inventory[0]?.enchants))).toBe(true);

  // Build & ignite a 4x5 Obsidian Nether Portal and step inside to enter The Nether
  await page.evaluate(([x, y, z]) => {
    const { player, world } = window.game;
    player.pointerLocked = true;
    world.setBlock(x, y + 1, z - 2, 0);
    const pz = z - 3;
    for (let dx = -1; dx <= 2; dx++) {
      for (let dy = 0; dy <= 4; dy++) {
        const edge = dx === -1 || dx === 2 || dy === 0 || dy === 4;
        world.setBlock(x + dx, y + dy, pz, edge ? 49 : 0);
      }
    }
    player.inventory[1] = { id: 259, count: 1, damage: 0 }; // Flint and Steel
    player.hotbarIndex = 1;
    player.pos.set(x + 0.5, y + 0.001, z + 0.5);
    player.vel.set(0, 0, 0);
    player.yaw = 0;
    player.pitch = -0.22;
    player.mouseDX = player.mouseDY = 0;
  }, origin);
  await expect.poll(() => page.evaluate(() => window.game.player.raycast(window.game.world, 5)?.block)).toBe(49);
  await page.evaluate(() => {
    window.game.player.pointerLocked = true;
    document.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
  });
  await expect.poll(() => page.evaluate(([x, y, z]) => window.game.world.getBlock(x, y + 1, z - 3), origin)).toBe(90);

  // Step into the lit portal and fast-advance portal timer to travel to the Nether
  await page.evaluate(([x, y, z]) => {
    const { player, world } = window.game;
    world.setBlock(x, y, z - 3, 49);
    player.pos.set(x + 0.5, y + 1.01, z - 2.5);
    player.vel.set(0, 0, 0);
    player.portalCooldown = 0;
    player.portalTime = 2.65;
  }, origin);
  await expect.poll(() => page.evaluate(() => window.game.world.dimension), { timeout: 15000 }).toBe('nether');
  expect(errors).toEqual([]);
});

test('WebGL startup failure presents a reload action that can recover', async ({ page }) => {
  await page.addInitScript(() => {
    if (!new URLSearchParams(location.search).has('no-webgl')) return;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (name, ...args) {
      return name.includes('webgl') ? null : original.call(this, name, ...args);
    };
  });
  await page.goto('/?no-webgl');
  await expect(page.getByRole('heading', { name: 'Graphics could not start' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload game' })).toBeFocused();
  await page.evaluate(() => history.replaceState(null, '', '/'));
  await page.getByRole('button', { name: 'Reload game' }).click();
  await expect(page.locator('#btn-singleplayer')).toBeVisible();
});

test('WebGL context loss pauses active play and permits recovery', async ({ page }) => {
  await title(page);
  await newWorld(page, 'Graphics recovery');
  await page.evaluate(() => {
    window.lossExtension = window.game.renderer.getContext().getExtension('WEBGL_lose_context');
    window.lossExtension.loseContext();
  });
  await expect(page.locator('#pause-screen')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /graphics connection lost/i })).toBeVisible();
  await page.evaluate(() => window.lossExtension.restoreContext());
  await expect(page.getByRole('status').filter({ hasText: /graphics restored/i })).toBeVisible();
  await page.locator('#btn-back').click();
  await playing(page);
  await expect.poll(() => page.evaluate(() => window.game.renderer.info.render.calls)).toBeGreaterThan(0);
});

test('storage quota leaves the world open and permits an unstored JSON backup', async ({ page }) => {
  await title(page);
  await newWorld(page, 'Quota survival');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('aislopcraft:world:') || key.startsWith('aislopcraft:world-v2:')) throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
    const { player } = window.game;
    player.inventory[0] = { id: 5, count: 7, damage: 0 };
  });
  await pause(page);
  await page.locator('#btn-save-quit').click();
  await expect(page.locator('#pause-screen')).toBeVisible();
  await expect(page.locator('#pause-save-status')).toContainText(/save failed/i);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download World Backup' }).click();
  const download = await downloadPromise;
  const data = await readFile(await download.path(), 'utf8');
  expect(data).toContain('Quota survival');
  expect(JSON.parse(data).world.player.inventory[0]).toMatchObject({ id: 5, count: 7 });
  expect(await page.evaluate(() => window.game.started)).toBe(true);
});

test('Classic grass renders in daylight with both the Classic and PSX presets', async ({ page }) => {
  const graphicsErrors = [];
  page.on('console', message => { if (message.type() === 'error') graphicsErrors.push(message.text()); });
  await title(page, '/?edition=classic&seed=release-perf');
  await page.locator('#btn-singleplayer').click();
  await page.locator('#world-create').click();
  await page.locator('#world-more-options').click();
  await page.locator('#new-world-seed').fill('release-perf');
  await page.locator('#world-create-confirm').click();
  await playing(page);
  const sample = await page.evaluate(async () => {
    const { player, renderer, sky, world } = window.game;
    sky.time = 0.5;
    player.pitch = -0.75;
    const gl = renderer.getContext();
    const pixels = new Uint8Array(40 * 40 * 4);
    const original = renderer.render;
    async function samplePreset(style) {
      window.game.setShaderStyle(style);
      return new Promise(resolve => {
        renderer.render = function (scene, camera) {
          original.call(this, scene, camera);
          if (this.getRenderTarget() || (style !== 'psx' && camera !== player.camera)) return;
          gl.readPixels(gl.drawingBufferWidth / 2 - 20, gl.drawingBufferHeight / 2 - 20, 40, 40, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          let lit = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) >= 24) lit++;
          }
          resolve(lit);
          renderer.render = original;
        };
      });
    }
    while ([...world.chunks.values()].filter(chunk => chunk.meshes).length < 21) {
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    return { classic: await samplePreset('classic'), psx: await samplePreset('psx') };
  });
  expect(graphicsErrors).toEqual([]);
  expect(sample.classic, JSON.stringify(sample)).toBeGreaterThan(1000);
  expect(sample.psx, JSON.stringify(sample)).toBeGreaterThan(1000);
});

test('PSX post-processing preserves dark colors instead of crushing them to black', async ({ page }) => {
  await title(page);
  await newWorld(page, 'PSX color test');
  const colors = await page.evaluate(async () => {
    const { renderer, player } = window.game;
    window.game.setShaderStyle('psx');
    const gl = renderer.getContext();
    const original = renderer.render;
    async function sample(value) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { renderer.render = original; reject(new Error('PSX frame not rendered')); }, 10000);
        renderer.render = function (scene, camera) {
          const target = this.getRenderTarget();
          original.call(this, scene, camera);
          if (target && camera === player.camera) {
            gl.clearColor(value, value, value, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
          } else if (!target && scene.children[0]?.material?.uniforms?.uScene) {
            const pixels = new Uint8Array(16 * 16 * 4);
            gl.readPixels(Math.floor(gl.drawingBufferWidth / 2) - 8, Math.floor(gl.drawingBufferHeight / 2) - 8, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            let sum = 0;
            for (let i = 0; i < pixels.length; i += 4) sum += pixels[i];
            clearTimeout(timer);
            renderer.render = original;
            resolve(sum / 256);
          }
        };
      });
    }
    return [await sample(0.04), await sample(0.12), await sample(0.5)];
  });
  expect(colors[0], JSON.stringify(colors)).toBeGreaterThan(20);
  expect(colors[1], JSON.stringify(colors)).toBeGreaterThan(colors[0] + 15);
  expect(colors[2], JSON.stringify(colors)).toBeGreaterThan(colors[1] + 30);
});

test('pause actions remain reachable on short screens', async ({ page }) => {
  await title(page);
  await newWorld(page, 'Short screen');
  await page.setViewportSize({ width: 700, height: 320 });
  await pause(page);
  for (const id of ['btn-back', 'btn-save-quit']) {
    const button = page.locator(`#${id}`);
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    expect(box.y, id).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, id).toBeLessThanOrEqual(320);
  }
});
