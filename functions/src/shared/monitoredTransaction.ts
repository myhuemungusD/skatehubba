/**
 * Firestore Transaction Monitoring
 *
 * Wraps transactions with structured logging for monitoring
 * retry rates, latency, and contention in production.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

/**
 * Wraps a Firestore transaction with structured logging for monitoring
 * retry rates, latency, and contention in production.
 *
 * Firestore automatically retries transactions up to 25 times on contention.
 * This wrapper tracks attempt count and total duration for observability.
 */
export async function monitoredTransaction<T>(
  db: admin.firestore.Firestore,
  label: string,
  gameId: string,
  updateFn: (transaction: admin.firestore.Transaction) => Promise<T>
): Promise<T> {
  let attempts = 0;
  const startMs = Date.now();

  const result = await db.runTransaction(async (transaction) => {
    attempts++;
    return updateFn(transaction);
  });

  const durationMs = Date.now() - startMs;
  const logData = {
    transaction: label,
    gameId,
    attempts,
    durationMs,
    retried: attempts > 1,
  };

  if (attempts > 1) {
    functions.logger.warn("[TransactionMonitor] Contention detected:", JSON.stringify(logData));
  } else {
    functions.logger.log("[TransactionMonitor]", JSON.stringify(logData));
  }

  return result;
}
