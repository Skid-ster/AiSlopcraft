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
  await page.evaluate(() => document.exitPointerLock?.());
  await expect.poll(() => page.evaluate(() => window.game.player.pointerLocked)).toBe(false);
  if (!await page.locator('#pause-screen').isVisible()) await page.keyboard.press('Escape');
  await expect(page.locator('#pause-screen')).toBeVisible();
}

test('Beta survival: mine, place, craft, die, respawn, and move a save between browsers', async ({ page, browser }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await title(page);
  await newWorld(page, 'Release smoke');
  await expect.poll(() => page.evaluate(() => window.game.renderer.info.render.calls)).toBeGreaterThan(0);
  await page.locator('#game-canvas').click({ position: { x: 400, y: 300 } });
  await expect.poll(() => page.evaluate(() => window.game.player.pointerLocked)).toBe(true);
  // Pin the target and supplies; let the real mouse, raycast, simulation and inventory do the work.
  const [x, y, z] = await page.evaluate(() => {
    const { world, player } = window.game;
    const [x, y, z] = player.pos.toArray().map(Math.floor);
    player.yaw = player.pitch = 0;
    player.pos.x = x + 0.5;
    player.pos.z = z + 0.5;
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
  await page.mouse.down();
  try { await expect.poll(block).toBe(0); } finally { await page.mouse.up(); }
  await page.mouse.down({ button: 'right' });
  try { await expect.poll(block).toBe(5); } finally { await page.mouse.up({ button: 'right' }); }

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

  const fresh = await browser.newContext();
  try {
    const imported = await fresh.newPage();
    await title(imported);
    await imported.locator('#btn-saves').click();
    await imported.locator('#save-import-file').setInputFiles({ name: 'world.json', mimeType: 'application/json', buffer: data });
    await expect(imported).toHaveURL(/launch=1/);
    await playing(imported);
    await expect.poll(() => imported.evaluate(([x, y, z]) => window.game.world.getBlock(x, y, z), [x, y, z])).toBe(5);
  } finally { await fresh.close(); }
  expect(errors).toEqual([]);
});

test.describe('small portrait touchscreen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 700 }, deviceScaleFactor: 1 });
  test('opens inventory, returns to play and pauses using touch', async ({ page }) => {
    await title(page);
    await newWorld(page, 'Pocket world');
    await page.getByRole('button', { name: 'Open or close inventory' }).tap();
    await expect(page.locator('#craft-out')).toBeVisible();
    await page.locator('#touch-panel-return').tap();
    await page.getByRole('button', { name: 'Pause game' }).tap();
    await expect(page.getByRole('button', { name: 'Back to game' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to game' }).tap();
    await playing(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

test('Classic lobby: unique names, release, create, join and leave', async ({ page, browser }) => {
  const guestContext = await browser.newContext({ viewport: { width: 800, height: 600 } });
  try {
    const guest = await guestContext.newPage();
    for (const client of [page, guest]) {
      await title(client, '/?edition=classic&seed=release-smoke');
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
    await page.locator('#mp-create').click();
    await playing(page);
    await guest.locator('#mp-refresh').click();
    await guest.getByRole('button', { name: /Smoke room, 1 of 5 players/ }).click();
    await playing(guest);
    await expect.poll(() => guest.evaluate(() => window.game.networkRoom?.role)).toBe('guest');
    await expect.poll(() => page.evaluate(() => window.game.networkRoom?.players?.length)).toBe(2);
    await pause(guest);
    await guest.locator('#btn-save-quit').click();
    await expect(guest.locator('#btn-multiplayer')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.game.networkRoom?.players?.length)).toBe(1);
    await pause(page);
    await page.locator('#btn-save-quit').click();
    await expect(page.locator('#btn-multiplayer')).toBeVisible();
  } finally { await guestContext.close(); }
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
      if (key.startsWith('aislopcraft:world:')) throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
    const { player } = window.game;
    player.inventory[0] = { id: 5, count: 7, damage: 0 };
  });
  await pause(page);
  await page.locator('#btn-save-quit').click();
  await expect(page.locator('#pause-screen')).toBeVisible();
  await expect(page.getByText(/save failed/i)).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download World Backup' }).click();
  const download = await downloadPromise;
  const data = await readFile(await download.path(), 'utf8');
  expect(data).toContain('Quota survival');
  expect(JSON.parse(data).world.player.inventory[0]).toMatchObject({ id: 5, count: 7 });
  expect(await page.evaluate(() => window.game.started)).toBe(true);
});
