const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const firestore = admin.firestore();
const messaging = admin.messaging();

async function getUserData(userId) {
  try {
    const userDoc = await firestore.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      console.log('No user found with ID:', userId);
      return null;
    }
    return userDoc.data();
  } catch (error) {
    console.error('Error fetching user data:', error);
    return null;
  }
}

async function sendPushNotificationToUser(userId, title, body, data = {}) {
  try {
    // 1. Get user's data from Firestore
    const userData = await getUserData(userId);
    
    if (!userData) {
      console.log('User not found:', userId);
      return null;
    }

    const { fcmToken, name } = userData;

    if (!fcmToken) {
      console.log('No FCM token for user:', name || userId);
      return null;
    }

    // 2. Build the message payload with user context
    const message = {
      notification: {
        title,
        body,
      },
      data: {
        ...data,
        userId,
        userName: name || '',
      },
      token: fcmToken,
    };

    // 3. Send the notification
    const response = await messaging.send(message);
    console.log('Successfully sent message to', name || userId, ':', response);
    
    // 4. Return success with context
    return {
      success: true,
      messageId: response,
      user: {
        id: userId,
        name: name || 'Unknown',
      }
    };
  } catch (error) {
    console.error('Error sending message:', error);
    return {
      success: false,
      error: error.message,
      user: {
        id: userId
      }
    };
  }
}

module.exports = {
  admin,
  firestore,
  messaging,
  sendPushNotificationToUser
};
