import messaging from '@react-native-firebase/messaging';
import firestore from '@react-native-firebase/firestore';
import { Platform } from 'react-native';
import { messaging as adminMessaging } from './firebase-admin';

// Initialize Firebase Messaging
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Message handled in the background!', remoteMessage);
});

// Notification types
export const NOTIFICATION_TYPES = {
  CHALLENGE: 'challenge',
  CHECK_IN: 'check_in',
  SESSION_INVITE: 'session_invite',
  VERIFICATION: 'verification',
  ACHIEVEMENT: 'achievement',
};

// Route mapping for deep linking
export const NOTIFICATION_ROUTES = {
  [NOTIFICATION_TYPES.CHALLENGE]: 'Challenges',
  [NOTIFICATION_TYPES.CHECK_IN]: 'Checkins',
  [NOTIFICATION_TYPES.SESSION_INVITE]: 'Sessions',
  [NOTIFICATION_TYPES.VERIFICATION]: 'Verify',
  [NOTIFICATION_TYPES.ACHIEVEMENT]: 'Profile',
};

// Register for push notifications
export async function registerForPushNotifications(uid) {
  try {
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (!enabled) {
      throw new Error('Permission to send notifications was denied');
    }

    // Get FCM token
    const token = await messaging().getToken();
    
    if (token) {
      // Save token to user's profile in Firestore
      await firestore().collection('users').doc(uid).update({
        fcmToken: token,
      });
      console.log('FCM Token stored in Firestore:', token);
    }

    // Configure Android channel
    if (Platform.OS === 'android') {
      await messaging().createChannel({
        id: 'default',
        name: 'Default Channel',
        importance: messaging.Android.Importance.MAX,
        vibration: true,
      });
    }

    // Listen for token refresh
    messaging().onTokenRefresh(async (newToken) => {
      if (uid) {
        await firestore().collection('users').doc(uid).update({
          fcmToken: newToken,
        });
      }
    });

    return token;
  } catch (error) {
    console.error('Failed to register for push notifications:', error);
    return null;
  }
}

export async function sendLocalNotification(title, body, data = {}, options = {}) {
  try {
    await messaging().sendMessage({
      data: {
        ...data,
        title,
        body,
        ...options,
      },
    });
  } catch (error) {
    console.error('Failed to send local notification:', error);
  }
}

// Cancel a specific notification
export async function cancelNotification(notificationId) {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    console.error('Failed to cancel notification:', error);
  }
}

// Cancel all notifications
export async function cancelAllNotifications() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('Failed to cancel all notifications:', error);
  }
}

// Get notification settings
export async function getNotificationSettings(userId) {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    return userDoc.data()?.notificationSettings || getDefaultNotificationSettings();
  } catch (error) {
    console.error('Failed to get notification settings:', error);
    return getDefaultNotificationSettings();
  }
}

// Update notification settings
export async function updateNotificationSettings(userId, settings) {
  try {
    await setDoc(
      doc(db, 'users', userId),
      { notificationSettings: settings },
      { merge: true }
    );
    return true;
  } catch (error) {
    console.error('Failed to update notification settings:', error);
    return false;
  }
}

// Default notification settings
export function getDefaultNotificationSettings() {
  return {
    challenges: true,
    checkIns: true,
    sessionInvites: true,
    verification: true,
    achievements: true,
    sound: true,
    vibration: true,
  };
}

import { sendPushNotificationToUser } from './firebase-admin';

// Send push notification using Firebase Admin SDK
export async function sendPushNotification(userId, title, body, data = {}) {
  try {
    // Add click action for proper navigation
    const notificationData = {
      ...data,
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
    };

    const response = await sendPushNotificationToUser(userId, title, body, notificationData);
    return response;
  } catch (error) {
    console.error('Error sending push notification:', error);
    throw error;
  }
}

// Example notification templates
export const NOTIFICATION_TEMPLATES = {
  newChallenge: (challengeData) => ({
    title: 'New Skating Challenge!',
    body: `${challengeData.creatorName} challenged you to: ${challengeData.title}`,
    data: {
      type: NOTIFICATION_TYPES.CHALLENGE,
      challengeId: challengeData.id,
    },
  }),
  checkInNearby: (location) => ({
    title: 'Skaters Nearby!',
    body: `Skaters are active at ${location.name}`,
    data: {
      type: NOTIFICATION_TYPES.CHECK_IN,
      locationId: location.id,
    },
  }),
  verificationComplete: (verified) => ({
    title: 'Trick Verification Result',
    body: verified ? 'Your trick was verified! 🎉' : 'Your trick needs another attempt',
    data: {
      type: NOTIFICATION_TYPES.VERIFICATION,
    },
  }),
};

// Common notification types
export const NotificationType = {
  CHALLENGE: 'challenge',
  MESSAGE: 'message',
  FRIEND_REQUEST: 'friend_request',
  ACHIEVEMENT: 'achievement',
};

// Helper functions for common notifications
export const sendAchievementNotification = async (userId, achievementTitle) => {
  return sendPushNotification(
    userId,
    'New Achievement!',
    `You've unlocked: ${achievementTitle}`,
    {
      type: NotificationType.ACHIEVEMENT,
      achievement: achievementTitle,
    }
  );
};

// Send notification to multiple users
export const sendBatchNotification = async (userIds, title, body, data = {}) => {
  const results = await Promise.all(
    userIds.map(userId => 
      sendPushNotification(userId, title, body, data)
        .catch(error => ({
          success: false,
          error: error.message,
          user: { id: userId }
        }))
    )
  );

  // Summarize results
  const summary = results.reduce((acc, result) => {
    if (result.success) {
      acc.successful.push(result.user);
    } else {
      acc.failed.push({
        user: result.user,
        error: result.error
      });
    }
    return acc;
  }, { successful: [], failed: [] });

  return {
    totalAttempted: userIds.length,
    successCount: summary.successful.length,
    failureCount: summary.failed.length,
    successful: summary.successful,
    failed: summary.failed
  };
};

// Enhanced notification helpers with user context
export const sendChallengeNotification = async (challengerUserId, targetUserId, challengeData) => {
  const challenger = await getUserData(challengerUserId);
  if (!challenger) return null;

  return sendPushNotification(
    targetUserId,
    'New Skate Challenge!',
    `${challenger.name} challenged you: ${challengeData.title}`,
    {
      type: NotificationType.CHALLENGE,
      challengeId: challengeData.id,
      challengerId: challengerUserId,
      challengerName: challenger.name
    }
  );
};

export const sendMessageNotification = async (senderUserId, receiverUserId, messageText) => {
  const sender = await getUserData(senderUserId);
  if (!sender) return null;

  const messagePreview = messageText.length > 50 
    ? `${messageText.substring(0, 47)}...` 
    : messageText;

  return sendPushNotification(
    receiverUserId,
    `Message from ${sender.name}`,
    messagePreview,
    {
      type: NotificationType.MESSAGE,
      senderId: senderUserId,
      senderName: sender.name,
      messageId: Date.now().toString()
    }
  );
};

export const sendFriendRequestNotification = async (requesterUserId, targetUserId) => {
  const requester = await getUserData(requesterUserId);
  if (!requester) return null;

  return sendPushNotification(
    targetUserId,
    'New Friend Request',
    `${requester.name} wants to connect with you!`,
    {
      type: NotificationType.FRIEND_REQUEST,
      requesterId: requesterUserId,
      requesterName: requester.name
    }
  );
};

// Example usage of batch notifications
export const notifyAllFriends = async (userId, title, body, data = {}) => {
  try {
    // Get user's friends list (assuming a friends subcollection)
    const friendsSnapshot = await firestore
      .collection('users')
      .doc(userId)
      .collection('friends')
      .get();

    const friendIds = friendsSnapshot.docs.map(doc => doc.id);
    
    if (friendIds.length === 0) {
      return {
        success: true,
        message: 'No friends to notify',
        notificationsSent: 0
      };
    }

    return sendBatchNotification(friendIds, title, body, data);
  } catch (error) {
    console.error('Error notifying friends:', error);
    throw error;
  }
};
