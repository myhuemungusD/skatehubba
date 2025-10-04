import { Alert, Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { analyticsService, EventCategory } from './analytics';

class GlobalErrorHandler {
  static init() {
    // Handle global JS errors
    const originalErrorHandler = ErrorUtils.getGlobalHandler();
    
    ErrorUtils.setGlobalHandler((error, isFatal) => {
      // Log to analytics
      analyticsService.logError(error, {
        category: EventCategory.ERROR,
        isFatal,
        type: 'unhandled_js_error',
      });

      // Send to Sentry with context
      Sentry.withScope(scope => {
        scope.setExtra('isFatal', isFatal);
        scope.setExtra('platform', Platform.OS);
        scope.setExtra('version', Platform.Version);
        scope.setLevel(isFatal ? 'fatal' : 'error');
        Sentry.captureException(error);
      });

      // Show alert for fatal errors in development
      if (__DEV__ && isFatal) {
        Alert.alert(
          'Unexpected Error',
          `
Error: ${error.message}

We've caught a fatal error in development mode.

${error.stack}
          `,
          [
            {
              text: 'OK',
              onPress: () => {
                originalErrorHandler(error, isFatal);
              },
            },
          ]
        );
      } else {
        // Call original handler
        originalErrorHandler(error, isFatal);
      }
    });

    // Handle unhandled promise rejections
    const unhandledRejectionHandler = event => {
      const error = event.reason;
      
      analyticsService.logError(error, {
        category: EventCategory.ERROR,
        type: 'unhandled_promise_rejection',
      });

      Sentry.withScope(scope => {
        scope.setExtra('type', 'unhandled_promise_rejection');
        Sentry.captureException(error);
      });

      if (__DEV__) {
        console.error(
          'Unhandled Promise Rejection:',
          error?.stack || error
        );
      }
    };

    // Add promise rejection handler
    if (global.addEventListener) {
      global.addEventListener('unhandledrejection', unhandledRejectionHandler);
    }
  }

  static logNonFatalError(error, context = {}) {
    analyticsService.logError(error, {
      category: EventCategory.ERROR,
      type: 'non_fatal_error',
      ...context,
    });

    Sentry.withScope(scope => {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
      Sentry.captureException(error);
    });

    if (__DEV__) {
      console.error('Non-fatal error:', error, context);
    }
  }

  static async clearErrorState() {
    try {
      await Promise.all([
        AsyncStorage.removeItem('@last_error'),
        AsyncStorage.removeItem('@error_count'),
      ]);
    } catch (e) {
      console.warn('Failed to clear error state:', e);
    }
  }
}

export default GlobalErrorHandler;
