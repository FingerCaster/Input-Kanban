import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = await fsp.readFile(new URL('../bin/input-kanban.js', import.meta.url), 'utf8');
const readme = await fsp.readFile(new URL('../README.md', import.meta.url), 'utf8');
const packageJson = JSON.parse(await fsp.readFile(new URL('../package.json', import.meta.url), 'utf8'));
const cliPath = fileURLToPath(new URL('../bin/input-kanban.js', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const versionOnly = execFileSync(process.execPath, [cliPath, '--version'], { env: { ...process.env, NODE_NO_WARNINGS: '1' }, encoding: 'utf8' }).trim();

async function writeRunState(runsDir, runId, state, extraFiles = []) {
  const runDir = path.join(runsDir, runId);
  await fsp.mkdir(runDir, { recursive: true });
  await fsp.writeFile(path.join(runDir, 'run_state.json'), JSON.stringify(state, null, 2));
  for (const [relativePath, content] of extraFiles) {
    const filePath = path.join(runDir, relativePath);
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, content);
  }
}

function runCli(args, env = {}) {
  return execFileSync(process.execPath, [cliPath, ...args], { env: { ...process.env, NODE_NO_WARNINGS: '1', ...env }, encoding: 'utf8' });
}

test('CLI exposes version output', () => {
  assert.equal(versionOnly, `input-kanban v${packageJson.version}`);
  assert.match(cli, /printVersion\(\)/);
  assert.match(cli, /Input Kanban v\$\{PACKAGE_VERSION\} started/);
});

test('CLI emits JSON runs output for active discovery', async () => {
  const runsDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-json-runs-'));
  await writeRunState(runsDir, 'run_active', {
    runId: 'run_active',
    label: 'active run',
    repo: repoRoot,
    runner: 'headless',
    workerSandbox: 'workspace-write',
    status: 'running',
    createdAt: '2026-06-10T00:00:01.000Z',
    updatedAt: '2026-06-10T00:00:01.000Z',
    planner: { status: 'completed' },
    tasks: [{ id: 'T-01', status: 'running' }],
    batches: [],
    judge: { status: 'pending' }
  });
  await writeRunState(runsDir, 'run_done', {
    runId: 'run_done',
    label: 'done run',
    repo: repoRoot,
    runner: 'headless',
    workerSandbox: 'workspace-write',
    status: 'judged',
    createdAt: '2026-06-10T00:00:00.000Z',
    updatedAt: '2026-06-10T00:00:00.000Z',
    planner: { status: 'completed' },
    tasks: [],
    batches: [],
    judge: { status: 'completed' }
  });
  const output = runCli(['--json', 'runs', '--active', '--runs-dir', runsDir]);
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command, 'runs');
  assert.equal(parsed.active, true);
  assert.equal(parsed.count, 1);
  assert.equal(parsed.runs[0].runId, 'run_active');
  assert.equal(parsed.runs[0].running, 1);
});

test('CLI emits JSON status output', async () => {
  const runsDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-json-status-'));
  const runId = 'run_json_status';
  await writeRunState(runsDir, runId, {
    runId,
    label: 'json status',
    repo: repoRoot,
    runner: 'headless',
    workerSandbox: 'workspace-write',
    status: 'created',
    createdAt: '2026-06-10T00:00:00.000Z',
    updatedAt: '2026-06-10T00:00:00.000Z',
    planner: { status: 'pending' },
    tasks: [],
    batches: [],
    judge: { status: 'pending' }
  });
  const output = runCli(['--json', 'status', runId, '--runs-dir', runsDir]);
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command, 'status');
  assert.equal(parsed.run.runId, runId);
  assert.equal(parsed.run.status, 'created');
  assert.equal(parsed.run.total, 0);
});

test('CLI emits JSON result output', async () => {
  const runsDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-json-result-'));
  const runId = 'run_json_result';
  await writeRunState(runsDir, runId, {
    runId,
    label: 'json result',
    repo: repoRoot,
    runner: 'headless',
    workerSandbox: 'workspace-write',
    status: 'judged',
    createdAt: '2026-06-10T00:00:00.000Z',
    updatedAt: '2026-06-10T00:00:00.000Z',
    planner: { status: 'completed' },
    tasks: [],
    batches: [],
    judge: { status: 'completed' }
  }, [['judge/verdict.json', JSON.stringify({ verdict: 'passed', completedTasks: ['T-01'] }, null, 2)]]);
  const output = runCli(['--json', 'result', runId, '--runs-dir', runsDir]);
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command, 'result');
  assert.equal(parsed.run.runId, runId);
  assert.equal(parsed.source, 'judge/verdict.json');
  assert.deepEqual(parsed.result, { verdict: 'passed', completedTasks: ['T-01'] });
});

test('CLI emits JSON retry output and preserves failed attempt', async () => {
  const runsDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-json-retry-'));
  const runId = 'run_json_retry';
  const failedTask = { id: 'T-01', batchId: 'batch-1', name: 'task', prompt: 'retry me', sandbox: 'read-only', expectedArtifacts: [], status: 'failed', exitCode: 1 };
  await writeRunState(runsDir, runId, {
    runId,
    label: 'json retry',
    repo: runsDir,
    runner: 'headless',
    workerSandbox: 'workspace-write',
    status: 'batch_blocked',
    maxParallel: 1,
    createdAt: '2026-06-10T00:00:00.000Z',
    updatedAt: '2026-06-10T00:00:00.000Z',
    planner: { status: 'completed' },
    batches: [{ id: 'batch-1', name: 'batch', maxParallel: 1, status: 'failed', tasks: [failedTask] }],
    tasks: [failedTask],
    judge: { status: 'pending' }
  }, [['workers/T-01/stderr.log', 'boom'], ['workers/T-01/exit_code', '1']]);
  const output = runCli(['--json', 'retry', runId, 'T-01', '--runs-dir', runsDir], { KANBAN_CODEX_BIN: '/bin/echo' });
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command, 'retry');
  assert.deepEqual(parsed.retriedTaskIds, ['T-01']);
  assert.equal(parsed.run.runId, runId);
  assert.equal(parsed.run.running, 1);
  const archivedStderr = await fsp.readFile(path.join(runsDir, runId, 'worker_attempts', 'T-01', 'attempt-01', 'stderr.log'), 'utf8');
  assert.equal(archivedStderr, 'boom');
});

test('CLI emits JSON stop output', async () => {
  const runsDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-json-stop-'));
  const runId = 'run_json_stop';
  await writeRunState(runsDir, runId, {
    runId,
    label: 'json stop',
    repo: repoRoot,
    runner: 'headless',
    workerSandbox: 'workspace-write',
    status: 'created',
    createdAt: '2026-06-10T00:00:00.000Z',
    updatedAt: '2026-06-10T00:00:00.000Z',
    planner: { status: 'pending' },
    tasks: [],
    batches: [],
    judge: { status: 'pending' }
  });
  const output = runCli(['--json', 'stop', runId, '--runs-dir', runsDir]);
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command, 'stop');
  assert.equal(parsed.run.runId, runId);
  assert.equal(parsed.run.status, 'stopped');
  assert.equal(parsed.reason, 'stopped from CLI');
});

test('CLI exposes submit auto loop without replacing serve mode', () => {
  assert.match(cli, /COMMANDS = new Set\(\['serve', 'submit', 'runs', 'status', 'result', 'retry', 'stop', 'auto'\]\)/);
  assert.match(cli, /input-kanban v\$\{PACKAGE_VERSION\}/);
  assert.match(cli, /input-kanban --version/);
  assert.match(cli, /input-kanban runs \[options\]/);
  assert.match(cli, /function parseRunsArgs\(argv\)/);
  assert.match(cli, /async function runs\(args\)/);
  assert.match(cli, /--active\s+Show only active or pending-action runs/);
  assert.match(cli, /input-kanban retry <runId> \[taskId\]/);
  assert.match(cli, /await retryRun\(args\.runId/);
  assert.match(cli, /input-kanban submit \[options\]/);
  assert.match(cli, /--auto\s+Plan, dispatch all batches, judge, and watch, default for submit/);
  assert.match(cli, /--no-auto\s+Only create the run and start planning/);
  assert.match(cli, /Task batch name, default generated from task text/);
  assert.match(cli, /-d, --detach\s+Run the default auto loop in a background supervisor/);
  assert.match(cli, /auto: true, detach: false, watch: true/);
  assert.match(cli, /async function autoRun\(args\)/);
  assert.match(cli, /function startDetachedAuto\(runId, args\)/);
  assert.match(cli, /async function result\(args\)/);
  assert.match(cli, /async function retry\(args\)/);
  assert.match(cli, /async function copyToClipboard\(text\)/);
  assert.match(cli, /await readRunFile\(runId, 'judge', 'verdict\.json'\)/);
  assert.match(cli, /async function stop\(args\)/);
  assert.match(cli, /await stopRun\(args\.runId, \{ reason: args\.reason \}\)/);
  assert.match(cli, /await createRun\(/);
  assert.match(cli, /await startPlanner\(state\.runId\)/);
  assert.match(cli, /await dispatchRun\(runId\)/);
  assert.match(cli, /await startJudge\(runId\)/);
  assert.match(cli, /function hasRecoverableUnknownTask\(state\)/);
  assert.match(cli, /async function confirmFailureTerminal\(runId, state, refreshRun, pollMs\)/);
  assert.match(cli, /Date\.now\(\) \+ 30000/);
  assert.match(cli, /async function latestRunId\(\)/);
  assert.match(cli, /const STATUS_TEXT = \{/);
  assert.match(cli, /任务批次: \$\{state\.label/);
  assert.match(cli, /状态 \$\{displayStatus\(state\.status\)\}/);
  assert.match(cli, /input-kanban status <runId> --watch/);
});

test('README documents CLI runs are visible in the Web dashboard', () => {
  assert.match(readme, /input-kanban submit --task-file task\.md --label "修复登录问题"/);
  assert.match(readme, /input-kanban submit --task "修复登录问题，并补充回归测试" --label "修复登录问题"/);
  assert.match(readme, /input-kanban submit --task-file task\.md -d/);
  assert.match(readme, /默认 repo 是当前目录/);
  assert.match(readme, /如果不传 `--label`，任务批次名称会从任务内容自动生成/);
  assert.match(readme, /CLI 创建的任务会在 Web 界面里可见/);
  assert.match(readme, /input-kanban runs/);
  assert.match(readme, /input-kanban --json runs --active/);
  assert.match(readme, /input-kanban status --watch/);
  assert.match(readme, /input-kanban --json status <runId>/);
  assert.match(readme, /input-kanban result <runId> --copy/);
  assert.match(readme, /input-kanban --json result <runId>/);
  assert.match(readme, /不传 `runId` 时，`status` 和 `result` 默认查看最近一次任务批次/);
});
