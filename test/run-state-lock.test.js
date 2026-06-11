import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-run-state-lock-'));
process.env.KANBAN_RUNS_DIR = tmp;

const { acquireRunStateLock } = await import(`../src/orchestrator.js?run-state-lock=${Date.now()}`);

test('acquireRunStateLock recovers a stale lock', async () => {
  const runId = 'run_lock_recovery';
  const runDir = path.join(tmp, runId);
  const lockFile = path.join(runDir, 'run_state.lock');
  await fsp.mkdir(runDir, { recursive: true });
  await fsp.writeFile(lockFile, JSON.stringify({ runId, pid: 999999, createdAt: '2026-06-10T00:00:00.000Z' }, null, 2));
  const oldTime = new Date(Date.now() - 120000);
  await fsp.utimes(lockFile, oldTime, oldTime);

  const release = await acquireRunStateLock(runId, { timeoutMs: 1000, staleMs: 1 });
  const lockData = JSON.parse(await fsp.readFile(lockFile, 'utf8'));
  assert.equal(lockData.pid, process.pid);
  assert.equal(lockData.runId, runId);
  await release();
  await assert.rejects(() => fsp.access(lockFile), { code: 'ENOENT' });
});
