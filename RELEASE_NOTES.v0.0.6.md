# v0.0.6

## Changes

- Validate the target repository when creating a run, rejecting missing paths and directories outside a Git work tree before planning starts.
- Add a compact copy button for the full repository path in the run detail header.
- Document the Git work tree requirement in the README, English README, environment reference, and project guide.

## Verification

- `npm run check` passes with 38 tests.
- `npm pack --dry-run` confirms package contents before the version bump.
