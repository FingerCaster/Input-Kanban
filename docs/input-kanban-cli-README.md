# Input Kanban CLI Usage

This page is only the entry point.

Before using `input-kanban` from another project, read:

- `docs/input-kanban-cli-skill.md`

## What this is for

- Controlled execution through the `input-kanban` CLI
- Status checks, retry handling, result retrieval, and stop control
- Agent usage in a project that needs stable task execution

## What this is not for

- Task decomposition
- Final acceptance decisions
- Replacing external gate checks

## Quick rule

- Use `submit` for a new task identity
- Use `retry` for the same task definition with a new attempt
- Use `status` before state-dependent actions
- Use `result` for final confirmation
- Use `stop` only with an explicit `runId`
