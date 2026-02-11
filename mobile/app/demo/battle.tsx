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
import { useRef, useEffect } from "react";
import { SKATE } from "@/theme";
import { LetterIndicator } from "@/components/game/LetterIndicator";
import { DEMO_ACTIVE_GAME, DEMO_PLAYERS } from "@/demo/mockData";

/**
 * Demo: Active S.K.A.T.E. Battle Screen
 * Shows a mid-game state with letters, round info, and record button.
 * Uses hardcoded mock data — no backend required.
 */
export default function DemoBattleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  // Pulse the record button
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
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

    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.8,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.3,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );

    pulse.start();
    glow.start();

    return () => {
      pulse.stop();
      glow.stop();
    };
  }, [pulseAnim, glowAnim]);

  const game = DEMO_ACTIVE_GAME;

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

        <TouchableOpacity style={styles.headerButton}>
          <Ionicons name="flag" size={24} color={SKATE.colors.blood} />
        </TouchableOpacity>
      </View>

      {/* Demo Banner */}
      <View style={styles.demoBanner}>
        <Ionicons name="eye" size={14} color={SKATE.colors.orange} />
        <Text style={styles.demoBannerText}>INVESTOR DEMO — Mock Data</Text>
      </View>

      {/* Player Status Cards */}
      <View style={styles.playersSection}>
        <View style={styles.playerCard}>
          <LetterIndicator
            letters={game.player1Letters}
            playerName={game.player1DisplayName}
            isCurrentPlayer={true}
            isAttacker={game.currentAttacker === game.player1Id}
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
            isAttacker={game.currentAttacker === game.player2Id}
          />
        </View>
      </View>

      {/* Phase Indicator */}
      <View style={styles.phaseSection}>
        <View style={styles.phaseBadge}>
          <Ionicons name="videocam" size={16} color={SKATE.colors.orange} />
          <Text style={styles.phaseText}>YOUR SET — Record a trick</Text>
        </View>
      </View>

      {/* Trick History Preview */}
      <View style={styles.historySection}>
        <Text style={styles.historySectionTitle}>RECENT TRICKS</Text>
        {game.moves
          .filter((m) => m.type === "set")
          .slice(-3)
          .map((move) => {
            const matchMove = game.moves.find(
              (m) =>
                m.type === "match" &&
                m.roundNumber === move.roundNumber
            );
            return (
              <View key={move.id} style={styles.historyItem}>
                <View style={styles.historyRound}>
                  <Text style={styles.historyRoundText}>R{move.roundNumber}</Text>
                </View>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyTrick}>{move.trickName}</Text>
                  <Text style={styles.historySetter}>
                    Set by{" "}
                    {move.playerId === DEMO_PLAYERS.me.uid
                      ? DEMO_PLAYERS.me.displayName
                      : DEMO_PLAYERS.opponent.displayName}
                  </Text>
                </View>
                <View
                  style={[
                    styles.historyResult,
                    matchMove?.result === "landed"
                      ? styles.resultLanded
                      : styles.resultBailed,
                  ]}
                >
                  <Text style={styles.historyResultText}>
                    {matchMove?.result === "landed" ? "LAND" : "BAIL"}
                  </Text>
                </View>
              </View>
            );
          })}
      </View>

      {/* Action Area */}
      <View style={styles.actionArea}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity style={styles.recordButton} activeOpacity={0.8}>
            <Animated.View
              style={[styles.recordGlow, { opacity: glowAnim }]}
            />
            <Ionicons name="videocam" size={32} color={SKATE.colors.white} />
            <Text style={styles.recordButtonText}>RECORD TRICK</Text>
          </TouchableOpacity>
        </Animated.View>
        <Text style={styles.timerHint}>15 seconds max — one take, no retries</Text>
      </View>
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
  phaseSection: {
    paddingHorizontal: SKATE.spacing.lg,
    marginBottom: SKATE.spacing.md,
  },
  phaseBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SKATE.spacing.sm,
    backgroundColor: "rgba(255, 102, 0, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 102, 0, 0.3)",
    borderRadius: SKATE.borderRadius.md,
    paddingVertical: SKATE.spacing.md,
  },
  phaseText: {
    color: SKATE.colors.orange,
    fontSize: 14,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  historySection: {
    paddingHorizontal: SKATE.spacing.lg,
    marginBottom: SKATE.spacing.md,
  },
  historySectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: SKATE.colors.gray,
    letterSpacing: 2,
    marginBottom: SKATE.spacing.sm,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SKATE.colors.grime,
    padding: SKATE.spacing.md,
    borderRadius: SKATE.borderRadius.md,
    marginBottom: SKATE.spacing.sm,
    gap: SKATE.spacing.md,
  },
  historyRound: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: SKATE.colors.darkGray,
    justifyContent: "center",
    alignItems: "center",
  },
  historyRoundText: {
    fontSize: 12,
    fontWeight: "bold",
    color: SKATE.colors.lightGray,
  },
  historyInfo: {
    flex: 1,
  },
  historyTrick: {
    fontSize: 14,
    fontWeight: "600",
    color: SKATE.colors.white,
  },
  historySetter: {
    fontSize: 12,
    color: SKATE.colors.lightGray,
    marginTop: 1,
  },
  historyResult: {
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
  historyResultText: {
    fontSize: 10,
    fontWeight: "bold",
    color: SKATE.colors.white,
    letterSpacing: 1,
  },
  actionArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SKATE.spacing.xl,
  },
  recordButton: {
    backgroundColor: SKATE.colors.blood,
    paddingHorizontal: 48,
    paddingVertical: SKATE.spacing.xl,
    borderRadius: SKATE.borderRadius.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.md,
    borderWidth: 3,
    borderColor: SKATE.colors.white,
    overflow: "hidden",
  },
  recordGlow: {
    position: "absolute",
    top: -20,
    left: -20,
    right: -20,
    bottom: -20,
    backgroundColor: SKATE.colors.blood,
    borderRadius: 30,
  },
  recordButtonText: {
    color: SKATE.colors.white,
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 2,
  },
  timerHint: {
    marginTop: SKATE.spacing.md,
    fontSize: 13,
    color: SKATE.colors.gray,
    fontStyle: "italic",
  },
});
