# Environment Variables

This file documents the runtime environment variables supported by Input Kanban. It is intended for local deployment and runtime configuration, not as the main implementation guide for agents.

CLI options take precedence over environment variables. Environment variables take precedence over defaults.

## Variables

- `PORT`: HTTP server port. Default: `8787`. CLI option: `--port`.
- `HOST`: HTTP bind host. Default: `127.0.0.1`. CLI option: `--host`.
- `KANBAN_DEFAULT_REPO`: Default target repository path for new runs. Default: the current working directory when `input-kanban` is launched. CLI option: `--repo`.
- `KANBAN_RUNS_DIR`: Directory for run state, logs, and artifacts. Default: `.input-kanban/runs` under the user's home directory. CLI option: `--runs-dir`.
- `KANBAN_CODEX_BIN`: Codex CLI executable name or path. Default: `codex`. CLI option: `--codex-bin`.

## Environment Example

```bash
PORT=8787 \
KANBAN_DEFAULT_REPO=/path/to/child-repo \
KANBAN_RUNS_DIR=/path/to/kanban-runs \
KANBAN_CODEX_BIN=codex \
input-kanban
```

## Equivalent CLI Example

```bash
input-kanban \
  --port 8787 \
  --repo /path/to/child-repo \
  --runs-dir /path/to/kanban-runs \
  --codex-bin codex
```

## Notes

- `KANBAN_DEFAULT_REPO` / `--repo` should point to the actual git repository where work should run.
- The runtime runs directory contains task text, logs, model output, artifacts, and possible audit information. It should not be committed to git.
- Avoid writing machine-specific absolute paths into public or shared documentation.
