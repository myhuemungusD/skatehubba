import { memo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { SKATE } from "@/theme";

interface WaitingForOpponentViewProps {
  opponentName: string;
  onCancel: () => void;
}

export const WaitingForOpponentView = memo(function WaitingForOpponentView({
  opponentName,
  onCancel,
}: WaitingForOpponentViewProps) {
  return (
    <View style={styles.container}>
      <View style={styles.waitingCard}>
        <ActivityIndicator size="large" color={SKATE.colors.orange} />
        <Text testID="game-waiting-opponent" style={styles.waitingTitle}>
          WAITING FOR OPPONENT
        </Text>
        <Text style={styles.waitingSubtitle}>{opponentName} hasn't accepted yet...</Text>

        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Cancel the challenge"
          style={styles.cancelButton}
          onPress={onCancel}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
  },
  waitingCard: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SKATE.spacing.xxl,
  },
  waitingTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: SKATE.colors.white,
    marginTop: SKATE.spacing.xl,
    letterSpacing: 2,
  },
  waitingSubtitle: {
    fontSize: 16,
    color: SKATE.colors.lightGray,
    marginTop: SKATE.spacing.sm,
    marginBottom: SKATE.spacing.xxl,
  },
  cancelButton: {
    backgroundColor: SKATE.colors.darkGray,
    paddingHorizontal: SKATE.spacing.xxl,
    paddingVertical: SKATE.spacing.md,
    borderRadius: SKATE.borderRadius.md,
    minHeight: SKATE.accessibility.minimumTouchTarget,
    justifyContent: "center",
  },
  cancelButtonText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "600",
  },
});
