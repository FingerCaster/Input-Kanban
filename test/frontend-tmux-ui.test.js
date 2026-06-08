import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import vm from 'node:vm';

const html = await fsp.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1] || '';

test('public inline script remains parseable', () => {
  assert.ok(script.includes('function renderSelectedHeader()'));
  assert.doesNotThrow(() => new vm.Script(script));
});

test('create form exposes worker sandbox selector', () => {
  assert.match(html, /<select id="workerSandbox">/);
  assert.match(html, /danger-full-access（高风险，跳过沙箱限制）/);
  assert.match(script, /workerSandbox: workerSandbox\.value/);
  assert.match(script, /metaChip\('沙箱', sandbox/);
  assert.match(script, /danger: sandbox === 'danger-full-access'/);
});

test('selected run header uses compact metadata chips', () => {
  assert.match(html, /\.meta-chip/);
  assert.match(script, /metaChip\('Run ID', currentState\.runId/);
  assert.match(script, /metaChip\('仓库', basenamePath\(currentState\.repo\)/);
  assert.match(script, /metaChip\('终端', tmuxSessionName\(currentState\)/);
  assert.match(script, /metaChip\('用时', `\$\{durationSeconds\(currentState\.createdAt, runDurationEnd\(currentState\)\)\} 秒`\)/);
  assert.match(script, /function runDurationEnd\(s\)/);
  assert.match(script, /terminalStatuses\.has\(s\.status\)/);
  assert.match(script, /metaChip\('刷新', `每 \$\{AUTO_REFRESH_MS \/ 1000\} 秒`\)/);
  assert.doesNotMatch(script, /durationSeconds\(currentState\.createdAt, currentState\.updatedAt\)/);
  assert.doesNotMatch(script, /Worker 沙箱=/);
});

test('task table has no tmux column or file-viewer tmux panel', () => {
  assert.doesNotMatch(script, /当前 runner 为 headless，无需终端附加操作/);
  assert.doesNotMatch(script, /const tmuxHeader = isTmuxMode\(\)/);
  assert.doesNotMatch(script, /hideTmuxPanel/);
  assert.match(script, /<th>进程号\/退出码<\/th><th>Codex 会话ID<\/th><th>最终回复<\/th><th>操作<\/th>/);
});

test('file viewer renders role-specific file tabs', () => {
  assert.match(html, /<div id="fileTabs" class="toolbar file-tabs"><\/div>/);
  assert.match(script, /const FILE_TAB_SETS = \{/);
  assert.match(script, /planner: \[/);
  assert.match(script, /worker: \[/);
  assert.match(script, /judge: \[/);
  assert.match(script, /\['verdict\.json', '验收结论'\]/);
  assert.match(script, /\['events\.pretty', '执行过程'\]/);
  assert.doesNotMatch(script, /\['exit_code', '退出码'\]/);
  assert.doesNotMatch(html, /onclick="loadFile\('exit_code'\)">退出码/);
});

test('file viewer does not render a tmux terminal info panel', () => {
  assert.doesNotMatch(html, /id="tmuxPanel"/);
  assert.doesNotMatch(html, /tmux-box/);
  assert.doesNotMatch(script, /renderTmuxPanel/);
  assert.doesNotMatch(script, /tmux-box-title/);
});

test('tmux generated badges are not shown in run/task panels', () => {
  assert.doesNotMatch(html, /▣ tmux/);
  assert.doesNotMatch(html, /tmux 已生成/);
  assert.doesNotMatch(html, /tmux-indicator/);
  assert.doesNotMatch(script, /tmuxIndicator/);
  assert.match(script, /复制tmux attach指令/);
  assert.doesNotMatch(script, /复制 attach/);
});

test('tmux copy action is only exposed at run attach level', () => {
  assert.match(script, /return state\?\.tmux\?\.tmuxAttachCommand \|\| `tmux attach-session -t \$\{tmuxSessionName\(state\)\}`/);
  assert.match(script, /copyTmuxRunCommand\(event\)/);
  assert.doesNotMatch(script, /copyTmuxCommand/);
  assert.doesNotMatch(script, /select-window/);
});
