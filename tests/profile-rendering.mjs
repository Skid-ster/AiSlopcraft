import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from '@playwright/test';
import { createMultiplayerServer } from '../server/multiplayer.js';

const service = createMultiplayerServer();
service.http.listen(0, '127.0.0.1');
await once(service.http, 'listening');
const url = `http://127.0.0.1:${service.http.address().port}/?edition=classic&seed=release-perf&world=Reference`;
const native = process.env.AISLOPCRAFT_HARDWARE_GL === '1';
let browser;
try {
  browser = await chromium.launch({ args: native ? ['--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const table = [];
  for (const [distance, chunks] of [[2, 21], [12, 256]]) {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
    try {
      await page.goto(url);
      await page.waitForFunction(() => Boolean(window.game));
      await page.evaluate(distance => {
        const game = window.game;
        Object.assign(game.settings, { renderDistance: distance, graphics: 'fancy', renderScale: 1, clouds: false, maxFps: 0 });
        game.applySettings();
        game.ui.setMode('game');
        game.start();
        game.sky.time = 0.5;
      }, distance);
      await page.waitForFunction(chunks => [...window.game.world.chunks.values()].filter(chunk => chunk.meshes).length >= chunks, chunks, { timeout: 120_000 });
      const gl = await page.evaluate(() => {
        const gl = window.game.renderer.getContext();
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      });
      console.log(`Distance ${distance}, ${chunks} meshed chunks, renderer: ${gl}`);
      for (const style of ['classic', 'shader']) {
        const result = await page.evaluate(async style => {
          const { renderer, lighting } = window.game;
          window.game.setShaderStyle(style);
          const animationFrames = count => new Promise(resolve => {
            const stamps = [];
            function frame(time) {
              stamps.push(time);
              if (stamps.length === count) resolve(stamps);
              else requestAnimationFrame(frame);
            }
            requestAnimationFrame(frame);
          });
          await animationFrames(15);
          const passes = { world: [], shadow: [] };
          const original = renderer.render;
          renderer.render = function (scene, camera) {
            const target = this.getRenderTarget();
            const pass = target === lighting.shadowTarget ? 'shadow'
              : camera === window.game.player.camera ? 'world' : null;
            const start = performance.now();
            original.call(this, scene, camera);
            if (pass) passes[pass].push(performance.now() - start);
          };
          try {
            const stamps = await animationFrames(91);
            const p95 = values => values.length ? values.sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1] : null;
            return {
              fps: 90_000 / (stamps.at(-1) - stamps[0]),
              frameP95Ms: p95(stamps.slice(1).map((s, i) => s - stamps[i])),
              worldP95Ms: p95(passes.world), shadowP95Ms: p95(passes.shadow),
            };
          } finally { renderer.render = original; }
        }, style);
        table.push({ distance, style, ...result });
        assert.ok(result.worldP95Ms !== null, 'profile must record draws of the world');
        if (style === 'shader') assert.ok(result.shadowP95Ms !== null, 'Shader profile must draw sun shadows');
        if (native && !/swiftshader|software/i.test(gl)) assert.ok(result.fps >= 30, `${distance}/${style} falls below the 30 FPS reference floor`);
      }
      if (process.env.AISLOPCRAFT_PROFILE_SCREENSHOT) await page.screenshot({ path: `${process.env.AISLOPCRAFT_PROFILE_SCREENSHOT}-${distance}.png` });
    } finally { await page.close(); }
  }
  console.table(table);
} finally {
  await browser?.close();
  await service.close();
}
