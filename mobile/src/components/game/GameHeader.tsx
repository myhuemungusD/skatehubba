import { memo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated } from "react-native";
import { useRef, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";

interface GameHeaderProps {
  roundNumber: number;
  paddingTop: number;
  onForfeit: () => void;
  onExit: () => void;
  /** Current player's letter count (0-5) */
  myLetterCount?: number;
  /** Opponent's letter count (0-5) */
  oppLetterCount?: number;
}

/** Stakes escalation message based on game state */
function getStakesMessage(myLetters: number, oppLetters: number): string | null {
  if (myLetters === 4) return "ONE MORE AND YOU'RE OUT";
  if (oppLetters === 4) return "ONE MORE AND THEY'RE OUT";
  if (myLetters === 3 && oppLetters === 3) return "NEXT LETTER DECIDES IT";
  if (myLetters >= 3 || oppLetters >= 3) return "IT'S GETTING SERIOUS";
  return null;
}

/** Color for stakes message */
function getStakesColor(myLetters: number, oppLetters: number): string {
  if (myLetters === 4) return SKATE.colors.blood;
  if (oppLetters === 4) return SKATE.colors.orange;
  return SKATE.colors.gold;
}

export const GameHeader = memo(function GameHeader({
  roundNumber,
  paddingTop,
  onForfeit,
  onExit,
  myLetterCount = 0,
  oppLetterCount = 0,
}: GameHeaderProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const stakesMessage = getStakesMessage(myLetterCount, oppLetterCount);
  const isMatchPoint = myLetterCount === 4 || oppLetterCount === 4;

  // Pulse animation for match point
  useEffect(() => {
    if (isMatchPoint) {
      pulseAnimRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
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
  }, [isMatchPoint, pulseAnim]);

  return (
    <View style={[styles.header, { paddingTop }]}>
      <TouchableOpacity
        accessible
        accessibilityRole="button"
        accessibilityLabel="Forfeit game"
        testID="game-forfeit"
        style={styles.headerButton}
        onPress={onForfeit}
      >
        <Ionicons name="flag" size={24} color={SKATE.colors.blood} />
      </TouchableOpacity>

      <View style={styles.centerContent}>
        <View testID="game-round-badge" style={styles.roundBadge}>
          <Text style={styles.roundText}>ROUND {roundNumber}</Text>
        </View>

        {stakesMessage && (
          <Animated.Text
            style={[
              styles.stakesText,
              { color: getStakesColor(myLetterCount, oppLetterCount) },
              isMatchPoint && { transform: [{ scale: pulseAnim }] },
            ]}
          >
            {stakesMessage}
          </Animated.Text>
        )}
      </View>

      <TouchableOpacity
        accessible
        accessibilityRole="button"
        accessibilityLabel="Exit to challenges"
        style={styles.headerButton}
        onPress={onExit}
      >
        <Ionicons name="close" size={24} color={SKATE.colors.white} />
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SKATE.spacing.lg,
    paddingBottom: SKATE.spacing.md,
    backgroundColor: SKATE.colors.grime,
  },
  headerButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    gap: SKATE.spacing.xs,
  },
  roundBadge: {
    backgroundColor: SKATE.colors.orange,
    paddingHorizontal: SKATE.spacing.lg,
    paddingVertical: SKATE.spacing.sm,
    borderRadius: SKATE.borderRadius.full,
  },
  roundText: {
    color: SKATE.colors.white,
    fontSize: 14,
    fontWeight: "bold",
    letterSpacing: 2,
  },
  stakesText: {
    fontSize: 11,
    fontWeight: "bold",
    letterSpacing: 1.5,
    textAlign: "center",
  },
});
