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

test('header, browser tab, and footer show Input Kanban identity', () => {
  assert.match(html, /<link rel="icon" type="image\/png" sizes="32x32" href="\/assets\/input-kanban-favicon-32\.png\?v=2" \/>/);
  assert.match(html, /<link rel="shortcut icon" type="image\/png" href="\/assets\/input-kanban-favicon-32\.png\?v=2" \/>/);
  assert.match(html, /<link rel="mask-icon" href="\/assets\/input-kanban-mask-icon\.svg" color="#2563eb" \/>/);
  assert.match(html, /<link rel="apple-touch-icon" sizes="180x180" href="\/assets\/input-kanban-apple-touch-icon\.png\?v=2" \/>/);
  assert.match(html, /<h1 class="brand"><img class="brand-icon" src="\/assets\/input-kanban-icon\.png"/);
  assert.match(html, /<footer id="pageFooter" class="page-footer">版本：-<\/footer>/);
  assert.match(html, /\.page-footer/);
  assert.match(script, /h\.version \? `版本：v\$\{h\.version\}` : '版本：未知（请重启服务）'/);
});

test('create form exposes worker sandbox selector', () => {
  assert.match(html, /<select id="workerSandbox">/);
  assert.match(html, /danger-full-access（高风险，跳过沙箱限制）/);
  assert.match(script, /workerSandbox: workerSandbox\.value/);
  assert.match(script, /api\(`\/api\/runs\/\$\{selectedRun\}\/plan`, \{ method: 'POST' \}\)/);
  assert.doesNotMatch(script, /async function maybeAutoAdvanceRunSummaries/);
  assert.doesNotMatch(script, /await maybeAutoAdvanceRunSummaries\(latestRuns\)/);
  assert.doesNotMatch(script, /async function maybeAutoAdvanceSelectedRun/);
  assert.doesNotMatch(script, /async function autoDispatchRun/);
  assert.doesNotMatch(script, /async function autoJudgeRun/);
  assert.doesNotMatch(script, /async function autoRetryRun/);
  assert.doesNotMatch(script, /AUTO_MAX_RETRIES/);
  assert.doesNotMatch(script, /skipAutoAdvance/);
  assert.match(script, /planner already running\/i\.test\(detail\)\) return '任务拆分正在进行中，请稍后查看结果。'/);
  assert.match(script, /console\.error\('操作失败', error\)/);
  assert.match(script, /任务仍在执行中，请先停止后再归档。/);
  assert.match(script, /async function archiveRunById\(runId, \{ confirmFirst = true \} = \{\}\)/);
  assert.match(script, /await archiveRunById\(runId, \{ confirmFirst: false \}\)/);
  assert.match(script, /metaChip\('沙箱', sandbox/);
  assert.match(script, /danger: sandbox === 'danger-full-access'/);
});

test('workspace filter controls are present in the sidebar', () => {
  assert.match(html, /<div class="workspace-filter-panel">\s*<select id="workspaceFilterSelect"[\s\S]*?<span id="runsLoadHint"/);
  assert.match(html, /id="runsLoadHint"/);
  assert.match(html, /class="runs-load-icon"/);
  assert.match(html, /title="批次列表尚未加载"/);
  assert.match(html, /id="workspaceFilterSelect"/);
  assert.match(html, /class="workspace-filter-select"/);
  assert.match(html, /title="未筛选工作区"/);
  assert.doesNotMatch(html, /workspaceFilterChips/);
  assert.doesNotMatch(html, /workspaceFilterHint/);
  assert.doesNotMatch(html, /workspace-filter-chip/);
  assert.doesNotMatch(html, /onclick="setWorkspaceFilter\('all'\)"/);
  assert.doesNotMatch(html, /onclick="setWorkspaceFilter\(currentWorkspacePath \|\| 'all'\)"/);
  assert.match(script, /const WORKSPACE_FILTER_ALL = '';/);
  assert.match(script, /let currentWorkspacePath = '';/);
  assert.match(script, /let selectedWorkspaceFilter = localStorage\.getItem\('input-kanban\.workspaceFilter'\) \|\| WORKSPACE_FILTER_ALL;/);
  assert.match(script, /let workspaceCatalogRuns = \[];/);
  assert.match(script, /function renderWorkspaceFilterOptions\(\)/);
  assert.match(script, /function updateWorkspaceFilterTitle\(\)/);
  assert.match(script, /function setWorkspaceFilter\(value\)/);
  assert.match(script, /const startedAt = performance\.now\(\)/);
  assert.match(script, /hint\.title = `加载 \$\{Math\.round\(performance\.now\(\) - startedAt\)\}ms｜显示 \$\{latestRuns\.length\} 个批次`/);
  assert.match(script, /hint\.setAttribute\('aria-label', hint\.title\)/);
  assert.doesNotMatch(script, /function toggleWorkspaceFilter/);
  assert.match(script, /currentWorkspacePath = h\.defaultWorkspace \|\| h\.defaultRepo \|\| ''/);
  assert.match(script, /workspaceCatalogRuns/);
  assert.match(script, /\[WORKSPACE_FILTER_ALL, '工作区筛选'\]/);
  assert.match(script, /select\.title = currentWorkspacePath \? `未筛选工作区｜默认工作区：\$\{currentWorkspacePath\}` : '未筛选工作区'/);
  assert.match(script, /selectedWorkspaceFilter = String\(value \|\| ''\)\.trim\(\)/);
  assert.match(script, /workspacePath \|\| run\.repo/);
});

test('selected run header uses compact metadata chips', () => {
  assert.match(html, /\.meta-chip/);
  assert.match(html, /\.run-card-meta/);
  assert.match(script, /metaChip\('Run ID', currentState\.runId/);
  assert.match(script, /metaChip\('工作区', basenamePath\(currentState\.workspacePath \|\| currentState\.repo\)/);
  assert.match(script, /copyRepoPath\(event\)/);
  assert.match(script, /title="复制工作区地址"/);
  assert.match(script, /event\.currentTarget\.textContent = '⧉'/);
  assert.match(script, /metaChip\('终端', tmuxSessionName\(currentState\)/);
  assert.match(script, /metaChip\('用时', formatDurationMs\(durationSeconds\(currentState\.createdAt, runDurationEnd\(currentState\)\) \* 1000\)\)/);
  assert.match(script, /function runDurationEnd\(s\)/);
  assert.match(script, /terminalStatuses\.has\(s\.status\)/);
  assert.match(html, /\.refresh-pulse-chip/);
  assert.match(html, /@keyframes refresh-spin/);
  assert.match(script, /function refreshPulseChip\(\)/);
  assert.match(script, /requestAnimationFrame\(triggerRefreshPulse\)/);
  assert.doesNotMatch(script, /durationSeconds\(currentState\.createdAt, currentState\.updatedAt\)/);
  assert.match(script, /copyRunRepoPath\(event, '\$\{r\.runId\}'\)/);
  assert.match(script, /metaChip\('工作区', basenamePath\(r\.workspacePath \|\| r\.repo\)/);
  assert.match(script, /metaChip\('用时', runCardDurationText\(r\)\)/);
  assert.doesNotMatch(script, /metaChip\('Run ID', r\.runId/);
  assert.match(script, /metaChip\('进度', `\$\{r\.completed\}\/\$\{r\.total\}`\)/);
  assert.match(script, /metaChip\('执行中', r\.running\)/);
  assert.match(script, /metaChip\('失败', r\.failed/);
  assert.match(html, /\.run-card-name-wrap/);
  assert.match(script, /renameRunLabel\(event, '\$\{r\.runId\}'\)/);
  assert.match(html, /\.rename-btn \{ opacity: 0; pointer-events: none/);
  assert.match(html, /\.run-card:hover \.rename-btn/);
  assert.match(html, /\.archive-confirm-btn \{ min-width: 46px/);
  assert.match(script, /function editIcon\(\)/);
  assert.match(script, /function archiveIcon\(\)/);
  assert.match(script, /class="icon-svg"/);
  assert.match(script, /archiveRunFromCard\(event, '\$\{r\.runId\}'\)/);
  assert.match(script, /onmouseleave="clearArchiveConfirm\('\$\{r\.runId\}'\)"/);
  assert.match(script, /pendingArchiveRunId === r\.runId \? '确认' : archiveIcon\(\)/);
  assert.match(script, /归档任务批次（运行中请先停止）/);
  assert.match(script, /再次点击确认归档/);
  assert.match(script, /class="secondary copy-btn rename-btn" title="修改任务批次名称" onclick="renameRunLabel\(event, currentState\.runId\)">\$\{editIcon\(\)\}/);
  assert.doesNotMatch(script, />✎/);
  assert.match(script, /prompt\('修改任务批次名称'/);
  assert.match(script, /任务批次名称不能为空/);
  assert.match(script, /\/api\/runs\/\$\{runId\}\/label/);
  assert.match(script, /method: 'PATCH'/);
  assert.match(html, /\.batch-row-meta/);
  assert.match(script, /metaChip\('Batch ID', b\.id\)/);
  assert.match(script, /metaChip\('最大并发', b\.maxParallel \|\| '-'/);
  assert.match(script, /metaChip\('进度', `\$\{done\}\/\$\{\(b\.tasks \|\| \[\]\)\.length\}`\)/);
  assert.doesNotMatch(script, /run-card-progress/);
  assert.doesNotMatch(script, /Worker 沙箱=/);
});

test('task table has no tmux column or file-viewer tmux panel', () => {
  assert.doesNotMatch(script, /当前 runner 为 headless，无需终端附加操作/);
  assert.doesNotMatch(script, /const tmuxHeader = isTmuxMode\(\)/);
  assert.doesNotMatch(script, /hideTmuxPanel/);
  assert.match(script, /<th>进程号\/退出码<\/th><th>Codex 会话ID<\/th><th>最终回复<\/th><th>操作<\/th>/);
});

test('file viewer renders role-specific file tabs', () => {
  assert.match(html, /<h2>任务详情<\/h2>/);
  assert.match(html, /点击任务后查看详情/);
  assert.match(script, /点击任务后查看详情/);
  assert.doesNotMatch(html, /<h2>文件查看<\/h2>/);
  assert.match(html, /<div id="fileTabs" class="toolbar file-tabs"><\/div>/);
  assert.match(script, /const FILE_TAB_SETS = \{/);
  assert.match(script, /planner: \[/);
  assert.match(script, /worker: \[/);
  assert.match(script, /judge: \[/);
  assert.match(script, /\['verdict\.json', '验收结论'\]/);
  assert.match(script, /new Set\(\['last_message\.md', 'verdict\.json'\]\)/);
  assert.match(script, /复制验收结论内容/);
  assert.match(script, /\['events\.pretty', '执行过程'\]/);
  assert.match(script, /tabs\.find\(\(\[name\]\) => name === 'events\.pretty'\)/);
  assert.match(script, /await loadFile\(defaultTab\[0\]\)/);
  assert.doesNotMatch(script, /\['manual_result\.md', '人工结果'\]/);
  assert.match(html, /\.summary-chip/);
  assert.match(html, /\.summary-chip\.command-type/);
  assert.match(html, /\.summary-break/);
  assert.match(script, /statChip\('任务用时', taskDuration\)/);
  assert.match(script, /statChip\('命令用时', summary\.commandDurationText\)/);
  assert.match(script, /statChip\('模型\/调度', summary\.modelOrchestrationText\)/);
  assert.match(script, /statChip\('启动\/收尾', summary\.startFinishText\)/);
  assert.match(script, /statChip\('系统事件', summary\.systemEvents\)/);
  assert.match(script, /summary-break/);
  assert.match(script, /events_timed\.jsonl/);
  assert.match(script, /summary\.commandTypes\.map/);
  assert.match(script, /占比 \$\{esc\(item\.percentText\)\}/);
  assert.match(script, /function taskDurationMs\(t\)/);
  assert.match(script, /return ms === null \? '-' : formatDurationMs\(ms\)/);
  assert.match(script, /summarizeEventsJsonl\(timedRaw \|\| raw, \{ taskMs \}\)/);
  assert.match(script, /commandCountsByKind/);
  assert.match(script, /commandDurationsByKind/);
  assert.match(script, /durationText: duration \? formatDurationMs\(duration\.ms\) : '-'/);
  assert.match(script, /percentText: duration && Number\.isFinite\(taskMs\)/);
  assert.match(script, /commandDurationTotalMs/);
  assert.match(script, /systemEvents/);
  assert.match(script, /summary\.systemEvents\+\+/);
  assert.doesNotMatch(script, /modelOrchestrationCount/);
  assert.match(script, /modelOrchestrationText = formatDurationMs/);
  assert.match(script, /startFinishText = formatDurationMs/);
  assert.match(script, /function eventTimeMs\(event\)/);
  assert.match(script, /function formatDurationMs\(ms\)/);
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

test('manual completion modal captures success result text', () => {
  assert.match(html, /id="manualCompleteModal"/);
  assert.match(html, /id="manualCompleteResult"/);
  assert.match(html, /人工成功执行结果/);
  assert.match(script, /manualCompleteTaskId/);
  assert.match(script, /submitManualComplete\(\)/);
  assert.match(script, /resultText/);
  assert.match(script, /manual_result\.md/);
  assert.match(script, /【这次是人工结果】/);
  assert.match(script, /await loadFile\('result\.json'\)/);
  assert.doesNotMatch(script, /confirm\(`确认将任务/);
});

test('tmux copy action is only exposed at run attach level', () => {
  assert.match(script, /return state\?\.tmux\?\.tmuxAttachCommand \|\| `tmux attach-session -t \$\{tmuxSessionName\(state\)\}`/);
  assert.match(script, /copyTmuxRunCommand\(event\)/);
  assert.match(script, /function gitChip\(\)/);
  assert.match(script, /r\.git\?\.isGit \? gitChip\(\) : ''/);
  assert.match(script, /chips\.push\(gitChip\(\)\)/);
  assert.doesNotMatch(script, /metaChip\('Git', 'Git'/);
  assert.doesNotMatch(script, /gitMeta\.branch/);
  assert.doesNotMatch(script, /dirty \? ' · dirty'/);
  assert.match(script, /async function copyRepoPath\(event, repoPath = currentState\?\.workspacePath \|\| currentState\?\.repo \|\| ''\)/);
  assert.doesNotMatch(script, /copyTmuxCommand/);
  assert.doesNotMatch(script, /select-window/);
});
