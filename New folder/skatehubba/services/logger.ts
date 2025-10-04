// Structured logging system that respects production environment
export const log = Object.freeze({
  // Development only - removed in production
  info: (...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[INFO]', ...args);
    }
  },
  
  // Development only - debug information
  debug: (...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[DEBUG]', ...args);
    }
  },
  
  // Always logged - important warnings
  warn: (...args: unknown[]) => {
    console.warn('[WARN]', ...args);
  },
  
  // Always logged - critical errors
  error: (...args: unknown[]) => {
    console.error('[ERROR]', ...args);
  },
  
  // Firebase specific logging
  firebase: {
    auth: (...args: unknown[]) => {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[FIREBASE:AUTH]', ...args);
      }
    },
    
    firestore: (...args: unknown[]) => {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[FIREBASE:FIRESTORE]', ...args);
      }
    },
    
    storage: (...args: unknown[]) => {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[FIREBASE:STORAGE]', ...args);
      }
    },
  },
  
  // User action logging for analytics/debugging
  userAction: (action: string, data?: any) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[USER_ACTION]', action, data);
    }
    // In production, this could send to analytics service
  },
  
  // Performance logging
  performance: (label: string, duration?: number) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[PERFORMANCE]', label, duration ? `${duration}ms` : '');
    }
  },
  
  // Network request logging
  network: (method: string, url: string, status?: number) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[NETWORK]', method, url, status ? `(${status})` : '');
    }
  },
});

// Performance timing helper
export function measurePerformance<T>(
  label: string,
  fn: () => T | Promise<T>
): T | Promise<T> {
  const start = performance.now();
  const result = fn();
  
  if (result instanceof Promise) {
    return result.finally(() => {
      const duration = performance.now() - start;
      log.performance(label, duration);
    });
  } else {
    const duration = performance.now() - start;
    log.performance(label, duration);
    return result;
  }
}

// Error boundary logging
export function logError(error: Error, context?: string) {
  log.error(context ? `${context}:` : 'Unhandled error:', error.message, error.stack);
  
  // In production, send to error tracking service
  if (process.env.NODE_ENV === 'production') {
    // TODO: Send to Sentry, Bugsnag, or other error tracking service
  }
}