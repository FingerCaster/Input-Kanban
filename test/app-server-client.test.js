import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

test('app-server client clears process state when codex spawn fails', async () => {
  const originalCodexBin = process.env.KANBAN_CODEX_BIN;
  process.env.KANBAN_CODEX_BIN = 'input-kanban-missing-app-server-codex';
  try {
    const { CodexAppServerClient } = await import(`../src/appServerClient.js?missing-codex=${Date.now()}`);
    const client = new CodexAppServerClient();
    const startedAt = performance.now();

    await assert.rejects(
      () => client.request('initialize', {}, 5000),
      /input-kanban-missing-app-server-codex|ENOENT|not found/i
    );

    assert.ok(performance.now() - startedAt < 1000);
    assert.equal(client.proc, null);
    assert.equal(client.rl, null);
    assert.equal(client.initialized, false);
  } finally {
    if (originalCodexBin === undefined) delete process.env.KANBAN_CODEX_BIN;
    else process.env.KANBAN_CODEX_BIN = originalCodexBin;
  }
});
