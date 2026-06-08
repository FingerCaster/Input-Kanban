# Input Kanban

[中文](README.zh-CN.md) | English

Input Kanban is a local dashboard for orchestrating Codex work with `codex exec`. Install it from npm, run `input-kanban`, and manage planner, worker, and final judge runs from your browser.

## Install

```bash
npm install -g input-kanban
```

Verify the CLI:

```bash
input-kanban --help
```

## Start

Run from the repository you want Codex to work on:

```bash
cd /path/to/repo
input-kanban
```

Then open:

```text
http://127.0.0.1:8787
```

Or provide the target repository explicitly:

```bash
input-kanban --repo /path/to/repo
```

## Common Options

```bash
input-kanban --port 8787
input-kanban --host 127.0.0.1
input-kanban --runs-dir ~/.input-kanban/runs
input-kanban --codex-bin codex
input-kanban --open
```

Defaults:

- repo: current working directory
- host: `127.0.0.1`
- port: `8787`
- runs directory: `~/.input-kanban/runs`
- Codex binary: `codex`

## What It Does

- Creates local task runs from user-provided task text.
- Starts a read-only planner with `codex exec --json`.
- Schedules workers by strict batch barriers and `batch.maxParallel`.
- Tracks local process status, exit codes, logs, final messages, and artifacts.
- Generates `judge_input.json` and runs one final judge after all batches complete.
- Supports stopping runs, soft-archiving runs, and manually marking failed or unknown workers as completed.
- Shows formatted Codex JSONL logs in the dashboard.

## Typical Workflow

1. Start `input-kanban` in the target repository.
2. Open the dashboard.
3. Create a run with task text.
4. Click `Plan` to generate batches and workers.
5. Click `Dispatch` to run workers.
6. Inspect logs, final messages, and artifacts.
7. Click `Final Judge` after all batches complete.
8. Stop or archive runs when needed.

## Runtime Data

Runtime data is stored under the configured runs directory:

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

For CLI usage, the default runs directory is:

```text
~/.input-kanban/runs
```

## Development

```bash
git clone https://github.com/zhang3xing1/Input-Kanban.git
cd Input-Kanban
npm install
npm start
```

For local CLI development:

```bash
npm link
input-kanban --help
```

Run checks:

```bash
npm run check
```

## More Documentation

- [Project guide](PROJECT_GUIDE.md)
- [Environment variables](ENVIRONMENT.md)
