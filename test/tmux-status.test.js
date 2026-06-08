import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-tmux-status-'));
process.env.KANBAN_RUNS_DIR = tmp;
process.env.KANBAN_RUNNER = 'tmux';
process.env.KANBAN_CODEX_BIN = 'node';
const { refreshRun } = await import(`../src/orchestrator.js?tmux-status=${Date.now()}`);

test('refreshRun exposes tmux metadata from role artifacts without changing status display fields', async () => {
  const runId = 'run_tmux_status';
  const runDir = path.join(tmp, runId);
  const workerDir = path.join(runDir, 'workers', 'T-01');
  await fsp.mkdir(path.join(runDir, 'planner'), { recursive: true });
  await fsp.mkdir(workerDir, { recursive: true });
  await fsp.mkdir(path.join(runDir, 'judge'), { recursive: true });
  await fsp.writeFile(path.join(runDir, 'task.md'), 'task');
  await fsp.writeFile(path.join(workerDir, 'tmux.json'), JSON.stringify({
    type: 'input_kanban_tmux_task',
    runner: 'tmux',
    sessionName: 'input-kanban-run_tmux_status',
    windowName: 'worker-T-01',
    target: 'input-kanban-run_tmux_status:worker-T-01',
    attachCommand: 'tmux attach-session -t input-kanban-run_tmux_status',
    selectCommand: 'tmux select-window -t input-kanban-run_tmux_status:worker-T-01',
    runScript: path.join(workerDir, 'run.sh'),
    startedAt: '2026-06-08T00:00:00.000Z'
  }, null, 2));
  await fsp.writeFile(path.join(runDir, 'run_state.json'), JSON.stringify({
    runId,
    label: 'tmux status',
    repo: tmp,
    maxParallel: 1,
    status: 'running',
    createdAt: '2026-06-08T00:00:00.000Z',
    updatedAt: '2026-06-08T00:00:00.000Z',
    planner: { status: 'completed' },
    judge: { status: 'pending' },
    batches: [{
      id: 'batch-1',
      status: 'running',
      maxParallel: 1,
      tasks: [{ id: 'T-01', name: 'Worker', batchId: 'batch-1', status: 'completed' }]
    }],
    tasks: [{ id: 'T-01', name: 'Worker', batchId: 'batch-1', status: 'completed' }]
  }, null, 2));

  const state = await refreshRun(runId);
  assert.equal(state.runner, 'tmux');
  assert.equal(state.tasks[0].status, 'completed');
  assert.equal(state.tasks[0].tmux.sessionName, 'input-kanban-run_tmux_status');
  assert.equal(state.tasks[0].tmux.windowName, 'worker-T-01');
  assert.equal(state.tasks[0].tmux.attachCommand, 'tmux attach-session -t input-kanban-run_tmux_status');
  assert.equal(state.tasks[0].tmux.selectWindowCommand, 'tmux select-window -t input-kanban-run_tmux_status:worker-T-01');
  assert.equal(state.batches[0].tasks[0].tmux.selectWindowCommand, state.tasks[0].tmux.selectWindowCommand);
});
