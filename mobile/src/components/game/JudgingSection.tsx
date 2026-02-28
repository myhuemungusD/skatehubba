import { memo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import { VideoErrorBoundary } from "@/components/common/VideoErrorBoundary";
import { SlowMoReplay } from "./SlowMoReplay";
import type { Move } from "@/types";

interface JudgingSectionProps {
  latestMatchMove: Move | null;
  matchMoveVideoUrl: string | null;
  matchMoveVideoIsLoading: boolean;
  canJudge: boolean;
  hasVoted: boolean;
  myVote: "landed" | "bailed" | null;
  opponentVote: "landed" | "bailed" | null;
  onJudge: (vote: "landed" | "bailed") => void;
  isJudging: boolean;
}

export const JudgingSection = memo(function JudgingSection({
  latestMatchMove,
  matchMoveVideoUrl,
  matchMoveVideoIsLoading,
  canJudge,
  hasVoted,
  myVote,
  opponentVote,
  onJudge,
  isJudging,
}: JudgingSectionProps) {
  return (
    <View style={styles.judgingSection}>
      <Text testID="game-judging-title" style={styles.judgingTitle}>
        DID THEY LAND IT?
      </Text>
      <Text style={styles.judgingSubtitle}>Both players vote. Tie goes to defender.</Text>

      {latestMatchMove &&
        (matchMoveVideoIsLoading ? (
          <ActivityIndicator color={SKATE.colors.orange} style={styles.judgingVideo} />
        ) : matchMoveVideoUrl ? (
          <VideoErrorBoundary>
            <SlowMoReplay
              clipUrl={matchMoveVideoUrl}
              trickName={latestMatchMove.trickName}
              defaultSlowMo={false}
              autoPlay={true}
              style={styles.judgingVideo}
            />
          </VideoErrorBoundary>
        ) : null)}

      {/* Voting status */}
      <View style={styles.votingStatus}>
        <View style={styles.voteIndicator}>
          <Text style={styles.voteLabel}>Your vote:</Text>
          {hasVoted ? (
            <View
              style={[
                styles.voteBadge,
                myVote === "landed" ? styles.voteLanded : styles.voteBailed,
              ]}
            >
              <Text style={styles.voteBadgeText}>{myVote?.toUpperCase()}</Text>
            </View>
          ) : (
            <Text style={styles.votePending}>Waiting...</Text>
          )}
        </View>
        <View style={styles.voteIndicator}>
          <Text style={styles.voteLabel}>Opponent:</Text>
          {opponentVote !== null ? (
            <View
              style={[
                styles.voteBadge,
                opponentVote === "landed" ? styles.voteLanded : styles.voteBailed,
              ]}
            >
              <Text style={styles.voteBadgeText}>{opponentVote.toUpperCase()}</Text>
            </View>
          ) : (
            <Text style={styles.votePending}>Waiting...</Text>
          )}
        </View>
      </View>

      {canJudge && (
        <View style={styles.judgingButtons}>
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Vote that trick was landed"
            testID="game-vote-landed"
            style={[styles.judgeButton, styles.landedButton]}
            onPress={() => onJudge("landed")}
            disabled={isJudging}
          >
            <Ionicons name="checkmark-circle" size={32} color={SKATE.colors.white} />
            <Text style={styles.judgeButtonText}>I LANDED IT</Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Vote that trick was not landed"
            testID="game-vote-bailed"
            style={[styles.judgeButton, styles.bailedButton]}
            onPress={() => onJudge("bailed")}
            disabled={isJudging}
          >
            <Ionicons name="close-circle" size={32} color={SKATE.colors.white} />
            <Text style={styles.judgeButtonText}>I DIDN'T GET IT</Text>
          </TouchableOpacity>
        </View>
      )}

      {hasVoted && opponentVote === null && (
        <View style={styles.waitingJudgment}>
          <ActivityIndicator color={SKATE.colors.orange} />
          <Text style={styles.waitingJudgmentText}>Waiting for opponent's vote...</Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  judgingSection: {
    flex: 1,
    margin: SKATE.spacing.lg,
    alignItems: "center",
  },
  judgingTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: SKATE.colors.gold,
    letterSpacing: 2,
    marginBottom: SKATE.spacing.xs,
  },
  judgingSubtitle: {
    fontSize: 12,
    color: SKATE.colors.lightGray,
    marginBottom: SKATE.spacing.lg,
  },
  votingStatus: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginBottom: SKATE.spacing.lg,
    backgroundColor: SKATE.colors.grime,
    padding: SKATE.spacing.md,
    borderRadius: SKATE.borderRadius.md,
  },
  voteIndicator: {
    alignItems: "center",
    gap: SKATE.spacing.sm,
  },
  voteLabel: {
    fontSize: 12,
    color: SKATE.colors.lightGray,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  voteBadge: {
    paddingHorizontal: SKATE.spacing.md,
    paddingVertical: SKATE.spacing.xs,
    borderRadius: SKATE.borderRadius.sm,
  },
  voteLanded: {
    backgroundColor: SKATE.colors.neon,
  },
  voteBailed: {
    backgroundColor: SKATE.colors.blood,
  },
  voteBadgeText: {
    color: SKATE.colors.white,
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  votePending: {
    color: SKATE.colors.gray,
    fontSize: 14,
    fontStyle: "italic",
  },
  judgingVideo: {
    width: "100%",
    height: 250,
    borderRadius: SKATE.borderRadius.lg,
    backgroundColor: SKATE.colors.grime,
    marginBottom: SKATE.spacing.lg,
  },
  judgingButtons: {
    flexDirection: "row",
    gap: SKATE.spacing.lg,
    width: "100%",
  },
  judgeButton: {
    flex: 1,
    paddingVertical: SKATE.spacing.xl,
    borderRadius: SKATE.borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: SKATE.spacing.sm,
    minHeight: 100,
  },
  landedButton: {
    backgroundColor: SKATE.colors.neon,
  },
  bailedButton: {
    backgroundColor: SKATE.colors.blood,
  },
  judgeButtonText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  waitingJudgment: {
    alignItems: "center",
    gap: SKATE.spacing.md,
  },
  waitingJudgmentText: {
    color: SKATE.colors.lightGray,
    fontSize: 14,
  },
});
