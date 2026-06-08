import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  TmuxUnavailableError,
  ensureTmuxAvailable,
  sanitizeTmuxName,
  sanitizeTmuxSessionName,
  sanitizeTmuxWindowName,
  tmuxHasSession,
  tmuxKillSession,
  tmuxKillWindow,
  tmuxNewSession,
  tmuxNewWindow
} from '../src/tmux.js';
import { createDefaultRunner, createTmuxRunner, headlessRunner } from '../src/runners/index.js';

function makeRunner(handler) {
  const calls = [];
  const runner = async (command, args) => {
    calls.push({ command, args });
    return handler(command, args);
  };
  return { calls, runner };
}

test('sanitizes tmux names deterministically with shell-safe characters', () => {
  assert.equal(sanitizeTmuxSessionName('Run 01/工作'), 'Run-01');
  assert.equal(sanitizeTmuxWindowName('Worker: T-01'), 'Worker-T-01');
  assert.equal(sanitizeTmuxName(''), 'tmux');
  assert.equal(sanitizeTmuxName('////', { fallback: 'fallback' }), 'fallback');

  const longName = sanitizeTmuxName('a'.repeat(120), { maxLength: 32 });
  assert.equal(longName, sanitizeTmuxName('a'.repeat(120), { maxLength: 32 }));
  assert.match(longName, /^[a-zA-Z0-9._-]+$/);
  assert.ok(longName.length <= 32);
});

test('ensureTmuxAvailable returns a clear error when tmux cannot run', async () => {
  const { runner } = makeRunner(() => ({ code: 127, stderr: 'tmux: command not found' }));

  await assert.rejects(
    () => ensureTmuxAvailable({ tmuxBin: 'missing-tmux', runner }),
    error => error instanceof TmuxUnavailableError &&
      /tmux is unavailable/.test(error.message) &&
      /missing-tmux -V/.test(error.message)
  );
});

test('tmuxHasSession checks availability before checking the session', async () => {
  const { calls, runner } = makeRunner((_command, args) => {
    if (args[0] === '-V') return { code: 0, stdout: 'tmux 3.4\n' };
    return { code: 1, stderr: 'no such session' };
  });

  assert.equal(await tmuxHasSession('Run 01/工作', { runner }), false);
  assert.deepEqual(calls.map(call => call.args), [
    ['-V'],
    ['has-session', '-t', 'Run-01']
  ]);
});

test('tmux wrappers invoke tmux with argument arrays and sanitized names', async () => {
  const { calls, runner } = makeRunner((_command, args) => {
    if (args[0] === '-V') return { code: 0, stdout: 'tmux 3.4\n' };
    return { code: 0, stdout: '' };
  });

  await tmuxNewSession('Run 01/工作', { runner, windowName: 'Planner: 1', cwd: '/repo' });
  await tmuxNewWindow('Run 01/工作', 'Worker: T-01', { runner, cwd: '/repo' });
  await tmuxKillSession('Run 01/工作', { runner });
  await tmuxKillWindow('Run 01/工作', 'Worker: T-01', { runner });

  assert.deepEqual(calls.map(call => call.args), [
    ['-V'],
    ['new-session', '-d', '-s', 'Run-01', '-n', 'Planner-1', '-c', '/repo'],
    ['-V'],
    ['new-window', '-t', 'Run-01', '-n', 'Worker-T-01', '-c', '/repo'],
    ['-V'],
    ['kill-session', '-t', 'Run-01'],
    ['-V'],
    ['kill-window', '-t', 'Run-01:Worker-T-01']
  ]);
});

test('tmux windows can start with commands without send-keys', async () => {
  const { calls, runner } = makeRunner((_command, args) => {
    if (args[0] === '-V') return { code: 0, stdout: 'tmux 3.4\n' };
    return { code: 0, stdout: '' };
  });

  await tmuxNewSession('Run 01', { runner, windowName: 'Planner', cwd: '/repo', command: 'echo planner' });
  await tmuxNewWindow('Run 01', 'Worker', { runner, cwd: '/repo', command: 'echo worker' });

  assert.deepEqual(calls.map(call => call.args), [
    ['-V'],
    ['new-session', '-d', '-s', 'Run-01', '-n', 'Planner', '-c', '/repo', 'echo planner'],
    ['-V'],
    ['new-window', '-t', 'Run-01', '-n', 'Worker', '-c', '/repo', 'echo worker']
  ]);
  assert.equal(calls.some(call => call.args.includes('send-keys')), false);
});

test('default runner selects tmux only when requested', () => {
  assert.equal(createDefaultRunner('headless'), headlessRunner);
  assert.equal(createDefaultRunner('tmux').kind, 'tmux');
});

test('tmux stop kills only the exact input-kanban run session', async () => {
  const { calls, runner: commandRunner } = makeRunner((_command, args) => {
    if (args[0] === '-V') return { code: 0, stdout: 'tmux 3.4\n' };
    if (args[0] === 'has-session') return { code: 0, stdout: '' };
    return { code: 0, stdout: '' };
  });
  const runner = createTmuxRunner({ tmuxOptions: { runner: commandRunner } });

  await runner.stopRun('run_20260608T174108Z_tmux-support_6fc244');

  assert.deepEqual(calls.map(call => call.args), [
    ['-V'],
    ['has-session', '-t', 'input-kanban-run_20260608T174108Z_tmux-support_6fc244'],
    ['-V'],
    ['kill-session', '-t', 'input-kanban-run_20260608T174108Z_tmux-support_6fc244']
  ]);
});

test('tmux stop tolerates already-missing matching session', async () => {
  const { calls, runner: commandRunner } = makeRunner((_command, args) => {
    if (args[0] === '-V') return { code: 0, stdout: 'tmux 3.4\n' };
    return { code: 1, stderr: 'no such session' };
  });
  const runner = createTmuxRunner({ tmuxOptions: { runner: commandRunner } });

  await runner.stopRun('missing-run');

  assert.deepEqual(calls.map(call => call.args), [
    ['-V'],
    ['has-session', '-t', 'input-kanban-missing-run']
  ]);
});

test('tmux runner writes run script, metadata, and observes exit_code', async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-tmux-runner-'));
  const outDir = path.join(tmp, 'planner');
  const { calls, runner: commandRunner } = makeRunner((_command, args) => {
    if (args[0] === '-V') return { code: 0, stdout: 'tmux 3.4\n' };
    if (args[0] === 'has-session') return { code: 1, stderr: 'no such session' };
    return { code: 0, stdout: '' };
  });
  const runner = createTmuxRunner({
    codexBin: '/usr/local/bin/codex',
    tmuxOptions: { runner: commandRunner },
    pollMs: 100
  });

  const handle = await runner.startCodexTask({
    runId: 'run_01',
    taskId: 'planner',
    prompt: 'plan this',
    sandbox: 'read-only',
    cwd: tmp,
    outDir
  });
  assert.equal(runner.hasRunning('run_01', 'planner'), true);
  assert.equal(await fsp.readFile(path.join(outDir, 'prompt.md'), 'utf8'), 'plan this');

  const script = await fsp.readFile(path.join(outDir, 'run.sh'), 'utf8');
  assert.match(script, /CODEX_BIN='\/usr\/local\/bin\/codex'/);
  assert.match(script, /\$CODEX_BIN" exec --json --sandbox/);
  assert.match(script, /printf '%s' "\$code" > "\$EXIT_CODE"/);

  const metadata = JSON.parse(await fsp.readFile(path.join(outDir, 'tmux.json'), 'utf8'));
  assert.equal(metadata.type, 'input_kanban_tmux_task');
  assert.equal(metadata.runner, 'tmux');
  assert.equal(metadata.sessionName, 'input-kanban-run_01');
  assert.equal(metadata.windowName, 'planner');
  assert.equal(metadata.target, 'input-kanban-run_01:planner');
  assert.equal(metadata.attachCommand, 'tmux attach-session -t input-kanban-run_01');
  assert.equal(metadata.selectWindowCommand, 'tmux select-window -t input-kanban-run_01:planner');
  assert.equal(metadata.selectCommand, metadata.selectWindowCommand);
  assert.equal(metadata.runScript, path.join(outDir, 'run.sh'));

  assert.deepEqual(calls.map(call => call.args), [
    ['-V'],
    ['has-session', '-t', 'input-kanban-run_01'],
    ['-V'],
    ['new-session', '-d', '-s', 'input-kanban-run_01', '-n', 'planner', '-c', tmp, path.join(outDir, 'run.sh')]
  ]);
  assert.equal(calls.some(call => call.args.includes('send-keys')), false);

  const exitCode = await new Promise(resolve => {
    handle.onExit(resolve);
    fsp.writeFile(path.join(outDir, 'exit_code'), '0');
  });
  assert.equal(exitCode, 0);
  assert.equal(runner.hasRunning('run_01', 'planner'), false);
});
