import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';

const cli = await fsp.readFile(new URL('../bin/input-kanban.js', import.meta.url), 'utf8');
const readme = await fsp.readFile(new URL('../README.md', import.meta.url), 'utf8');

test('CLI exposes submit auto loop without replacing serve mode', () => {
  assert.match(cli, /COMMANDS = new Set\(\['serve', 'submit', 'status', 'result', 'stop', 'auto'\]\)/);
  assert.match(cli, /input-kanban submit \[options\]/);
  assert.match(cli, /--auto\s+Plan, dispatch all batches, judge, and watch, default for submit/);
  assert.match(cli, /--no-auto\s+Only create the run and start planning/);
  assert.match(cli, /Task batch name, default generated from task text/);
  assert.match(cli, /-d, --detach\s+Run the default auto loop in a background supervisor/);
  assert.match(cli, /auto: true, detach: false, watch: true/);
  assert.match(cli, /async function autoRun\(args\)/);
  assert.match(cli, /function startDetachedAuto\(runId, args\)/);
  assert.match(cli, /async function result\(args\)/);
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
  assert.match(readme, /input-kanban status --watch/);
  assert.match(readme, /input-kanban result <runId> --copy/);
  assert.match(readme, /不传 `runId` 时，`status` 和 `result` 默认查看最近一次任务批次/);
});
