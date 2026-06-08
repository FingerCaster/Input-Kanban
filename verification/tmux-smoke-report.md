# tmux Runner Smoke Report

Date: 2026-06-09

## Scope

This report closes the TMUX-04 / TMUX-09 verification gap for the current tmux runner implementation.

The smoke test verifies that `--runner tmux` can drive a full Input Kanban run with:

- planner running in a tmux window;
- worker running in a tmux window;
- final judge running in a tmux window;
- Node.js still owning orchestration, batch barriers, status refresh, and judge sequencing;
- filesystem artifacts remaining the source of truth.

## Environment

- Platform: macOS
- tmux: `tmux 3.6b`
- Runner mode: `tmux`
- Codex binary: fake read-only smoke binary used to avoid model cost and repository modification while exercising real tmux session/window creation.
- Target repo: current Input Kanban repository.
- Runs directory: `/tmp/input-kanban-tmux-e2e-smoke/runs`

## Commands Executed

1. Verified tmux availability with `tmux -V`.
2. Ran a minimal real tmux session smoke using `tmux new-session` and `tmux kill-session`.
3. Ran `npm run check`.
4. Started Input Kanban with:

```text
PORT=8895 KANBAN_RUNS_DIR=/tmp/input-kanban-tmux-e2e-smoke/runs KANBAN_DEFAULT_REPO=<repo> KANBAN_CODEX_BIN=<fake-codex> KANBAN_RUNNER=tmux node bin/input-kanban.js --no-open
```

5. Created a run through `POST /api/runs`.
6. Started planner through `POST /api/runs/<runId>/plan`.
7. Dispatched workers through `POST /api/runs/<runId>/dispatch`.
8. Started final judge through `POST /api/runs/<runId>/judge`.
9. Polled `GET /api/runs/<runId>/status` until final status was `judged`.
10. Verified runtime artifacts under planner, worker, and judge directories.

## Result

Status: `passed`

Observed run id:

```text
run_20260608T182713Z_tmux-e2e-smoke_79ceab
```

Observed final run status:

```text
judged
```

Observed final judge verdict:

```json
{
  "verdict": "passed",
  "completedTasks": ["T-01"],
  "failedTasks": [],
  "blockedTasks": [],
  "missingArtifacts": [],
  "scopeViolations": [],
  "residualRisk": [],
  "recommendedNextActions": []
}
```

## Runtime Artifacts Verified

Planner directory included:

```text
planner/run.sh
planner/tmux.json
planner/events.jsonl
planner/stderr.log
planner/last_message.md
planner/exit_code
```

Worker directory included:

```text
workers/T-01/run.sh
workers/T-01/tmux.json
workers/T-01/events.jsonl
workers/T-01/stderr.log
workers/T-01/last_message.md
workers/T-01/exit_code
```

Judge directory included:

```text
judge/run.sh
judge/tmux.json
judge/events.jsonl
judge/stderr.log
judge/last_message.md
judge/exit_code
judge/judge_input.json
judge/verdict.json
```

## tmux Metadata Verified

Each role/task exposed tmux metadata in `GET /api/runs/<runId>/status`:

```text
sessionName
windowName
target
attachCommand
selectWindowCommand
runScript
startedAt
```

Observed session name shape:

```text
input-kanban-run_20260608T182713Z_tmux-e2e-smoke_79ceab
```

Observed window names:

```text
planner
worker-T-01
judge
```

## Stop Semantics Coverage

Unit coverage verifies that `stopRun()` only targets the exact matching session name:

```text
input-kanban-<runId>
```

A live tmux stop smoke was also executed.

Observed stop run id:

```text
run_20260608T183534Z_tmux-stop-smoke_07653f
```

Observed target session:

```text
input-kanban-run_20260608T183534Z_tmux-stop-smoke_07653f
```

Observed stop result:

```text
session_before_stop=input-kanban-run_20260608T183534Z_tmux-stop-smoke_07653f
session_after_stop=
run_status=stopped
worker_status=stopped
stop_assertions=passed
```

The live stop smoke verified that the matching run session existed before stop, was gone after stop, and the run/task states were marked `stopped` while preserving generated `run.sh` and `tmux.json` artifacts.

## Recovery Fix Verified

During stop smoke, the planner completed fast enough that the tmux runner could write `exit_code` before the Node callback path completed plan materialization. The orchestrator now recovers this case during `refreshRun()`:

- completed planner + no materialized tasks/batches triggers plan materialization from `planner/last_message.md`;
- completed judge + missing verdict triggers verdict extraction from `judge/last_message.md` and writes `judge/verdict.json`.

Unit tests now cover both recovery paths.

## Notes

- Earlier Kanban judging reported `Operation not permitted` when creating tmux sessions. This local smoke did not reproduce that issue; real tmux sessions were created successfully.
- The project intentionally keeps the frontend buildless in `public/index.html`; missing `public/app.js` and `public/styles.css` are expected artifact-plan drift, not implementation failure.
- `src/runners/tmuxUtils.js` now re-exports `src/tmux.js` utilities for compatibility with the originally expected artifact path.
- The smoke used fake Codex executables to avoid modifying files while still exercising real tmux session/window creation and filesystem status artifacts.
