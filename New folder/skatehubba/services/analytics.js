import analytics from '@react-native-firebase/analytics';
import * as Sentry from '@sentry/react-native';

// Event Categories
export const EventCategory = {
  AUTH: 'auth',
  CHALLENGE: 'challenge',
  CHECK_IN: 'check_in',
  SESSION: 'session',
  VERIFICATION: 'verification',
  PROFILE: 'profile',
  SHOP: 'shop',
  ERROR: 'error',
  AR: 'ar',
};

// Event Names
export const EventName = {
  // Auth Events
  SIGN_UP: 'sign_up',
  LOGIN: 'login',
  LOGOUT: 'logout',
  AUTH_ERROR: 'auth_error',
  
  // Challenge Events
  CHALLENGE_CREATED: 'challenge_created',
  CHALLENGE_ACCEPTED: 'challenge_accepted',
  CHALLENGE_COMPLETED: 'challenge_completed',
  CHALLENGE_FAILED: 'challenge_failed',
  
  // Check-in Events
  CHECK_IN_CREATED: 'check_in_created',
  CHECK_IN_LIKED: 'check_in_liked',
  
  // Session Events
  SESSION_CREATED: 'session_created',
  SESSION_JOINED: 'session_joined',
  SESSION_LEFT: 'session_left',
  
  // Verification Events
  VERIFICATION_REQUESTED: 'verification_requested',
  VERIFICATION_APPROVED: 'verification_approved',
  VERIFICATION_REJECTED: 'verification_rejected',
  
  // Profile Events
  PROFILE_UPDATED: 'profile_updated',
  AVATAR_UPDATED: 'avatar_updated',
  FOLLOWING_UPDATED: 'following_updated',
  EMAIL_UPDATED: 'email_updated',
  PASSWORD_UPDATED: 'password_updated',
  ACCOUNT_DELETED: 'account_deleted',
  
  // Shop Events
  PRODUCT_VIEWED: 'product_viewed',
  CART_UPDATED: 'cart_updated',
  PURCHASE_COMPLETED: 'purchase_completed',
  
  // Error Events
  APP_ERROR: 'app_error',
  NETWORK_ERROR: 'network_error',
  API_ERROR: 'api_error',
};

class Analytics {
  constructor() {
    // Initialize Sentry
    Sentry.init({
      dsn: "YOUR_SENTRY_DSN", // Replace with your Sentry DSN
      tracesSampleRate: 1.0,
      enableAutoSessionTracking: true,
    });
  }

  // Log event to both Firebase Analytics and Sentry
  async logEvent(eventName, params = {}) {
    try {
      // Add common parameters
      const eventParams = {
        ...params,
        timestamp: Date.now(),
      };

      // Log to Firebase Analytics
      await analytics().logEvent(eventName, eventParams);

      // Log to Sentry
      Sentry.addBreadcrumb({
        category: params.category || 'general',
        message: eventName,
        data: eventParams,
        level: params.level || 'info',
      });

      if (__DEV__) {
        console.log('📊 Analytics Event:', { eventName, ...eventParams });
      }
    } catch (error) {
      console.error('Failed to log analytics event:', error);
      this.logError(error);
    }
  }

  // Log error to Sentry
  logError(error, context = {}) {
    try {
      Sentry.captureException(error, {
        extra: context,
      });

      // Also log to Firebase Analytics for error tracking
      this.logEvent(EventName.APP_ERROR, {
        category: EventCategory.ERROR,
        error: error.message,
        stack: error.stack,
        ...context,
      });

      if (__DEV__) {
        console.error('🚨 Error logged:', error, context);
      }
    } catch (e) {
      console.error('Failed to log error:', e);
    }
  }

  // Auth Events
  async logSignUp(method, userId) {
    await this.logEvent(EventName.SIGN_UP, {
      category: EventCategory.AUTH,
      method,
      userId,
    });
  }

  async logLogin(method, userId) {
    await this.logEvent(EventName.LOGIN, {
      category: EventCategory.AUTH,
      method,
      userId,
    });
  }

  async logAuthError(error, method) {
    await this.logEvent(EventName.AUTH_ERROR, {
      category: EventCategory.AUTH,
      error: error.message,
      method,
    });
    this.logError(error, { category: EventCategory.AUTH, method });
  }

  // Challenge Events
  async logChallengeCreated(challengeId, challengerUserId, targetUserId) {
    await this.logEvent(EventName.CHALLENGE_CREATED, {
      category: EventCategory.CHALLENGE,
      challengeId,
      challengerUserId,
      targetUserId,
    });
  }

  // Check-in Events
  async logCheckIn(userId, locationId, tricks = []) {
    await this.logEvent(EventName.CHECK_IN_CREATED, {
      category: EventCategory.CHECK_IN,
      userId,
      locationId,
      trickCount: tricks.length,
    });
  }

  // Session Events
  async logSessionCreated(sessionId, hostUserId, locationId) {
    await this.logEvent(EventName.SESSION_CREATED, {
      category: EventCategory.SESSION,
      sessionId,
      hostUserId,
      locationId,
    });
  }

  // Verification Events
  async logVerificationRequest(trickId, userId, verifierUserId) {
    await this.logEvent(EventName.VERIFICATION_REQUESTED, {
      category: EventCategory.VERIFICATION,
      trickId,
      userId,
      verifierUserId,
    });
  }

  // Screen tracking
  async logScreenView(screenName, params = {}) {
    await analytics().logScreenView({
      screen_name: screenName,
      screen_class: screenName,
      ...params,
    });
  }

  // Set user properties
  async setUserProperties(userId, properties = {}) {
    try {
      // Set Firebase Analytics user properties
      await analytics().setUserId(userId);
      Object.entries(properties).forEach(async ([key, value]) => {
        await analytics().setUserProperty(key, value);
      });

      // Set Sentry user
      Sentry.setUser({
        id: userId,
        ...properties,
      });
    } catch (error) {
      console.error('Failed to set user properties:', error);
      this.logError(error);
    }
  }
}

export const analyticsService = new Analytics();
