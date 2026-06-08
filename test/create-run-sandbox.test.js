import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-create-sandbox-'));
process.env.KANBAN_RUNS_DIR = tmp;
process.env.KANBAN_RUNNER = 'headless';
const { createRun } = await import(`../src/orchestrator.js?create-sandbox=${Date.now()}`);

test('createRun stores default worker sandbox', async () => {
  const state = await createRun({ label: 'default sandbox', repo: tmp, taskText: 'noop' });
  assert.equal(state.workerSandbox, 'workspace-write');
});

test('createRun stores explicit danger-full-access worker sandbox', async () => {
  const state = await createRun({ label: 'danger sandbox', repo: tmp, taskText: 'noop', workerSandbox: 'danger-full-access' });
  assert.equal(state.workerSandbox, 'danger-full-access');
});

test('createRun rejects unknown worker sandbox by falling back to workspace-write', async () => {
  const state = await createRun({ label: 'bad sandbox', repo: tmp, taskText: 'noop', workerSandbox: 'not-a-sandbox' });
  assert.equal(state.workerSandbox, 'workspace-write');
});
