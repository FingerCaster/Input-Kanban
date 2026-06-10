import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CODEX_BIN } from '../utils.js';

function processKey(runId, taskId) {
  return `${runId}:${taskId}`;
}

function captureEventsWithTimestamps(stream, eventsFile, timedEventsFile) {
  const events = fs.createWriteStream(eventsFile, { flags: 'a' });
  const timedEvents = fs.createWriteStream(timedEventsFile, { flags: 'a' });
  let buffer = '';
  const writeLine = line => {
    events.write(`${line}\n`);
    const receivedAt = new Date().toISOString();
    try {
      timedEvents.write(`${JSON.stringify({ receivedAt, event: JSON.parse(line) })}\n`);
    } catch {
      timedEvents.write(`${JSON.stringify({ receivedAt, rawLine: line })}\n`);
    }
  };
  stream.setEncoding('utf8');
  stream.on('data', chunk => {
    buffer += chunk;
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
      buffer = buffer.slice(newlineIndex + 1);
      if (line) writeLine(line);
    }
  });
  stream.on('end', () => {
    if (buffer) writeLine(buffer.replace(/\r$/, ''));
    events.end();
    timedEvents.end();
  });
}

export function createHeadlessRunner({ codexBin = CODEX_BIN } = {}) {
  const runningProcesses = new Map();

  function startCodexTask({ runId, taskId, prompt, sandbox, cwd, outDir }) {
    const events = path.join(outDir, 'events.jsonl');
    const timedEvents = path.join(outDir, 'events_timed.jsonl');
    const stderr = path.join(outDir, 'stderr.log');
    const last = path.join(outDir, 'last_message.md');
    fs.writeFileSync(path.join(outDir, 'prompt.md'), prompt);
    const args = ['exec', '--json', '--sandbox', sandbox, '-C', cwd, '-o', last, prompt];
    const child = spawn(codexBin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    captureEventsWithTimestamps(child.stdout, events, timedEvents);
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
