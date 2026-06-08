## Highlights

- Adds tmux batch layout: one session per run, windows for planner, each batch, and judge, with batch windows showing an overview pane plus worker panes.
- Shows formatted Codex execution output in tmux panes while keeping raw JSONL logs in `events.jsonl`.
- Adds worker sandbox selection in the create form, including explicit `danger-full-access` for controlled test repositories.
- Refines the dashboard UI with compact run metadata chips, no redundant tmux badges, no file-viewer tmux panel, and role-specific file tabs.
- Freezes run duration after terminal states such as final judge completion, instead of continuing to count on auto-refresh.

## Notes

- `codex exec` is treated as non-interactive; tmux mode provides live terminal visibility but does not implement manual approval prompts.
- The dashboard exposes the run-level `tmux attach-session` copy action after tmux metadata is available.
- Use `danger-full-access` only when you explicitly want to relax worker sandbox limits in a controlled environment.

## Verification

- `npm run check`
