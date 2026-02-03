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

export function LetterIndicator({
  letters,
  playerName,
  isCurrentPlayer,
  isAttacker,
  layout = "horizontal",
}: LetterIndicatorProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  // Attacker pulse effect with proper cleanup
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
        { transform: [{ scale: pulseAnim }] },
      ]}
    >
      <View style={[styles.nameContainer, isVertical && styles.nameContainerVertical]}>
        <Text
          style={[
            styles.playerName,
            isCurrentPlayer && styles.playerNameCurrent,
          ]}
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
        {SKATE_LETTERS.map((letter) => {
          const hasLetter = letters.includes(letter);

          return (
            <View
              key={letter}
              style={[
                styles.letterBox,
                hasLetter && styles.letterBoxActive,
              ]}
            >
              <Text
                style={[
                  styles.letterText,
                  hasLetter && styles.letterTextActive,
                ]}
              >
                {letter}
              </Text>
            </View>
          );
        })}
      </View>

      {letters.length === 5 && (
        <View style={styles.eliminatedBanner}>
          <Text style={styles.eliminatedText}>ELIMINATED</Text>
        </View>
      )}
    </Animated.View>
  );
}

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
  letterBoxActive: {
    backgroundColor: SKATE.colors.blood,
    borderColor: SKATE.colors.blood,
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
  eliminatedBanner: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    transform: [{ translateY: -12 }, { rotate: "-5deg" }],
    backgroundColor: SKATE.colors.blood,
    paddingVertical: SKATE.spacing.xs,
  },
  eliminatedText: {
    color: SKATE.colors.white,
    fontWeight: "bold",
    fontSize: 14,
    textAlign: "center",
    letterSpacing: 2,
  },
});

export default LetterIndicator;
