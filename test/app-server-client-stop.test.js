import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('app-server stop rejects pending requests immediately', async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-app-server-stop-'));
  const codexStub = path.join(tmp, 'codex-stub.cjs');
  await fsp.writeFile(codexStub, 'setInterval(() => {}, 1000);\n');

  const originalCodexBin = process.env.KANBAN_CODEX_BIN;
  process.env.KANBAN_CODEX_BIN = codexStub;
  try {
    const { CodexAppServerClient } = await import(`../src/appServerClient.js?stop=${Date.now()}`);
    const client = new CodexAppServerClient();
    const pending = client.request('initialize', {}, 5000);
    client.stop();

    await assert.rejects(pending, /app-server stopped/);
    assert.equal(client.proc, null);
    assert.equal(client.rl, null);
    assert.equal(client.pending.size, 0);
  } finally {
    if (originalCodexBin === undefined) delete process.env.KANBAN_CODEX_BIN;
    else process.env.KANBAN_CODEX_BIN = originalCodexBin;
  }
});

test('app-server request rejects immediately when stdin is unavailable', async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-app-server-stdin-'));
  const codexStub = path.join(tmp, 'codex-stub.cjs');
  await fsp.writeFile(codexStub, 'setInterval(() => {}, 1000);\n');

  const originalCodexBin = process.env.KANBAN_CODEX_BIN;
  process.env.KANBAN_CODEX_BIN = codexStub;
  try {
    const { CodexAppServerClient } = await import(`../src/appServerClient.js?stdin=${Date.now()}`);
    const client = new CodexAppServerClient();
    client.start();
    client.proc.stdin.destroy();

    await assert.rejects(
      () => client.request('initialize', {}, 5000),
      /app-server unavailable|stream/i
    );
    assert.equal(client.pending.size, 0);
    client.stop();
  } finally {
    if (originalCodexBin === undefined) delete process.env.KANBAN_CODEX_BIN;
    else process.env.KANBAN_CODEX_BIN = originalCodexBin;
  }
});
