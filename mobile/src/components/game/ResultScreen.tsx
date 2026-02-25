import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated } from "react-native";
import { useRef, useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import type { GameSession } from "@/types";
import { LetterIndicator } from "./LetterIndicator";

interface ResultScreenProps {
  /** The completed game session */
  gameSession: GameSession;
  /** Current user's ID */
  currentUserId: string;
  /** Callback to return to challenges */
  onExit: () => void;
  /** Callback to challenge again */
  onRematch?: () => void;
}

/**
 * Post-game summary screen showing winner, stats, and trick history.
 * Features dramatic Baker-era victory/defeat aesthetics.
 */
export function ResultScreen({ gameSession, currentUserId, onExit, onRematch }: ResultScreenProps) {
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const trophyScale = useRef(new Animated.Value(0)).current;
  const statsSlide = useRef(new Animated.Value(50)).current;

  const isWinner = gameSession.winnerId === currentUserId;
  const isPlayer1 = gameSession.player1Id === currentUserId;

  const winnerName = isPlayer1
    ? gameSession.winnerId === gameSession.player1Id
      ? gameSession.player1DisplayName
      : gameSession.player2DisplayName
    : gameSession.winnerId === gameSession.player2Id
      ? gameSession.player2DisplayName
      : gameSession.player1DisplayName;

  const loserName =
    gameSession.winnerId === gameSession.player1Id
      ? gameSession.player2DisplayName
      : gameSession.player1DisplayName;

  // Entrance animations
  useEffect(() => {
    const animation = Animated.sequence([
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
    ]);
    animation.start();

    return () => {
      animation.stop();
      fadeAnim.setValue(0);
      trophyScale.setValue(0);
      statsSlide.setValue(50);
    };
  }, [fadeAnim, trophyScale, statsSlide]);

  // Calculate stats
  const totalRounds = gameSession.roundNumber;
  const player1Tricks = gameSession.moves.filter(
    (m) => m.playerId === gameSession.player1Id && m.type === "set"
  ).length;
  const player2Tricks = gameSession.moves.filter(
    (m) => m.playerId === gameSession.player2Id && m.type === "set"
  ).length;
  const landedAttempts = gameSession.moves.filter(
    (m) => m.type === "match" && m.result === "landed"
  ).length;
  const totalAttempts = gameSession.moves.filter((m) => m.type === "match").length;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + SKATE.spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Victory/Defeat Banner */}
        <View style={[styles.banner, isWinner ? styles.bannerWin : styles.bannerLose]}>
          <Animated.View style={[styles.iconContainer, { transform: [{ scale: trophyScale }] }]}>
            <Ionicons
              name={isWinner ? "trophy" : "sad"}
              size={64}
              color={isWinner ? SKATE.colors.gold : SKATE.colors.lightGray}
            />
          </Animated.View>

          <Text style={[styles.resultText, isWinner && styles.resultTextWin]}>
            {isWinner ? "VICTORY" : "DEFEAT"}
          </Text>

          <Text style={styles.subResultText}>
            {isWinner ? `You defeated ${loserName}!` : `${winnerName} won the battle`}
          </Text>
        </View>

        {/* Final S.K.A.T.E. Status */}
        <Animated.View style={[styles.statusSection, { transform: [{ translateY: statsSlide }] }]}>
          <Text style={styles.sectionTitle}>FINAL SCORE</Text>

          <View style={styles.playersContainer}>
            <View style={styles.playerColumn}>
              <LetterIndicator
                letters={gameSession.player1Letters}
                playerName={gameSession.player1DisplayName}
                isCurrentPlayer={gameSession.player1Id === currentUserId}
                isAttacker={false}
                layout="vertical"
              />
              {gameSession.winnerId === gameSession.player1Id && (
                <View style={styles.winnerBadge}>
                  <Ionicons name="trophy" size={16} color={SKATE.colors.gold} />
                  <Text style={styles.winnerBadgeText}>WINNER</Text>
                </View>
              )}
            </View>

            <View style={styles.vsContainer}>
              <Text style={styles.vsText}>VS</Text>
            </View>

            <View style={styles.playerColumn}>
              <LetterIndicator
                letters={gameSession.player2Letters}
                playerName={gameSession.player2DisplayName}
                isCurrentPlayer={gameSession.player2Id === currentUserId}
                isAttacker={false}
                layout="vertical"
              />
              {gameSession.winnerId === gameSession.player2Id && (
                <View style={styles.winnerBadge}>
                  <Ionicons name="trophy" size={16} color={SKATE.colors.gold} />
                  <Text style={styles.winnerBadgeText}>WINNER</Text>
                </View>
              )}
            </View>
          </View>
        </Animated.View>

        {/* Stats */}
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>BATTLE STATS</Text>

          <View style={styles.statsGrid}>
            <StatCard icon="layers" label="Rounds" value={totalRounds.toString()} />
            <StatCard icon="flash" label="Tricks Set" value={`${player1Tricks + player2Tricks}`} />
            <StatCard
              icon="checkmark-circle"
              label="Landed"
              value={`${landedAttempts}/${totalAttempts}`}
            />
            <StatCard
              icon="timer"
              label="Duration"
              value={formatDuration(gameSession.createdAt, gameSession.completedAt)}
            />
          </View>
        </View>

        {/* Trick History */}
        {gameSession.moves.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>TRICK HISTORY</Text>

            {gameSession.moves
              .filter((m) => m.type === "set")
              .map((move, index) => {
                const matchMove = gameSession.moves.find(
                  (m) =>
                    m.type === "match" &&
                    m.roundNumber === move.roundNumber &&
                    m.playerId !== move.playerId
                );

                return (
                  <View key={move.id} style={styles.trickHistoryItem}>
                    <View style={styles.roundBadge}>
                      <Text style={styles.roundBadgeText}>R{index + 1}</Text>
                    </View>

                    <View style={styles.trickContent}>
                      <Text style={styles.trickName}>{move.trickName || "Unnamed Trick"}</Text>
                      <Text style={styles.trickSetter}>
                        Set by{" "}
                        {move.playerId === gameSession.player1Id
                          ? gameSession.player1DisplayName
                          : gameSession.player2DisplayName}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.resultBadge,
                        matchMove?.result === "landed" ? styles.resultLanded : styles.resultBailed,
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
        )}

        {/* Action Buttons */}
        <View style={styles.actions}>
          {onRematch && (
            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel="Challenge opponent to a rematch"
              style={[styles.button, styles.rematchButton]}
              onPress={onRematch}
            >
              <Ionicons name="refresh" size={20} color={SKATE.colors.white} />
              <Text style={styles.buttonText}>Run it back?</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Return to challenges"
            style={[styles.button, styles.exitButton]}
            onPress={onExit}
          >
            <Ionicons name="arrow-back" size={20} color={SKATE.colors.white} />
            <Text style={styles.buttonText}>Back to Challenges</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Animated.View>
  );
}

interface StatCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}

function StatCard({ icon, label, value }: StatCardProps) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={24} color={SKATE.colors.orange} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function formatDuration(start: Date | null | undefined, end: Date | null | undefined): string {
  if (!start || !end) return "--";

  const startDate = start instanceof Date ? start : new Date(start);
  const endDate = end instanceof Date ? end : new Date(end);

  const diffMs = endDate.getTime() - startDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "<1 min";
  if (diffMins < 60) return `${diffMins} min`;

  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return `${hours}h ${mins}m`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
  },
  scrollContent: {
    paddingHorizontal: SKATE.spacing.xl,
    paddingBottom: SKATE.spacing.xl,
  },
  banner: {
    alignItems: "center",
    padding: SKATE.spacing.xxl,
    borderRadius: SKATE.borderRadius.lg,
    marginBottom: SKATE.spacing.xl,
    borderWidth: 3,
  },
  bannerWin: {
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderColor: SKATE.colors.gold,
  },
  bannerLose: {
    backgroundColor: SKATE.colors.grime,
    borderColor: SKATE.colors.darkGray,
  },
  iconContainer: {
    marginBottom: SKATE.spacing.md,
  },
  resultText: {
    fontSize: 36,
    fontWeight: "bold",
    color: SKATE.colors.lightGray,
    letterSpacing: 4,
  },
  resultTextWin: {
    color: SKATE.colors.gold,
  },
  subResultText: {
    fontSize: 16,
    color: SKATE.colors.lightGray,
    marginTop: SKATE.spacing.sm,
  },
  statusSection: {
    marginBottom: SKATE.spacing.xl,
  },
  sectionTitle: {
    fontSize: 14,
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
    paddingHorizontal: SKATE.spacing.sm,
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
    color: SKATE.colors.ink,
    letterSpacing: 1,
  },
  actions: {
    gap: SKATE.spacing.md,
    marginTop: SKATE.spacing.md,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SKATE.spacing.sm,
    paddingVertical: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.md,
    minHeight: SKATE.accessibility.minimumTouchTarget,
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

export default ResultScreen;
