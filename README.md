# Input Kanban

Input Kanban is a lightweight local dashboard for splitting a Codex task into batches and workers, running them with `codex exec`, observing status, stopping or archiving runs, and performing a final judge pass.

For implementation details and agent-facing project context, see:

```text
PROJECT_GUIDE.md
```

For runtime environment variables, see:

```text
ENVIRONMENT.md
```

## Features

- Static HTML dashboard with no frontend build step.
- Node.js backend that can:
  - create multiple runs;
  - start a `codex exec` planner and materialize `plan.json`;
  - safely retry planner runs before any worker or judge starts;
  - detect `plan_empty` when the planner returns zero tasks;
  - schedule workers by strict batch barriers and `batch.maxParallel`;
  - generate `judge_input.json` before the final judge pass;
  - start an independent `codex exec` final judge;
  - aggregate PID, exit code, events, stderr, last message, artifacts, and Codex session IDs;
  - stop runs, soft-archive runs, and manually mark failed or unknown workers as completed.

## CLI Usage

Run from the target repository directory:

```bash
input-kanban
```

Or provide the target repository explicitly:

```bash
input-kanban --repo /path/to/repo
```

Then open:

```text
http://127.0.0.1:8787
```

Common options:

```bash
input-kanban --port 8787
input-kanban --host 127.0.0.1
input-kanban --runs-dir ~/.input-kanban/runs
input-kanban --codex-bin codex
input-kanban --open
```

## Development

```bash
npm start
```

For local CLI development:

```bash
npm link
input-kanban
```

## Workflow

1. Click `New Run`, then enter a label, target repo, max parallel value, and task text.
2. Click `Create Run`.
3. Click `Plan` to start the planner:
   - planner uses `codex exec --json --sandbox read-only`;
   - output is stored under `runs/<runId>/planner/`.
4. When planning succeeds, `plan.json` is created and the worker list is shown.
5. Click `Dispatch` to start workers according to batch barriers and `batch.maxParallel`.
6. The page polls status every 3 seconds.
7. After all batches complete, click `Final Judge` to run the final judge pass.

The current UI labels are localized, but the project documentation is written in English for easier agent consumption.

## Planner Output Format

The preferred planner response is a JSON object with `batches`. The older `tasks` shape is also supported.

```json
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
          "sandbox": "workspace-write",
          "expectedArtifacts": ["tmp/example-result.json"]
        }
      ]
    }
  ],
  "finalJudgeRequired": true
}
```

The backend extracts the first JSON object from `last_message.md`. If the planner succeeds but returns zero tasks, the run is marked `plan_empty` and can be planned again before any worker or judge starts.

## Status Sources

Worker status is primarily determined from local state:

- Node child process tracking
- `exit_code`
- `events.jsonl`
- `stderr.log`
- `last_message.md`
- expected artifacts

Codex App Server is an auxiliary source only:

- the backend starts `codex app-server --stdio`;
- it calls `thread/list`;
- it matches sessions using prompt markers:
  - `ORCHESTRATOR_RUN_ID`
  - `ORCHESTRATOR_TASK_ID`

A Codex App Server `notLoaded` state does not mean a worker failed. The local process, exit code, logs, and artifacts remain the source of truth.

## Runtime Directory

```text
runs/<runId>/
├── task.md
├── plan.json
├── run_state.json
├── planner/
├── workers/<taskId>/
└── judge/
    ├── judge_input.json
    └── verdict.json
```

The development `runs/` directory is gitignored. For CLI usage, the default runtime directory is `~/.input-kanban/runs`.

## Checks

```bash
npm run check
```
