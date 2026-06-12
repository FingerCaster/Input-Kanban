import { autoAdvanceActiveRuns } from './orchestrator.js';

export function startAutoScheduler({ appClient = null, pollMs = Number(process.env.KANBAN_AUTO_POLL_MS || 3000), maxRetries = Number(process.env.KANBAN_AUTO_MAX_RETRIES || 1), startCreated = false, log = false } = {}) {
  const intervalMs = Math.max(500, Number(pollMs) || 3000);
  let stopped = false;
  let running = false;
  let timer = null;

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const results = await autoAdvanceActiveRuns({ appClient, startCreated, maxRetries, retryReason: 'auto retry from server scheduler' });
      if (log) {
        for (const result of results) {
          if (result.ok === false) console.warn(`[scheduler] ${result.runId}: ${result.error}`);
        }
      }
    } catch (error) {
      if (log) console.warn(`[scheduler] ${error.message || String(error)}`);
    } finally {
      running = false;
    }
  };

  timer = setInterval(() => { tick(); }, intervalMs);
  timer.unref?.();
  tick();

  return {
    get running() { return running; },
    get stopped() { return stopped; },
    async tick() { await tick(); },
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
    }
  };
}
