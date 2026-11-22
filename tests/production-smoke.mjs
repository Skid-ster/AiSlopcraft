import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const portProbe = createServer();
await new Promise((resolveListen, reject) => {
  portProbe.once('error', reject);
  portProbe.listen(0, '127.0.0.1', resolveListen);
});
const { port } = portProbe.address();
await new Promise((resolveClose, reject) => portProbe.close(error => error ? reject(error) : resolveClose()));

const server = spawn(process.execPath, [resolve(root, 'server/multiplayer.js')], {
  cwd: root,
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'production' },
  stdio: 'inherit',
});
let serverExited = null;
const exited = new Promise(resolveExit => server.once('exit', (code, signal) => {
  serverExited = { code, signal };
  resolveExit(serverExited);
}));
let succeeded = false;
try {
  const baseUrl = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (serverExited) throw new Error(`Production server exited early (${serverExited.code ?? serverExited.signal}).`);
    try {
      const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) { ready = true; break; }
    } catch {}
    await delay(125);
  }
  assert.ok(ready, 'built production service starts and responds to health checks');

  const smoke = spawn(process.execPath, [resolve(root, 'tests/deployment-smoke.mjs')], {
    cwd: root,
    env: { ...process.env, BASE_URL: baseUrl },
    stdio: 'inherit',
  });
  const result = await new Promise((resolveSmoke, rejectSmoke) => {
    smoke.once('error', rejectSmoke);
    smoke.once('exit', (code, signal) => resolveSmoke({ code, signal }));
  });
  assert.equal(result.code, 0, `deployment smoke failed (${result.code ?? result.signal})`);
  console.log('Built production server smoke passed on an ephemeral local port.');
  succeeded = true;
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    server.kill('SIGTERM');
    await Promise.race([exited, delay(5_000)]);
    if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL');
  }
}
if (!succeeded) process.exitCode = 1;
