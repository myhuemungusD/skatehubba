import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRef, useEffect, useState } from "react";
import { SKATE } from "@/theme";
import { LetterIndicator } from "@/components/game/LetterIndicator";
import { DEMO_JUDGING_GAME, DEMO_PLAYERS } from "@/demo/mockData";

/**
 * Demo: Judging Phase Screen
 * Shows the dual-vote judging UI where both players vote LANDED or BAILED.
 * Demonstrates the unique mutual-agreement judging system.
 */
export default function DemoJudgingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [myVote, setMyVote] = useState<"landed" | "bailed" | null>(null);
  const [opponentVote, setOpponentVote] = useState<"landed" | "bailed" | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  const game = DEMO_JUDGING_GAME;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // Simulate opponent vote after player votes
  useEffect(() => {
    if (myVote && !opponentVote) {
      const timer = setTimeout(() => {
        setOpponentVote(myVote === "landed" ? "landed" : "bailed");
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [myVote, opponentVote]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={SKATE.colors.white} />
        </TouchableOpacity>

        <View style={styles.roundBadge}>
          <Text style={styles.roundText}>ROUND {game.roundNumber}</Text>
        </View>

        <View style={styles.headerButton} />
      </View>

      {/* Demo Banner */}
      <View style={styles.demoBanner}>
        <Ionicons name="eye" size={14} color={SKATE.colors.orange} />
        <Text style={styles.demoBannerText}>INVESTOR DEMO — Tap to vote</Text>
      </View>

      {/* Player Cards */}
      <View style={styles.playersSection}>
        <View style={styles.playerCard}>
          <LetterIndicator
            letters={game.player1Letters}
            playerName={game.player1DisplayName}
            isCurrentPlayer={true}
            isAttacker={true}
          />
        </View>
        <View style={styles.vsContainer}>
          <Text style={styles.vsText}>VS</Text>
        </View>
        <View style={styles.playerCard}>
          <LetterIndicator
            letters={game.player2Letters}
            playerName={game.player2DisplayName}
            isCurrentPlayer={false}
            isAttacker={false}
          />
        </View>
      </View>

      {/* Judging Section */}
      <Animated.View
        style={[
          styles.judgingSection,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        <Text style={styles.judgingTitle}>DID THEY LAND IT?</Text>
        <Text style={styles.trickName}>
          Trick: {game.currentSetMove?.trickName}
        </Text>
        <Text style={styles.judgingSubtitle}>
          Both players vote. Tie goes to defender.
        </Text>

        {/* Video Placeholder */}
        <View style={styles.videoPlaceholder}>
          <Ionicons name="play-circle" size={64} color={SKATE.colors.orange} />
          <Text style={styles.videoPlaceholderText}>Trick Replay</Text>
          <Text style={styles.videoPlaceholderSub}>
            Slow-motion replay available
          </Text>
        </View>

        {/* Voting Status */}
        <View style={styles.votingStatus}>
          <View style={styles.voteIndicator}>
            <Text style={styles.voteLabel}>YOUR VOTE</Text>
            {myVote ? (
              <View
                style={[
                  styles.voteBadge,
                  myVote === "landed" ? styles.voteLanded : styles.voteBailed,
                ]}
              >
                <Text style={styles.voteBadgeText}>
                  {myVote.toUpperCase()}
                </Text>
              </View>
            ) : (
              <Text style={styles.votePending}>Waiting...</Text>
            )}
          </View>
          <View style={styles.voteDivider} />
          <View style={styles.voteIndicator}>
            <Text style={styles.voteLabel}>OPPONENT</Text>
            {opponentVote ? (
              <View
                style={[
                  styles.voteBadge,
                  opponentVote === "landed"
                    ? styles.voteLanded
                    : styles.voteBailed,
                ]}
              >
                <Text style={styles.voteBadgeText}>
                  {opponentVote.toUpperCase()}
                </Text>
              </View>
            ) : (
              <Text style={styles.votePending}>
                {myVote ? "Thinking..." : "Waiting..."}
              </Text>
            )}
          </View>
        </View>

        {/* Vote Buttons */}
        {!myVote ? (
          <View style={styles.judgingButtons}>
            <TouchableOpacity
              style={[styles.judgeButton, styles.landedButton]}
              onPress={() => setMyVote("landed")}
              activeOpacity={0.7}
            >
              <Ionicons
                name="checkmark-circle"
                size={36}
                color={SKATE.colors.white}
              />
              <Text style={styles.judgeButtonText}>LANDED</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.judgeButton, styles.bailedButton]}
              onPress={() => setMyVote("bailed")}
              activeOpacity={0.7}
            >
              <Ionicons
                name="close-circle"
                size={36}
                color={SKATE.colors.white}
              />
              <Text style={styles.judgeButtonText}>BAILED</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.waitingSection}>
            {opponentVote ? (
              <View style={styles.resultAnnouncement}>
                <Ionicons
                  name={myVote === opponentVote ? "checkmark-done" : "alert-circle"}
                  size={32}
                  color={
                    myVote === opponentVote
                      ? SKATE.colors.neon
                      : SKATE.colors.gold
                  }
                />
                <Text style={styles.resultText}>
                  {myVote === opponentVote
                    ? `Both voted: ${myVote.toUpperCase()}`
                    : "Split vote — Tie goes to defender"}
                </Text>
              </View>
            ) : (
              <View style={styles.waitingVote}>
                <Ionicons name="hourglass" size={24} color={SKATE.colors.orange} />
                <Text style={styles.waitingVoteText}>
                  Waiting for opponent's vote...
                </Text>
              </View>
            )}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
  },
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
    backgroundColor: SKATE.colors.gold,
    paddingHorizontal: SKATE.spacing.lg,
    paddingVertical: SKATE.spacing.sm,
    borderRadius: SKATE.borderRadius.full,
  },
  roundText: {
    color: SKATE.colors.ink,
    fontSize: 14,
    fontWeight: "bold",
    letterSpacing: 2,
  },
  demoBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SKATE.spacing.xs,
    paddingVertical: SKATE.spacing.sm,
    backgroundColor: "rgba(255, 102, 0, 0.1)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 102, 0, 0.2)",
  },
  demoBannerText: {
    fontSize: 11,
    fontWeight: "bold",
    color: SKATE.colors.orange,
    letterSpacing: 1,
  },
  playersSection: {
    flexDirection: "row",
    padding: SKATE.spacing.lg,
    gap: SKATE.spacing.sm,
    alignItems: "flex-start",
  },
  playerCard: {
    flex: 1,
  },
  vsContainer: {
    justifyContent: "center",
    paddingTop: SKATE.spacing.xxl,
  },
  vsText: {
    fontSize: 16,
    fontWeight: "bold",
    color: SKATE.colors.gray,
  },
  judgingSection: {
    flex: 1,
    paddingHorizontal: SKATE.spacing.lg,
    alignItems: "center",
  },
  judgingTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: SKATE.colors.gold,
    letterSpacing: 2,
    marginBottom: SKATE.spacing.xs,
  },
  trickName: {
    fontSize: 16,
    fontWeight: "600",
    color: SKATE.colors.white,
    marginBottom: SKATE.spacing.xs,
  },
  judgingSubtitle: {
    fontSize: 13,
    color: SKATE.colors.lightGray,
    marginBottom: SKATE.spacing.lg,
  },
  videoPlaceholder: {
    width: "100%",
    height: 180,
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: SKATE.spacing.lg,
    borderWidth: 2,
    borderColor: SKATE.colors.darkGray,
    borderStyle: "dashed",
  },
  videoPlaceholderText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
    marginTop: SKATE.spacing.sm,
  },
  videoPlaceholderSub: {
    color: SKATE.colors.lightGray,
    fontSize: 12,
    marginTop: SKATE.spacing.xs,
  },
  votingStatus: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginBottom: SKATE.spacing.lg,
    backgroundColor: SKATE.colors.grime,
    padding: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.md,
  },
  voteIndicator: {
    alignItems: "center",
    gap: SKATE.spacing.sm,
    flex: 1,
  },
  voteDivider: {
    width: 1,
    backgroundColor: SKATE.colors.darkGray,
  },
  voteLabel: {
    fontSize: 11,
    color: SKATE.colors.lightGray,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "bold",
  },
  voteBadge: {
    paddingHorizontal: SKATE.spacing.lg,
    paddingVertical: SKATE.spacing.sm,
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
    fontSize: 14,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  votePending: {
    color: SKATE.colors.gray,
    fontSize: 14,
    fontStyle: "italic",
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
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  waitingSection: {
    width: "100%",
    alignItems: "center",
  },
  waitingVote: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.md,
    padding: SKATE.spacing.lg,
  },
  waitingVoteText: {
    color: SKATE.colors.lightGray,
    fontSize: 16,
  },
  resultAnnouncement: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.md,
    backgroundColor: SKATE.colors.grime,
    padding: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.md,
    width: "100%",
    justifyContent: "center",
  },
  resultText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
  },
});
