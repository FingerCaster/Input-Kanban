import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('stop marks running roles and tasks stopped without removing artifacts', async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-stop-'));
  process.env.KANBAN_RUNS_DIR = tmp;
  process.env.KANBAN_RUNNER = 'headless';
  process.env.KANBAN_CODEX_BIN = 'node';

  const { stopRun, loadRun, dispatchRun, startPlanner } = await import(`../src/orchestrator.js?stop-test=${Date.now()}`);
  const runId = 'run_stop_state';
  const runDir = path.join(tmp, runId);
  const workerDir = path.join(runDir, 'workers', 'T-01');
  await fsp.mkdir(workerDir, { recursive: true });
  await fsp.writeFile(path.join(workerDir, 'tmux.json'), '{"sessionName":"input-kanban-run_stop_state"}');
  await fsp.writeFile(path.join(workerDir, 'events.jsonl'), '{"event":"kept"}\n');
  await fsp.writeFile(path.join(runDir, 'task.md'), 'task');
  await fsp.writeFile(path.join(runDir, 'run_state.json'), JSON.stringify({
    runId,
    label: 'stop state',
    repo: tmp,
    maxParallel: 1,
    status: 'running',
    createdAt: '2026-06-08T00:00:00.000Z',
    updatedAt: '2026-06-08T00:00:00.000Z',
    planner: { status: 'running' },
    judge: { status: 'running' },
    batches: [{
      id: 'batch-1',
      status: 'running',
      maxParallel: 1,
      tasks: [{ id: 'T-01', batchId: 'batch-1', status: 'running' }]
    }],
    tasks: [{ id: 'T-01', batchId: 'batch-1', status: 'running' }]
  }, null, 2));

  const stopped = await stopRun(runId, { reason: 'test stop' });
  assert.equal(stopped.status, 'stopped');
  assert.equal(stopped.planner.status, 'stopped');
  assert.equal(stopped.judge.status, 'stopped');
  assert.equal(stopped.tasks[0].status, 'stopped');
  assert.equal(stopped.batches[0].status, 'stopped');
  assert.equal(stopped.stopInfo.reason, 'test stop');
  assert.equal(await fsp.readFile(path.join(workerDir, 'tmux.json'), 'utf8'), '{"sessionName":"input-kanban-run_stop_state"}');
  assert.equal(await fsp.readFile(path.join(workerDir, 'events.jsonl'), 'utf8'), '{"event":"kept"}\n');

  const persisted = await loadRun(runId);
  assert.equal(persisted.status, 'stopped');
  await assert.rejects(() => dispatchRun(runId), /stopped run cannot be dispatched/);
  await assert.rejects(() => startPlanner(runId), /stopped run cannot be planned/);
});
