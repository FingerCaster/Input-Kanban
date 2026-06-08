import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-headless-status-'));
process.env.KANBAN_RUNS_DIR = tmp;
process.env.KANBAN_RUNNER = 'headless';
process.env.KANBAN_CODEX_BIN = 'node';
const { refreshRun } = await import(`../src/orchestrator.js?headless-status=${Date.now()}`);

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
  assert.equal(state.tasks[0].attentionHint, null);
});
