const isDevelopment = import.meta.env.DEV;

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

interface Logger {
  log(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
  debug(...args: any[]): void;
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

export function logError(error: Error, context?: Record<string, any>) {
  logger.error('[SkateHubba Error]', {
    message: error.message,
    stack: error.stack,
    ...context,
  });
}

export function logPerformance(metric: string, value: number, unit: string = 'ms') {
  if (isDevelopment) {
    console.log(`[Performance] ${metric}: ${value}${unit}`);
  }
}
