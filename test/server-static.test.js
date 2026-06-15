import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { startServer } from '../src/server.js';

test('server serves index.html at root and reports a valid app root', async () => {
  const instance = await startServer({ host: '127.0.0.1', port: 0, log: false, scheduler: false });
  const address = instance.server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const rootResponse = await fetch(`${baseUrl}/`);
    const rootHtml = await rootResponse.text();
    assert.equal(rootResponse.status, 200);
    assert.match(rootHtml, /<title>Input 看板<\/title>/);
    assert.match(rootHtml, /<h1 class="brand">/);

    const healthResponse = await fetch(`${baseUrl}/api/health`);
    const health = await healthResponse.json();
    assert.equal(healthResponse.status, 200);
    assert.equal(health.appRoot, process.cwd());
    assert.equal(typeof health.codexBin, 'string');

    const codexResponse = await fetch(`${baseUrl}/api/codex`);
    const codex = await codexResponse.json();
    assert.equal(codexResponse.status, 200);
    assert.equal(codex.ok, true);
    assert.equal(codex.codex.packageName, '@openai/codex');
    assert.match(codex.codex.installCommand, /npm install -g @openai\/codex/);
  } finally {
    await instance.stop();
  }
});

test('server caches /api/codex detection for a short TTL and reports missing codex', async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-server-codex-cache-'));
  const codexStub = path.join(tmp, 'missing-codex.js');
  const counterFile = path.join(tmp, 'count.txt');
  await fsp.writeFile(codexStub, `#!/usr/bin/env node
const fs = require('fs');
const file = ${JSON.stringify(counterFile)};
let count = 0;
try { count = Number(fs.readFileSync(file, 'utf8')) || 0; } catch {}
fs.writeFileSync(file, String(count + 1));
process.exit(127);
`);
  await fsp.chmod(codexStub, 0o755);

  const child = execFile(process.execPath, ['-e', `
process.env.KANBAN_CODEX_BIN = ${JSON.stringify(codexStub)};
process.env.KANBAN_RUNS_DIR = ${JSON.stringify(path.join(tmp, 'runs'))};
const { startServer } = await import(${JSON.stringify(new URL('../src/server.js', import.meta.url).href)});
const instance = await startServer({ host: '127.0.0.1', port: 0, log: false, scheduler: false });
const address = instance.server.address();
console.log('http://127.0.0.1:' + address.port);
process.on('SIGTERM', async () => { await instance.stop(); process.exit(0); });
setInterval(() => {}, 1000);
`], { stdio: ['ignore', 'pipe', 'pipe'] });

  let baseUrl = '';
  try {
    baseUrl = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error(`server did not start: ${output}`)), 5000);
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) {
          clearTimeout(timer);
          resolve(match[0]);
        }
      });
      child.once('exit', code => {
        clearTimeout(timer);
        reject(new Error(`server exited before start: ${code}`));
      });
    });

    const first = await (await fetch(`${baseUrl}/api/codex`)).json();
    const second = await (await fetch(`${baseUrl}/api/codex`)).json();
    assert.equal(first.ok, true);
    assert.equal(first.codex.installed, false);
    assert.match(first.codex.installHint, /Command failed|127|missing-codex/i);
    assert.equal(second.codex.installHint, first.codex.installHint);
    assert.equal(await fsp.readFile(counterFile, 'utf8'), '1');
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise(resolve => child.once('exit', resolve));
    }
  }
});
