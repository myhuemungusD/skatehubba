import { View, Text, StyleSheet, Animated } from "react-native";
import { useRef, useEffect } from "react";
import { SKATE } from "@/theme";
import type { SkateLetter } from "@/types";
import { SKATE_LETTERS } from "@/types";

interface LetterIndicatorProps {
  /** Letters the player has accumulated */
  letters: SkateLetter[];
  /** Player's display name */
  playerName: string;
  /** Whether this is the current player (affects styling) */
  isCurrentPlayer: boolean;
  /** Whether this player is currently attacking */
  isAttacker: boolean;
  /** Size variant */
  size?: "small" | "medium" | "large";
  /** Layout direction */
  layout?: "horizontal" | "vertical";
  /** Recently gained letter (for animation) */
  newLetter?: SkateLetter | null;
}

/**
 * Displays the S-K-A-T-E letter status for a player.
 * Shows which letters have been accumulated with Baker-era raw aesthetics.
 */
export function LetterIndicator({
  letters,
  playerName,
  isCurrentPlayer,
  isAttacker,
  size = "medium",
  layout = "horizontal",
  newLetter = null,
}: LetterIndicatorProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const letterAnims = useRef(
    SKATE_LETTERS.map(() => new Animated.Value(1))
  ).current;

  // Pulse animation for new letter
  useEffect(() => {
    if (newLetter) {
      const letterIndex = SKATE_LETTERS.indexOf(newLetter);
      if (letterIndex !== -1) {
        Animated.sequence([
          Animated.timing(letterAnims[letterIndex], {
            toValue: 1.4,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.spring(letterAnims[letterIndex], {
            toValue: 1,
            friction: 3,
            tension: 40,
            useNativeDriver: true,
          }),
        ]).start();
      }
    }
  }, [newLetter, letterAnims]);

  // Attacker pulse effect
  useEffect(() => {
    if (isAttacker) {
      Animated.loop(
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
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isAttacker, pulseAnim]);

  const sizeStyles = SIZE_CONFIGS[size];
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
            sizeStyles.nameStyle,
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
        {SKATE_LETTERS.map((letter, index) => {
          const hasLetter = letters.includes(letter);
          const isNew = newLetter === letter;

          return (
            <Animated.View
              key={letter}
              style={[
                styles.letterBox,
                sizeStyles.letterBox,
                hasLetter && styles.letterBoxActive,
                isNew && styles.letterBoxNew,
                { transform: [{ scale: letterAnims[index] }] },
              ]}
            >
              <Text
                style={[
                  styles.letterText,
                  sizeStyles.letterText,
                  hasLetter && styles.letterTextActive,
                  isNew && styles.letterTextNew,
                ]}
              >
                {letter}
              </Text>
            </Animated.View>
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

const SIZE_CONFIGS = {
  small: {
    letterBox: {
      width: 24,
      height: 28,
    },
    letterText: {
      fontSize: 14,
    },
    nameStyle: {
      fontSize: 12,
    },
  },
  medium: {
    letterBox: {
      width: 36,
      height: 42,
    },
    letterText: {
      fontSize: 20,
    },
    nameStyle: {
      fontSize: 14,
    },
  },
  large: {
    letterBox: {
      width: 48,
      height: 56,
    },
    letterText: {
      fontSize: 28,
    },
    nameStyle: {
      fontSize: 18,
    },
  },
};

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
  letterBoxNew: {
    borderColor: SKATE.colors.gold,
    shadowColor: SKATE.colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 6,
  },
  letterText: {
    fontWeight: "bold",
    color: SKATE.colors.darkGray,
    fontFamily: "monospace",
  },
  letterTextActive: {
    color: SKATE.colors.white,
  },
  letterTextNew: {
    color: SKATE.colors.gold,
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
