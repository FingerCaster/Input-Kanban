# tmux Keep-Open and UI Entry Verification

Date: 2026-06-09 03:32:31 CST

Run context:

- ORCHESTRATOR_RUN_ID: `run_20260608T190727Z_tmux_d72e53`
- ORCHESTRATOR_TASK_ID: `T-04`
- ORCHESTRATOR_BATCH_ID: `batch-3`
- Scope: documentation and verification closeout for tmux keep-open behavior and UI tmux entry gating.
- Non-actions: did not publish npm; did not change `package.json` version.

## Commands and Results

### Documentation review

Reviewed:

- `README.md`
- `README.en.md`
- `PROJECT_GUIDE.md`
- `ENVIRONMENT.md`

Result:

- Updated only tmux-related documentation.
- Clarified that Node.js still owns scheduling, batch barriers, `maxParallel`, stop/archive, `judge_input.json`, and status refresh from `exit_code` plus artifacts.
- Clarified that tmux role windows write `exit_code` before the keep-open shell and stay open for manual inspection.
- Clarified that manual Codex approvals are still performed by the user inside the relevant tmux window.
- Clarified that UI attach/select-window copy entries are shown only after `tmux.json` metadata exists.

### Main check

Command:

```text
npm run check
```

Result:

```text
pass
tests 25
pass 25
fail 0
duration_ms 361.566625
```

Covered by this check:

- `--runner headless` default behavior remains free of tmux controls and tmux keep-open scripts.
- tmux `run.sh` writes `exit_code` before the keep-open summary and then enters an interactive shell.
- tmux `run.sh` keep-open summary is generated for planner, worker, and judge roles.
- tmux metadata includes `sessionName`, `windowName`, `target`, `attachCommand`, and `selectWindowCommand`.
- `refreshRun()` exposes tmux metadata from `tmux.json`.
- `refreshRun()` does not invent attach commands before tmux metadata exists.
- frontend tmux UI does not show copyable commands before metadata exists.
- frontend tmux UI gates attach/select-window copy actions on run/session and task/window metadata.
- stop behavior targets only the exact `input-kanban-<runId>` tmux session.
- completed planner and judge states can be recovered from filesystem `exit_code` and output artifacts if callback timing is missed.

### Targeted tmux/UI tests

Command:

```text
node --test test/tmux.test.js test/tmux-status.test.js test/headless-status.test.js test/frontend-tmux-ui.test.js
```

Result:

```text
pass
tests 19
pass 19
fail 0
duration_ms 351.576833
```

### Whitespace/diff check

Command:

```text
git diff --check
```

Result:

```text
pass
```

### tmux availability

Command:

```text
tmux -V
```

Result:

```text
tmux 3.6b
```

### Attempted local HTTP smoke

Command shape:

```text
node bin/input-kanban.js --no-open --host 127.0.0.1 --port 8898 --repo <repo> --runs-dir <tmp-runs-dir> --codex-bin <fake-codex> --runner tmux
```

Result:

```text
failed
Error: listen EPERM: operation not permitted 127.0.0.1:8898
```

Reason:

- Current execution sandbox does not allow binding a local HTTP port, so browser/API smoke through the server could not be completed here.

### Attempted direct real tmux smoke

Command shape:

```text
node <direct orchestrator smoke using createRun/startPlanner/dispatchRun/startJudge/stopRun with KANBAN_RUNNER=tmux and fake Codex>
```

Result:

```text
failed
tmux command failed: tmux new-session ... (error connecting to /private/tmp/tmux-501/default (Operation not permitted))
```

Additional isolation attempt:

```text
env -u TMUX tmux -S /private/tmp/input-kanban-tmux-socket-test/manual.sock new-session -d -s input-kanban-smoke-socket-test -n smoke 'printf smoke; sleep 1'
```

Result:

```text
failed
error creating /private/tmp/input-kanban-tmux-socket-test/manual.sock (Operation not permitted)
```

Reason:

- `tmux -V` works, but the current sandbox cannot create or connect to tmux server sockets. This prevented a true live session/window smoke and live stop-run session kill verification in this environment.

## Smoke Verdicts

- `--runner headless` default behavior unchanged: passed by automated tests.
- tmux `run.sh` contains keep-open logic: passed by automated tests.
- `exit_code` is written before keep-open shell: passed by automated tests.
- Node status can advance from filesystem state to `planned`/`completed`/`judged`: passed by automated recovery/status tests; not revalidated with a live tmux server due sandbox socket denial.
- UI hides tmux attach/select-window copy buttons before `tmux.json`: passed by frontend static tests and status tests.
- UI shows tmux icon plus attach/select-window copy actions after `tmux.json`: passed by frontend static tests and status tests.
- stop run kills the exact tmux session: passed by tmux runner unit test; live session kill not covered due sandbox socket denial.

## Uncovered Items and Reasons

- Full live HTTP smoke with browser/UI interaction: not covered because local port binding failed with `listen EPERM`.
- Full live tmux session/window creation: not covered because tmux server socket creation/connection failed with `Operation not permitted`.
- Manual Codex approval prompt handling: not covered by automation by design; approval remains a user action inside the relevant tmux window.

## Residual Risk

- The remaining risk is environment-specific live tmux behavior: session/window creation and stop-run kill should still be run once in an unrestricted terminal before release.
- The automated tests cover the generated scripts, metadata shape, UI gating, status recovery, and exact session-name kill command, but they cannot prove this sandbox can run a tmux server.
