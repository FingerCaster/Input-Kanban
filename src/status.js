export const TERMINAL_RUN_STATUSES = ['judged', 'judge_failed', 'batch_blocked', 'plan_failed', 'plan_empty', 'stopped', 'load_failed'];
export const FAILURE_RUN_STATUSES = ['judge_failed', 'batch_blocked', 'plan_failed', 'plan_empty', 'stopped', 'load_failed'];
export const INACTIVE_RUN_SUMMARY_STATUSES = TERMINAL_RUN_STATUSES.filter(status => status !== 'batch_blocked');
export const AUTO_ADVANCE_SKIP_RUN_STATUSES = INACTIVE_RUN_SUMMARY_STATUSES;

export function isTerminalRunStatus(status) {
  return TERMINAL_RUN_STATUSES.includes(status);
}

export function isFailureRunStatus(status) {
  return FAILURE_RUN_STATUSES.includes(status);
}

export function isActiveRunSummaryStatus(status) {
  return !INACTIVE_RUN_SUMMARY_STATUSES.includes(status);
}

export function isAutoAdvanceableRunStatus(status) {
  return !AUTO_ADVANCE_SKIP_RUN_STATUSES.includes(status);
}
