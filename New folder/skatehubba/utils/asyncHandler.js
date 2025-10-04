import { handleFirebaseError } from '../services/firebase';

export const ERROR_MESSAGES = {
  NETWORK: 'Network connection error. Please check your internet connection.',
  AUTH: 'Authentication error. Please try logging in again.',
  PERMISSION: 'You don\'t have permission to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  UNKNOWN: 'An unexpected error occurred. Please try again.',
  TIMEOUT: 'The request timed out. Please try again.',
  RATE_LIMIT: 'Too many requests. Please try again later.',
};

export const asyncHandler = async (promise, customErrorMessage = null) => {
  try {
    return {
      data: await promise,
      error: null,
      success: true
    };
  } catch (error) {
    // Handle Firebase errors
    if (error.code?.startsWith('auth/') || error.code?.startsWith('firestore/')) {
      const firebaseError = handleFirebaseError(error);
      return {
        data: null,
        error: firebaseError,
        success: false
      };
    }

    // Handle network errors
    if (!navigator.onLine || error.message?.includes('network')) {
      return {
        data: null,
        error: { message: ERROR_MESSAGES.NETWORK },
        success: false
      };
    }

    // Handle timeout
    if (error.message?.includes('timeout')) {
      return {
        data: null,
        error: { message: ERROR_MESSAGES.TIMEOUT },
        success: false
      };
    }

    return {
      data: null,
      error: { 
        message: customErrorMessage || ERROR_MESSAGES.UNKNOWN,
        originalError: error
      },
      success: false
    };
  }
};

// Utility for handling multiple async operations
export const asyncBatch = async (promises, options = {}) => {
  const { 
    stopOnError = false, 
    errorMessage = ERROR_MESSAGES.UNKNOWN 
  } = options;

  try {
    if (stopOnError) {
      const results = await Promise.all(promises);
      return {
        data: results,
        error: null,
        success: true
      };
    } else {
      const results = await Promise.allSettled(promises);
      const fulfilled = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value);
      const rejected = results
        .filter(r => r.status === 'rejected')
        .map(r => r.reason);

      return {
        data: fulfilled,
        error: rejected.length ? { 
          message: errorMessage,
          errors: rejected 
        } : null,
        success: rejected.length === 0
      };
    }
  } catch (error) {
    return {
      data: null,
      error: { message: errorMessage, originalError: error },
      success: false
    };
  }
};
