import { memo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";

interface ChallengeReceivedViewProps {
  challengerName: string;
  onAccept: () => void;
  onDecline: () => void;
  isAccepting: boolean;
}

export const ChallengeReceivedView = memo(function ChallengeReceivedView({
  challengerName,
  onAccept,
  onDecline,
  isAccepting,
}: ChallengeReceivedViewProps) {
  return (
    <View style={styles.container}>
      <View style={styles.waitingCard}>
        <Ionicons name="flash" size={48} color={SKATE.colors.orange} />
        <Text testID="game-challenge-received" style={styles.waitingTitle}>
          CHALLENGE RECEIVED
        </Text>
        <Text style={styles.waitingSubtitle}>{challengerName} wants to battle!</Text>

        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Accept the challenge and start the battle"
          testID="game-accept-challenge"
          style={styles.acceptButton}
          onPress={onAccept}
          disabled={isAccepting}
        >
          {isAccepting ? (
            <ActivityIndicator color={SKATE.colors.white} />
          ) : (
            <>
              <Ionicons name="checkmark" size={24} color={SKATE.colors.white} />
              <Text style={styles.acceptButtonText}>Accept Challenge</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Decline the challenge"
          style={styles.declineButton}
          onPress={onDecline}
        >
          <Text style={styles.declineButtonText}>Decline</Text>
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
  acceptButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
    backgroundColor: SKATE.colors.neon,
    paddingHorizontal: SKATE.spacing.xxl,
    paddingVertical: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.md,
    minHeight: SKATE.accessibility.minimumTouchTarget,
    minWidth: 200,
    justifyContent: "center",
  },
  acceptButtonText: {
    color: SKATE.colors.ink,
    fontSize: 16,
    fontWeight: "bold",
  },
  declineButton: {
    marginTop: SKATE.spacing.lg,
    paddingVertical: SKATE.spacing.md,
  },
  declineButtonText: {
    color: SKATE.colors.lightGray,
    fontSize: 14,
  },
});
