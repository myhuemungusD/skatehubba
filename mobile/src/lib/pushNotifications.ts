/**
 * Push Notification Service
 *
 * Handles Expo push notification registration, permission management,
 * and notification channel configuration for FCM delivery.
 */

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { apiRequest } from "./queryClient";

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Register for push notifications and return the Expo push token.
 * Returns null if permissions are denied or device is not physical.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log("[Push] Skipping registration — not a physical device");
    }
    return null;
  }

  // Check existing permission status
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permission if not already granted
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log("[Push] Permission not granted:", finalStatus);
    }
    return null;
  }

  // Set up Android notification channel
  if (Platform.OS === "android") {
    await setupAndroidChannels();
  }

  // Get the Expo push token
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    return tokenData.data;
  } catch (error) {
    if (__DEV__) {
      console.error("[Push] Failed to get push token:", error);
    }
    return null;
  }
}

/**
 * Send the push token to the backend for storage.
 */
export async function sendPushTokenToServer(token: string): Promise<void> {
  try {
    await apiRequest("/api/notifications/push-token", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  } catch (error) {
    if (__DEV__) {
      console.error("[Push] Failed to register token with server:", error);
    }
  }
}

/**
 * Remove the push token from the server (call on sign-out).
 */
export async function removePushTokenFromServer(): Promise<void> {
  try {
    await apiRequest("/api/notifications/push-token", {
      method: "DELETE",
    });
  } catch {
    // Non-critical: token will be overwritten on next login
  }
}

/**
 * Set up Android notification channels for different notification types.
 */
async function setupAndroidChannels(): Promise<void> {
  await Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#ff6600",
  });

  await Notifications.setNotificationChannelAsync("game", {
    name: "Game Events",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#ff6600",
    sound: "default",
  });

  await Notifications.setNotificationChannelAsync("challenge", {
    name: "Challenges",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 500, 200, 500],
    lightColor: "#ff6600",
    sound: "default",
  });
}
