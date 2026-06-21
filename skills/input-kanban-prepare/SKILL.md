# input-kanban-prepare

Use this skill when a task discussed in an external Agent conversation needs to be handed off to `input-kanban` for execution.

This skill prepares an execution-ready `task.md`. It does not execute the task and does not decide final acceptance.

## Non-Negotiable Rules

- Evidence first: inspect relevant code, specs, history, docs, or user-provided context before writing the handoff.
- Do not invent requirements, files, or acceptance criteria.
- Every acceptance criterion must be verifiable by a human, command, artifact, or clear inspection step.
- Every expected artifact must include how to verify it.
- If the task is ambiguous, ask clarifying questions before preparing the handoff.
- Do not output an `input-kanban submit` command until the handoff passes the quality gate.

## Workflow

1. Restate the goal in one or two sentences.
2. Identify non-goals and scope boundaries.
3. Collect evidence and context references.
4. Write acceptance criteria as checkable bullets.
5. Identify expected artifacts and verification methods.
6. Suggest batches only when order or safety matters.
7. List risks, assumptions, and open questions.
8. Run the quality gate.
9. Output the final `task.md` and a recommended submit command.

## Required `task.md` Shape

```markdown
# Task

## Goal

...

## Non-Goals

- ...

## Acceptance Criteria

- [ ] ...
- [ ] ...

## Expected Artifacts

- Path: `...`
  Verify: ...

## Context References

- `...`

## Execution Hints

### Suggested Batches

- Batch: ...
  Reason: ...
  Max parallel: ...
  Tasks:
    - ...

## Risks and Assumptions

- ...
```

## Quality Gate

Before producing the submit command, confirm:

- The goal is concrete.
- The scope is bounded.
- Acceptance criteria are testable or inspectable.
- Expected artifacts have verification methods.
- Batch hints explain why ordering or parallelism matters.
- Context references point to real files, notes, specs, or user-provided material.
- Risks and unknowns are explicit.

If any item fails, do not submit. Ask for clarification or improve the handoff.

## Recommended Submit Command

Prefer plan approval for external handoffs:

```bash
input-kanban submit --task-file task.md --plan-approval
```

Use `--json` when another tool needs structured output:

```bash
input-kanban --json status <runId>
input-kanban --json result <runId>
```
