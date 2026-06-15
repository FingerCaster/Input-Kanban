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
const { createRun, listRuns, loadRun, markTaskCompleted, readRunFile, renameRun } = await import(`../src/orchestrator.js?create-sandbox=${Date.now()}`);

test('createRun derives a label from task text when omitted', async () => {
  const state = await createRun({ repo, taskText: '请修复登录问题，并补充回归测试\n\n更多细节' });
  assert.equal(state.label, '请修复登录问题，并补充回归测试');
  assert.match(state.runId, /^run_.*_run_/);
});

test('createRun truncates derived labels by display width', async () => {
  const state = await createRun({ repo, taskText: '请按两批完成任务：第一批并行生成三个随机整数，第二批求和并判断是否为十的倍数' });
  assert.equal(state.label, '请按两批完成任务：第一批并行生成三个随机…');
});

test('createRun stores default worker sandbox', async () => {
  const state = await createRun({ label: 'default sandbox', repo, taskText: 'noop' });
  assert.equal(state.workerSandbox, 'workspace-write');
});

test('createRun stores optional plan approval gate', async () => {
  const open = await createRun({ label: 'open gate', repo, taskText: 'noop' });
  assert.deepEqual(open.gates.planApproval, { required: false, approved: true, approvedAt: null, approvedBy: null });

  const gated = await createRun({ label: 'plan gate', repo, taskText: 'noop', planApproval: true });
  assert.equal(gated.gates.planApproval.required, true);
  assert.equal(gated.gates.planApproval.approved, false);
  assert.equal(gated.gates.planApproval.approvedAt, null);
});

test('createRun stores explicit danger-full-access worker sandbox', async () => {
  const state = await createRun({ label: 'danger sandbox', repo, taskText: 'noop', workerSandbox: 'danger-full-access' });
  assert.equal(state.workerSandbox, 'danger-full-access');
});

test('createRun rejects unknown worker sandbox by falling back to workspace-write', async () => {
  const state = await createRun({ label: 'bad sandbox', repo, taskText: 'noop', workerSandbox: 'not-a-sandbox' });
  assert.equal(state.workerSandbox, 'workspace-write');
});

test('createRun accepts a non-git workspace directory', async () => {
  const state = await createRun({ label: 'not git', workspace: nonGitRepo, taskText: 'noop' });
  assert.equal(state.workspacePath, nonGitRepo);
  assert.equal(state.repo, nonGitRepo);
  assert.equal(state.git.isGit, false);
  assert.equal(state.workspace.git.isGit, false);
});

test('createRun marks a git workspace when available', async () => {
  const state = await createRun({ label: 'git workspace', repo, taskText: 'noop' });
  assert.equal(state.workspacePath, repo);
  assert.equal(state.repo, repo);
  assert.equal(state.git.isGit, true);
  assert.equal(state.workspace.git.isGit, true);
  assert.ok(state.git.gitRoot);
});

test('createRun rejects a missing workspace path', async () => {
  await assert.rejects(
    () => createRun({ label: 'missing', workspace: path.join(tmp, 'missing'), taskText: 'noop' }),
    error => error.statusCode === 400 && /does not exist/.test(error.message)
  );
});

test('renameRun updates and trims a run label', async () => {
  const state = await createRun({ label: 'old label', repo, taskText: 'noop' });
  const renamed = await renameRun(state.runId, { label: '  new label  ' });
  assert.equal(renamed.label, 'new label');
  assert.ok(renamed.renamedAt);
  const persisted = await loadRun(state.runId);
  assert.equal(persisted.label, 'new label');
});

test('renameRun rejects an empty run label', async () => {
  const state = await createRun({ label: 'keep label', repo, taskText: 'noop' });
  await assert.rejects(
    () => renameRun(state.runId, { label: '   ' }),
    error => error.statusCode === 400 && /label cannot be empty/.test(error.message)
  );
});

test('listRuns freezes duration after run is judged', async () => {
  const state = await createRun({ label: 'judged duration', repo, taskText: 'noop' });
  const runDir = path.join(process.env.KANBAN_RUNS_DIR, state.runId);
  state.status = 'judged';
  state.createdAt = '2026-06-10T08:00:00.000Z';
  state.updatedAt = '2026-06-10T08:07:00.000Z';
  state.planner = { id: 'planner', status: 'completed', endedAt: '2026-06-10T08:01:00.000Z' };
  state.tasks = [{ id: 'T-01', status: 'completed', endedAt: '2026-06-10T08:05:00.000Z' }];
  state.batches = [{ id: 'batch-1', name: 'batch', status: 'completed', tasks: state.tasks }];
  state.judge = { id: 'judge', status: 'completed', endedAt: '2026-06-10T08:06:00.000Z' };
  await fsp.writeFile(path.join(runDir, 'run_state.json'), JSON.stringify(state, null, 2));

  const listed = await listRuns();
  const summary = listed.find(run => run.runId === state.runId);

  assert.equal(summary.durationEnd, '2026-06-10T08:06:00.000Z');
});

test('markTaskCompleted stores manual success result text', async () => {
  const state = await createRun({ label: 'manual result', repo, taskText: 'noop' });
  const runDir = path.join(process.env.KANBAN_RUNS_DIR, state.runId);
  const workerDir = path.join(runDir, 'workers', 'T-01');
  await fsp.mkdir(workerDir, { recursive: true });
  state.status = 'batch_blocked';
  state.batches = [{ id: 'batch-1', name: 'batch', maxParallel: 1, status: 'failed', tasks: [{ id: 'T-01', batchId: 'batch-1', name: 'task', status: 'failed', exitCode: 1, expectedArtifacts: [] }] }];
  state.tasks = state.batches[0].tasks;
  await fsp.writeFile(path.join(runDir, 'run_state.json'), JSON.stringify(state, null, 2));

  const marked = await markTaskCompleted(state.runId, 'T-01', { resultText: 'manual success evidence' });

  assert.equal(marked.tasks[0].status, 'completed');
  assert.equal(marked.tasks[0].manualCompletion.hasManualResult, true);
  assert.equal(await readRunFile(state.runId, 'T-01', 'manual_result.md'), 'manual success evidence');
  const completion = JSON.parse(await readRunFile(state.runId, 'T-01', 'manual_completion.json'));
  assert.equal(completion.manualResultFile, 'manual_result.md');
});
