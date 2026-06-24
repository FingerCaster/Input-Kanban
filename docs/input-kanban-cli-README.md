# Input Kanban CLI Usage

This page is only the entry point.

Before using `input-kanban` from another project, read:

- `docs/input-kanban-cli-skill.md`
- `docs/input-kanban-prepare.md` when the task comes from an external Agent conversation

## What this is for

- Controlled execution through the `input-kanban` CLI
- Structured handoff from external Agent conversations
- Status checks, retry handling, result retrieval, and stop control
- Agent usage in a project that needs stable task execution

## What this is not for

- Task decomposition
- Final acceptance decisions
- Replacing external gate checks

## Install the bundled prepare skill

```bash
input-kanban install-skill codex
```

Use `--target-dir` if your Codex skills root is not `~/.codex/skills`:

```bash
input-kanban install-skill codex --target-dir /path/to/codex/skills
```

## Quick rule

- Use `submit` for a new task identity
- Use `retry` for the same task definition with a new attempt
- Use timestamped drafts like `.tmp/input-kanban/YYYYMMDD-HHmm-<short-slug>-task.md` for prepared handoffs
- Use `status` before state-dependent actions
- Use `result` for final confirmation
- Use `stop` only with an explicit `runId`
