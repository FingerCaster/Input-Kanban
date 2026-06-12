# Input Kanban

[中文](README.md) | English

Input Kanban is a local Codex orchestration dashboard. The recommended path is to install it from npm, run `input-kanban` inside the target workspace, and use the browser UI to manage planning, worker execution, and final judging. If the workspace is a Git repository, the UI marks it as such.

## Recommended Usage

### 1. Install

```bash
npm install -g input-kanban
```

Verify the installation:

```bash
input-kanban --help
```

### 2. Start in the Target Workspace

Enter the workspace you want Codex to modify or inspect:

```bash
cd /path/to/your/workspace
input-kanban
```

By default, this starts a local server at:

```text
http://127.0.0.1:8787
```

Open that URL in your browser to use the dashboard.

### 3. Start with an Explicit Workspace

If you do not want to `cd` into the target workspace first, pass it explicitly:

```bash
input-kanban --workspace /path/to/your/workspace
```

`--repo` remains available as a compatibility alias.

## CLI Auto Execution

To submit a task from the terminal and let it advance automatically, use `submit`. Task content supports two input modes:

```bash
input-kanban submit --task-file task.md --label "Fix login issue"
input-kanban submit --task "Fix the login issue and add regression tests" --label "Fix login issue"
```

`submit` creates a run, starts planning, dispatches all batches, and starts the final judge after all workers finish by default. The default workspace is the current directory. If `--label` is omitted, the run label is generated from the task text. It uses the same runs directory, so CLI-created runs are visible in the Web dashboard on port 8787 as long as the dashboard uses the same `--runs-dir`.

`input-kanban serve` starts a lightweight background scheduler that keeps refreshing and advancing unfinished runs: it dispatches batches when a plan is ready, starts the next serial batch after the previous one completes, and starts the final judge after all batches complete. CLI `submit --auto` / `input-kanban auto <runId>` and the Web server share the same orchestrator auto-advance path, so progress no longer depends on whether a browser page is open or refreshed.

To return immediately and let a background supervisor continue the auto loop, pass `-d` / `--detach`:

```bash
input-kanban submit --task-file task.md -d
```

To create the run and start planning without dispatching or judging, pass `--no-auto`.

Common examples:

```bash
input-kanban submit --task "Fix login issue"
input-kanban submit --task-file task.md --max-parallel 2 --worker-sandbox workspace-write
input-kanban submit --runs-dir ~/.input-kanban/runs --runner tmux -d
```

Check and stop:

```bash
input-kanban runs
input-kanban --json runs --active
input-kanban status
input-kanban status --watch
input-kanban status <runId> --watch
input-kanban --json status <runId>
input-kanban result
input-kanban result <runId> --copy
input-kanban --json result <runId>
input-kanban retry <runId> [taskId]
input-kanban --json retry <runId> [taskId]
input-kanban stop <runId>
```

Use `runs` to discover visible run batches first; `runs --active` shows only runs that have not reached a terminal state or still have running tasks, which lets an agent find `runId` values before calling `status <runId>`. To focus on one workspace, use `input-kanban runs --workspace /path/to/workspace`; the Web sidebar has the same workspace filter. Without a `runId`, `status` and `result` use the latest run by default. `result --copy` copies the final judge result. `retry` preserves the failed attempt and retries failed/unknown tasks. `--json` is handy for agents/scripts that need structured output. Stopping requires an explicit `runId` to avoid stopping the wrong run.

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

- workspace: the current directory where `input-kanban` is launched; creating a run only requires an existing directory, and Git is shown as an optional capability when detected
- host: `127.0.0.1`
- port: `8787`
- runs directory: `~/.input-kanban/runs`
- Codex command: `codex`
- runner: `headless`

`--runner` currently supports `headless` and `tmux`. The default behavior remains `headless`; `tmux` creates one `input-kanban-<runId>` session per run and one window for the planner, each batch, and the final judge. A batch window contains an overview pane plus the worker panes for that batch.

tmux mode still leaves batch barriers, `maxParallel`, final judge sequencing, and `judge_input.json` generation in Node.js. Each role output directory gets `run.sh` and `tmux.json`; status continues to be driven by `events.jsonl`, `stderr.log`, `last_message.md`, `exit_code`, and existing artifact files. After a tmux role command finishes, it writes `exit_code` first and then keeps the window open for inspection; the user closes the window manually from tmux.

If you are using `--runner tmux`, stopping and restarting `input-kanban serve` does not interrupt Codex sessions that are already running; the tmux session keeps going, and the scheduler resumes orchestration after the server comes back. With the `headless` runner, do not assume that restarting the service is safe for in-flight child processes.

tmux mode is optional and intended for live terminal viewing of each Codex role. `codex exec` is currently non-interactive and does not normally show manual approval prompts; if you select `danger-full-access` when creating a run, you explicitly relax the worker sandbox and should only do so in a controlled test workspace.

After run-level tmux metadata is available, the dashboard shows `Copy tmux attach command`. The file viewer no longer repeats tmux terminal details; use the run detail header to copy the attach command and inspect the tmux session.

## Using the Dashboard

1. Click `New Run`.
2. Enter a label, workspace, worker sandbox, and task description.
3. Click `Create Run`.
4. The dashboard automatically starts `Plan` so the Codex planner can generate batches and workers.
5. After planning completes, Web auto mode dispatches workers by batch barrier and concurrency limits by default.
6. After all batches complete, Web auto mode starts the final judge by default.
7. Inspect execution logs, final messages, error logs, and artifacts.
8. Stop or archive a run when needed, or manually click buttons to retry/advance, or manually mark a confirmed failed/unknown worker as completed.

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

These files are local run records and do not need to be committed to your application workspace.

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
