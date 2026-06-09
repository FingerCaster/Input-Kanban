import { execFile } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-create-sandbox-'));
const repo = path.join(tmp, 'repo');
const nonGitRepo = path.join(tmp, 'not-git');
await fsp.mkdir(repo, { recursive: true });
await fsp.mkdir(nonGitRepo, { recursive: true });
await execFileAsync('git', ['init'], { cwd: repo });
process.env.KANBAN_RUNS_DIR = path.join(tmp, 'runs');
process.env.KANBAN_RUNNER = 'headless';
const { createRun } = await import(`../src/orchestrator.js?create-sandbox=${Date.now()}`);

test('createRun stores default worker sandbox', async () => {
  const state = await createRun({ label: 'default sandbox', repo, taskText: 'noop' });
  assert.equal(state.workerSandbox, 'workspace-write');
});

test('createRun stores explicit danger-full-access worker sandbox', async () => {
  const state = await createRun({ label: 'danger sandbox', repo, taskText: 'noop', workerSandbox: 'danger-full-access' });
  assert.equal(state.workerSandbox, 'danger-full-access');
});

test('createRun rejects unknown worker sandbox by falling back to workspace-write', async () => {
  const state = await createRun({ label: 'bad sandbox', repo, taskText: 'noop', workerSandbox: 'not-a-sandbox' });
  assert.equal(state.workerSandbox, 'workspace-write');
});

test('createRun rejects a target directory outside a git work tree', async () => {
  await assert.rejects(
    () => createRun({ label: 'not git', repo: nonGitRepo, taskText: 'noop' }),
    error => error.statusCode === 400 && /not a git work tree/.test(error.message)
  );
});

test('createRun rejects a missing target repository path', async () => {
  await assert.rejects(
    () => createRun({ label: 'missing', repo: path.join(tmp, 'missing'), taskText: 'noop' }),
    error => error.statusCode === 400 && /does not exist/.test(error.message)
  );
});
