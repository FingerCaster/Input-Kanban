import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import vm from 'node:vm';

const html = await fsp.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1] || '';

function createFrontendHarness() {
  const calls = [];
  const storage = new Map();
  const elements = new Map();
  const elementForId = id => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        id,
        innerHTML: '',
        textContent: '',
        value: '',
        checked: false,
        classList: {
          add(...names) { for (const name of names) classes.add(name); },
          remove(...names) { for (const name of names) classes.delete(name); },
          toggle(name, force) {
            if (force === true) { classes.add(name); return true; }
            if (force === false) { classes.delete(name); return false; }
            if (classes.has(name)) { classes.delete(name); return false; }
            classes.add(name); return true;
          },
          contains(name) { return classes.has(name); }
        },
        setAttribute() {},
        addEventListener() {}
      });
    }
    return elements.get(id);
  };
  const globalElementIds = ['label', 'repo', 'runsDir', 'runnerMode', 'maxParallel', 'workerSandbox', 'planApproval', 'taskText', 'tmuxDependencyModal', 'showTmuxInstallCommandBtn', 'copyTmuxDependencyCommandBtn'];
  const context = {
    console: { error() {} },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : ''; },
      setItem(key, value) { storage.set(key, String(value)); }
    },
    navigator: { clipboard: { writeText: async text => { calls.push({ kind: 'clipboard', text }); } } },
    performance: { now() { return 0; } },
    setInterval() {},
    setTimeout(fn) { if (typeof fn === 'function') fn(); },
    requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); },
    alert(message) { calls.push({ kind: 'alert', message }); },
    confirm(message) { calls.push({ kind: 'confirm', message }); return true; },
    prompt(title, value) { calls.push({ kind: 'prompt', title, value }); return value; },
    calls,
    fetch: async (requestPath, opts = {}) => {
      calls.push({ kind: 'fetch', path: requestPath, opts });
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({}), text: async () => '' };
    },
    document: { getElementById: elementForId },
    api: async (requestPath, opts = {}) => { calls.push({ kind: 'api', path: requestPath, opts }); return {}; },
    refreshRuns: async () => { calls.push({ kind: 'refreshRuns' }); },
    refreshSelected: async () => { calls.push({ kind: 'refreshSelected' }); }
  };
  for (const id of globalElementIds) context[id] = elementForId(id);
  context.label.value = 'codex-task';
  context.repo.value = '/tmp/input-kanban';
  context.runnerMode.value = 'default';
  context.maxParallel.value = '3';
  context.workerSandbox.value = 'workspace-write';
  context.taskText.value = 'noop';
  const bootScript = script
    .replace(/\r?\ninitializeRunnerModePreference\(\);\r?\ninitializeWorkerSandboxPreference\(\);\r?\ninitSessionManagementResize\(\);\r?\nrenderActionToolbar\(\);\r?\nloadCodexStatus\(\)\.catch\(console\.error\);\r?\nloadAppConfig\(\)\.catch\(console\.error\);\r?\nloadHealth\(\)\.then\(refreshRuns\);\r?\nsetInterval\(\(\) => \{ if \(selectedRun\) refreshSelected\(\{auto:true\}\)\.catch\(console\.error\); else refreshRuns\(\)\.catch\(console\.error\); \}, AUTO_REFRESH_MS\);\s*$/, '');
  vm.runInNewContext(`${bootScript}
api = async (requestPath, opts = {}) => { calls.push({ kind: 'api', path: requestPath, opts }); return {}; };
refreshSelected = async () => { calls.push({ kind: 'refreshSelected' }); };
globalThis.__setRun = (runId, state) => { selectedRun = runId; currentState = state; };
globalThis.__runActionState = runActionState;
globalThis.__dispatchRun = dispatchRun;
globalThis.__createRun = createRun;
globalThis.__initializeRunnerModePreference = initializeRunnerModePreference;
globalThis.__saveRunnerModePreference = saveRunnerModePreference;
  globalThis.__showTmuxInstallCommand = showTmuxInstallCommand;
  globalThis.__hasRunTmuxMetadata = hasRunTmuxMetadata;
  globalThis.__taskById = taskById;
  globalThis.__taskActionInfoCell = taskActionInfoCell;
  globalThis.__setApi = nextApi => { api = nextApi; };
  globalThis.__calls = calls;`, context);
  context.__storage = storage;
  return context;
}

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
  assert.match(html, /<footer class="page-footer"><div id="pageFooter">版本：-<\/div><div id="codexStatus" class="codex-status hidden"><\/div><div class="footer-actions"><button id="environmentTrigger" class="secondary environment-trigger" onclick="openEnvironmentModal\(\)">环境<\/button><button id="sessionManagementTrigger" class="secondary session-management-trigger" onclick="openSessionManagement\(\)">会话管理<\/button><\/div><\/footer>/);
  assert.match(script, /sessionManagementThreadTitle/);
  assert.match(script, /sessionManagementShortId/);
  assert.match(script, /sessionManagementTab = 'board'/);
  assert.match(script, /sessionManagementTabLabel/);
  assert.doesNotMatch(script, /sessionManagementSourceOptions/);
  assert.doesNotMatch(script, /sessionManagementSourceFilter/);
  assert.match(script, /loadProcessManagement/);
  assert.doesNotMatch(script, /copyProcessKillCommand/);
  assert.doesNotMatch(script, /processKillCommand/);
  assert.match(script, /sessionManagementTab !== 'local'/);
  assert.match(script, /SESSION_MODAL_HEIGHT_STORAGE_KEY/);
  assert.match(script, /initSessionManagementResize/);
  assert.match(script, /restoreSessionManagementHeight/);
  assert.match(script, /saveSessionManagementHeight/);
  assert.match(html, /id="sessionManagementModal"/);
  assert.match(html, /id="sessionManagementModalCard"/);
  assert.match(html, /id="processManagementPanel" class="process-management hidden"/);
  assert.match(html, /id="processManagementList"/);
  assert.match(script, /metaChip\('PID', processInfo\.pid, \{ title: processInfo\.command \|\| '' \}\)/);
  assert.match(script, /thread\.status && thread\.status !== 'unknown'/);
  assert.match(script, /const resumableProcesses = processes\.filter\(processInfo => processInfo\.sessionId\)/);
  assert.match(html, /id="sessionManagementTotalMemory"/);
  assert.match(script, /总占用内存/);
  assert.doesNotMatch(script, /processManagementLoad\)\.innerHTML = .*总占用内存/);
  assert.match(script, /其他 Codex 进程/);
  assert.match(script, /可 resume/);
  assert.match(html, /process-management-resume/);
  assert.doesNotMatch(script, /processDisplayCommand/);
  assert.doesNotMatch(html, /session-management-status"><span class="pill [^"]*unknown/);
  assert.match(html, /session-management-side/);
  assert.match(html, /\.session-management-row \{ display: grid;/);
  assert.match(script, /copySessionId\(event, \$\{JSON\.stringify\(processInfo\.sessionId\)\}\)/);
  assert.match(html, /session-management-trigger/);
  assert.match(html, /\.page-footer/);
  assert.match(script, /h\.version \? `版本：v\$\{h\.version\}` : '版本：未知（请重启服务）'/);
});

test('sidebar header keeps a compact create action', () => {
  assert.match(html, /<div class="section-header">\s*<h2>任务批次<\/h2>[\s\S]*?>新建<\/button>/);
  assert.match(html, /\.section-header/);
  assert.doesNotMatch(html, /<button onclick="showCreateForm\(\)">新建任务批次<\/button>/);
});

test('footer exposes codex backend status and create form exposes worker sandbox selector', () => {
  assert.match(html, /id="codexStatus"/);
  assert.match(html, /\.codex-status/);
  assert.match(script, /async function loadCodexStatus\(\)/);
  assert.match(script, /api\('\/api\/codex'\)/);
  assert.match(script, /Codex 未安装/);
  assert.match(script, /npm install -g @openai\/codex/);
  assert.doesNotMatch(script, /Codex 可更新/);
  assert.match(script, /codex\.versionText \|\| codex\.installedVersion \|\| 'codex'/);
  assert.doesNotMatch(script, /后端命令 <code>/);
  assert.match(html, /<select id="workerSandbox">/);
  assert.match(html, /id="codexSkipGitRepoCheck" type="checkbox" checked/);
  assert.match(html, /<select id="runnerMode">/);
  assert.match(html, /<option value="default" selected>跟随默认<\/option>/);
  assert.match(html, /<option value="tmux">tmux<\/option>/);
  assert.match(html, /id="runnerHint"/);
  assert.doesNotMatch(html, /<select id="tmuxShellMode">/);
  assert.doesNotMatch(html, /id="defaultTmuxShellSelect"/);
  assert.match(html, /id="environmentModal"/);
  assert.match(html, /id="defaultRunnerSelect"/);
  assert.match(html, /id="tmuxStatus"/);
  assert.match(script, /async function loadAppConfig\(\{ force = false \} = \{\}\)/);
  assert.match(script, /api\('\/api\/config'\)/);
  assert.match(script, /api\('\/api\/tmux'\)/);
  assert.doesNotMatch(script, /\/api\/tmux\?shell=/);
  assert.match(script, /async function ensureAppConfigLoaded\(\)/);
  assert.match(script, /async function ensureRunnerSelectionReady\(\)/);
  assert.match(script, /async function ensureTmuxForCreate\(\)/);
  assert.match(script, /tmux 未安装，不能创建 tmux runner 批次。/);
  assert.match(script, /input-kanban deps install tmux/);
  assert.match(html, /id="tmuxDependencyModal"/);
  assert.match(html, /id="tmuxDependencyNotes"/);
  assert.match(html, /id="showTmuxInstallCommandBtn"/);
  assert.match(html, /id="copyTmuxDependencyCommandBtn"/);

  assert.match(html, /id="planApproval" type="checkbox"/);
  assert.doesNotMatch(html, /sessionManagementSourceFilter/);
  assert.match(html, /本机 Codex 进程/);
  assert.match(html, /class="secondary modal-close-btn"/);
  assert.doesNotMatch(html, /复制 kill 命令/);
  assert.match(script, /card\.classList\.add\('resizable'\)/);
  assert.match(script, /window\.addEventListener\('mouseup', saveSessionManagementHeight\)/);
  assert.doesNotMatch(html, /查看本机可见的 Codex 会话。/);
  assert.doesNotMatch(html, /onclick="refreshSessionManagement\(\)">刷新/);
  assert.match(script, /api\('\/api\/session-management\/processes'\)/);
  assert.match(html, /跳过 Codex Git\/信任目录检查/);
  assert.match(html, /--skip-git-repo-check/);
  assert.match(html, /计划生成后手动确认后执行/);
  assert.match(html, /停在“已拆分，待确认”/);
  assert.match(html, /创建/);
  assert.match(html, /最后更新/);
  assert.match(html, /danger-full-access（高风险，跳过沙箱限制）/);
  assert.match(html, /这通常不是任务本身失败，而是当前沙箱能力不足/);
  assert.match(html, /DNS \/ 网络失败则通常需要检查代理、VPN 或本地 evidence/);
  assert.match(script, /workerSandbox: workerSandbox\.value/);
  assert.match(script, /codexSkipGitRepoCheck: !!document\.getElementById\('codexSkipGitRepoCheck'\)\?\.checked/);
  assert.match(script, /planApproval: planApproval\.checked/);
  assert.match(script, /function planApprovalPending\(state = currentState\)/);
  assert.match(script, /function runStatusLabel\(state = currentState\)/);
  assert.match(script, /已拆分，待确认/);
  assert.match(script, /开始执行/);
  assert.match(script, /const WORKER_SANDBOX_STORAGE_KEY = 'input-kanban\.workerSandbox'/);
  assert.match(script, /const RUNNER_MODE_STORAGE_KEY = 'input-kanban\.runnerMode'/);
  assert.match(script, /const VALID_WORKER_SANDBOXES = new Set\(\['read-only', 'workspace-write', 'danger-full-access'\]\)/);
  assert.match(script, /const VALID_RUNNER_OPTIONS = new Set\(\['default', 'headless', 'tmux'\]\)/);
  assert.match(script, /跳过 Git 检查/);
  assert.match(script, /function initializeWorkerSandboxPreference\(\)/);
  assert.match(script, /function initializeRunnerModePreference\(\)/);
  assert.match(script, /function saveRunnerModePreference\(\)/);
  assert.match(script, /localStorage\.getItem\(WORKER_SANDBOX_STORAGE_KEY\)/);
  assert.match(script, /localStorage\.getItem\(RUNNER_MODE_STORAGE_KEY\)/);
  assert.match(script, /select\.addEventListener\('change', saveWorkerSandboxPreference\)/);
  assert.match(script, /select\.addEventListener\('change', saveRunnerModePreference\)/);
  assert.match(script, /saveWorkerSandboxPreference\(\);\r?\n  saveRunnerModePreference\(\);\r?\n  if \(!await ensureRunnerSelectionReady\(\)\) return;\r?\n  if \(!await ensureTmuxForCreate\(\)\) return;\r?\n  const runner = selectedRunnerMode\(\);/);
  assert.match(script, /saveRunnerModePreference\(\);\r?\n  if \(!await ensureRunnerSelectionReady\(\)\) return;/);
  assert.doesNotMatch(script, /selectedTmuxShellMode/);
  assert.doesNotMatch(script, /body\.tmuxShell/);
  assert.match(html, /<div id="actionToolbar" class="toolbar"><\/div>/);
  assert.match(html, /button\.state-pending/);
  assert.match(html, /button\.state-active/);
  assert.match(html, /@keyframes action-pulse/);
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.match(script, /let pendingAction = null/);
  assert.match(script, /function renderActionToolbar\(\)/);
  assert.match(script, /function runActionState\(key\)/);
  assert.doesNotMatch(script, /workers_completed/);
  assert.doesNotMatch(script, /workers_failed/);
  assert.match(script, /async function runActionWithPending\(actionKey, fn\)/);
  assert.match(script, /pendingAction === key/);
  assert.match(script, /拆分中/);
  assert.match(script, /启动中/);
  assert.match(script, /验收中/);
  assert.match(script, /重试拆分/);
  assert.match(script, /重试执行/);
  assert.match(script, /重试验收/);
  assert.match(script, /api\(`\/api\/runs\/\$\{selectedRun\}\/plan`, \{method:'POST'\}\)/);
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

test('create form blocks tmux run creation when tmux is missing', async () => {
  const harness = createFrontendHarness();
  harness.runnerMode.value = 'tmux';
  harness.__setApi(async (requestPath, opts = {}) => {
    harness.__calls.push({ kind: 'api', path: requestPath, opts });
    if (requestPath === '/api/tmux') {
      return { tmux: { installed: false, installAvailable: true, cliInstallCommand: 'input-kanban deps install tmux', installNotes: ['Windows will install psmux, a third-party tmux-compatible implementation, not official tmux.'] } };
    }
    if (requestPath === '/api/runs') return { runId: 'unexpected' };
    return {};
  });

  await harness.__createRun();

  assert.deepEqual(harness.__calls.filter(call => call.kind === 'api').map(call => call.path), ['/api/tmux']);
  assert.equal(harness.__calls.some(call => call.kind === 'api' && call.path === '/api/runs'), false);
  assert.equal(harness.__calls.some(call => call.kind === 'confirm'), false);
  assert.equal(harness.__calls.some(call => call.kind === 'prompt'), false);
  assert.equal(harness.tmuxDependencyModal.classList.contains('hidden'), false);
  assert.match(harness.document.getElementById('tmuxDependencyMessage').textContent, /tmux 未安装，不能创建 tmux runner 批次/);
  assert.equal(harness.showTmuxInstallCommandBtn.classList.contains('hidden'), false);
  assert.equal(harness.copyTmuxDependencyCommandBtn.classList.contains('hidden'), true);
  assert.match(harness.document.getElementById('tmuxDependencyNotes').textContent, /third-party tmux-compatible/);
  harness.__showTmuxInstallCommand();
  assert.equal(harness.document.getElementById('tmuxDependencyCommandWrap').classList.contains('hidden'), false);
  assert.equal(harness.document.getElementById('tmuxDependencyCommand').textContent, 'input-kanban deps install tmux');
  assert.equal(harness.copyTmuxDependencyCommandBtn.classList.contains('hidden'), false);
});

test('create form shows manual tmux guidance when no installer is available', async () => {
  const harness = createFrontendHarness();
  harness.runnerMode.value = 'tmux';
  harness.__setApi(async (requestPath, opts = {}) => {
    harness.__calls.push({ kind: 'api', path: requestPath, opts });
    if (requestPath === '/api/tmux') {
      return { tmux: { installed: false, installAvailable: false, installNotes: ['Install psmux manually or install winget first.'], installHint: 'winget missing' } };
    }
    if (requestPath === '/api/runs') return { runId: 'unexpected' };
    return {};
  });

  await harness.__createRun();

  assert.equal(harness.__calls.some(call => call.kind === 'api' && call.path === '/api/runs'), false);
  assert.equal(harness.__calls.some(call => call.kind === 'confirm'), false);
  assert.equal(harness.__calls.some(call => call.kind === 'prompt'), false);
  assert.match(harness.showTmuxInstallCommandBtn.textContent, /安装指引/);
  assert.equal(harness.copyTmuxDependencyCommandBtn.classList.contains('hidden'), true);
  harness.__showTmuxInstallCommand();
  assert.equal(harness.document.getElementById('tmuxDependencyCommand').textContent, 'Install psmux manually or install winget first.');
});

test('run attach affordance requires a live tmux session flag', () => {
  const harness = createFrontendHarness();
  assert.equal(harness.__hasRunTmuxMetadata({
    runner: 'tmux',
    tmux: {
      hasTmuxSession: false,
      tmuxSessionName: 'input-kanban-run_dead',
      tmuxAttachCommand: 'tmux attach-session -t input-kanban-run_dead'
    }
  }), false);
  assert.equal(harness.__hasRunTmuxMetadata({
    runner: 'tmux',
    tmux: {
      hasTmuxSession: true,
      tmuxSessionName: 'input-kanban-run_live'
    }
  }), true);
});

test('create form loads the default runner before following it', async () => {
  const harness = createFrontendHarness();
  harness.runnerMode.value = 'default';
  harness.__setApi(async (requestPath, opts = {}) => {
    harness.__calls.push({ kind: 'api', path: requestPath, opts });
    if (requestPath === '/api/config') {
      return { config: { defaultRunner: 'tmux' }, effective: { runner: 'tmux', runnerEnvOverride: false } };
    }
    if (requestPath === '/api/tmux') {
      return { tmux: { installed: false, installAvailable: true, cliInstallCommand: 'input-kanban deps install tmux' } };
    }
    if (requestPath === '/api/runs') return { runId: 'unexpected' };
    return {};
  });

  await harness.__createRun();

  assert.deepEqual(harness.__calls.filter(call => call.kind === 'api').map(call => call.path), ['/api/config', '/api/tmux']);
  assert.equal(harness.__calls.some(call => call.kind === 'api' && call.path === '/api/runs'), false);
  assert.equal(harness.__calls.some(call => call.kind === 'confirm'), false);
  assert.match(harness.document.getElementById('tmuxDependencyMessage').textContent, /tmux 未安装/);
});

test('create form does not require config loading for explicit headless runner', async () => {
  const harness = createFrontendHarness();
  harness.runnerMode.value = 'headless';
  harness.__setApi(async (requestPath, opts = {}) => {
    harness.__calls.push({ kind: 'api', path: requestPath, opts });
    if (requestPath === '/api/config') throw new Error('config should not be required');
    if (requestPath === '/api/runs') return { runId: 'run_headless' };
    return {};
  });

  await harness.__createRun();

  const apiPaths = harness.__calls.filter(call => call.kind === 'api').map(call => call.path);
  assert.equal(apiPaths.includes('/api/config'), false);
  assert.equal(apiPaths[0], '/api/runs');
  const createCall = harness.__calls.find(call => call.kind === 'api' && call.path === '/api/runs');
  assert.equal(JSON.parse(createCall.opts.body).runner, 'headless');
});

test('create form remembers the selected runner mode', async () => {
  const harness = createFrontendHarness();
  harness.runnerMode.value = 'tmux';
  harness.__setApi(async (requestPath, opts = {}) => {
    harness.__calls.push({ kind: 'api', path: requestPath, opts });
    if (requestPath === '/api/tmux') return { tmux: { installed: true, shellAvailable: true, version: 'tmux 3.4' } };
    if (requestPath === '/api/runs') return { runId: 'run_runner_memory' };
    return {};
  });

  await harness.__createRun();

  assert.equal(harness.__storage.get('input-kanban.runnerMode'), 'tmux');
  const createCall = harness.__calls.find(call => call.kind === 'api' && call.path === '/api/runs');
  assert.equal(JSON.parse(createCall.opts.body).runner, 'tmux');
  assert.equal(Object.hasOwn(JSON.parse(createCall.opts.body), 'tmuxShell'), false);
});

test('run action state maps reachable statuses to executable actions', () => {
  const harness = createFrontendHarness();

  harness.__setRun('run_planned', { status: 'planned', tasks: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(harness.__runActionState('dispatch'))), { label: '执行', disabled: false, state: '' });
  assert.deepEqual(JSON.parse(JSON.stringify(harness.__runActionState('judge'))), { label: '验收', disabled: true, state: 'done' });

  harness.__setRun('run_gated', { status: 'planned', tasks: [], gates: { planApproval: { required: true, approved: false } } });
  assert.deepEqual(JSON.parse(JSON.stringify(harness.__runActionState('dispatch'))), { label: '开始执行', disabled: false, state: '' });

  harness.__setRun('run_blocked', { status: 'batch_blocked', tasks: [{ id: 'T-01', status: 'failed' }] });
  assert.deepEqual(JSON.parse(JSON.stringify(harness.__runActionState('dispatch'))), { label: '重试执行', disabled: false, state: 'retry' });

  harness.__setRun('run_completed', { status: 'batches_completed', tasks: [{ id: 'T-01', status: 'completed' }] });
  assert.deepEqual(JSON.parse(JSON.stringify(harness.__runActionState('dispatch'))), { label: '已完成', disabled: true, state: 'done' });
  assert.deepEqual(JSON.parse(JSON.stringify(harness.__runActionState('judge'))), { label: '验收', disabled: false, state: '' });
});

test('dispatch toolbar action retries blocked runs and dispatches planned runs', async () => {
  const planned = createFrontendHarness();
  planned.__setRun('run_planned', { status: 'planned', tasks: [] });
  await planned.__dispatchRun();
  assert.deepEqual(planned.__calls.filter(call => call.kind === 'api' && call.opts.method === 'POST').map(call => [call.path, call.opts.method]), [
    ['/api/runs/run_planned/dispatch', 'POST']
  ]);

  const blocked = createFrontendHarness();
  blocked.__setRun('run_blocked', { status: 'batch_blocked', tasks: [{ id: 'T-01', status: 'failed' }] });
  await blocked.__dispatchRun();
  assert.deepEqual(blocked.__calls.filter(call => call.kind === 'api' && call.opts.method === 'POST').map(call => [call.path, call.opts.method]), [
    ['/api/runs/run_blocked/retry', 'POST']
  ]);
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
  assert.doesNotMatch(script, /metaChip\('Run ID', currentState\.runId/);
  assert.match(html, /\.build-title \{ display: grid; grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(html, /\.build-title-tools/);
  assert.match(script, /build-title-main/);
  assert.match(script, /build-title-tools/);
  assert.match(script, /title-copy-btn/);
  assert.match(script, /data-copy-kind="run-id"/);
  assert.match(script, /data-copy-kind="tmux"/);
  assert.match(script, /function copyIcon\(\)/);
  assert.match(script, /function titleCopyLabel\(kind\)/);
  assert.match(script, /copyRunId\(event\)/);
  assert.match(script, /复制 Run ID/);
  assert.match(script, /metaChip\('工作区', basenamePath\(currentState\.workspacePath \|\| currentState\.repo\)/);
  assert.match(script, /copyRepoPath\(event\)/);
  assert.match(script, /title="复制工作区地址"/);
  assert.match(script, /event\.currentTarget\.textContent = '⧉'/);
  assert.doesNotMatch(script, /metaChip\('终端', tmuxSessionName\(currentState\)/);
  assert.doesNotMatch(script, /tmux 现场尚未生成/);
  assert.match(script, /复制 tmux attach 指令/);
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
  assert.match(html, /th:nth-child\(6\), td:nth-child\(6\) \{ width: 116px; \}/);
  assert.match(html, /\.session-cell-wrap \{ display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; \}/);
  assert.match(script, /session-cell-wrap/);
  assert.match(script, /function taskAttentionHintCell\(t\)/);
  assert.match(script, /attentionHint\.message/);
  assert.match(script, /function attentionHintText\(t, \{ includeDetail = false \} = \{\}\)/);
  assert.match(script, /原因：\$\{hint\.detail\}/);
  assert.match(script, /attention-resume-label">介入/);
  assert.match(script, /const command = `codex resume \$\{sessionId\}`/);
  assert.doesNotMatch(script, /codex exec resume/);
  assert.match(html, /th:nth-child\(8\), td:nth-child\(8\) \{ width: 220px; \}/);
  assert.match(html, /\.attention-action \{ display: inline-flex;/);
  assert.match(html, /\.attention-pill \{ max-width: 100%; white-space: normal;/);
});

test('file viewer renders role-specific file tabs', () => {
  assert.match(html, /<h2>任务详情<\/h2>/);
  assert.match(html, /aria-label="任务详情权限与网络提示"/);
  assert.match(html, /当前 worker 沙箱能力不足/);
  assert.match(html, /DNS \/ 网络失败则通常需要检查代理、VPN 或本地 evidence/);
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
  assert.match(script, /const wasAtBottom = pre\.scrollHeight - pre\.scrollTop - pre\.clientHeight < 24/);
  assert.match(script, /name === 'events\.pretty' && \(!preserveScroll \|\| wasAtBottom\)/);
  assert.match(script, /pre\.scrollTop = pre\.scrollHeight/);
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
  assert.match(script, /复制 tmux attach 指令/);
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

test('tmux copy action stays on the run header only', async () => {
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
  assert.doesNotMatch(script, /function taskTmuxCommand\(t\)/);
  assert.doesNotMatch(script, /function taskTmuxButton\(id, t\)/);
  assert.doesNotMatch(script, /task-tmux-copy/);
  assert.doesNotMatch(script, /async function copyTaskTmuxCommand\(event, taskId\)/);
  assert.doesNotMatch(script, /attachPaneCommand \|\| tmux\.selectPaneCommand \|\| tmux\.paneCommand/);

  const harness = createFrontendHarness();
  const task = {
    id: 'T-01',
    status: 'running',
    tmux: {
      ready: true,
      tmuxShell: { scriptKind: 'powershell' },
      attachPaneCommand: 'tmux select-window -t input-kanban-run_01:batch-1 \\; select-pane -t %12 \\; attach-session -t input-kanban-run_01'
    }
  };
  harness.__setRun('run_01', { batches: [{ id: 'B-01', tasks: [task] }], tasks: [] });
  assert.equal(harness.__taskById('T-01'), task);
  assert.equal(harness.__taskActionInfoCell('T-01', task), '-');
});
