import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CODEX_BIN } from '../utils.js';

function processKey(runId, taskId) {
  return `${runId}:${taskId}`;
}

export function createHeadlessRunner({ codexBin = CODEX_BIN } = {}) {
  const runningProcesses = new Map();

  function startCodexTask({ runId, taskId, prompt, sandbox, cwd, outDir }) {
    const events = path.join(outDir, 'events.jsonl');
    const stderr = path.join(outDir, 'stderr.log');
    const last = path.join(outDir, 'last_message.md');
    fs.writeFileSync(path.join(outDir, 'prompt.md'), prompt);
    const args = ['exec', '--json', '--sandbox', sandbox, '-C', cwd, '-o', last, prompt];
    const child = spawn(codexBin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(fs.createWriteStream(events, { flags: 'a' }));
    child.stderr.pipe(fs.createWriteStream(stderr, { flags: 'a' }));
    const key = processKey(runId, taskId);
    runningProcesses.set(key, child);
    child.on('exit', code => {
      try { fs.writeFileSync(path.join(outDir, 'exit_code'), String(code)); } catch {}
      runningProcesses.delete(key);
    });
    return {
      pid: child.pid,
      onExit(listener) { child.on('exit', listener); },
      stop(signal = 'TERM') { child.kill(signal); }
    };
  }

  function stopRun(runId, signal = 'TERM') {
    for (const [key, child] of runningProcesses.entries()) {
      if (key.startsWith(`${runId}:`)) {
        try { child.kill(signal); } catch {}
        runningProcesses.delete(key);
      }
    }
  }

  function hasRunning(runId, taskId) {
    return runningProcesses.has(processKey(runId, taskId));
  }

  return { kind: 'headless', startCodexTask, stopRun, hasRunning };
}

export const headlessRunner = createHeadlessRunner();
