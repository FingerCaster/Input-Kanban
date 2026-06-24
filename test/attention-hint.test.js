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

test('worker context unauthorized logs surface an attention hint', async () => {
  const startedAt = new Date().toISOString();
  const { workerDir } = await writeRunState({ runId: 'run_worker_context_unauthorized', startedAt });
  await fsp.writeFile(path.join(workerDir, 'stderr.log'), 'Worker context unauthorized: request denied.\n');
  await fsp.writeFile(path.join(workerDir, 'exit_code'), '1');

  const state = await refreshRun('run_worker_context_unauthorized');
  assert.equal(state.tasks[0].status, 'failed');
  assert.equal(state.tasks[0].attentionHint.kind, 'worker_context_unauthorized');
  assert.match(state.tasks[0].attentionHint.message, /Worker context 无授权/);
  assert.equal(state.batches[0].tasks[0].attentionHint.kind, 'worker_context_unauthorized');
});

test('patch context drift logs surface a running attention hint', async () => {
  const startedAt = new Date().toISOString();
  const { workerDir } = await writeRunState({ runId: 'run_patch_context_drift', startedAt });
  await fsp.writeFile(path.join(workerDir, 'stderr.log'), 'ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines\n');

  const state = await refreshRun('run_patch_context_drift');
  assert.equal(state.tasks[0].status, 'running');
  assert.equal(state.tasks[0].attentionHint.kind, 'patch_context_drift');
  assert.match(state.tasks[0].attentionHint.message, /Patch 上下文不匹配/);
});

test('environment HTTP blockers surface a running attention hint', async () => {
  const startedAt = new Date().toISOString();
  const { workerDir } = await writeRunState({ runId: 'run_environment_blocked', startedAt });
  await fsp.writeFile(path.join(workerDir, 'last_message.md'), 'Benchmark preflight stopped: HTTP 409 values profile unavailable for report 303.\n');

  const state = await refreshRun('run_environment_blocked');
  assert.equal(state.tasks[0].status, 'running');
  assert.equal(state.tasks[0].attentionHint.kind, 'environment_blocked');
  assert.match(state.tasks[0].attentionHint.message, /外部环境/);
});

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
