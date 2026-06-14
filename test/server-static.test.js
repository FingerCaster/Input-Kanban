import test from 'node:test';
import assert from 'node:assert/strict';

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
