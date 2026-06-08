# Environment Variables

This file documents the runtime environment variables supported by Input Kanban. It is intended for local deployment and runtime configuration, not as the main implementation guide for agents.

CLI options take precedence over environment variables. Environment variables take precedence over defaults.

## Variables

- `PORT`: HTTP server port. Default: `8787`. CLI option: `--port`.
- `HOST`: HTTP bind host. Default: `127.0.0.1`. CLI option: `--host`.
- `KANBAN_DEFAULT_REPO`: Default target repository path for new runs. Default: the current working directory when `input-kanban` is launched. CLI option: `--repo`.
- `KANBAN_RUNS_DIR`: Directory for run state, logs, and artifacts. Default: `.input-kanban/runs` under the user's home directory. CLI option: `--runs-dir`.
- `KANBAN_CODEX_BIN`: Codex CLI executable name or path. Default: `codex`. CLI option: `--codex-bin`.
- `KANBAN_RUNNER`: Runner mode. Supported values: `headless`, `tmux`. Default: `headless`. CLI option: `--runner`.

## Environment Example

```bash
PORT=8787 \
KANBAN_DEFAULT_REPO=/path/to/child-repo \
KANBAN_RUNS_DIR=/path/to/kanban-runs \
KANBAN_CODEX_BIN=codex \
KANBAN_RUNNER=headless \
input-kanban
```

## Equivalent CLI Example

```bash
input-kanban \
  --port 8787 \
  --repo /path/to/child-repo \
  --runs-dir /path/to/kanban-runs \
  --codex-bin codex \
  --runner headless
```

## Notes

- `KANBAN_DEFAULT_REPO` / `--repo` should point to the actual git repository where work should run.
- `KANBAN_RUNNER` / `--runner tmux` runs Codex tasks inside tmux windows while keeping scheduling and status tracking in the Node.js orchestrator.
- `KANBAN_RUNNER=tmux` is optional. Use it when you want live terminal visibility into planner, worker, and final judge sessions, or when you need to manually respond to Codex CLI approval prompts.
- tmux mode does not implement automatic approval. It does not bypass Codex CLI, repository, or system permission boundaries; any approval prompt must still be explicitly approved by the user in the relevant tmux window.
- The runtime runs directory contains task text, logs, model output, artifacts, and possible audit information. It should not be committed to git.
- Avoid writing machine-specific absolute paths into public or shared documentation.
