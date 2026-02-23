import { memo } from "react";
import { View, Text, StyleSheet, Animated, Pressable, Modal } from "react-native";
import { useRef, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import type { GameOverlay } from "@/types";

interface TurnOverlayProps {
  overlay: GameOverlay | null;
  onDismiss: () => void;
  dismissible?: boolean;
}

export const TurnOverlay = memo(function TurnOverlay({
  overlay,
  onDismiss,
  dismissible = true,
}: TurnOverlayProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const letterScaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (overlay) {
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
        <Pressable style={styles.backdropPressable} onPress={dismissible ? onDismiss : undefined}>
          <Animated.View
            style={[styles.content, config.containerStyle, { transform: [{ scale: scaleAnim }] }]}
          >
            {config.icon && (
              <View style={styles.iconContainer}>
                <Ionicons
                  name={config.icon}
                  size={48}
                  color={config.iconColor || SKATE.colors.white}
                />
              </View>
            )}

            <Text style={[styles.title, config.titleStyle]}>{overlay.title}</Text>

            {overlay.subtitle && <Text style={styles.subtitle}>{overlay.subtitle}</Text>}

            {overlay.type === "letter_gained" && overlay.letter && (
              <Animated.View
                style={[styles.letterDisplay, { transform: [{ scale: letterScaleAnim }] }]}
              >
                <Text style={styles.letterText}>{overlay.letter}</Text>
              </Animated.View>
            )}

            {overlay.type === "waiting_opponent" && (
              <View style={styles.loadingContainer}>
                <LoadingDots />
              </View>
            )}

            {dismissible && overlay.autoDismissMs === null && (
              <Text style={styles.dismissHint}>Tap to continue</Text>
            )}
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
});

function LoadingDots() {
  const animations = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
  ]).current;

  useEffect(() => {
    const compositeAnimation = Animated.parallel(
      animations.map((anim, index) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(index * 150),
            Animated.timing(anim, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0.3,
              duration: 300,
              useNativeDriver: true,
            }),
          ])
        )
      )
    );

    compositeAnimation.start();

    // Cleanup: stop animations on unmount
    return () => {
      compositeAnimation.stop();
      animations.forEach((anim) => anim.setValue(0.3));
    };
  }, [animations]);

  return (
    <View style={styles.dotsContainer}>
      {animations.map((anim, i) => (
        <Animated.View key={i} style={[styles.dot, { opacity: anim }]} />
      ))}
    </View>
  );
}

const OVERLAY_CONFIGS: Record<
  GameOverlay["type"],
  {
    icon?: keyof typeof Ionicons.glyphMap;
    iconColor?: string;
    containerStyle?: object;
    titleStyle?: object;
  }
> = {
  turn_start: {
    icon: "flash",
    iconColor: SKATE.colors.neon,
    containerStyle: { borderColor: SKATE.colors.neon },
    titleStyle: { color: SKATE.colors.neon },
  },
  waiting_opponent: {
    icon: "hourglass",
    iconColor: SKATE.colors.lightGray,
    containerStyle: { borderColor: SKATE.colors.gray },
    titleStyle: { color: SKATE.colors.lightGray },
  },
  letter_gained: {
    icon: "close-circle",
    iconColor: SKATE.colors.blood,
    containerStyle: { borderColor: SKATE.colors.blood },
    titleStyle: { color: SKATE.colors.blood },
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
