import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-headless-status-'));
const codexStub = path.join(tmp, 'codex-stub.js');
await fsp.writeFile(codexStub, '#!/usr/bin/env node\nsetTimeout(() => process.exit(0), 10000);\n');
await fsp.chmod(codexStub, 0o755);
process.env.KANBAN_RUNS_DIR = tmp;
process.env.KANBAN_RUNNER = 'headless';
process.env.KANBAN_CODEX_BIN = codexStub;
const { refreshRun, autoAdvanceRun, stopRun } = await import(`../src/orchestrator.js?headless-status=${Date.now()}`);

async function writeRunState({ runId, startedAt, status = 'completed' }) {
  const runDir = path.join(tmp, runId);
  const workerDir = path.join(runDir, 'workers', 'T-01');
  await fsp.mkdir(path.join(runDir, 'planner'), { recursive: true });
  await fsp.mkdir(workerDir, { recursive: true });
  await fsp.mkdir(path.join(runDir, 'judge'), { recursive: true });
  await fsp.writeFile(path.join(runDir, 'task.md'), 'task');
  await fsp.writeFile(path.join(runDir, 'run_state.json'), JSON.stringify({
    runId,
    label: 'headless status',
    repo: tmp,
    runner: 'headless',
    maxParallel: 1,
    status: 'running',
    createdAt: startedAt,
    updatedAt: startedAt,
    planner: { status: 'completed' },
    judge: { status: 'pending' },
    batches: [{
      id: 'batch-1',
      status: 'running',
      maxParallel: 1,
      tasks: [{ id: 'T-01', name: 'Worker', batchId: 'batch-1', status, startedAt }]
    }],
    tasks: [{ id: 'T-01', name: 'Worker', batchId: 'batch-1', status, startedAt }]
  }, null, 2));
  return { workerDir };
}

test('refreshRun keeps headless runs free of tmux controls when metadata is absent', async () => {
  const startedAt = '2026-06-08T00:00:00.000Z';
  await writeRunState({ runId: 'run_headless_status', startedAt });

  const state = await refreshRun('run_headless_status');
  assert.equal(state.runner, 'headless');
  assert.equal(state.tmux, undefined);
  assert.equal(state.tasks[0].status, 'completed');
  assert.equal(state.tasks[0].tmux, undefined);
});

test('headless task without tmux metadata does not get manual attention hint', async () => {
  const startedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const { workerDir } = await writeRunState({ runId: 'run_headless_attention', startedAt, status: 'running' });
  await fsp.writeFile(path.join(workerDir, 'stderr.log'), 'Waiting for password.\n');
  const old = new Date(Date.now() - 8 * 60 * 1000);
  await fsp.utimes(path.join(workerDir, 'stderr.log'), old, old);

  const state = await refreshRun('run_headless_attention');
  assert.equal(state.tasks[0].attentionHint, undefined);
});

test('autoAdvanceRun dispatches planned runs through the shared orchestrator path', async () => {
  const runId = 'run_auto_advance_planned';
  const runDir = path.join(tmp, runId);
  await fsp.mkdir(path.join(runDir, 'planner'), { recursive: true });
  await fsp.mkdir(path.join(runDir, 'judge'), { recursive: true });
  await fsp.writeFile(path.join(runDir, 'task.md'), 'task');
  await fsp.writeFile(path.join(runDir, 'run_state.json'), JSON.stringify({
    runId,
    label: 'auto advance planned',
    repo: tmp,
    runner: 'headless',
    maxParallel: 1,
    workerSandbox: 'workspace-write',
    status: 'planned',
    createdAt: '2026-06-08T00:00:00.000Z',
    updatedAt: '2026-06-08T00:00:00.000Z',
    planner: { status: 'completed' },
    judge: { status: 'pending' },
    batches: [{
      id: 'batch-1',
      status: 'pending',
      maxParallel: 1,
      tasks: [{ id: 'T-01', name: 'Worker', batchId: 'batch-1', prompt: 'work', sandbox: 'workspace-write', expectedArtifacts: [], status: 'pending' }]
    }],
    tasks: [{ id: 'T-01', name: 'Worker', batchId: 'batch-1', prompt: 'work', sandbox: 'workspace-write', expectedArtifacts: [], status: 'pending' }]
  }, null, 2));

  const state = await autoAdvanceRun(runId);
  assert.equal(state.status, 'running');
  assert.equal(state.tasks[0].status, 'running');
  assert.ok(state.tasks[0].startedAt);
  assert.ok(state.tasks[0].pid > 0);
  await stopRun(runId, { reason: 'test cleanup' });
});
