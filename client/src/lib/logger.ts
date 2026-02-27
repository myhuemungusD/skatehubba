/* eslint-disable no-console -- this IS the logger module; direct console access is intentional here and guarded: production builds silence all levels except error */
const isDevelopment = import.meta.env.DEV;

export type LogLevel = "log" | "info" | "warn" | "error" | "debug";

interface Logger {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

function createLogger(): Logger {
  if (isDevelopment) {
    return {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      debug: console.debug.bind(console),
    };
  }

  return {
    log: () => {},
    info: () => {},
    warn: () => {},
    error: console.error.bind(console),
    debug: () => {},
  };
}

export const logger = createLogger();

export function logError(error: Error, context?: Record<string, unknown>) {
  logger.error("[SkateHubba Error]", {
    message: error.message,
    stack: error.stack,
    ...context,
  });
}

export function logPerformance(metric: string, value: number, unit: string = "ms") {
  logger.log(`[Performance] ${metric}: ${value}${unit}`);
}
