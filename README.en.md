# Input Kanban

[中文](README.md) | English

Input Kanban is a local Codex orchestration dashboard. The recommended path is to install it from npm, run `input-kanban` inside the target repository, and use the browser UI to manage planning, worker execution, and final judging.

## Recommended Usage

### 1. Install

```bash
npm install -g input-kanban
```

Verify the installation:

```bash
input-kanban --help
```

### 2. Start in the Target Repository

Enter the repository you want Codex to modify or inspect:

```bash
cd /path/to/your/repo
input-kanban
```

By default, this starts a local server at:

```text
http://127.0.0.1:8787
```

Open that URL in your browser to use the dashboard.

### 3. Start with an Explicit Repository

If you do not want to `cd` into the target repository first, pass it explicitly:

```bash
input-kanban --repo /path/to/your/repo
```

## Common Startup Options

```bash
input-kanban --port 8787
input-kanban --host 127.0.0.1
input-kanban --runs-dir ~/.input-kanban/runs
input-kanban --codex-bin codex
input-kanban --runner headless
input-kanban --open
```

Defaults:

- target repository: the current directory where `input-kanban` is launched
- host: `127.0.0.1`
- port: `8787`
- runs directory: `~/.input-kanban/runs`
- Codex command: `codex`
- runner: `headless`

`--runner` currently supports `headless` and `tmux`. The default behavior remains `headless`; `tmux` creates one `input-kanban-<runId>` session per run and one window for the planner, each batch, and the final judge. A batch window contains an overview pane plus the worker panes for that batch.

tmux mode still leaves batch barriers, `maxParallel`, final judge sequencing, and `judge_input.json` generation in Node.js. Each role output directory gets `run.sh` and `tmux.json`; status continues to be driven by `events.jsonl`, `stderr.log`, `last_message.md`, `exit_code`, and existing artifact files. After a tmux role command finishes, it writes `exit_code` first and then keeps the window open for inspection; the user closes the window manually from tmux.

tmux mode is optional and intended for live terminal viewing of each Codex role. `codex exec` is currently non-interactive and does not normally show manual approval prompts; if you select `danger-full-access` when creating a run, you explicitly relax the worker sandbox and should only do so in a controlled test repository.

After run-level tmux metadata is available, the dashboard shows `Copy tmux attach command`. The file viewer no longer repeats tmux terminal details; use the run detail header to copy the attach command and inspect the tmux session.

## Using the Dashboard

1. Click `New Run`.
2. Enter a label, target repository, worker sandbox, and task description.
3. Click `Create Run`.
4. Click `Plan` to let the Codex planner generate batches and workers.
5. Click `Dispatch` to run workers by batch barrier and concurrency limits.
6. Inspect execution logs, final messages, error logs, and artifacts.
7. After all batches complete, click `Final Judge`.
8. Stop or archive a run when needed, or manually mark a confirmed failed/unknown worker as completed.

## What It Is For

- Split a larger Codex programming task into multiple workers.
- Control execution order with batch barriers.
- Observe each worker's local status, logs, and final response.
- In tmux runner mode, inspect an overview pane and worker panes inside each batch window.
- Run a final judge after all workers complete.
- Keep local run records for debugging and recovery.

## Runtime Data Location

Runtime data is stored in the configured runs directory. The CLI default is:

```text
~/.input-kanban/runs
```

Each run roughly looks like this:

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

These files are local run records and do not need to be committed to your application repository.

## Requirements

- Node.js 20 or newer.
- Codex CLI installed and configured.
- `tmux` installed when using `--runner tmux`.
- The `codex` command works in your terminal, or `--codex-bin` points to the Codex executable.

## Maintainer Development

If you want to develop Input Kanban itself instead of using it as an end user:

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
