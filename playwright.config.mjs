import { defineConfig } from '@playwright/test';

const port = process.env.AISLOPCRAFT_E2E_PORT || '38787';
const baseURL = `http://127.0.0.1:${port}`;

// Test the Render-style combined service, not the Vite development server.
// https://playwright.dev/docs/test-webserver
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 180_000,
  globalTimeout: 12 * 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  use: {
    baseURL,
    browserName: 'chromium',
    viewport: { width: 800, height: 600 },
    launchOptions: { args: process.env.AISLOPCRAFT_HARDWARE_GL === '1'
      ? ['--enable-gpu']
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    trace: { mode: 'retain-on-failure', screenshots: false },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node server/multiplayer.js',
    env: { HOST: '127.0.0.1', PORT: port },
    url: `${baseURL}/health`,
    reuseExistingServer: false,
  },
});
