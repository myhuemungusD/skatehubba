import { memo } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { useRef, useEffect } from "react";
import { SKATE } from "@/theme";
import type { SkateLetter } from "@/types";
import { SKATE_LETTERS } from "@/types";

interface LetterIndicatorProps {
  letters: SkateLetter[];
  playerName: string;
  isCurrentPlayer: boolean;
  isAttacker: boolean;
  layout?: "horizontal" | "vertical";
}

/** Color escalation: green → yellow → orange → red based on letter count */
function getLetterColor(letterCount: number): string {
  switch (letterCount) {
    case 0:
      return SKATE.colors.neon; // green — clean
    case 1:
      return "#22c55e"; // green
    case 2:
      return "#eab308"; // yellow
    case 3:
      return SKATE.colors.orange; // orange
    case 4:
    case 5:
      return SKATE.colors.blood; // red — match point / eliminated
    default:
      return SKATE.colors.neon;
  }
}

/** Status label based on letter count */
function getStatusLabel(letterCount: number): string | null {
  if (letterCount === 0) return "Clean";
  if (letterCount === 4) return "MATCH POINT";
  if (letterCount === 5) return "S.K.A.T.E.";
  return null;
}

export const LetterIndicator = memo(function LetterIndicator({
  letters,
  playerName,
  isCurrentPlayer,
  isAttacker,
  layout = "horizontal",
}: LetterIndicatorProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const pulseAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const glowAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const isMatchPoint = letters.length === 4;
  const escalationColor = getLetterColor(letters.length);
  const statusLabel = getStatusLabel(letters.length);

  // Attacker pulse effect
  useEffect(() => {
    if (isAttacker) {
      pulseAnimRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulseAnimRef.current.start();
    }

    return () => {
      if (pulseAnimRef.current) {
        pulseAnimRef.current.stop();
        pulseAnimRef.current = null;
      }
      pulseAnim.setValue(1);
    };
  }, [isAttacker, pulseAnim]);

  // Match point glow effect
  useEffect(() => {
    if (isMatchPoint) {
      glowAnimRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 0.8,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0.3,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      glowAnimRef.current.start();
    }

    return () => {
      if (glowAnimRef.current) {
        glowAnimRef.current.stop();
        glowAnimRef.current = null;
      }
      glowAnim.setValue(0.3);
    };
  }, [isMatchPoint, glowAnim]);

  const isVertical = layout === "vertical";

  return (
    <Animated.View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${playerName} has ${letters.length} letters: ${letters.join(", ") || "none"}`}
      style={[
        styles.container,
        isVertical && styles.containerVertical,
        isCurrentPlayer && styles.containerCurrent,
        isMatchPoint && {
          borderColor: SKATE.colors.blood,
          shadowColor: SKATE.colors.blood,
          shadowOpacity: 0.6,
          shadowRadius: 12,
          elevation: 8,
        },
        { transform: [{ scale: pulseAnim }] },
      ]}
    >
      <View style={[styles.nameContainer, isVertical && styles.nameContainerVertical]}>
        <Text
          style={[styles.playerName, isCurrentPlayer && styles.playerNameCurrent]}
          numberOfLines={1}
        >
          {playerName}
        </Text>
        {isAttacker && (
          <View style={styles.attackerBadge}>
            <Text style={styles.attackerBadgeText}>SET</Text>
          </View>
        )}
      </View>

      <View style={[styles.lettersRow, isVertical && styles.lettersRowVertical]}>
        {SKATE_LETTERS.map((letter, index) => {
          const hasLetter = letters.includes(letter);
          const letterColor = hasLetter ? getLetterColor(index + 1) : undefined;

          return (
            <View
              key={letter}
              style={[
                styles.letterBox,
                hasLetter && { backgroundColor: letterColor, borderColor: letterColor },
              ]}
            >
              <Text style={[styles.letterText, hasLetter && styles.letterTextActive]}>
                {letter}
              </Text>
            </View>
          );
        })}
      </View>

      {statusLabel && (
        <View
          style={[
            styles.statusBanner,
            isMatchPoint && styles.matchPointBanner,
            letters.length === 5 && styles.eliminatedBanner,
          ]}
        >
          <Text
            style={[
              styles.statusText,
              { color: escalationColor },
              letters.length === 5 && styles.eliminatedText,
            ]}
          >
            {statusLabel}
          </Text>
        </View>
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    padding: SKATE.spacing.md,
    borderRadius: SKATE.borderRadius.md,
    backgroundColor: SKATE.colors.grime,
    borderWidth: 2,
    borderColor: SKATE.colors.darkGray,
  },
  containerVertical: {
    alignItems: "center",
  },
  containerCurrent: {
    borderColor: SKATE.colors.neon,
    shadowColor: SKATE.colors.neon,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  nameContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SKATE.spacing.sm,
    gap: SKATE.spacing.sm,
  },
  nameContainerVertical: {
    justifyContent: "center",
  },
  playerName: {
    color: SKATE.colors.lightGray,
    fontWeight: "600",
    fontSize: 14,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  playerNameCurrent: {
    color: SKATE.colors.white,
  },
  attackerBadge: {
    backgroundColor: SKATE.colors.orange,
    paddingHorizontal: SKATE.spacing.sm,
    paddingVertical: 2,
    borderRadius: SKATE.borderRadius.sm,
  },
  attackerBadgeText: {
    color: SKATE.colors.white,
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  lettersRow: {
    flexDirection: "row",
    gap: SKATE.spacing.xs,
  },
  lettersRowVertical: {
    justifyContent: "center",
  },
  letterBox: {
    width: 36,
    height: 42,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: SKATE.colors.ink,
    borderWidth: 2,
    borderColor: SKATE.colors.darkGray,
    borderRadius: SKATE.borderRadius.sm,
  },
  letterText: {
    fontWeight: "bold",
    fontSize: 20,
    color: SKATE.colors.darkGray,
    fontFamily: "monospace",
  },
  letterTextActive: {
    color: SKATE.colors.white,
  },
  statusBanner: {
    marginTop: SKATE.spacing.xs,
    alignItems: "center",
  },
  matchPointBanner: {
    paddingVertical: SKATE.spacing.xs,
  },
  eliminatedBanner: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    transform: [{ translateY: -12 }, { rotate: "-5deg" }],
    backgroundColor: SKATE.colors.blood,
    paddingVertical: SKATE.spacing.xs,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  eliminatedText: {
    color: SKATE.colors.white,
    fontSize: 14,
    textAlign: "center",
    letterSpacing: 2,
  },
});

export default LetterIndicator;
