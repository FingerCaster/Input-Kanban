import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-attention-removed-'));
process.env.KANBAN_RUNS_DIR = tmp;
process.env.KANBAN_RUNNER = 'tmux';
process.env.KANBAN_CODEX_BIN = 'node';
const { refreshRun } = await import(`../src/orchestrator.js?attention-removed=${Date.now()}`);

async function writeRunState({ runId, runner = 'tmux', startedAt }) {
  const runDir = path.join(tmp, runId);
  const workerDir = path.join(runDir, 'workers', 'T-01');
  await fsp.mkdir(workerDir, { recursive: true });
  await fsp.writeFile(path.join(runDir, 'task.md'), 'task');
  await fsp.writeFile(path.join(runDir, 'run_state.json'), JSON.stringify({
    runId,
    label: 'attention hint removed',
    repo: tmp,
    runner,
    maxParallel: 1,
    status: 'running',
    createdAt: startedAt,
    updatedAt: startedAt,
    planner: { status: 'pending' },
    judge: { status: 'pending' },
    batches: [{
      id: 'batch-1',
      status: 'running',
      maxParallel: 1,
      tasks: [{ id: 'T-01', batchId: 'batch-1', status: 'running', startedAt }]
    }],
    tasks: [{ id: 'T-01', batchId: 'batch-1', status: 'running', startedAt }]
  }, null, 2));
  return { runDir, workerDir };
}

test('tmux codex exec tasks do not show manual intervention hints for stale logs', async () => {
  const startedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const { workerDir } = await writeRunState({ runId: 'run_stale_tmux_no_hint', startedAt });
  await fsp.writeFile(path.join(workerDir, 'tmux.json'), JSON.stringify({ runner: 'tmux', ready: true, status: 'ready', attachCommand: 'tmux attach-session -t stale' }));
  await fsp.writeFile(path.join(workerDir, 'events.jsonl'), '{"event":"old"}\n');
  const old = new Date(Date.now() - 8 * 60 * 1000);
  await fsp.utimes(path.join(workerDir, 'events.jsonl'), old, old);

  const state = await refreshRun('run_stale_tmux_no_hint');
  assert.equal(state.tasks[0].attentionHint, undefined);
});

test('tmux codex exec tasks do not show manual intervention hints for approval-like log text', async () => {
  const startedAt = new Date().toISOString();
  const { workerDir } = await writeRunState({ runId: 'run_keyword_tmux_no_hint', startedAt });
  await fsp.writeFile(path.join(workerDir, 'tmux.json'), JSON.stringify({ runner: 'tmux', ready: true, status: 'ready', attachCommand: 'tmux attach-session -t keyword' }));
  await fsp.writeFile(path.join(workerDir, 'stderr.log'), 'Waiting for approval before continuing.\n');

  const state = await refreshRun('run_keyword_tmux_no_hint');
  assert.equal(state.tasks[0].attentionHint, undefined);
});
