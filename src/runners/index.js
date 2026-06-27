import { headlessRunner } from './headlessRunner.js';
import { createTmuxRunner } from './tmuxRunner.js';

export { createHeadlessRunner, headlessRunner } from './headlessRunner.js';
export { createTmuxRunner } from './tmuxRunner.js';

export function createDefaultRunner(runnerMode = 'headless', options = {}) {
  if (runnerMode === 'tmux') return createTmuxRunner(options);
  return headlessRunner;
}

export const defaultRunner = createDefaultRunner();
