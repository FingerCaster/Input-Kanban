# Preparing Tasks for Input Kanban

Use this guide when a task starts in an external Agent conversation and should be handed off to `input-kanban` for execution.

The goal is not to make Input Kanban do all planning from a vague prompt. The goal is to give it a clear execution contract so the planner, workers, and final judge have better inputs.

## Recommended Flow

1. Use the external Agent conversation to clarify the goal, scope, risks, and acceptance criteria.
2. Convert the discussion into a structured `task.md`.
3. Submit the task with plan approval:

```bash
input-kanban submit --task-file task.md --plan-approval
```

4. Review the generated plan before dispatching workers.
5. Use `status`, `result`, `retry`, and `stop` to control execution.

## Minimal `task.md` Structure

```markdown
# Task

## Goal

Describe the desired outcome in one or two concrete paragraphs.

## Non-Goals

- List what should not be changed.

## Acceptance Criteria

- [ ] Criterion that can be tested, inspected, or verified.
- [ ] Another criterion.

## Expected Artifacts

- Path: `relative/or/absolute/path`
  Verify: command, inspection step, or expected content.

## Context References

- `path/to/spec.md`
- `path/to/relevant/file.ts`

## Execution Hints

### Suggested Batches

- Batch: first safe step
  Reason: why this is an execution barrier
  Max parallel: 1
  Tasks:
    - concrete worker instruction

## Risks and Assumptions

- Known risk, assumption, or unresolved detail.
```

## Good Handoff Checklist

- The goal is specific.
- The scope is bounded.
- Acceptance criteria are checkable.
- Expected artifacts include verification methods.
- Context references point to real material.
- Batch hints explain dependencies or safety reasons.
- Risks and assumptions are visible.

## Skill Template

A reusable skill draft is available at:

```text
skills/input-kanban-prepare/SKILL.md
```

After installing the npm package, you can install the bundled skill for Codex:

```bash
input-kanban install-skill codex
```

Use `--target-dir` if your Codex skills root is custom:

```bash
input-kanban install-skill codex --target-dir /path/to/codex/skills
```

Use it in external Agent tools when you want the Agent to prepare a better `task.md` before invoking Input Kanban.
