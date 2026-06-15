import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-judge-idempotency-'));
const codexStub = path.join(tmp, 'codex-stub.js');
const markerFile = path.join(tmp, 'judge-starts.log');
await fsp.writeFile(codexStub, `#!/usr/bin/env node
const fs = require('fs');
fs.appendFileSync(${JSON.stringify(markerFile)}, 'start\\n');
setInterval(() => {}, 1000);
`);
await fsp.chmod(codexStub, 0o755);

process.env.KANBAN_RUNS_DIR = path.join(tmp, 'runs');
process.env.KANBAN_RUNNER = 'headless';
process.env.KANBAN_CODEX_BIN = codexStub;

const { startJudge, stopRun } = await import(`../src/orchestrator.js?judge-idempotency=${Date.now()}`);

async function writeCompletedRun(runId, judge = { status: 'pending' }) {
  const runDir = path.join(process.env.KANBAN_RUNS_DIR, runId);
  const task = { id: 'T-01', batchId: 'batch-1', name: 'task', prompt: 'done', status: 'completed', expectedArtifacts: [] };
  await fsp.mkdir(runDir, { recursive: true });
  await fsp.writeFile(path.join(runDir, 'task.md'), 'judge idempotency');
  await fsp.writeFile(path.join(runDir, 'plan.json'), JSON.stringify({ batches: [{ id: 'batch-1', tasks: [task] }] }, null, 2));
  await fsp.writeFile(path.join(runDir, 'run_state.json'), JSON.stringify({
    runId,
    label: 'judge idempotency',
    repo: tmp,
    workspacePath: tmp,
    maxParallel: 1,
    runner: 'headless',
    status: judge.status === 'completed' ? 'judged' : judge.status === 'failed' ? 'judge_failed' : 'batches_completed',
    createdAt: '2026-06-14T00:00:00.000Z',
    updatedAt: '2026-06-14T00:00:00.000Z',
    gates: { planApproval: { required: false, approved: true, approvedAt: null, approvedBy: null } },
    planner: { status: 'completed' },
    batches: [{ id: 'batch-1', name: 'batch', maxParallel: 1, status: 'completed', tasks: [task] }],
    tasks: [task],
    judge
  }, null, 2));
  return runDir;
}

async function countJudgeStarts() {
  try {
    return (await fsp.readFile(markerFile, 'utf8')).trim().split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

async function waitForJudgeStarts(expected) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const count = await countJudgeStarts();
    if (count >= expected) return count;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return await countJudgeStarts();
}

test('startJudge rejects a direct duplicate start while judge is running', async () => {
  const runId = 'run_duplicate_judge';
  await writeCompletedRun(runId);

  const first = await startJudge(runId);
  assert.equal(first.judge.status, 'running');
  assert.ok(first.judge.pid);
  assert.equal(await waitForJudgeStarts(1), 1);
  await assert.rejects(() => startJudge(runId), /judge already running/);
  assert.equal(await countJudgeStarts(), 1);

  await stopRun(runId, { reason: 'cleanup duplicate judge test' });
});

test('startJudge leaves completed judges immutable and allows failed judges to retry', async () => {
  await writeCompletedRun('run_completed_judge', {
    status: 'completed',
    exitCode: 0,
    startedAt: '2026-06-14T00:01:00.000Z',
    endedAt: '2026-06-14T00:02:00.000Z',
    dir: path.join(process.env.KANBAN_RUNS_DIR, 'run_completed_judge', 'judge')
  });
  await assert.rejects(() => startJudge('run_completed_judge'), /judge already completed/);

  const failedRunDir = await writeCompletedRun('run_failed_judge', {
    status: 'failed',
    exitCode: 1,
    startedAt: '2026-06-14T00:03:00.000Z',
    endedAt: '2026-06-14T00:04:00.000Z',
    dir: path.join(process.env.KANBAN_RUNS_DIR, 'run_failed_judge', 'judge')
  });
  await fsp.mkdir(path.join(failedRunDir, 'judge'), { recursive: true });
  await fsp.writeFile(path.join(failedRunDir, 'judge', 'stderr.log'), 'failed judge');

  const beforeRetryStarts = await countJudgeStarts();
  const retried = await startJudge('run_failed_judge');
  assert.equal(retried.judge.status, 'running');
  assert.equal(retried.judge.attempt, 2);
  assert.equal(await waitForJudgeStarts(beforeRetryStarts + 1), beforeRetryStarts + 1);
  assert.equal(await fsp.readFile(path.join(failedRunDir, 'judge_attempts', 'attempt-01', 'stderr.log'), 'utf8'), 'failed judge');

  await stopRun('run_failed_judge', { reason: 'cleanup failed judge retry test' });
});

test('startJudge allocates the next retry attempt after historical judge attempts', async () => {
  const runId = 'run_historical_failed_judge';
  const runDir = await writeCompletedRun(runId, {
    status: 'failed',
    exitCode: 1,
    startedAt: '2026-06-14T00:05:00.000Z',
    endedAt: '2026-06-14T00:06:00.000Z',
    dir: path.join(process.env.KANBAN_RUNS_DIR, runId, 'judge')
  });
  const statePath = path.join(runDir, 'run_state.json');
  const state = JSON.parse(await fsp.readFile(statePath, 'utf8'));
  state.judgeAttempts = [{ attempt: 1, status: 'failed' }];
  await fsp.writeFile(statePath, JSON.stringify(state, null, 2));
  await fsp.mkdir(path.join(runDir, 'judge'), { recursive: true });
  await fsp.writeFile(path.join(runDir, 'judge', 'stderr.log'), 'second failed judge');

  const beforeRetryStarts = await countJudgeStarts();
  const retried = await startJudge(runId);
  assert.equal(retried.judge.attempt, 3);
  assert.equal(await waitForJudgeStarts(beforeRetryStarts + 1), beforeRetryStarts + 1);
  assert.equal(await fsp.readFile(path.join(runDir, 'judge_attempts', 'attempt-02', 'stderr.log'), 'utf8'), 'second failed judge');

  await stopRun(runId, { reason: 'cleanup historical judge retry test' });
});
