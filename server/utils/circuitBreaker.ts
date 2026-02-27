import logger from "../logger";

type CircuitState = "closed" | "open" | "half-open";

/**
 * Lightweight circuit breaker for non-critical read paths that should
 * degrade gracefully (e.g. stats, user discovery, spot listing).
 *
 * - **closed** – requests flow through normally.
 * - **open**   – requests are short-circuited to the fallback value.
 * - **half-open** – one probe request is allowed through; success resets
 *   the circuit, failure re-opens it.
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: CircuitState = "closed";

  constructor(
    private readonly name: string,
    private readonly threshold: number = 5,
    private readonly resetTimeoutMs: number = 30_000
  ) {}

  /**
   * Execute `fn`; on failure return `fallback` and track the failure.
   * When the circuit is open, `fn` is not called at all — `fallback` is
   * returned immediately.
   */
  async execute<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        this.state = "half-open";
      } else {
        return fallback;
      }
    }

    try {
      const result = await fn();
      if (this.state === "half-open") {
        this.reset();
      }
      return result;
    } catch (error) {
      this.recordFailure(error);
      return fallback;
    }
  }

  /** Current circuit state (useful for health checks / metrics). */
  getState(): CircuitState {
    return this.state;
  }

  private recordFailure(error: unknown): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.threshold) {
      this.state = "open";
      logger.warn(
        `[CircuitBreaker] ${this.name} opened after ${this.failures} consecutive failures`,
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  private reset(): void {
    this.failures = 0;
    this.state = "closed";
    logger.info(`[CircuitBreaker] ${this.name} reset to closed`);
  }
}

// Named breakers for non-critical features
export const statsBreaker = new CircuitBreaker("stats");
export const userDiscoveryBreaker = new CircuitBreaker("userDiscovery");
export const spotDiscoveryBreaker = new CircuitBreaker("spotDiscovery");
