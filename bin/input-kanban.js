#!/usr/bin/env node
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VALID_RUNNERS = ['headless', 'tmux'];
const VALID_SANDBOXES = ['read-only', 'workspace-write', 'danger-full-access'];
const COMMANDS = new Set(['serve', 'submit', 'status', 'result', 'stop', 'auto']);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const STATUS_TEXT = {
  created: '已创建', planning: '拆分中', plan_failed: '拆分失败', plan_empty: '拆分为空', planned: '已拆分',
  running: '执行中', batch_blocked: '批次阻塞', batches_completed: '批次完成', judging: '验收中', judged: '已验收',
  judge_failed: '验收失败', stopped: '已停止'
};

function validateChoice(value, source, choices) {
  if (choices.includes(value)) return value;
  throw new Error(`invalid ${source}: ${value}; expected one of: ${choices.join(', ')}`);
}

function validateRunner(value, source) {
  return validateChoice(value, source, VALID_RUNNERS);
}

function validateSandbox(value, source) {
  return validateChoice(value, source, VALID_SANDBOXES);
}

function splitCommand(argv) {
  if (argv[0] && COMMANDS.has(argv[0])) return { command: argv[0], rest: argv.slice(1) };
  return { command: 'serve', rest: argv };
}

function parseServeArgs(argv) {
  const args = { host: '127.0.0.1', port: undefined, repo: undefined, runsDir: undefined, codexBin: undefined, runner: undefined, open: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--open') args.open = true;
    else if (arg === '--no-open') args.open = false;
    else if (arg === '--host') args.host = next();
    else if (arg === '--port' || arg === '-p') args.port = Number(next());
    else if (arg === '--repo' || arg === '-r') args.repo = next();
    else if (arg === '--runs-dir') args.runsDir = next();
    else if (arg === '--codex-bin') args.codexBin = next();
    else if (arg === '--runner') args.runner = validateRunner(next(), '--runner');
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function parseStatusArgs(argv) {
  const args = { host: '127.0.0.1', port: 8787, runsDir: undefined, runId: undefined, watch: false, pollMs: 3000, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--host') args.host = next();
    else if (arg === '--port' || arg === '-p') args.port = Number(next());
    else if (arg === '--runs-dir') args.runsDir = next();
    else if (arg === '--watch') args.watch = true;
    else if (arg === '--poll-ms') args.pollMs = Number(next());
    else if (!arg.startsWith('-') && !args.runId) args.runId = arg;
    else throw new Error(`unknown status argument: ${arg}`);
  }
  return args;
}

function parseResultArgs(argv) {
  const args = { runsDir: undefined, runId: undefined, copy: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--runs-dir') args.runsDir = next();
    else if (arg === '--copy') args.copy = true;
    else if (!arg.startsWith('-') && !args.runId) args.runId = arg;
    else throw new Error(`unknown result argument: ${arg}`);
  }
  return args;
}

function parseStopArgs(argv) {
  const args = { runsDir: undefined, runId: undefined, reason: 'stopped from CLI', help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--runs-dir') args.runsDir = next();
    else if (arg === '--reason') args.reason = next();
    else if (!arg.startsWith('-') && !args.runId) args.runId = arg;
    else throw new Error(`unknown stop argument: ${arg}`);
  }
  return args;
}

function parseAutoArgs(argv) {
  const args = { host: '127.0.0.1', port: 8787, runsDir: undefined, codexBin: undefined, runner: undefined, runId: undefined, pollMs: 3000, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--host') args.host = next();
    else if (arg === '--port' || arg === '-p') args.port = Number(next());
    else if (arg === '--runs-dir') args.runsDir = next();
    else if (arg === '--codex-bin') args.codexBin = next();
    else if (arg === '--runner') args.runner = validateRunner(next(), '--runner');
    else if (arg === '--poll-ms') args.pollMs = Number(next());
    else if (!arg.startsWith('-') && !args.runId) args.runId = arg;
    else throw new Error(`unknown auto argument: ${arg}`);
  }
  return args;
}

function parseSubmitArgs(argv) {
  const args = {
    host: '127.0.0.1', port: 8787, repo: undefined, runsDir: undefined, codexBin: undefined,
    runner: undefined, label: undefined, taskText: undefined, taskFile: undefined, maxParallel: 3,
    workerSandbox: 'workspace-write', auto: true, detach: false, watch: true, pollMs: 3000, help: false
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--host') args.host = next();
    else if (arg === '--port' || arg === '-p') args.port = Number(next());
    else if (arg === '--repo' || arg === '-r') args.repo = next();
    else if (arg === '--runs-dir') args.runsDir = next();
    else if (arg === '--codex-bin') args.codexBin = next();
    else if (arg === '--runner') args.runner = validateRunner(next(), '--runner');
    else if (arg === '--label' || arg === '-l') args.label = next();
    else if (arg === '--task') args.taskText = next();
    else if (arg === '--task-file') args.taskFile = next();
    else if (arg === '--max-parallel') args.maxParallel = Number(next());
    else if (arg === '--worker-sandbox') args.workerSandbox = validateSandbox(next(), '--worker-sandbox');
    else if (arg === '--auto') { args.auto = true; args.watch = true; }
    else if (arg === '--no-auto') { args.auto = false; args.watch = false; }
    else if (arg === '--detach' || arg === '-d') args.detach = true;
    else if (arg === '--watch') args.watch = true;
    else if (arg === '--poll-ms') args.pollMs = Number(next());
    else throw new Error(`unknown submit argument: ${arg}`);
  }
  return args;
}

function applyRuntimeEnv(args) {
  if (args.port) process.env.PORT = String(args.port);
  if (args.host) process.env.HOST = args.host;
  if (args.repo) process.env.KANBAN_DEFAULT_REPO = path.resolve(args.repo);
  else if (!process.env.KANBAN_DEFAULT_REPO) process.env.KANBAN_DEFAULT_REPO = process.cwd();
  if (args.runsDir) process.env.KANBAN_RUNS_DIR = path.resolve(args.runsDir);
  if (args.codexBin) process.env.KANBAN_CODEX_BIN = args.codexBin;
  if (args.runner) process.env.KANBAN_RUNNER = args.runner;
}

function printHelp() {
  console.log(`input-kanban

Usage:
  input-kanban [options]
  input-kanban serve [options]
  input-kanban submit [options]
  input-kanban status [runId] [options]
  input-kanban result [runId] [options]
  input-kanban stop <runId> [options]

Serve options:
  --host <host>              Host to bind, default 127.0.0.1
  -p, --port <port>          Port to bind, default 8787
  -r, --repo <path>          Default target repository, default current directory
  --runs-dir <path>          Runtime runs directory, default ~/.input-kanban/runs
  --codex-bin <path>         Codex CLI executable, default codex
  --runner <mode>            Runner mode: headless or tmux, default headless
  --open                     Open browser after starting
  --no-open                  Do not open browser, default

Status options:
  --runs-dir <path>          Runtime runs directory shared with the Web UI
  --watch                    Keep printing status until the run reaches a terminal state
  --poll-ms <ms>             Watch poll interval, default 3000

Result options:
  --runs-dir <path>          Runtime runs directory shared with the Web UI
  --copy                     Copy final result to clipboard

Stop options:
  --runs-dir <path>          Runtime runs directory shared with the Web UI
  --reason <text>            Stop reason stored in run state

Submit options:
  -r, --repo <path>          Target Git work tree, default current directory
  -l, --label <label>        Task batch name, default generated from task text
  --task <text>              Task description text
  --task-file <path>         Read task description from file, use - for stdin
  --max-parallel <n>         Default max parallel workers, default 3
  --worker-sandbox <mode>    read-only, workspace-write, or danger-full-access
  --runner <mode>            Runner mode: headless or tmux
  --runs-dir <path>          Runtime runs directory shared with the Web UI
  --auto                     Plan, dispatch all batches, judge, and watch, default for submit
  --no-auto                  Only create the run and start planning
  -d, --detach               Run the default auto loop in a background supervisor
  --watch                    Watch status after starting the planner
  --poll-ms <ms>             Watch poll interval, default 3000
  -h, --help                 Show help
`);
}

function printSubmitHelp() {
  console.log(`input-kanban submit

Usage:
  input-kanban submit --repo <path> --task-file task.md
  input-kanban submit --repo <path> --task "fix the bug" --label "bugfix"
  input-kanban submit --task-file task.md -d

Options:
  -r, --repo <path>          Target Git work tree, default current directory
  -l, --label <label>        Task batch name, default generated from task text
  --task <text>              Task description text
  --task-file <path>         Read task description from file, use - for stdin
  --max-parallel <n>         Default max parallel workers, default 3
  --worker-sandbox <mode>    read-only, workspace-write, or danger-full-access
  --runner <mode>            Runner mode: headless or tmux
  --runs-dir <path>          Runtime runs directory shared with the Web UI
  --auto                     Plan, dispatch all batches, judge, and watch, default for submit
  --no-auto                  Only create the run and start planning
  -d, --detach               Run the default auto loop in a background supervisor
  --watch                    Watch status after starting the planner
  --poll-ms <ms>             Watch poll interval, default 3000
`);
}

function printStatusHelp() {
  console.log(`input-kanban status

Usage:
  input-kanban status
  input-kanban status <runId>
  input-kanban status --watch
  input-kanban status <runId> --watch

Options:
  --runs-dir <path>          Runtime runs directory shared with the Web UI
  --watch                    Keep printing status until the run reaches a terminal state
  --poll-ms <ms>             Watch poll interval, default 3000
`);
}

function printResultHelp() {
  console.log(`input-kanban result

Usage:
  input-kanban result
  input-kanban result <runId>
  input-kanban result <runId> --copy

Options:
  --runs-dir <path>          Runtime runs directory shared with the Web UI
  --copy                     Copy final result to clipboard
`);
}

function printStopHelp() {
  console.log(`input-kanban stop

Usage:
  input-kanban stop <runId>

Options:
  --runs-dir <path>          Runtime runs directory shared with the Web UI
  --reason <text>            Stop reason stored in run state
`);
}

function printAutoHelp() {
  console.log(`input-kanban auto

Usage:
  input-kanban auto <runId>

Options:
  --runs-dir <path>          Runtime runs directory shared with the Web UI
  --codex-bin <path>         Codex CLI executable, default codex
  --runner <mode>            Runner mode: headless or tmux
  --poll-ms <ms>             Watch poll interval, default 3000
`);
}

function openBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.unref();
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function readTaskText(args) {
  if (args.taskText !== undefined) return args.taskText;
  if (args.taskFile === '-') return await readStdin();
  if (args.taskFile) return await fsp.readFile(path.resolve(args.taskFile), 'utf8');
  throw new Error('submit requires --task or --task-file');
}

function webUrl(args, runId = '') {
  return `http://${args.host || '127.0.0.1'}:${Number(args.port || 8787)}${runId ? `  (runId: ${runId})` : ''}`;
}

function displayStatus(status) {
  const text = STATUS_TEXT[status] || status || '-';
  return status && text !== status ? `${text}(${status})` : text;
}

function countByStatus(state) {
  const tasks = state.tasks || [];
  return {
    total: tasks.length,
    completed: tasks.filter(task => task.status === 'completed').length,
    running: tasks.filter(task => task.status === 'running').length,
    failed: tasks.filter(task => ['failed', 'unknown'].includes(task.status)).length
  };
}

function currentBatchText(state) {
  const batch = (state.batches || []).find(item => item.status !== 'completed');
  if (!batch) return '-';
  const tasks = batch.tasks || [];
  const completed = tasks.filter(task => task.status === 'completed').length;
  return `${batch.name || batch.id}(${batch.id}) ${displayStatus(batch.status)} ${completed}/${tasks.length}`;
}

function statusLine(state) {
  const counts = countByStatus(state);
  return `${state.label || state.runId}｜${state.runId}｜状态 ${displayStatus(state.status)}｜进度 ${counts.completed}/${counts.total}｜执行中 ${counts.running}｜失败 ${counts.failed}`;
}

function printRunStatus(state) {
  const counts = countByStatus(state);
  console.log(`任务批次: ${state.label || '-'}`);
  console.log(`Run ID: ${state.runId}`);
  console.log(`状态: ${displayStatus(state.status)}`);
  console.log(`仓库: ${state.repo || '-'}`);
  console.log(`当前批次: ${currentBatchText(state)}`);
  console.log(`进度: ${counts.completed}/${counts.total} ｜执行中 ${counts.running} ｜失败 ${counts.failed}`);
  if (state.judge?.status && state.judge.status !== 'pending') console.log(`验收: ${displayStatus(state.judge.status)}`);
}

function isTerminal(state) {
  return ['judged', 'judge_failed', 'batch_blocked', 'plan_failed', 'plan_empty', 'stopped'].includes(state.status);
}

function isFailureTerminal(state) {
  return ['judge_failed', 'batch_blocked', 'plan_failed', 'plan_empty', 'stopped'].includes(state.status);
}

function hasRecoverableUnknownTask(state) {
  return (state.tasks || []).some(task => task.status === 'unknown' && (task.exitCode === undefined || task.exitCode === 0));
}

async function confirmFailureTerminal(runId, state, refreshRun, pollMs) {
  let confirmed = state;
  const deadline = Date.now() + 30000;
  while (confirmed?.status === 'batch_blocked' && hasRecoverableUnknownTask(confirmed) && Date.now() < deadline) {
    await delay(Math.max(500, Number(pollMs) || 3000));
    confirmed = await refreshRun(runId);
    if (!confirmed || !isTerminal(confirmed) || confirmed.status !== state.status) return { confirmed: false, state: confirmed };
  }
  return { confirmed: true, state: confirmed };
}

async function watchRun(runId, { auto = false, pollMs = 3000 } = {}) {
  const { dispatchRun, refreshRun, startJudge } = await import('../src/orchestrator.js');
  let lastStatus = '';
  let judgeStarted = false;
  while (true) {
    const state = await refreshRun(runId);
    if (!state) throw new Error(`run not found: ${runId}`);
    const line = statusLine(state);
    if (line !== lastStatus) {
      console.log(`[${new Date().toLocaleTimeString()}] ${line}`);
      lastStatus = line;
    }

    if (auto && state.status === 'planned') {
      console.log('自动派发任务...');
      await dispatchRun(runId);
    } else if (auto && state.status === 'batches_completed' && state.judge?.status !== 'running' && !judgeStarted) {
      console.log('自动发起最终验收...');
      judgeStarted = true;
      await startJudge(runId);
    }

    if (isTerminal(state)) {
      if (isFailureTerminal(state)) {
        const result = await confirmFailureTerminal(runId, state, refreshRun, pollMs);
        if (!result.confirmed) {
          lastStatus = '';
          continue;
        }
        return result.state || state;
      }
      return state;
    }
    await delay(Math.max(500, Number(pollMs) || 3000));
  }
}

async function serve(args) {
  applyRuntimeEnv(args);
  const { startServer } = await import('../src/server.js');
  const instance = await startServer({ host: process.env.HOST, port: Number(process.env.PORT || 8787), log: false });
  console.log('Input Kanban started');
  console.log(`URL:  ${instance.url}`);
  console.log(`Repo: ${instance.defaultRepo}`);
  console.log(`Runs: ${instance.runsDir}`);
  console.log(`Runner: ${instance.runner}`);
  if (args.open) openBrowser(instance.url);
  const shutdown = () => { instance.stop().finally(() => process.exit(0)); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function detachedAutoArgs(runId, args) {
  const cliPath = fileURLToPath(import.meta.url);
  const values = [cliPath, 'auto', runId, '--host', args.host || '127.0.0.1', '--port', String(args.port || 8787), '--poll-ms', String(args.pollMs || 3000)];
  if (args.runsDir) values.push('--runs-dir', path.resolve(args.runsDir));
  if (args.codexBin) values.push('--codex-bin', args.codexBin);
  if (args.runner) values.push('--runner', args.runner);
  return values;
}

function startDetachedAuto(runId, args) {
  const child = spawn(process.execPath, detachedAutoArgs(runId, args), {
    detached: true,
    stdio: 'ignore',
    env: process.env
  });
  child.unref();
  return child.pid;
}

async function latestRunId() {
  const { listRuns } = await import('../src/orchestrator.js');
  const runs = await listRuns();
  if (!runs.length) throw new Error('没有找到任务批次');
  return runs[0].runId;
}

async function status(args) {
  applyRuntimeEnv(args);
  const runId = args.runId || await latestRunId();
  if (args.watch) {
    await watchRun(runId, { auto: false, pollMs: args.pollMs });
    return;
  }
  const { refreshRun } = await import('../src/orchestrator.js');
  const state = await refreshRun(runId);
  if (!state) throw new Error(`run not found: ${runId}`);
  printRunStatus(state);
}

async function readFinalResult(runId) {
  const { loadRun, readRunFile } = await import('../src/orchestrator.js');
  const state = await loadRun(runId);
  if (!state) throw new Error(`run not found: ${runId}`);
  try { return await readRunFile(runId, 'judge', 'verdict.json'); }
  catch {}
  try { return await readRunFile(runId, 'judge', 'last_message.md'); }
  catch {}
  throw new Error(`最终结果尚未生成：当前状态 ${displayStatus(state.status)}`);
}

function clipboardCommands() {
  if (process.platform === 'darwin') return [['pbcopy', []]];
  if (process.platform === 'win32') return [['clip', []]];
  return [['wl-copy', []], ['xclip', ['-selection', 'clipboard']], ['xsel', ['--clipboard', '--input']]];
}

async function copyToClipboard(text) {
  let lastError = null;
  for (const [command, args] of clipboardCommands()) {
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'ignore'] });
        child.on('error', reject);
        child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
        child.stdin.end(text);
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`无法复制到剪贴板：${lastError?.message || '未找到可用剪贴板命令'}`);
}

async function result(args) {
  applyRuntimeEnv(args);
  const runId = args.runId || await latestRunId();
  const text = await readFinalResult(runId);
  if (args.copy) {
    await copyToClipboard(text);
    console.log(`已复制最终结果: ${runId}`);
    return;
  }
  console.log(text);
}

async function stop(args) {
  applyRuntimeEnv(args);
  if (!args.runId) throw new Error('stop requires a runId');
  const { stopRun } = await import('../src/orchestrator.js');
  const state = await stopRun(args.runId, { reason: args.reason });
  console.log(`已停止任务批次: ${state.runId}`);
}

async function autoRun(args) {
  applyRuntimeEnv(args);
  if (!args.runId) throw new Error('auto requires a runId');
  const { loadRun, startPlanner } = await import('../src/orchestrator.js');
  const state = await loadRun(args.runId);
  if (!state) throw new Error(`run not found: ${args.runId}`);
  if (state.status === 'created') await startPlanner(args.runId);
  const finalState = await watchRun(args.runId, { auto: true, pollMs: args.pollMs });
  if (isFailureTerminal(finalState)) process.exitCode = 1;
}

async function submit(args) {
  if (args.detach && !args.auto) throw new Error('--detach requires auto mode; remove --no-auto');
  applyRuntimeEnv(args);
  const taskText = await readTaskText(args);
  const { createRun, startPlanner } = await import('../src/orchestrator.js');
  const state = await createRun({
    label: args.label,
    taskText,
    repo: process.env.KANBAN_DEFAULT_REPO,
    maxParallel: args.maxParallel,
    workerSandbox: args.workerSandbox
  });
  console.log(`已创建任务批次: ${state.runId}`);
  console.log(`看板地址: ${webUrl(args, state.runId)}`);
  console.log(`终端查看: input-kanban status ${state.runId} --watch`);
  if (args.detach) {
    const pid = startDetachedAuto(state.runId, args);
    console.log(`后台执行中: supervisor pid ${pid}`);
    return;
  }
  console.log('发起任务拆分...');
  await startPlanner(state.runId);
  if (!args.watch && !args.auto) return;
  const finalState = await watchRun(state.runId, { auto: args.auto, pollMs: args.pollMs });
  console.log(`最终状态: ${finalState.status}`);
  if (isFailureTerminal(finalState)) process.exitCode = 1;
}

try {
  const { command, rest } = splitCommand(process.argv.slice(2));
  if (command === 'serve') {
    const args = parseServeArgs(rest);
    if (args.help) { printHelp(); process.exit(0); }
    await serve(args);
  } else if (command === 'submit') {
    const args = parseSubmitArgs(rest);
    if (args.help) { printSubmitHelp(); process.exit(0); }
    await submit(args);
  } else if (command === 'status') {
    const args = parseStatusArgs(rest);
    if (args.help) { printStatusHelp(); process.exit(0); }
    await status(args);
  } else if (command === 'result') {
    const args = parseResultArgs(rest);
    if (args.help) { printResultHelp(); process.exit(0); }
    await result(args);
  } else if (command === 'stop') {
    const args = parseStopArgs(rest);
    if (args.help) { printStopHelp(); process.exit(0); }
    await stop(args);
  } else if (command === 'auto') {
    const args = parseAutoArgs(rest);
    if (args.help) { printAutoHelp(); process.exit(0); }
    await autoRun(args);
  }
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
