# Release Notes

## v0.0.8

### Highlights

- Add CLI `submit` workflow with two task input modes: `--task-file <markdown>` for Markdown files and `--task <text>` for inline task text.
- Add CLI auto loop as the default `submit` behavior to create a run, start planning, dispatch batches, and run the final judge while keeping the run visible in the shared Web dashboard.
- Add CLI `-d` / `--detach` to run the auto loop in a background supervisor, plus `--no-auto` for create-and-plan-only mode.
- Add CLI `status [runId] [--watch]`, defaulting to the latest run when `runId` is omitted.
- Add CLI `result [runId] [--copy]` to print or copy the final judge result.
- Add CLI `stop <runId>` and make backend stop robust across CLI/Web processes by falling back to stored live PIDs.
- Derive the run label from task text when `--label` / form label is omitted.
- Add dashboard run-card archive confirmation without modal popups and replace the detail refresh text chips with a one-shot circle animation.

### Verification

- `npm run check` passed with 51 tests.

## v0.0.7

### Highlights

- Improve the run list cards: replace `Run ID` with a repository chip and copy action, add frozen duration, and hide rename buttons until hover/focus.
- Streamline dashboard flow: creating a run now automatically starts planning, selecting a task opens its execution log by default, and running-task conflicts show Chinese user-facing messages.
- Improve task detail ergonomics: copy actions are available for both final replies and verdict JSON, and manual success completion stores pasted human evidence.
- Add execution timing artifacts and summary chips, including `events_timed.jsonl`, command duration breakdowns, model/scheduler time, startup/teardown time, and system event counts.
- Strengthen run creation validation by rejecting missing target paths and directories outside a Git work tree before planning starts.
- Keep release notes in a single repository-level `RELEASE_NOTES.md` and include that file in the npm package.

### Verification

- `npm run check` passed with 43 tests.
- `npm pack --dry-run` passed before publishing.

## v0.0.6

### Changes

- Validate the target repository when creating a run, rejecting missing paths and directories outside a Git work tree before planning starts.
- Add a compact copy button for the full repository path in the run detail header.
- Document the Git work tree requirement in the README, English README, environment reference, and project guide.

### Verification

- `npm run check` passed with 38 tests.
- `npm pack --dry-run` confirmed package contents before the version bump.

## v0.0.5

### Highlights

- Add Input Kanban branding icons to the dashboard header and browser tab.
- Add standard favicon and Apple touch icon assets so browsers can show the same visual identity as the page header.
- Align left run-list metadata with the compact chip style used in run details.
- Align batch-row metadata in the task table with the same chip style for `Batch ID`, `最大并发`, and `进度`.

### Notes

- This is a UI polish release after `v0.0.4`.
- No runner, scheduler, tmux, sandbox, or Codex execution behavior changes are included.

### Verification

- `npm run check` passed.
- `npm pack --dry-run` passed.

## v0.0.4

### Highlights

- Add tmux batch layout: one session per run, windows for planner, each batch, and judge, with batch windows showing an overview pane plus worker panes.
- Show formatted Codex execution output in tmux panes while keeping raw JSONL logs in `events.jsonl`.
- Add worker sandbox selection in the create form, including explicit `danger-full-access` for controlled test repositories.
- Refine the dashboard UI with compact run metadata chips, no redundant tmux badges, no file-viewer tmux panel, and role-specific file tabs.
- Freeze run duration after terminal states such as final judge completion, instead of continuing to count on auto-refresh.

### Notes

- `codex exec` is treated as non-interactive; tmux mode provides live terminal visibility but does not implement manual approval prompts.
- The dashboard exposes the run-level `tmux attach-session` copy action after tmux metadata is available.
- Use `danger-full-access` only when you explicitly want to relax worker sandbox limits in a controlled environment.

### Verification

- `npm run check` passed.
