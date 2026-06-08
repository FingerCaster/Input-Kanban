import { headlessRunner } from './headlessRunner.js';
import { createTmuxRunner } from './tmuxRunner.js';
import { RUNNER } from '../utils.js';

export { createHeadlessRunner, headlessRunner } from './headlessRunner.js';
export { createTmuxRunner } from './tmuxRunner.js';

export function createDefaultRunner(runnerMode = RUNNER) {
  if (runnerMode === 'tmux') return createTmuxRunner();
  return headlessRunner;
}

export const defaultRunner = createDefaultRunner();
