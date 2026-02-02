import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
  Modal,
} from "react-native";
import { useRef, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import type { GameOverlay, SkateLetter } from "@/types";

interface TurnOverlayProps {
  /** The overlay configuration to display */
  overlay: GameOverlay | null;
  /** Callback when overlay is dismissed */
  onDismiss: () => void;
  /** Whether the overlay can be manually dismissed */
  dismissible?: boolean;
}

/**
 * Full-screen overlay for game state announcements.
 * Uses dramatic Baker-era aesthetics with heavy typography.
 */
export function TurnOverlay({
  overlay,
  onDismiss,
  dismissible = true,
}: TurnOverlayProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const letterScaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (overlay) {
      // Entrance animation
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 6,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();

      // Letter gained animation
      if (overlay.type === "letter_gained" && overlay.letter) {
        Animated.sequence([
          Animated.delay(300),
          Animated.spring(letterScaleAnim, {
            toValue: 1,
            friction: 4,
            tension: 50,
            useNativeDriver: true,
          }),
        ]).start();
      }
    } else {
      // Reset animations
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.8);
      letterScaleAnim.setValue(0);
    }
  }, [overlay, fadeAnim, scaleAnim, letterScaleAnim]);

  if (!overlay) return null;

  const config = OVERLAY_CONFIGS[overlay.type];

  return (
    <Modal
      visible={true}
      transparent
      animationType="none"
      onRequestClose={dismissible ? onDismiss : undefined}
    >
      <Animated.View
        style={[styles.backdrop, { opacity: fadeAnim }]}
        accessible
        accessibilityRole="alert"
        accessibilityLabel={`${overlay.title}. ${overlay.subtitle || ""}`}
      >
        <Pressable
          style={styles.backdropPressable}
          onPress={dismissible ? onDismiss : undefined}
        >
          <Animated.View
            style={[
              styles.content,
              config.containerStyle,
              {
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            {/* Icon */}
            {config.icon && (
              <View style={[styles.iconContainer, config.iconContainerStyle]}>
                <Ionicons
                  name={config.icon}
                  size={config.iconSize || 48}
                  color={config.iconColor || SKATE.colors.white}
                />
              </View>
            )}

            {/* Title */}
            <Text style={[styles.title, config.titleStyle]}>{overlay.title}</Text>

            {/* Subtitle */}
            {overlay.subtitle && (
              <Text style={[styles.subtitle, config.subtitleStyle]}>
                {overlay.subtitle}
              </Text>
            )}

            {/* Letter Display (for letter_gained) */}
            {overlay.type === "letter_gained" && overlay.letter && (
              <Animated.View
                style={[
                  styles.letterDisplay,
                  { transform: [{ scale: letterScaleAnim }] },
                ]}
              >
                <Text style={styles.letterText}>{overlay.letter}</Text>
              </Animated.View>
            )}

            {/* Loading indicator for waiting states */}
            {(overlay.type === "uploading" ||
              overlay.type === "waiting_opponent") && (
              <View style={styles.loadingContainer}>
                <LoadingDots />
              </View>
            )}

            {/* Dismiss hint */}
            {dismissible && overlay.autoDismissMs === null && (
              <Text style={styles.dismissHint}>Tap to continue</Text>
            )}
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

/** Animated loading dots */
function LoadingDots() {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animateDot = (dot: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.3,
            duration: 300,
            useNativeDriver: true,
          }),
        ])
      );
    };

    Animated.parallel([
      animateDot(dot1, 0),
      animateDot(dot2, 150),
      animateDot(dot3, 300),
    ]).start();
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.dotsContainer}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View
          key={i}
          style={[styles.dot, { opacity: dot }]}
        />
      ))}
    </View>
  );
}

// Configuration for each overlay type
const OVERLAY_CONFIGS: Record<
  GameOverlay["type"],
  {
    icon?: keyof typeof Ionicons.glyphMap;
    iconSize?: number;
    iconColor?: string;
    containerStyle?: object;
    iconContainerStyle?: object;
    titleStyle?: object;
    subtitleStyle?: object;
  }
> = {
  turn_start: {
    icon: "flash",
    iconColor: SKATE.colors.neon,
    containerStyle: { borderColor: SKATE.colors.neon },
    titleStyle: { color: SKATE.colors.neon },
  },
  recording: {
    icon: "videocam",
    iconColor: SKATE.colors.blood,
    containerStyle: { borderColor: SKATE.colors.blood },
    iconContainerStyle: { backgroundColor: SKATE.colors.blood },
  },
  uploading: {
    icon: "cloud-upload",
    iconColor: SKATE.colors.orange,
    containerStyle: { borderColor: SKATE.colors.orange },
  },
  waiting_opponent: {
    icon: "hourglass",
    iconColor: SKATE.colors.lightGray,
    containerStyle: { borderColor: SKATE.colors.gray },
    titleStyle: { color: SKATE.colors.lightGray },
  },
  judging: {
    icon: "eye",
    iconColor: SKATE.colors.gold,
    containerStyle: { borderColor: SKATE.colors.gold },
    titleStyle: { color: SKATE.colors.gold },
  },
  letter_gained: {
    icon: "close-circle",
    iconColor: SKATE.colors.blood,
    containerStyle: { borderColor: SKATE.colors.blood },
    titleStyle: { color: SKATE.colors.blood },
  },
  round_complete: {
    icon: "checkmark-circle",
    iconColor: SKATE.colors.neon,
    containerStyle: { borderColor: SKATE.colors.neon },
    titleStyle: { color: SKATE.colors.neon },
  },
  game_over: {
    icon: "trophy",
    iconSize: 64,
    iconColor: SKATE.colors.gold,
    containerStyle: {
      borderColor: SKATE.colors.gold,
      borderWidth: 4,
    },
    titleStyle: { color: SKATE.colors.gold, fontSize: 36 },
  },
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  backdropPressable: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    padding: SKATE.spacing.xl,
  },
  content: {
    backgroundColor: SKATE.colors.ink,
    borderWidth: 3,
    borderColor: SKATE.colors.white,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.xxl,
    alignItems: "center",
    minWidth: 280,
    maxWidth: 340,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: SKATE.colors.grime,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: SKATE.spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: SKATE.colors.white,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: SKATE.spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    color: SKATE.colors.lightGray,
    textAlign: "center",
    marginBottom: SKATE.spacing.md,
  },
  letterDisplay: {
    width: 100,
    height: 120,
    backgroundColor: SKATE.colors.blood,
    borderRadius: SKATE.borderRadius.md,
    justifyContent: "center",
    alignItems: "center",
    marginTop: SKATE.spacing.lg,
    shadowColor: SKATE.colors.blood,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  letterText: {
    fontSize: 72,
    fontWeight: "bold",
    color: SKATE.colors.white,
    fontFamily: "monospace",
  },
  loadingContainer: {
    marginTop: SKATE.spacing.lg,
  },
  dotsContainer: {
    flexDirection: "row",
    gap: SKATE.spacing.sm,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: SKATE.colors.white,
  },
  dismissHint: {
    marginTop: SKATE.spacing.xl,
    fontSize: 12,
    color: SKATE.colors.gray,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
});

export default TurnOverlay;
