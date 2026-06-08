import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-attention-'));
process.env.KANBAN_RUNS_DIR = tmp;
process.env.KANBAN_RUNNER = 'tmux';
process.env.KANBAN_CODEX_BIN = 'node';
const { refreshRun } = await import(`../src/orchestrator.js?attention=${Date.now()}`);

async function writeRunState(tmp, { runId, runner, startedAt }) {
  const runDir = path.join(tmp, runId);
  const workerDir = path.join(runDir, 'workers', 'T-01');
  await fsp.mkdir(workerDir, { recursive: true });
  await fsp.writeFile(path.join(runDir, 'task.md'), 'task');
  await fsp.writeFile(path.join(runDir, 'run_state.json'), JSON.stringify({
    runId,
    label: 'attention hint',
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

test('running tmux task gets manual attention hint when logs are stale', async () => {
  const startedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const { workerDir } = await writeRunState(tmp, { runId: 'run_stale_tmux', runner: 'tmux', startedAt });
  await fsp.writeFile(path.join(workerDir, 'tmux.json'), JSON.stringify({ runner: 'tmux', attachCommand: 'tmux attach-session -t stale' }));
  await fsp.writeFile(path.join(workerDir, 'events.jsonl'), '{"event":"old"}\n');
  const old = new Date(Date.now() - 8 * 60 * 1000);
  await fsp.utimes(path.join(workerDir, 'events.jsonl'), old, old);

  const state = await refreshRun('run_stale_tmux');
  assert.match(state.tasks[0].attentionHint.message, /manual intervention/);
  assert.match(state.tasks[0].attentionHint.reasons.join(' '), /no recent log updates/);
  assert.equal(state.tasks[0].attentionHint.attachCommand, 'tmux attach-session -t stale');
});

test('running tmux task gets manual attention hint for conservative stderr keywords', async () => {
  const startedAt = new Date().toISOString();
  const { workerDir } = await writeRunState(tmp, { runId: 'run_keyword_tmux', runner: 'tmux', startedAt });
  await fsp.writeFile(path.join(workerDir, 'tmux.json'), JSON.stringify({ runner: 'tmux', attachCommand: 'tmux attach-session -t keyword' }));
  await fsp.writeFile(path.join(workerDir, 'stderr.log'), 'Waiting for approval before continuing.\n');

  const state = await refreshRun('run_keyword_tmux');
  assert.match(state.tasks[0].attentionHint.reasons.join(' '), /approval/);
});

test('headless task without tmux metadata does not get manual attention hint', async () => {
  const startedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const { workerDir } = await writeRunState(tmp, { runId: 'run_headless', runner: 'headless', startedAt });
  await fsp.writeFile(path.join(workerDir, 'stderr.log'), 'Waiting for password.\n');
  const old = new Date(Date.now() - 8 * 60 * 1000);
  await fsp.utimes(path.join(workerDir, 'stderr.log'), old, old);

  const state = await refreshRun('run_headless');
  assert.equal(state.tasks[0].attentionHint, null);
});
