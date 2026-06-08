import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  CODEX_BIN,
  ensureDir,
  nowIso,
  readTextMaybe,
  writeJsonAtomic
} from '../utils.js';
import {
  DEFAULT_TMUX_BIN,
  sanitizeTmuxSessionName,
  sanitizeTmuxWindowName,
  tmuxHasSession,
  tmuxKillSession,
  tmuxNewSession,
  tmuxNewWindow
} from '../tmux.js';

function processKey(runId, taskId) {
  return `${runId}:${taskId}`;
}

function roleForTask(taskId) {
  if (taskId === 'planner') return 'planner';
  if (taskId === 'judge') return 'judge';
  return 'worker';
}

function windowNameForTask(taskId) {
  const role = roleForTask(taskId);
  return sanitizeTmuxWindowName(role === 'worker' ? `worker-${taskId}` : role);
}

function sessionNameForRun(runId) {
  return sanitizeTmuxSessionName(`input-kanban-${runId}`);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function buildRunScript({ codexBin, sandbox, cwd, outDir }) {
  return `#!/usr/bin/env bash
set -u

CODEX_BIN=${shellQuote(codexBin)}
SANDBOX=${shellQuote(sandbox)}
CWD=${shellQuote(cwd)}
OUT_DIR=${shellQuote(outDir)}
PROMPT_FILE="$OUT_DIR/prompt.md"
EVENTS="$OUT_DIR/events.jsonl"
STDERR_LOG="$OUT_DIR/stderr.log"
LAST_MESSAGE="$OUT_DIR/last_message.md"
EXIT_CODE="$OUT_DIR/exit_code"

cd "$CWD"
rm -f "$EXIT_CODE"
"$CODEX_BIN" exec --json --sandbox "$SANDBOX" -C "$CWD" -o "$LAST_MESSAGE" "$(<"$PROMPT_FILE")" >>"$EVENTS" 2>>"$STDERR_LOG"
code=$?
printf '%s' "$code" > "$EXIT_CODE"
exit "$code"
`;
}

export function createTmuxRunner({
  codexBin = CODEX_BIN,
  tmuxBin = DEFAULT_TMUX_BIN,
  tmuxOptions = {},
  pollMs = 1000
} = {}) {
  const runningWindows = new Map();

  async function startCodexTask({ runId, taskId, prompt, sandbox, cwd, outDir }) {
    await ensureDir(outDir);
    const sessionName = sessionNameForRun(runId);
    const windowName = windowNameForTask(taskId);
    const role = roleForTask(taskId);
    const key = processKey(runId, taskId);
    const promptFile = path.join(outDir, 'prompt.md');
    const runScript = path.join(outDir, 'run.sh');
    const exitFile = path.join(outDir, 'exit_code');
    const metadataFile = path.join(outDir, 'tmux.json');
    const startedAt = nowIso();

    await fsp.writeFile(promptFile, prompt);
    await fsp.writeFile(runScript, buildRunScript({ codexBin, sandbox, cwd, outDir }));
    await fsp.chmod(runScript, 0o755);

    const metadata = {
      type: 'input_kanban_tmux_task',
      version: 1,
      runner: 'tmux',
      runId,
      taskId,
      role,
      sessionName,
      windowName,
      target: `${sessionName}:${windowName}`,
      attachCommand: `${tmuxBin} attach-session -t ${sessionName}`,
      selectWindowCommand: `${tmuxBin} select-window -t ${sessionName}:${windowName}`,
      selectCommand: `${tmuxBin} select-window -t ${sessionName}:${windowName}`,
      runScript,
      promptFile,
      cwd,
      sandbox,
      startedAt
    };
    await writeJsonAtomic(metadataFile, metadata);

    const tmuxCommandOptions = {
      ...tmuxOptions,
      tmuxBin,
      cwd,
      command: runScript
    };
    if (await tmuxHasSession(sessionName, tmuxCommandOptions)) {
      await tmuxNewWindow(sessionName, windowName, tmuxCommandOptions);
    } else {
      await tmuxNewSession(sessionName, { ...tmuxCommandOptions, windowName });
    }

    const listeners = [];
    let exited = false;
    let exitCode = null;
    const timer = setInterval(async () => {
      const text = await readTextMaybe(exitFile, 1000);
      if (text === '') return;
      clearInterval(timer);
      runningWindows.delete(key);
      const code = Number(text.trim());
      exited = true;
      exitCode = Number.isNaN(code) ? null : code;
      for (const listener of listeners) listener(exitCode);
    }, Math.max(100, Number(pollMs) || 1000));

    const handle = {
      pid: null,
      onExit(listener) {
        if (exited) listener(exitCode);
        else listeners.push(listener);
      },
      stop() {}
    };
    runningWindows.set(key, { sessionName, windowName, timer });
    return handle;
  }

  async function stopRun(runId) {
    for (const [key, value] of runningWindows.entries()) {
      if (!key.startsWith(`${runId}:`)) continue;
      clearInterval(value.timer);
      runningWindows.delete(key);
    }
    const sessionName = sessionNameForRun(runId);
    try {
      if (await tmuxHasSession(sessionName, { ...tmuxOptions, tmuxBin })) {
        await tmuxKillSession(sessionName, { ...tmuxOptions, tmuxBin });
      }
    } catch (error) {
      if (!/no such session/i.test(error?.message || '')) throw error;
    }
  }

  function hasRunning(runId, taskId) {
    return runningWindows.has(processKey(runId, taskId));
  }

  return { kind: 'tmux', sessionNameForRun, startCodexTask, stopRun, hasRunning };
}
