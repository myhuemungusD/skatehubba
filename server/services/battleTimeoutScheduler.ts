/**
 * Battle Timeout Scheduler
 *
 * Periodically checks for and processes battle vote timeouts.
 * Runs every 10 seconds to ensure timely timeout processing.
 */

import { processVoteTimeouts as processBattleTimeouts } from "./battleStateService";
import logger from "../logger";

let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

const SCHEDULER_INTERVAL_MS = 10 * 1000; // 10 seconds

async function processAllTimeouts(): Promise<void> {
  if (isRunning) {
    return;
  }

  isRunning = true;

  try {
    await processBattleTimeouts().catch((error) => {
      logger.error("[Scheduler] Battle timeout processing failed", { error });
    });
  } finally {
    isRunning = false;
  }
}

export function startTimeoutScheduler(): void {
  if (schedulerInterval) {
    logger.warn("[Scheduler] Timeout scheduler already running");
    return;
  }

  schedulerInterval = setInterval(processAllTimeouts, SCHEDULER_INTERVAL_MS);

  processAllTimeouts();

  logger.info("[Scheduler] Timeout scheduler started", {
    intervalMs: SCHEDULER_INTERVAL_MS,
  });
}

export function stopTimeoutScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info("[Scheduler] Timeout scheduler stopped");
  }
}

export async function forceTimeoutCheck(): Promise<void> {
  await processAllTimeouts();
}
