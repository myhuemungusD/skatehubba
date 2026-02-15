/**
 * Push Notification Hook
 *
 * Registers for push notifications when a user is authenticated,
 * handles incoming notifications, and navigates on tap.
 */

import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/store/authStore";
import { registerForPushNotifications, sendPushTokenToServer } from "@/lib/pushNotifications";

/**
 * Initialize push notification registration and response handling.
 * Call once at the app root level.
 */
export function usePushNotifications() {
  const user = useAuthStore((state) => state.user);
  const router = useRouter();
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const hasRegistered = useRef(false);

  // Register push token when user authenticates
  useEffect(() => {
    if (!user || hasRegistered.current) return;

    let cancelled = false;

    (async () => {
      const token = await registerForPushNotifications();
      if (token && !cancelled) {
        await sendPushTokenToServer(token);
        hasRegistered.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Reset registration flag on sign-out so re-login re-registers
  useEffect(() => {
    if (!user) {
      hasRegistered.current = false;
    }
  }, [user]);

  // Handle notification taps — navigate to relevant screen
  useEffect(() => {
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (!data) return;

      const type = data.type as string | undefined;
      const gameId = data.gameId as string | undefined;
      const challengeId = data.challengeId as string | undefined;

      if (
        gameId &&
        (type === "your_turn" || type === "game_your_turn" || type === "vote_reminder")
      ) {
        router.push(`/game/${gameId}`);
      } else if (
        challengeId &&
        (type === "challenge" || type === "challenge_received" || type === "quick_match")
      ) {
        router.push(`/challenge/${challengeId}`);
      } else if (gameId && (type === "game_over" || type === "game_game_over")) {
        router.push(`/game/${gameId}`);
      }
    });

    return () => {
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [router]);
}
