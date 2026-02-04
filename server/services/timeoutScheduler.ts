/**
 * Timeout Scheduler
 *
 * Periodically checks for and processes:
 * - Game turn timeouts
 * - Game disconnect timeouts (auto-forfeit)
 * - Battle vote timeouts
 *
 * Runs every 10 seconds to ensure timely timeout processing.
 */

import { processTimeouts as processGameTimeouts } from "./gameStateService";
import { processVoteTimeouts as processBattleTimeouts } from "./battleStateService";
import logger from "../logger";

let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

const SCHEDULER_INTERVAL_MS = 10 * 1000; // 10 seconds

/**
 * Process all timeouts (games and battles)
 */
async function processAllTimeouts(): Promise<void> {
  if (isRunning) {
    // Skip if previous run is still in progress
    return;
  }

  isRunning = true;

  try {
    // Process in parallel for efficiency
    await Promise.all([
      processGameTimeouts().catch((error) => {
        logger.error("[Scheduler] Game timeout processing failed", { error });
      }),
      processBattleTimeouts().catch((error) => {
        logger.error("[Scheduler] Battle timeout processing failed", { error });
      }),
    ]);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the timeout scheduler
 */
export function startTimeoutScheduler(): void {
  if (schedulerInterval) {
    logger.warn("[Scheduler] Timeout scheduler already running");
    return;
  }

  schedulerInterval = setInterval(processAllTimeouts, SCHEDULER_INTERVAL_MS);

  // Run immediately on startup
  processAllTimeouts();

  logger.info("[Scheduler] Timeout scheduler started", {
    intervalMs: SCHEDULER_INTERVAL_MS,
  });
}

/**
 * Stop the timeout scheduler
 */
export function stopTimeoutScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info("[Scheduler] Timeout scheduler stopped");
  }
}

/**
 * Force an immediate timeout check (for testing)
 */
export async function forceTimeoutCheck(): Promise<void> {
  await processAllTimeouts();
}
