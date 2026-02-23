import { memo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";

interface GameHeaderProps {
  roundNumber: number;
  paddingTop: number;
  onForfeit: () => void;
  onExit: () => void;
}

export const GameHeader = memo(function GameHeader({
  roundNumber,
  paddingTop,
  onForfeit,
  onExit,
}: GameHeaderProps) {
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

      <View testID="game-round-badge" style={styles.roundBadge}>
        <Text style={styles.roundText}>ROUND {roundNumber}</Text>
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
});
