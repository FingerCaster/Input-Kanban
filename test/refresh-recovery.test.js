import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-refresh-recovery-'));
process.env.KANBAN_RUNS_DIR = tmp;
process.env.KANBAN_RUNNER = 'tmux';

const { refreshRun } = await import(`../src/orchestrator.js?refresh-recovery=${Date.now()}`);

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(value, null, 2));
}

test('refreshRun materializes a completed planner when tmux exit_code arrived before callback', async () => {
  const runId = 'run_recover_planner';
  const runDir = path.join(tmp, runId);
  const plannerDir = path.join(runDir, 'planner');
  await fsp.mkdir(plannerDir, { recursive: true });
  await fsp.writeFile(path.join(runDir, 'task.md'), 'recover planner');
  await writeJson(path.join(runDir, 'run_state.json'), {
    runId,
    label: 'recover planner',
    repo: tmp,
    maxParallel: 1,
    runner: 'tmux',
    status: 'planning',
    createdAt: '2026-06-09T00:00:00.000Z',
    updatedAt: '2026-06-09T00:00:00.000Z',
    planner: { status: 'running', dir: plannerDir },
    batches: [],
    tasks: [],
    judge: { status: 'pending' }
  });
  await fsp.writeFile(path.join(plannerDir, 'exit_code'), '0');
  await fsp.writeFile(path.join(plannerDir, 'last_message.md'), JSON.stringify({
    tasks: [{ id: 'T-01', name: 'task', prompt: 'do task', sandbox: 'read-only', expectedArtifacts: [] }]
  }));

  const state = await refreshRun(runId);

  assert.equal(state.status, 'planned');
  assert.equal(state.planner.status, 'completed');
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].id, 'T-01');
  const plan = JSON.parse(await fsp.readFile(path.join(runDir, 'plan.json'), 'utf8'));
  assert.equal(plan.tasks[0].id, 'T-01');
});

test('refreshRun writes verdict.json for a completed judge when callback was missed', async () => {
  const runId = 'run_recover_judge';
  const runDir = path.join(tmp, runId);
  const judgeDir = path.join(runDir, 'judge');
  await fsp.mkdir(judgeDir, { recursive: true });
  await fsp.writeFile(path.join(runDir, 'task.md'), 'recover judge');
  await writeJson(path.join(runDir, 'run_state.json'), {
    runId,
    label: 'recover judge',
    repo: tmp,
    maxParallel: 1,
    runner: 'tmux',
    status: 'judging',
    createdAt: '2026-06-09T00:00:00.000Z',
    updatedAt: '2026-06-09T00:00:00.000Z',
    planner: { status: 'completed' },
    batches: [{ id: 'batch-1', name: 'batch', maxParallel: 1, status: 'completed', tasks: [{ id: 'T-01', batchId: 'batch-1', name: 'task', prompt: 'do task', sandbox: 'read-only', expectedArtifacts: [], status: 'completed' }] }],
    tasks: [{ id: 'T-01', batchId: 'batch-1', name: 'task', prompt: 'do task', sandbox: 'read-only', expectedArtifacts: [], status: 'completed' }],
    judge: { status: 'running', dir: judgeDir }
  });
  await fsp.writeFile(path.join(judgeDir, 'exit_code'), '0');
  await fsp.writeFile(path.join(judgeDir, 'last_message.md'), JSON.stringify({
    verdict: 'passed',
    completedTasks: ['T-01'],
    failedTasks: [],
    blockedTasks: [],
    missingArtifacts: [],
    scopeViolations: [],
    residualRisk: [],
    recommendedNextActions: []
  }));

  const state = await refreshRun(runId);

  assert.equal(state.status, 'judged');
  assert.equal(state.judge.status, 'completed');
  assert.equal(state.judge.verdict.verdict, 'passed');
  const verdict = JSON.parse(await fsp.readFile(path.join(judgeDir, 'verdict.json'), 'utf8'));
  assert.equal(verdict.verdict, 'passed');
});
