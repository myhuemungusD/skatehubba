import { View, Text, StyleSheet, Animated } from "react-native";
import { useEffect, useRef } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReconnectionStatus } from "@/store/networkStore";
import { SKATE } from "@/theme";

/**
 * Offline banner that shows when network connectivity is lost.
 * Displays a countdown timer during the 120-second reconnection window.
 * Shows an error state when the reconnection window expires.
 */
export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const { isConnected, isReconnecting, secondsRemaining, expired } = useReconnectionStatus();
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Slide animation for showing/hiding banner
  useEffect(() => {
    const shouldShow = !isConnected || expired;

    Animated.spring(slideAnim, {
      toValue: shouldShow ? 0 : -100,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();
  }, [isConnected, expired, slideAnim]);

  // Pulse animation for urgent states
  useEffect(() => {
    if (isReconnecting && secondsRemaining <= 30) {
      const pulse = Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]);

      const loopRef = Animated.loop(pulse);
      loopRef.start();

      return () => {
        loopRef.stop();
        pulseAnim.setValue(1);
      };
    }
  }, [isReconnecting, secondsRemaining, pulseAnim]);

  // Don't render if connected and not expired
  if (isConnected && !expired) {
    return null;
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isUrgent = secondsRemaining <= 30 && !expired;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 8,
          transform: [{ translateY: slideAnim }, { scale: pulseAnim }],
          backgroundColor: expired
            ? SKATE.colors.blood
            : isUrgent
              ? SKATE.colors.orange
              : SKATE.colors.darkGray,
        },
      ]}
    >
      <View style={styles.content}>
        <Ionicons
          name={expired ? "close-circle" : "cloud-offline"}
          size={20}
          color={SKATE.colors.white}
        />

        <View style={styles.textContainer}>
          {expired ? (
            <>
              <Text style={styles.title}>Connection Lost</Text>
              <Text style={styles.subtitle}>
                The game will be forfeited. Please check your connection.
              </Text>
            </>
          ) : isReconnecting ? (
            <>
              <Text style={styles.title}>Reconnecting...</Text>
              <Text style={styles.subtitle}>
                {formatTime(secondsRemaining)} remaining to reconnect
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.title}>You're Offline</Text>
              <Text style={styles.subtitle}>Waiting for connection...</Text>
            </>
          )}
        </View>

        {isReconnecting && !expired && (
          <View style={styles.timerContainer}>
            <Text style={[styles.timer, isUrgent && styles.timerUrgent]}>
              {formatTime(secondsRemaining)}
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingHorizontal: SKATE.spacing.lg,
    paddingBottom: SKATE.spacing.md,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: SKATE.colors.white,
    fontSize: 14,
    fontWeight: "bold",
  },
  subtitle: {
    color: SKATE.colors.white,
    fontSize: 12,
    opacity: 0.9,
  },
  timerContainer: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    paddingHorizontal: SKATE.spacing.md,
    paddingVertical: SKATE.spacing.xs,
    borderRadius: SKATE.borderRadius.sm,
  },
  timer: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
    fontVariant: ["tabular-nums"],
  },
  timerUrgent: {
    color: SKATE.colors.white,
  },
});
