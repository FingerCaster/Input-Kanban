# Input Kanban Project Guide

This document explains how Input Kanban is implemented so that humans and coding agents can quickly understand the project before making changes.

## Current Status

Implementation status:

```text
mvp / batch-scheduler / codex-exec-primary / tmux-batch-layout / buildkite-style-ui / manual-recovery / stop-archive / cli-bootstrap
```

Recent validation:

- `npm run check` passes for the CLI entry and backend modules.
- A smoke test can start `input-kanban` on a temporary port and read `GET /api/health`.
- The frontend is a single HTML file; its inline script can be extracted and checked with `node --check` when edited.

## Project Purpose

Input Kanban is a local Codex orchestration dashboard. It is not a business service and not a CI system.

It runs local `codex exec --json` processes, stores run state and logs on the filesystem, and serves a static HTML dashboard that polls the backend.

The intended use case is:

1. Create a run from a user task.
2. Ask a planner to split the task into batches and workers.
3. Dispatch workers by strict batch barriers.
4. Observe logs, status, artifacts, and Codex session IDs.
5. Stop or archive runs when needed.
6. Run one final judge pass after all batches complete.

## Important Boundaries

- If the current workspace is a multi-repo umbrella, the target repo must be a concrete child repository, not the umbrella root.
- Workers can modify the target repository. Failed workers are not automatically retried because a partial modification may already exist.
- The planner only creates a plan and does not modify the target repo. Planner failures, invalid output, and empty plans can be safely retried before any worker or judge starts.
- Local process state, `exit_code`, logs, and artifacts are the source of truth. Codex App Server session lookup is auxiliary.
- tmux mode changes terminal visibility only. Node.js still owns scheduling, batch barriers, `maxParallel`, stop/archive, `judge_input.json`, and status refresh from `exit_code` plus artifacts.
- tmux windows stay open after command completion for human inspection, but `exit_code` is written before the keep-open shell starts so state can advance without closing the window.
- Dashboard tmux attach copy actions are shown only after tmux metadata is present. The file viewer does not repeat tmux terminal details.
- `codex exec` is treated as non-interactive; tmux mode provides live terminal visibility, not an approval UI.
- There is no batch-level judge. Only one final judge pass runs after all batches complete.

## CLI Entry

The npm CLI entry is:

```text
bin/input-kanban.js
```

It parses CLI options, sets environment variables before importing backend modules, and starts the HTTP server.

Supported options:

```text
--host <host>
--port <port>
--repo <path>
--runs-dir <path>
--codex-bin <path>
--open
--no-open
```

Default behavior:

- default repo: current working directory when `input-kanban` is launched; run creation validates that the selected repo is inside a Git work tree;
- default host: `127.0.0.1`;
- default port: `8787`;
- default runs directory: `~/.input-kanban/runs`;
- default Codex binary: `codex`.

## Data Model

### Run

A run is one user-submitted task batch. It appears as one card in the left sidebar and maps to one runtime directory:

```text
runs/<runId>/
```

Main files:

```text
task.md
plan.json
run_state.json
```

### Batch

A batch is a strict scheduling barrier produced by the planner. Only the first incomplete batch is eligible for scheduling. Later batches must wait until all earlier batches complete.

### Task

A task is one worker inside a batch. Batch-level parallelism is controlled by `batch.maxParallel`.

### Roles

- `planner`: read-only `codex exec` that returns a plan.
- `worker`: `codex exec` that performs work. The run-level worker sandbox defaults to `workspace-write`, and the create form can explicitly select `read-only` or `danger-full-access`.
- `judge`: read-only `codex exec` that performs final evaluation.

## Run State Machine

Common run states:

- `created`: run exists, planner has not started.
- `planning`: planner is running.
- `plan_failed`: planner failed or returned output that could not be parsed.
- `plan_empty`: planner returned valid JSON but zero tasks.
- `planned`: planner produced executable tasks.
- `running`: at least one worker in the current batch is running.
- `batch_blocked`: the current batch has a `failed` or `unknown` worker; later batches will not start.
- `batches_completed`: all batches completed; final judge can run.
- `judging`: final judge is running.
- `judged`: final judge process completed.
- `judge_failed`: final judge process failed.
- `stopped`: user stopped the run; no further scheduling occurs.

## Planner Retry Policy

Planner retry is allowed only before any worker or judge has started.

Before retrying, the backend:

1. Moves the current `planner/` directory to `planner_attempts/attempt-XX/`.
2. Clears current `tasks` and `batches`.
3. Resets `judge` state.
4. Deletes old `plan.json`.
5. Starts a new planner in a clean `planner/` directory.

If the planner returns valid JSON with zero tasks, the run is marked `plan_empty`. The UI shows a warning and allows planning again.

## Worker Failure Policy

Workers are not automatically retried.

Reason: a worker may have already changed files in the target repository. Retrying could duplicate edits, overwrite partial work, or create conflicts.

Recovery options:

- Inspect `events.pretty`, `stderr.log`, `last_message.md`, and artifacts.
- Manually mark `failed` or `unknown` workers as completed if the user confirms the work is actually done.
- Manual completion writes `workers/<taskId>/manual_completion.json`.
- The UI preserves the original failed or unknown status while also showing the manual completion marker.

## Stop and Archive

### Stop

`POST /api/runs/:runId/stop` terminates still-running local `codex exec` child processes for that run and freezes the run as `stopped`.

### Archive

`POST /api/runs/:runId/archive` performs a soft archive:

- writes `archived: true` to `run_state.json`;
- does not move the run directory;
- hides the run from default `GET /api/runs` and the left sidebar.

Archived runs can be queried with:

```text
GET /api/runs?includeArchived=1
```

## Left Sidebar Behavior

The left sidebar is rendered from API summaries, not direct file reads.

Flow:

1. Backend scans `runs/<runId>/run_state.json`.
2. `summaryOfRun()` creates summaries.
3. `GET /api/runs` returns those summaries.
4. Frontend renders run cards.

Current behavior:

- Shows the newest 10 runs by default.
- `Show more` appends 10 more runs.
- Sidebar height is fixed to the viewport; the run list has its own vertical scroll.
- Each card shows label, status, run ID, creation time, progress, running count, and failed count.
- Long labels are clamped to two lines with a browser tooltip for the full value.

## Final Judge

Final Judge runs once after all batches complete.

Before starting the judge, the backend generates:

```text
runs/<runId>/judge/judge_input.json
```

This manifest is the judge's primary source of truth. It contains:

- run metadata;
- original task text;
- `plan.json`;
- batch summaries and task order;
- planner status, output, and parse errors;
- worker status, exit code, start/end timestamps, expected artifacts;
- each worker's `last_message.md`, `result.json`, `evidence.json`, `manual_completion.json`, and stderr tail.

The judge prompt instructs the model to use `judge_input.json` first and inspect other run artifacts only if needed. This makes final evaluation more deterministic than asking the judge to discover files on its own.

## File Viewer

The file viewer calls:

```text
GET /api/runs/:runId/tasks/:taskId/file?name=...
```

It can read planner, worker, and judge files.

Current behavior:

- Selecting a task updates the file viewer title to `runId / taskId`.
- File tabs are role-specific. Planner, worker, and judge views expose only their common or relevant files.
- If a file tab is already open, switching tasks reloads the same file only when that role exposes the same tab; otherwise the file view is cleared.
- Auto refresh also reloads the selected task's selected file and attempts to preserve scroll position.
- `events.pretty` is a virtual file generated by formatting `events.jsonl` into a readable Chinese execution log.
- The execution view shows event counts and a jump-to-bottom button.
- `last_message.md` has a hover copy button in the top-left of the text area.
- `judge_input.json` and `verdict.json` are shown for the judge role. `exit_code` is not a default file tab because the task table already shows exit codes.

## Files and Responsibilities

```text
bin/input-kanban.js       CLI entry; parses args and starts server
src/server.js             HTTP server, static files, API routes
src/orchestrator.js       run state machine, scheduling, codex exec, stop/archive, file formatting
src/appServerClient.js    Codex App Server stdio client and session lookup
src/utils.js              paths, IDs, atomic JSON writes, file info, JSON extraction
public/index.html         single-file frontend, no build step
README.md                 user-facing overview
PROJECT_GUIDE.md          implementation guide for humans and agents
ENVIRONMENT.md            runtime environment variable reference
```

Runtime files:

```text
runs/<runId>/run_state.json
runs/<runId>/task.md
runs/<runId>/plan.json
runs/<runId>/planner/
runs/<runId>/planner_attempts/attempt-XX/
runs/<runId>/workers/<taskId>/
runs/<runId>/judge/judge_input.json
runs/<runId>/judge/verdict.json
```

## API

- `GET /`
- `GET /api/health`
- `GET /api/runs`
- `GET /api/runs?includeArchived=1`
- `POST /api/runs`
- `GET /api/runs/:runId/status`
- `POST /api/runs/:runId/plan`
- `POST /api/runs/:runId/dispatch`
- `POST /api/runs/:runId/judge`
- `POST /api/runs/:runId/stop`
- `POST /api/runs/:runId/archive`
- `GET /api/runs/:runId/task-text`
- `GET /api/runs/:runId/tasks/:taskId/file?name=...`
- `POST /api/runs/:runId/tasks/:taskId/mark-completed`

## Planner Output

Preferred shape:

```json
{
  "batches": [
    {
      "id": "batch-1",
      "name": "first batch",
      "maxParallel": 3,
      "tasks": [
        {
          "id": "T-01",
          "name": "short name",
          "prompt": "worker prompt",
          "sandbox": "workspace-write",
          "expectedArtifacts": []
        }
      ]
    }
  ],
  "finalJudgeRequired": true
}
```

Backward-compatible shape:

```json
{
  "tasks": [
    {
      "id": "T-01",
      "name": "short name",
      "prompt": "worker prompt",
      "sandbox": "workspace-write",
      "expectedArtifacts": []
    }
  ]
}
```

The old `tasks` format is wrapped into `batch-1` automatically.

## Development Checks

```bash
npm run check
```

When editing `public/index.html`, also consider extracting the inline script and checking it with `node --check`.

## Manual Smoke Checklist

Use this checklist before an npm release when runner behavior or package contents
change. Record the exact commands, run ids, and artifact paths in the release
notes or handoff.

1. Headless runner:
   - Start the app with `input-kanban --runner headless --runs-dir <tmp-runs-dir> --repo <target-repo> --port <free-port>`.
   - Create a small run, plan it, dispatch at least one worker, and run the final judge if the plan requires it.
   - Verify the run state reports `runner: headless`, no task exposes `tmux` metadata, and role directories contain the expected `prompt.md`, `events.jsonl`, `stderr.log`, `last_message.md`, and `exit_code` files.
   - Stop the run and verify no unrelated local process is affected.

2. tmux runner, only when `tmux -V` succeeds:
   - Start the app with `input-kanban --runner tmux --runs-dir <tmp-runs-dir> --repo <target-repo> --port <free-port>`.
   - Create a small run and click Plan. Verify a session named `input-kanban-<runId>` exists and has a planner window.
   - Dispatch workers. Verify each batch gets its own window with an overview pane plus worker panes, and each role directory writes `run.sh` and `tmux.json` with the expected `sessionName`, `windowName`, `target`, and `attachCommand`.
   - Verify `run.sh` writes `exit_code` before printing the keep-open summary, then keeps the window open for manual inspection.
   - Verify status refresh can advance planner, workers, and judge to `completed`, `planned`, or `judged` from filesystem state while tmux windows remain open.
   - Verify the UI does not show run attach copy before tmux metadata exists, then shows `复制tmux attach指令` in the run detail header after metadata exists. Verify the file viewer does not show a separate tmux terminal info panel.
   - Complete or stop the run. Verify stop removes only the exact `input-kanban-<runId>` tmux session and leaves any other tmux session running.
   - Do not mark this smoke as passed when tmux is unavailable or when these tmux checks were not run.

3. Package dry run:
   - Run `npm pack --dry-run`.
   - Verify the package includes `bin/`, `src/`, `public/`, `README.md`, `README.en.md`, `PROJECT_GUIDE.md`, `ENVIRONMENT.md`, and `package.json`.
   - Verify no runtime run directories, local logs, or unrelated temporary artifacts are included.

## Change Guidelines

- Do not add automatic worker retry unless there is a verified rollback or idempotency mechanism.
- Do not default to `--skip-git-repo-check`; prefer a concrete target child repository.
- Preserve batch barriers when modifying scheduling logic.
- Decide clearly between soft archive and physical directory archive before changing archive semantics.
- Keep the frontend buildless unless there is a strong reason to introduce a build pipeline.
