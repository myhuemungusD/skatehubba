import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRef, useEffect } from "react";
import { SKATE } from "@/theme";
import { LetterIndicator } from "@/components/game/LetterIndicator";
import { DEMO_COMPLETED_GAME, DEMO_PLAYERS } from "@/demo/mockData";

/**
 * Demo: Victory/Result Screen
 * Shows post-game summary with winner announcement, final scores,
 * battle stats, and complete trick history.
 */
export default function DemoResultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const trophyScale = useRef(new Animated.Value(0)).current;
  const statsSlide = useRef(new Animated.Value(50)).current;

  const game = DEMO_COMPLETED_GAME;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.spring(trophyScale, {
          toValue: 1,
          friction: 4,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(statsSlide, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [fadeAnim, trophyScale, statsSlide]);

  // Calculate stats
  const totalRounds = game.roundNumber;
  const landedAttempts = game.moves.filter(
    (m) => m.type === "match" && m.result === "landed"
  ).length;
  const totalAttempts = game.moves.filter((m) => m.type === "match").length;
  const setTricks = game.moves.filter((m) => m.type === "set").length;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + SKATE.spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Demo Banner */}
        <View style={styles.demoBanner}>
          <Ionicons name="eye" size={14} color={SKATE.colors.orange} />
          <Text style={styles.demoBannerText}>INVESTOR DEMO — Victory Screen</Text>
        </View>

        {/* Victory Banner */}
        <View style={styles.banner}>
          <Animated.View style={{ transform: [{ scale: trophyScale }] }}>
            <View style={styles.trophyGlow}>
              <Ionicons name="trophy" size={72} color={SKATE.colors.gold} />
            </View>
          </Animated.View>

          <Text style={styles.victoryText}>VICTORY</Text>
          <Text style={styles.subText}>
            You defeated {DEMO_PLAYERS.opponent.displayName}!
          </Text>
        </View>

        {/* Final Score */}
        <Animated.View
          style={[
            styles.scoreSection,
            { transform: [{ translateY: statsSlide }] },
          ]}
        >
          <Text style={styles.sectionTitle}>FINAL SCORE</Text>

          <View style={styles.playersContainer}>
            <View style={styles.playerColumn}>
              <LetterIndicator
                letters={game.player1Letters}
                playerName={game.player1DisplayName}
                isCurrentPlayer={true}
                isAttacker={false}
                layout="vertical"
              />
              <View style={styles.winnerBadge}>
                <Ionicons name="trophy" size={16} color={SKATE.colors.gold} />
                <Text style={styles.winnerBadgeText}>WINNER</Text>
              </View>
            </View>

            <View style={styles.vsContainer}>
              <Text style={styles.vsText}>VS</Text>
            </View>

            <View style={styles.playerColumn}>
              <LetterIndicator
                letters={game.player2Letters}
                playerName={game.player2DisplayName}
                isCurrentPlayer={false}
                isAttacker={false}
                layout="vertical"
              />
            </View>
          </View>
        </Animated.View>

        {/* Battle Stats */}
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>BATTLE STATS</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Ionicons name="layers" size={24} color={SKATE.colors.orange} />
              <Text style={styles.statValue}>{totalRounds}</Text>
              <Text style={styles.statLabel}>Rounds</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="flash" size={24} color={SKATE.colors.orange} />
              <Text style={styles.statValue}>{setTricks}</Text>
              <Text style={styles.statLabel}>Tricks Set</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="checkmark-circle" size={24} color={SKATE.colors.orange} />
              <Text style={styles.statValue}>
                {landedAttempts}/{totalAttempts}
              </Text>
              <Text style={styles.statLabel}>Landed</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="timer" size={24} color={SKATE.colors.orange} />
              <Text style={styles.statValue}>32m</Text>
              <Text style={styles.statLabel}>Duration</Text>
            </View>
          </View>
        </View>

        {/* Trick History */}
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>TRICK HISTORY</Text>
          {game.moves
            .filter((m) => m.type === "set")
            .map((move, index) => {
              const matchMove = game.moves.find(
                (m) =>
                  m.type === "match" &&
                  m.roundNumber === move.roundNumber
              );

              return (
                <View key={move.id} style={styles.trickHistoryItem}>
                  <View style={styles.roundBadge}>
                    <Text style={styles.roundBadgeText}>R{index + 1}</Text>
                  </View>
                  <View style={styles.trickContent}>
                    <Text style={styles.trickName}>
                      {move.trickName || "Unnamed Trick"}
                    </Text>
                    <Text style={styles.trickSetter}>
                      Set by{" "}
                      {move.playerId === DEMO_PLAYERS.me.uid
                        ? DEMO_PLAYERS.me.displayName
                        : DEMO_PLAYERS.opponent.displayName}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.resultBadge,
                      matchMove?.result === "landed"
                        ? styles.resultLanded
                        : styles.resultBailed,
                    ]}
                  >
                    <Text style={styles.resultBadgeText}>
                      {matchMove?.result === "landed" ? "LANDED" : "BAILED"}
                    </Text>
                  </View>
                </View>
              );
            })}
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, styles.rematchButton]}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh" size={20} color={SKATE.colors.white} />
            <Text style={styles.buttonText}>Rematch</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.exitButton]}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color={SKATE.colors.white} />
            <Text style={styles.buttonText}>Back to Demo</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
  },
  scrollContent: {
    paddingHorizontal: SKATE.spacing.xl,
    paddingBottom: 40,
  },
  demoBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SKATE.spacing.xs,
    paddingVertical: SKATE.spacing.sm,
    marginBottom: SKATE.spacing.lg,
    backgroundColor: "rgba(255, 102, 0, 0.1)",
    borderRadius: SKATE.borderRadius.md,
  },
  demoBannerText: {
    fontSize: 11,
    fontWeight: "bold",
    color: SKATE.colors.orange,
    letterSpacing: 1,
  },
  banner: {
    alignItems: "center",
    padding: SKATE.spacing.xxl,
    borderRadius: SKATE.borderRadius.lg,
    marginBottom: SKATE.spacing.xl,
    borderWidth: 3,
    borderColor: SKATE.colors.gold,
    backgroundColor: "rgba(255, 215, 0, 0.08)",
  },
  trophyGlow: {
    marginBottom: SKATE.spacing.md,
  },
  victoryText: {
    fontSize: 40,
    fontWeight: "bold",
    color: SKATE.colors.gold,
    letterSpacing: 6,
  },
  subText: {
    fontSize: 16,
    color: SKATE.colors.lightGray,
    marginTop: SKATE.spacing.sm,
  },
  scoreSection: {
    marginBottom: SKATE.spacing.xl,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: SKATE.colors.gray,
    letterSpacing: 2,
    marginBottom: SKATE.spacing.md,
  },
  playersContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  playerColumn: {
    flex: 1,
    alignItems: "center",
  },
  vsContainer: {
    justifyContent: "center",
    paddingHorizontal: SKATE.spacing.md,
    paddingTop: SKATE.spacing.xxl,
  },
  vsText: {
    fontSize: 20,
    fontWeight: "bold",
    color: SKATE.colors.gray,
  },
  winnerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.xs,
    marginTop: SKATE.spacing.sm,
    backgroundColor: "rgba(255, 215, 0, 0.2)",
    paddingHorizontal: SKATE.spacing.md,
    paddingVertical: SKATE.spacing.xs,
    borderRadius: SKATE.borderRadius.full,
  },
  winnerBadgeText: {
    color: SKATE.colors.gold,
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  statsSection: {
    marginBottom: SKATE.spacing.xl,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SKATE.spacing.md,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: SKATE.colors.grime,
    padding: SKATE.spacing.md,
    borderRadius: SKATE.borderRadius.md,
    alignItems: "center",
    gap: SKATE.spacing.xs,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: SKATE.colors.white,
  },
  statLabel: {
    fontSize: 12,
    color: SKATE.colors.lightGray,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  historySection: {
    marginBottom: SKATE.spacing.xl,
  },
  trickHistoryItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SKATE.colors.grime,
    padding: SKATE.spacing.md,
    borderRadius: SKATE.borderRadius.md,
    marginBottom: SKATE.spacing.sm,
    gap: SKATE.spacing.md,
  },
  roundBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: SKATE.colors.darkGray,
    justifyContent: "center",
    alignItems: "center",
  },
  roundBadgeText: {
    fontSize: 12,
    fontWeight: "bold",
    color: SKATE.colors.lightGray,
  },
  trickContent: {
    flex: 1,
  },
  trickName: {
    fontSize: 14,
    fontWeight: "600",
    color: SKATE.colors.white,
  },
  trickSetter: {
    fontSize: 12,
    color: SKATE.colors.lightGray,
    marginTop: 2,
  },
  resultBadge: {
    paddingHorizontal: SKATE.spacing.sm,
    paddingVertical: SKATE.spacing.xs,
    borderRadius: SKATE.borderRadius.sm,
  },
  resultLanded: {
    backgroundColor: SKATE.colors.neon,
  },
  resultBailed: {
    backgroundColor: SKATE.colors.blood,
  },
  resultBadgeText: {
    fontSize: 10,
    fontWeight: "bold",
    color: SKATE.colors.white,
    letterSpacing: 1,
  },
  actions: {
    gap: SKATE.spacing.md,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SKATE.spacing.sm,
    paddingVertical: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.md,
    minHeight: 48,
  },
  rematchButton: {
    backgroundColor: SKATE.colors.orange,
  },
  exitButton: {
    backgroundColor: SKATE.colors.darkGray,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: SKATE.colors.white,
  },
});
