import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  DEFAULT_REPO, RUNS_DIR, ensureDir, nowIso, makeRunId, readJson,
  writeJsonAtomic, fileInfo, readTextMaybe, extractFirstJsonObject, listRunDirs,
  pathForRun, roleDir, safeIdPart, RUNNER
} from './utils.js';
import { matchThreadToMarkers } from './appServerClient.js';
import { formatCodexEventsJsonl } from './eventFormatter.js';
import { defaultRunner } from './runners/index.js';

const execFileAsync = promisify(execFile);
const runner = defaultRunner;
const VALID_SANDBOXES = new Set(['read-only', 'workspace-write', 'danger-full-access']);

function normalizeSandbox(value, fallback = 'workspace-write') {
  const sandbox = String(value || '').trim();
  if (VALID_SANDBOXES.has(sandbox)) return sandbox;
  return fallback;
}

function statePath(runDir) { return path.join(runDir, 'run_state.json'); }
function planPath(runDir) { return path.join(runDir, 'plan.json'); }

function userInputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

async function assertGitWorkTree(repo) {
  const resolvedRepo = path.resolve(repo || DEFAULT_REPO);
  let stat;
  try { stat = await fsp.stat(resolvedRepo); }
  catch { throw userInputError(`target repository does not exist: ${resolvedRepo}`); }
  if (!stat.isDirectory()) throw userInputError(`target repository is not a directory: ${resolvedRepo}`);
  try {
    const { stdout } = await execFileAsync('git', ['-C', resolvedRepo, 'rev-parse', '--is-inside-work-tree'], { timeout: 5000 });
    if (stdout.trim() === 'true') return resolvedRepo;
  } catch {}
  throw userInputError(`target repository is not a git work tree: ${resolvedRepo}`);
}

export async function createRun({ label = 'task', taskText = '', repo = DEFAULT_REPO, maxParallel = 3, workerSandbox = 'workspace-write' } = {}) {
  const resolvedRepo = await assertGitWorkTree(repo);
  const runId = makeRunId(label);
  const runDir = pathForRun(runId);
  await ensureDir(runDir);
  await fsp.writeFile(path.join(runDir, 'task.md'), taskText || '');
  const state = {
    runId, label, repo: resolvedRepo, maxParallel: Number(maxParallel) || 3, workerSandbox: normalizeSandbox(workerSandbox),
    runner: RUNNER,
    status: 'created', createdAt: nowIso(), updatedAt: nowIso(),
    planner: { status: 'pending' }, batches: [], tasks: [], judge: { status: 'pending' }
  };
  await writeJsonAtomic(statePath(runDir), state);
  return state;
}

export async function listRuns({ includeArchived = false } = {}) {
  const dirs = await listRunDirs();
  const rows = [];
  for (const dir of dirs) {
    const s = await loadAndRefreshRun(path.basename(dir), null, { light: true });
    if (s && (includeArchived || !s.archived)) rows.push(summaryOfRun(s));
  }
  return rows;
}

export async function loadRun(runId) {
  const state = await readJson(statePath(pathForRun(runId)), null);
  if (state) ensureBatchShape(state);
  return state;
}

async function saveRun(state) {
  ensureBatchShape(state);
  state.updatedAt = nowIso();
  await writeJsonAtomic(statePath(pathForRun(state.runId)), state);
  return state;
}

function marker(runId, taskId, role) {
  return `ORCHESTRATOR_RUN_ID: ${runId}\nORCHESTRATOR_TASK_ID: ${taskId}\nORCHESTRATOR_ROLE: ${role}`;
}

function defaultPlannerPrompt(state, taskText) {
  return `${marker(state.runId, 'planner', 'planner')}

You are the planner for a local Codex orchestrator dashboard.
Split the user's task into scoped Codex worker tasks.
Return ONLY one JSON object. No markdown.

Preferred schema with blocking batches:
{
  "batches": [
    {
      "id": "batch-1",
      "name": "first batch name",
      "maxParallel": 3,
      "tasks": [
        {
          "id": "T-01",
          "name": "short name",
          "prompt": "complete worker prompt",
          "sandbox": "${state.workerSandbox || 'workspace-write'}",
          "expectedArtifacts": []
        }
      ]
    }
  ],
  "finalJudgeRequired": true
}

Backward-compatible schema also accepted:
{
  "tasks": [
    {
      "id": "T-01",
      "name": "short name",
      "prompt": "complete worker prompt",
      "sandbox": "${state.workerSandbox || 'workspace-write'}",
      "expectedArtifacts": []
    }
  ]
}

Rules:
- Batches are strict barriers: a later batch must not start before all tasks in earlier batches complete.
- Use batch maxParallel to express whether tasks in the same batch may run concurrently or serially.
- Keep tasks scoped and independently executable.
- Include exact output/artifact expectations in each worker prompt.
- Default worker sandbox for this run is ${state.workerSandbox || 'workspace-write'}; use that sandbox unless a task has a specific safety reason to be stricter.
- If the input already contains task sections, preserve their ids when practical.

User task:
${taskText}
`;
}

function defaultJudgePrompt(state, judgeInputPath) {
  return `${marker(state.runId, 'judge', 'judge')}

You are an independent final judge for a Codex orchestrator run.
Use the judge input manifest as the primary source of truth. Inspect additional run artifacts only if needed.
Do not modify files. Return ONLY JSON with:
{
  "verdict": "passed|partial|failed|blocked",
  "completedTasks": [],
  "failedTasks": [],
  "blockedTasks": [],
  "missingArtifacts": [],
  "scopeViolations": [],
  "residualRisk": [],
  "recommendedNextActions": []
}

Judge input manifest: ${judgeInputPath}
Run directory: ${pathForRun(state.runId)}
Original task: ${path.join(pathForRun(state.runId), 'task.md')}
Plan: ${path.join(pathForRun(state.runId), 'plan.json')}
`;
}

export async function startPlanner(runId) {
  const state = await loadRun(runId);
  if (!state) throw new Error(`run not found: ${runId}`);
  if (state.archived) throw new Error('archived run cannot be planned');
  if (state.status === 'stopped') throw new Error('stopped run cannot be planned; create a new run after modifications');
  if (state.planner.status === 'running') throw new Error('planner already running');
  if (hasStartedExecution(state)) throw new Error('planner retry is allowed only before any worker/judge starts');
  const runDir = pathForRun(runId);
  const previousPlanner = state.planner;
  if (previousPlanner?.status && previousPlanner.status !== 'pending') await rotatePlannerAttempt(state, runDir);
  state.batches = [];
  state.tasks = [];
  state.judge = { status: 'pending' };
  const outDir = roleDir(runDir, 'planner');
  await ensureDir(outDir);
  await fsp.rm(planPath(runDir), { force: true });
  const taskText = await fsp.readFile(path.join(runDir, 'task.md'), 'utf8');
  const prompt = defaultPlannerPrompt(state, taskText);
  const child = await runner.startCodexTask({ runId: state.runId, taskId: 'planner', batchId: 'planner', runStatePath: statePath(runDir), prompt, sandbox: 'read-only', cwd: state.repo, outDir });
  state.status = 'planning';
  state.planner = { status: 'running', pid: child.pid, startedAt: nowIso(), dir: outDir, attempt: (state.plannerAttempts?.length || 0) + 1 };
  await saveRun(state);
  child.onExit(async code => {
    const s = await loadRun(runId); if (!s || s.status === 'stopped') return;
    s.planner.exitCode = code; s.planner.endedAt = nowIso(); s.planner.status = code === 0 ? 'completed' : 'failed';
    const planResult = await materializePlan(s);
    if (s.planner.status !== 'completed') s.status = 'plan_failed';
    else if (planResult.ok) s.status = 'planned';
    else if (planResult.empty) s.status = 'plan_empty';
    else s.status = 'plan_failed';
    await saveRun(s);
  });
  return state;
}

function normalizeTask(t, i, batch, defaultSandbox = 'workspace-write') {
  const id = safeIdPart(t.id || `T-${String(i + 1).padStart(2, '0')}`);
  return {
    id,
    batchId: batch.id,
    name: t.name || t.id || `Task ${i + 1}`,
    prompt: t.prompt || t.instructions || '',
    sandbox: normalizeSandbox(t.sandbox, defaultSandbox),
    expectedArtifacts: Array.isArray(t.expectedArtifacts) ? t.expectedArtifacts : [],
    status: 'pending'
  };
}

function hasStartedExecution(state) {
  return (state.tasks || []).some(t => ['running', 'completed', 'failed', 'unknown', 'stopped'].includes(t.status)) ||
    ['running', 'completed', 'failed', 'unknown', 'stopped'].includes(state.judge?.status);
}

async function rotatePlannerAttempt(state, runDir) {
  const plannerDir = roleDir(runDir, 'planner');
  if (!fs.existsSync(plannerDir)) return;
  const attemptsDir = path.join(runDir, 'planner_attempts');
  await ensureDir(attemptsDir);
  const attempt = (state.plannerAttempts?.length || 0) + 1;
  const archivedDir = path.join(attemptsDir, `attempt-${String(attempt).padStart(2, '0')}`);
  await fsp.rm(archivedDir, { recursive: true, force: true });
  await fsp.rename(plannerDir, archivedDir);
  state.plannerAttempts = [...(state.plannerAttempts || []), {
    attempt,
    status: state.planner?.status,
    exitCode: state.planner?.exitCode ?? null,
    startedAt: state.planner?.startedAt,
    endedAt: state.planner?.endedAt,
    archivedDir,
    archivedAt: nowIso(),
    planParseError: state.planner?.planParseError,
    planEmpty: !!state.planner?.planEmpty
  }];
}

function normalizePlan(plan, defaultMaxParallel, defaultSandbox = 'workspace-write') {
  if (Array.isArray(plan.batches)) {
    const batches = plan.batches.map((b, bi) => {
      const batch = {
        id: safeIdPart(b.id || `batch-${bi + 1}`),
        name: b.name || `批次 ${bi + 1}`,
        maxParallel: Math.max(1, Number(b.maxParallel || defaultMaxParallel) || 1),
        status: 'pending',
        tasks: []
      };
      batch.tasks = (Array.isArray(b.tasks) ? b.tasks : []).map((t, ti) => normalizeTask(t, ti, batch, defaultSandbox));
      return batch;
    }).filter(b => b.tasks.length);
    return { ...plan, batches, tasks: batches.flatMap(b => b.tasks) };
  }
  if (Array.isArray(plan.tasks)) {
    const batch = { id: 'batch-1', name: '默认批次', maxParallel: Math.max(1, Number(defaultMaxParallel) || 1), status: 'pending', tasks: [] };
    batch.tasks = plan.tasks.map((t, i) => normalizeTask(t, i, batch, defaultSandbox));
    return { ...plan, batches: [batch], tasks: batch.tasks };
  }
  return null;
}

async function materializePlan(state) {
  const last = path.join(roleDir(pathForRun(state.runId), 'planner'), 'last_message.md');
  const text = await readTextMaybe(last, 1000000);
  const plan = extractFirstJsonObject(text);
  if (!plan) {
    state.planner.planParseError = 'planner last_message did not contain a JSON object';
    state.batches = [];
    state.tasks = [];
    return { ok: false, empty: false, error: state.planner.planParseError };
  }
  const normalized = normalizePlan(plan, state.maxParallel, state.workerSandbox || 'workspace-write');
  if (!normalized || !Array.isArray(normalized.tasks)) {
    state.planner.planParseError = 'planner JSON did not contain { batches: [...] } or { tasks: [...] }';
    state.batches = [];
    state.tasks = [];
    return { ok: false, empty: false, error: state.planner.planParseError };
  }
  if (!normalized.tasks.length) {
    state.planner.planEmpty = true;
    state.planner.planParseError = 'planner returned zero tasks; retry planning after adjusting the task description or prompt';
    state.batches = [];
    state.tasks = [];
    return { ok: false, empty: true, error: state.planner.planParseError };
  }
  delete state.planner.planEmpty;
  delete state.planner.planParseError;
  await writeJsonAtomic(planPath(pathForRun(state.runId)), normalized);
  state.batches = normalized.batches;
  state.tasks = normalized.tasks;
  return { ok: true, empty: false };
}

export async function dispatchRun(runId) {
  const state = await loadRun(runId);
  if (!state) throw new Error(`run not found: ${runId}`);
  if (state.archived) throw new Error('archived run cannot be dispatched');
  if (state.status === 'stopped') throw new Error('stopped run cannot be dispatched; create a new run after modifications');
  if (!state.tasks?.length) throw new Error('no tasks in plan');
  if (state.status === 'batch_blocked') throw new Error('current batch is blocked by failed/unknown tasks');
  if (allBatchesCompleted(state)) throw new Error('all batches completed; run final judge next');
  state.status = 'running';
  await scheduleMoreWorkers(state);
  recomputeRunStatus(state);
  await saveRun(state);
  return state;
}

async function startWorkerInState(state, task) {
  const runDir = pathForRun(state.runId);
  const outDir = roleDir(runDir, 'worker', task.id);
  await ensureDir(outDir);
  const fullPrompt = `${marker(state.runId, task.id, 'worker')}
ORCHESTRATOR_BATCH_ID: ${task.batchId || 'batch-1'}

${task.prompt}
`;
  const child = await runner.startCodexTask({ runId: state.runId, taskId: task.id, batchId: task.batchId || 'batch-1', runStatePath: statePath(runDir), prompt: fullPrompt, sandbox: task.sandbox || state.workerSandbox || 'workspace-write', cwd: state.repo, outDir });
  Object.assign(task, { status: 'running', pid: child.pid, startedAt: nowIso(), dir: outDir });
}

export async function stopRun(runId, { reason = 'stopped by user' } = {}) {
  const state = await loadRun(runId);
  if (!state) throw new Error(`run not found: ${runId}`);
  const stoppedAt = nowIso();
  await runner.stopRun(runId);
  for (const roleState of [state.planner, state.judge]) {
    if (roleState?.status === 'running') Object.assign(roleState, { status: 'stopped', stoppedAt, endedAt: stoppedAt });
  }
  for (const task of state.tasks || []) {
    if (task.status === 'running') Object.assign(task, { status: 'stopped', stoppedAt, endedAt: stoppedAt });
  }
  for (const batch of state.batches || []) {
    if ((batch.tasks || []).some(t => t.status === 'stopped')) batch.status = 'stopped';
  }
  state.status = 'stopped';
  state.stopInfo = { reason, stoppedAt };
  await saveRun(state);
  return state;
}

export async function archiveRun(runId, { reason = 'archived by user' } = {}) {
  const state = await loadRun(runId);
  if (!state) throw new Error(`run not found: ${runId}`);
  if ((state.tasks || []).some(t => t.status === 'running') || state.planner?.status === 'running' || state.judge?.status === 'running') {
    throw new Error('cannot archive a run while tasks are running; stop it first');
  }
  state.archived = true;
  state.archivedAt = nowIso();
  state.archiveInfo = { reason, archivedAt: state.archivedAt };
  await saveRun(state);
  return state;
}

export async function renameRun(runId, { label = '' } = {}) {
  const state = await loadRun(runId);
  if (!state) throw new Error(`run not found: ${runId}`);
  const nextLabel = String(label || '').trim();
  if (!nextLabel) throw userInputError('run label cannot be empty');
  state.label = nextLabel;
  state.renamedAt = nowIso();
  await saveRun(state);
  return state;
}

export async function markTaskCompleted(runId, taskId, { reason = 'manual success confirmed by user', resultText = '' } = {}) {
  const state = await loadRun(runId);
  if (!state) throw new Error(`run not found: ${runId}`);
  const task = (state.tasks || []).find(t => t.id === taskId);
  if (!task) throw new Error(`task not found: ${taskId}`);
  if (task.status === 'running') throw new Error('cannot mark a running task completed');
  const runDir = pathForRun(runId);
  const outDir = roleDir(runDir, 'worker', task.id);
  await ensureDir(outDir);
  if (task.status !== 'completed') {
    const manualResult = String(resultText || '').trim();
    if (manualResult) await fsp.writeFile(path.join(outDir, 'manual_result.md'), manualResult);
    const override = {
      type: 'manual_task_completed',
      runId,
      taskId,
      originalStatus: task.originalStatus || task.status,
      originalExitCode: task.originalExitCode ?? task.exitCode ?? null,
      previousStatus: task.status,
      previousExitCode: task.exitCode ?? null,
      reason,
      hasManualResult: !!manualResult,
      manualResultFile: manualResult ? 'manual_result.md' : null,
      manualResultPreview: manualResult ? manualResult.slice(0, 500) : '',
      markedAt: nowIso()
    };
    await writeJsonAtomic(path.join(outDir, 'manual_completion.json'), override);
    Object.assign(task, {
      status: 'completed',
      originalStatus: override.originalStatus,
      originalExitCode: override.originalExitCode,
      manualCompletion: override,
      completedAt: override.markedAt
    });
    const batch = (state.batches || []).find(b => b.id === task.batchId);
    if (batch) {
      const batchTask = batch.tasks.find(t => t.id === task.id);
      if (batchTask && batchTask !== task) Object.assign(batchTask, task);
    }
  }
  recomputeRunStatus(state);
  if (hasPendingRunnableBatch(state)) state.status = 'running';
  await scheduleMoreWorkers(state);
  recomputeRunStatus(state);
  await saveRun(state);
  return state;
}

export async function startJudge(runId) {
  const state = await loadRun(runId);
  if (!state) throw new Error(`run not found: ${runId}`);
  recomputeRunStatus(state);
  if (!allBatchesCompleted(state) && state.tasks?.length) throw new Error('final judge is allowed only after all batches completed');
  const outDir = roleDir(pathForRun(runId), 'judge');
  await ensureDir(outDir);
  const judgeInputPath = path.join(outDir, 'judge_input.json');
  const judgeInput = await buildJudgeInput(state);
  await writeJsonAtomic(judgeInputPath, judgeInput);
  const prompt = defaultJudgePrompt(state, judgeInputPath);
  const child = await runner.startCodexTask({ runId: state.runId, taskId: 'judge', batchId: 'judge', runStatePath: statePath(pathForRun(runId)), prompt, sandbox: 'read-only', cwd: state.repo, outDir });
  state.judge = { status: 'running', pid: child.pid, startedAt: nowIso(), dir: outDir };
  state.status = 'judging';
  await saveRun(state);
  child.onExit(async code => {
    const s = await loadRun(runId); if (!s || s.status === 'stopped') return;
    s.judge.exitCode = code; s.judge.endedAt = nowIso(); s.judge.status = code === 0 ? 'completed' : 'failed';
    const text = await readTextMaybe(path.join(outDir, 'last_message.md'), 1000000);
    const verdict = extractFirstJsonObject(text);
    if (verdict) { s.judge.verdict = verdict; await writeJsonAtomic(path.join(outDir, 'verdict.json'), verdict); }
    s.status = s.judge.status === 'completed' ? 'judged' : 'judge_failed';
    await saveRun(s);
  });
  return state;
}

export async function refreshRun(runId, appClient = null) {
  return await loadAndRefreshRun(runId, appClient, { light: false });
}

async function loadAndRefreshRun(runId, appClient = null, { light = false } = {}) {
  const state = await loadRun(runId);
  if (!state) return null;
  state.runner = state.runner || RUNNER;
  await refreshRole(state, state.planner, roleDir(pathForRun(runId), 'planner'));
  await recoverCompletedPlanner(state);
  for (const task of state.tasks || []) await refreshTask(state, task);
  await refreshRole(state, state.judge, roleDir(pathForRun(runId), 'judge'));
  await recoverCompletedJudge(state);
  aggregateRunTmuxMetadata(state);
  recomputeRunStatus(state);
  await scheduleMoreWorkers(state);
  recomputeRunStatus(state);
  if (appClient && !light) await enrichFromAppServer(state, appClient).catch(e => { state.appServerError = e.message; });
  await saveRun(state);
  return state;
}

async function recoverCompletedPlanner(state) {
  if (state.planner?.status !== 'completed' || state.tasks?.length || state.batches?.length) return;
  const planResult = await materializePlan(state);
  if (planResult.ok) state.status = 'planned';
  else if (planResult.empty) state.status = 'plan_empty';
  else state.status = 'plan_failed';
}

async function recoverCompletedJudge(state) {
  if (!['completed', 'failed'].includes(state.judge?.status)) return;
  if (state.judge.status === 'completed' && !state.judge.verdict) {
    const outDir = roleDir(pathForRun(state.runId), 'judge');
    const text = await readTextMaybe(path.join(outDir, 'last_message.md'), 1000000);
    const verdict = extractFirstJsonObject(text);
    if (verdict) {
      state.judge.verdict = verdict;
      await writeJsonAtomic(path.join(outDir, 'verdict.json'), verdict);
    }
  }
  state.status = state.judge.status === 'completed' ? 'judged' : 'judge_failed';
}

async function refreshRole(state, roleState, dir) {
  if (!roleState) return;
  const exitPath = path.join(dir, 'exit_code');
  const exit = await readTextMaybe(exitPath, 1000);
  const exitInfo = await fileInfo(exitPath);
  const key = roleState === state.judge ? 'judge' : 'planner';
  if (exit !== '') {
    roleState.exitCode = Number(exit.trim());
    if (!roleState.endedAt && exitInfo.exists) roleState.endedAt = exitInfo.mtime;
    if (roleState.status === 'running') roleState.status = roleState.exitCode === 0 ? 'completed' : 'failed';
  }
  else if (roleState.status === 'running' && !runner.hasRunning(state.runId, key)) roleState.status = 'unknown';
  roleState.files = await standardFiles(dir);
  await attachTmuxMetadata(roleState, dir);
}

async function refreshTask(state, task) {
  const dir = roleDir(pathForRun(state.runId), 'worker', task.id);
  const exitPath = path.join(dir, 'exit_code');
  const exit = await readTextMaybe(exitPath, 1000);
  const exitInfo = await fileInfo(exitPath);
  if (exit !== '') {
    task.exitCode = Number(exit.trim());
    if (!task.endedAt && exitInfo.exists) task.endedAt = exitInfo.mtime;
    if (task.status === 'running') task.status = task.exitCode === 0 ? 'completed' : 'failed';
  } else if (task.status === 'running' && !runner.hasRunning(state.runId, task.id)) task.status = 'unknown';
  task.files = await standardFiles(dir);
  await attachTmuxMetadata(task, dir);
  delete task.attentionHint;
  task.artifacts = [];
  for (const rel of task.expectedArtifacts || []) task.artifacts.push({ path: rel, ...(await fileInfo(path.isAbsolute(rel) ? rel : path.join(state.repo, rel))) });
  const batch = (state.batches || []).find(b => b.id === task.batchId);
  if (batch) {
    const bt = batch.tasks.find(t => t.id === task.id);
    if (bt && bt !== task) Object.assign(bt, task);
  }
}

async function attachTmuxMetadata(target, dir) {
  const raw = await readJson(path.join(dir, 'tmux.json'), null);
  if (!raw || raw.runner !== 'tmux') {
    delete target.tmux;
    return;
  }
  if (raw.ready !== true) {
    target.tmux = {
      runner: 'tmux',
      ready: false,
      status: raw.status || 'pending',
      sessionName: raw.sessionName || '',
      windowName: raw.windowName || '',
      target: raw.target || '',
      runScript: raw.runScript || '',
      startedAt: raw.startedAt || '',
      error: raw.error || ''
    };
    return;
  }
  const selectWindowCommand = raw.selectWindowCommand || raw.selectCommand || '';
  target.tmux = {
    runner: 'tmux',
    ready: true,
    status: raw.status || 'ready',
    sessionName: raw.sessionName || '',
    windowName: raw.windowName || '',
    target: raw.target || '',
    attachCommand: raw.attachCommand || '',
    selectWindowCommand,
    runScript: raw.runScript || '',
    startedAt: raw.startedAt || '',
    readyAt: raw.readyAt || ''
  };
}

function aggregateRunTmuxMetadata(state) {
  const roles = [state.planner, ...(state.tasks || []), state.judge].filter(Boolean);
  const entries = roles.map(role => role.tmux).filter(tmux => tmux?.runner === 'tmux');
  const readyEntries = entries.filter(tmux => tmux.ready === true);
  if (!entries.length) {
    if ((state.runner || RUNNER) === 'tmux') {
      state.tmux = {
        runner: 'tmux',
        hasTmuxSession: false
      };
    } else {
      delete state.tmux;
    }
    return;
  }
  const withSession = readyEntries.find(tmux => tmux.sessionName || tmux.target || tmux.windowName);
  if (!withSession) {
    state.tmux = {
      runner: 'tmux',
      hasTmuxSession: false
    };
    return;
  }
  state.tmux = {
    runner: 'tmux',
    hasTmuxSession: true,
    tmuxSessionName: withSession.sessionName || ''
  };
  if (withSession.attachCommand) state.tmux.tmuxAttachCommand = withSession.attachCommand;
}

async function standardFiles(dir) {
  return {
    prompt: await fileInfo(path.join(dir, 'prompt.md')),
    events: await fileInfo(path.join(dir, 'events.jsonl')),
    timedEvents: await fileInfo(path.join(dir, 'events_timed.jsonl')),
    stderr: await fileInfo(path.join(dir, 'stderr.log')),
    lastMessage: await fileInfo(path.join(dir, 'last_message.md')),
    exitCode: await fileInfo(path.join(dir, 'exit_code')),
    runScript: await fileInfo(path.join(dir, 'run.sh')),
    tmux: await fileInfo(path.join(dir, 'tmux.json')),
    manualResult: await fileInfo(path.join(dir, 'manual_result.md'))
  };
}

function currentBatch(state) {
  ensureBatchShape(state);
  return (state.batches || []).find(b => b.status !== 'completed');
}

async function scheduleMoreWorkers(state) {
  if (state.status !== 'running') return;
  const batch = currentBatch(state);
  if (!batch) return;
  if (batch.status === 'failed' || batch.status === 'blocked') return;
  batch.status = 'running';
  const maxParallel = Math.max(1, Number(batch.maxParallel || state.maxParallel) || 1);
  let active = batch.tasks.filter(t => t.status === 'running').length;
  for (const task of batch.tasks) {
    if (active >= maxParallel) break;
    if (task.status !== 'pending') continue;
    try { await startWorkerInState(state, task); syncFlatTask(state, task); }
    catch (e) { task.status = 'failed'; task.error = e.message; syncFlatTask(state, task); }
    active++;
  }
}

function syncFlatTask(state, task) {
  const i = (state.tasks || []).findIndex(t => t.id === task.id);
  if (i >= 0) state.tasks[i] = task;
}

function recomputeRunStatus(state) {
  ensureBatchShape(state);
  if (state.archived || state.status === 'stopped' || state.status === 'created' || state.status === 'planning' || state.status === 'judging') return;
  for (const batch of state.batches || []) {
    const tasks = batch.tasks || [];
    if (!tasks.length) { batch.status = 'completed'; continue; }
    if (tasks.some(t => t.status === 'running')) { batch.status = 'running'; continue; }
    if (tasks.some(t => ['failed', 'unknown'].includes(t.status))) { batch.status = 'failed'; continue; }
    if (tasks.every(t => t.status === 'completed')) { batch.status = 'completed'; continue; }
    batch.status = 'pending';
  }
  const failedBatch = (state.batches || []).find(b => b.status === 'failed');
  if (failedBatch) { state.status = 'batch_blocked'; return; }
  if (allBatchesCompleted(state)) {
    if (state.judge?.status === 'completed') state.status = 'judged';
    else state.status = 'batches_completed';
    return;
  }
  if ((state.batches || []).some(b => b.status === 'running')) state.status = 'running';
  else if ((state.batches || []).some(b => b.status === 'pending')) {
    state.status = state.status === 'running' ? 'running' : 'planned';
  }
}

function hasPendingRunnableBatch(state) {
  if (state.archived || state.status === 'stopped') return false;
  const batch = currentBatch(state);
  if (!batch) return false;
  if (batch.status === 'failed' || batch.status === 'blocked') return false;
  return (batch.tasks || []).some(t => t.status === 'pending');
}

function allBatchesCompleted(state) {
  return !!(state.batches?.length) && state.batches.every(b => b.status === 'completed');
}

async function buildJudgeInput(state) {
  const runDir = pathForRun(state.runId);
  const taskText = await readTextMaybe(path.join(runDir, 'task.md'), 1000000);
  const plan = await readJson(planPath(runDir), null);
  const tasks = [];
  for (const task of state.tasks || []) {
    const dir = roleDir(runDir, 'worker', task.id);
    tasks.push({
      id: task.id,
      name: task.name,
      batchId: task.batchId,
      status: task.status,
      originalStatus: task.originalStatus,
      exitCode: task.exitCode ?? null,
      originalExitCode: task.originalExitCode ?? null,
      startedAt: task.startedAt,
      endedAt: task.endedAt,
      completedAt: task.completedAt,
      expectedArtifacts: task.expectedArtifacts || [],
      artifacts: task.artifacts || [],
      lastMessage: await readTextMaybe(path.join(dir, 'last_message.md'), 200000),
      resultJson: await readJson(path.join(dir, 'result.json'), null),
      evidenceJson: await readJson(path.join(dir, 'evidence.json'), null),
      manualCompletion: task.manualCompletion || await readJson(path.join(dir, 'manual_completion.json'), null),
      manualResult: await readTextMaybe(path.join(dir, 'manual_result.md'), 200000),
      tmux: task.tmux || null,
      stderrTail: await readTextMaybe(path.join(dir, 'stderr.log'), 20000)
    });
  }
  return {
    type: 'codex_orchestrator_judge_input',
    version: 1,
    generatedAt: nowIso(),
    run: {
      runId: state.runId,
      label: state.label,
      repo: state.repo,
      status: state.status,
      runner: state.runner || RUNNER,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      maxParallel: state.maxParallel,
      workerSandbox: state.workerSandbox || 'workspace-write'
    },
    taskText,
    plan,
    batches: (state.batches || []).map(batch => ({
      id: batch.id,
      name: batch.name,
      status: batch.status,
      maxParallel: batch.maxParallel,
      taskIds: (batch.tasks || []).map(task => task.id)
    })),
    planner: {
      status: state.planner?.status,
      exitCode: state.planner?.exitCode ?? null,
      planParseError: state.planner?.planParseError,
      planEmpty: !!state.planner?.planEmpty,
      tmux: state.planner?.tmux || null,
      lastMessage: await readTextMaybe(path.join(roleDir(runDir, 'planner'), 'last_message.md'), 200000)
    },
    tasks
  };
}

function ensureBatchShape(state) {
  if (!Array.isArray(state.batches) || !state.batches.length) {
    if (Array.isArray(state.tasks) && state.tasks.length) {
      state.batches = [{ id: 'batch-1', name: '默认批次', maxParallel: Math.max(1, Number(state.maxParallel) || 1), status: 'pending', tasks: state.tasks }];
      for (const t of state.tasks) t.batchId = t.batchId || 'batch-1';
    } else state.batches = [];
  }
  state.tasks = (state.batches || []).flatMap(b => {
    b.tasks = Array.isArray(b.tasks) ? b.tasks : [];
    for (const t of b.tasks) t.batchId = t.batchId || b.id;
    return b.tasks;
  });
}

async function enrichFromAppServer(state, appClient) {
  const res = await appClient.listThreads({ cwd: state.repo, limit: 100 });
  const threads = res?.data || [];
  const all = [{ id: 'planner', target: state.planner }, ...(state.tasks || []).map(t => ({ id: t.id, target: t })), { id: 'judge', target: state.judge }];
  for (const item of all) {
    const thread = threads.find(th => matchThreadToMarkers(th, state.runId, item.id));
    if (thread && item.target) item.target.codexThread = { id: thread.id, sessionId: thread.sessionId, source: thread.source, status: thread.status, preview: thread.preview, updatedAt: thread.updatedAt };
  }
}

function runDurationEndOfState(s) {
  const terminalStatuses = new Set(['judged', 'judge_failed', 'batch_blocked', 'plan_failed', 'plan_empty', 'stopped']);
  if (!terminalStatuses.has(s.status)) return null;
  const times = [
    s.stoppedAt,
    s.stopInfo?.stoppedAt,
    s.judge?.endedAt,
    s.planner?.endedAt,
    ...(s.tasks || []).flatMap(task => [task.endedAt, task.completedAt, task.stoppedAt])
  ].map(value => Date.parse(value || '')).filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)).toISOString() : s.updatedAt;
}

function summaryOfRun(s) {
  const tasks = s.tasks || [];
  return { runId: s.runId, label: s.label, repo: s.repo, status: s.status, runner: s.runner || RUNNER, workerSandbox: s.workerSandbox || 'workspace-write', archived: !!s.archived, createdAt: s.createdAt, updatedAt: s.updatedAt, durationEnd: runDurationEndOfState(s), total: tasks.length, completed: tasks.filter(t => t.status === 'completed').length, failed: tasks.filter(t => ['failed','unknown'].includes(t.status)).length, running: tasks.filter(t => t.status === 'running').length, batches: (s.batches || []).map(b => ({ id: b.id, name: b.name, status: b.status, total: b.tasks?.length || 0, completed: (b.tasks || []).filter(t => t.status === 'completed').length })) };
}

export async function readRunTaskText(runId) {
  return await readTextMaybe(path.join(pathForRun(runId), 'task.md'), 1000000);
}

export async function readRunFile(runId, taskId, name) {
  const runDir = pathForRun(runId);
  const allowed = new Set(['prompt.md','events.jsonl','events_timed.jsonl','events.pretty','stderr.log','last_message.md','exit_code','result.json','evidence.json','verdict.json','judge_input.json','manual_completion.json','manual_result.md','run.sh','tmux.json']);
  if (!allowed.has(name)) throw new Error('file not allowed');
  let dir;
  if (taskId === 'planner') dir = roleDir(runDir, 'planner');
  else if (taskId === 'judge') dir = roleDir(runDir, 'judge');
  else dir = roleDir(runDir, 'worker', taskId);
  if (name === 'events.pretty') {
    const text = await readTextMaybe(path.join(dir, 'events.jsonl'), 1000000);
    return formatCodexEventsJsonl(text);
  }
  return await readTextMaybe(path.join(dir, name), 1000000);
}

export { RUNS_DIR };
