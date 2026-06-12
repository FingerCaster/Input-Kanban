# Environment Variables

This file documents the runtime environment variables supported by Input Kanban. It is intended for local deployment and runtime configuration, not as the main implementation guide for agents.

CLI options take precedence over environment variables. Environment variables take precedence over defaults.

## Variables

- `PORT`: HTTP server port. Default: `8787`. CLI option: `--port`.
- `HOST`: HTTP bind host. Default: `127.0.0.1`. CLI option: `--host`.
- `KANBAN_DEFAULT_WORKSPACE`: Default workspace path for new runs. Default: the current working directory when `input-kanban` is launched. CLI option: `--workspace`. `KANBAN_DEFAULT_REPO` remains as a compatibility alias. Creating a run only requires this path to exist and be a directory; Git is detected and marked when available.
- `KANBAN_RUNS_DIR`: Directory for run state, logs, and artifacts. Default: `.input-kanban/runs` under the user's home directory. CLI option: `--runs-dir`.
- `KANBAN_CODEX_BIN`: Codex CLI executable name or path. Default: `codex`. CLI option: `--codex-bin`.
- `KANBAN_RUNNER`: Runner mode. Supported values: `headless`, `tmux`. Default: `headless`. CLI option: `--runner`.
- `KANBAN_AUTO_POLL_MS`: Poll interval for the Web server background scheduler. Default: `3000`.
- `KANBAN_AUTO_MAX_RETRIES`: Maximum automatic retries for recoverable failed/unknown tasks in the scheduler. Default: `1`.

## Environment Example

```bash
PORT=8787 \
KANBAN_DEFAULT_WORKSPACE=/path/to/workspace \
KANBAN_RUNS_DIR=/path/to/kanban-runs \
KANBAN_CODEX_BIN=codex \
KANBAN_RUNNER=headless \
input-kanban
```

## Equivalent CLI Example

```bash
input-kanban \
  --port 8787 \
  --workspace /path/to/workspace \
  --runs-dir /path/to/kanban-runs \
  --codex-bin codex \
  --runner headless
```

## Notes

- `KANBAN_DEFAULT_WORKSPACE` / `--workspace` should point to the local directory where work should run; `KANBAN_DEFAULT_REPO` / `--repo` remain compatibility aliases.
- `input-kanban serve` starts a lightweight background scheduler that uses the same orchestrator auto-advance path as CLI `submit --auto` / `input-kanban auto <runId>`. It advances planned runs, serial batches, final judge startup, and bounded automatic retries without relying on an open browser tab.
- `KANBAN_RUNNER` / `--runner tmux` runs Codex tasks inside tmux windows while keeping scheduling and status tracking in the Node.js orchestrator.
- `KANBAN_RUNNER=tmux` is optional. Use it when you want live terminal visibility into planner, worker, and final judge sessions.
- tmux mode uses one session per run and one window for planner, each batch, and judge. Batch windows contain an overview pane plus worker panes.
- tmux role windows stay open after the Codex command exits. The runner writes `exit_code` before entering the keep-open shell so Node.js status refresh can continue to advance from filesystem state.
- The dashboard exposes the run-level `tmux attach-session` copy action after tmux metadata is available. File viewer panels do not repeat tmux terminal details.
- `codex exec` is non-interactive in current supported usage. tmux mode does not implement automatic approval and does not turn `codex exec` into an approval UI.
- The runtime runs directory contains task text, logs, model output, artifacts, and possible audit information. It should not be committed to git.
- Avoid writing machine-specific absolute paths into public or shared documentation.
