import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from "react-native";
import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase.config";
import { apiRequest } from "@/lib/queryClient";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import { PlaySkateSkeleton } from "@/components/common/Skeleton";
import { ScreenErrorBoundary } from "@/components/common/ScreenErrorBoundary";
import type { GameSession } from "@/types";

// ── Quick Match state machine ────────────────────────────────────────────

type QuickMatchState =
  | { phase: "idle" }
  | { phase: "searching" }
  | { phase: "matched"; gameId: string; opponentName: string; opponentPhoto: string | null }
  | { phase: "error"; message: string };

// ── Active game card type (minimal projection from Firestore) ────────────

interface ActiveGame {
  id: string;
  opponentName: string;
  opponentPhoto: string | null;
  myLetters: string[];
  opponentLetters: string[];
  isMyTurn: boolean;
  status: GameSession["status"];
}

// ── Main screen ──────────────────────────────────────────────────────────

function PlaySkateContent() {
  const { user, isAuthenticated } = useRequireAuth();
  const router = useRouter();
  const [quickMatch, setQuickMatch] = useState<QuickMatchState>({ phase: "idle" });

  // ── Fetch active games from Firestore ──────────────────────────────────
  const {
    data: activeGames,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["active-games", user?.uid],
    queryFn: async (): Promise<ActiveGame[]> => {
      if (!user) return [];

      // Firestore doesn't support OR across different fields, so run two queries
      const asPlayer1 = query(
        collection(db, "game_sessions"),
        where("player1Id", "==", user.uid),
        where("status", "in", ["waiting", "active"])
      );
      const asPlayer2 = query(
        collection(db, "game_sessions"),
        where("player2Id", "==", user.uid),
        where("status", "in", ["waiting", "active"])
      );

      const [snap1, snap2] = await Promise.all([getDocs(asPlayer1), getDocs(asPlayer2)]);

      const seen = new Set<string>();
      const games: ActiveGame[] = [];

      for (const docSnap of [...snap1.docs, ...snap2.docs]) {
        if (seen.has(docSnap.id)) continue;
        seen.add(docSnap.id);

        const d = docSnap.data();
        const isPlayer1 = d.player1Id === user.uid;

        games.push({
          id: docSnap.id,
          opponentName: isPlayer1
            ? d.player2DisplayName || "Opponent"
            : d.player1DisplayName || "Opponent",
          opponentPhoto: isPlayer1 ? d.player2PhotoURL : d.player1PhotoURL,
          myLetters: isPlayer1 ? d.player1Letters || [] : d.player2Letters || [],
          opponentLetters: isPlayer1 ? d.player2Letters || [] : d.player1Letters || [],
          isMyTurn: d.currentTurn === user.uid,
          status: d.status,
        });
      }

      // Sort: your-turn games first
      games.sort((a, b) => (a.isMyTurn === b.isMyTurn ? 0 : a.isMyTurn ? -1 : 1));
      return games;
    },
    enabled: !!user,
  });

  // ── Real-time listener for active game updates ─────────────────────────
  useEffect(() => {
    if (!user) return;

    const unsubs: Unsubscribe[] = [];

    const q1 = query(
      collection(db, "game_sessions"),
      where("player1Id", "==", user.uid),
      where("status", "in", ["waiting", "active"])
    );
    const q2 = query(
      collection(db, "game_sessions"),
      where("player2Id", "==", user.uid),
      where("status", "in", ["waiting", "active"])
    );

    // Refetch the query data when any active game changes
    for (const q of [q1, q2]) {
      unsubs.push(
        onSnapshot(q, () => {
          refetch();
        })
      );
    }

    return () => unsubs.forEach((u) => u());
  }, [user, refetch]);

  // ── Quick Match mutation ───────────────────────────────────────────────
  const quickMatchMutation = useMutation({
    mutationFn: async () => {
      return apiRequest<{ gameId: string; opponentName: string; opponentPhoto: string | null }>(
        "/api/matchmaking/quick-match",
        { method: "POST" }
      );
    },
    onMutate: () => {
      setQuickMatch({ phase: "searching" });
    },
    onSuccess: (data) => {
      setQuickMatch({
        phase: "matched",
        gameId: data.gameId,
        opponentName: data.opponentName,
        opponentPhoto: data.opponentPhoto,
      });
    },
    onError: (error: Error) => {
      setQuickMatch({ phase: "error", message: error.message || "Could not find a match" });
    },
  });

  const handleQuickMatch = useCallback(() => {
    if (quickMatch.phase === "searching") return;
    quickMatchMutation.mutate();
  }, [quickMatch.phase, quickMatchMutation]);

  const handleLetsGo = useCallback(() => {
    if (quickMatch.phase !== "matched") return;
    const { gameId } = quickMatch;
    setQuickMatch({ phase: "idle" });
    router.push(`/game/${gameId}`);
  }, [quickMatch, router]);

  const handleDismissQuickMatch = useCallback(() => {
    setQuickMatch({ phase: "idle" });
  }, []);

  // ── Auth gate ──────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={SKATE.colors.orange} />
      </View>
    );
  }

  return (
    <View testID="play-skate-screen" style={styles.container}>
      {isLoading ? (
        <PlaySkateSkeleton />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={SKATE.colors.orange}
              colors={[SKATE.colors.orange]}
            />
          }
        >
          {/* ── Header ─────────────────────────────────────────────── */}
          <Text style={styles.heroTitle}>PLAY S.K.A.T.E.</Text>

          {/* ── Quick Match Button ─────────────────────────────────── */}
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Quick match — find a random skater to battle"
            testID="quick-match-btn"
            style={styles.quickMatchButton}
            onPress={handleQuickMatch}
            disabled={quickMatch.phase === "searching"}
          >
            <View style={styles.actionButtonIcon}>
              <Ionicons name="flash" size={28} color={SKATE.colors.white} />
            </View>
            <View style={styles.actionButtonText}>
              <Text style={styles.actionTitle}>QUICK MATCH</Text>
              <Text style={styles.actionSubtitle}>Find a random skater to battle</Text>
            </View>
          </TouchableOpacity>

          {/* ── Challenge Button ────────────────────────────────────── */}
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Challenge someone you know"
            testID="challenge-btn"
            style={styles.challengeButton}
            onPress={() => router.push("/challenge/pick-opponent")}
          >
            <View style={styles.actionButtonIcon}>
              <Ionicons name="person-add" size={28} color={SKATE.colors.orange} />
            </View>
            <View style={styles.actionButtonText}>
              <Text style={styles.actionTitle}>CHALLENGE</Text>
              <Text style={styles.actionSubtitle}>someone you know</Text>
            </View>
          </TouchableOpacity>

          {/* ── Quick Match Overlay ─────────────────────────────────── */}
          {quickMatch.phase === "searching" && (
            <View style={styles.matchOverlay}>
              <ActivityIndicator size="large" color={SKATE.colors.orange} />
              <Text style={styles.matchOverlayText}>Finding opponent...</Text>
            </View>
          )}

          {quickMatch.phase === "matched" && (
            <View style={styles.matchOverlay}>
              {quickMatch.opponentPhoto ? (
                <Image source={{ uri: quickMatch.opponentPhoto }} style={styles.matchAvatar} />
              ) : (
                <View style={styles.matchAvatarPlaceholder}>
                  <Ionicons name="person" size={32} color={SKATE.colors.orange} />
                </View>
              )}
              <Text style={styles.matchOverlayTitle}>Matched!</Text>
              <Text style={styles.matchOverlayOpponent}>vs. {quickMatch.opponentName}</Text>
              <TouchableOpacity
                accessible
                accessibilityRole="button"
                accessibilityLabel="Start the game"
                testID="lets-go-btn"
                style={styles.letsGoButton}
                onPress={handleLetsGo}
              >
                <Text style={styles.letsGoText}>LET'S GO</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessible
                accessibilityRole="button"
                accessibilityLabel="Dismiss match"
                onPress={handleDismissQuickMatch}
                style={styles.dismissButton}
              >
                <Text style={styles.dismissText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {quickMatch.phase === "error" && (
            <View style={styles.matchOverlay}>
              <Ionicons name="alert-circle" size={40} color={SKATE.colors.blood} />
              <Text style={styles.matchOverlayText}>{quickMatch.message}</Text>
              <TouchableOpacity
                accessible
                accessibilityRole="button"
                accessibilityLabel="Dismiss error"
                onPress={handleDismissQuickMatch}
                style={styles.dismissButton}
              >
                <Text style={styles.dismissText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Active Games ───────────────────────────────────────── */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>YOUR ACTIVE GAMES</Text>
            <View style={styles.dividerLine} />
          </View>

          {!activeGames || activeGames.length === 0 ? (
            <View style={styles.emptyGames}>
              <Ionicons name="game-controller-outline" size={48} color={SKATE.colors.gray} />
              <Text style={styles.emptyGamesText}>No active games</Text>
              <Text style={styles.emptyGamesSubtext}>
                Start a quick match or challenge a friend!
              </Text>
            </View>
          ) : (
            activeGames.map((game) => (
              <TouchableOpacity
                key={game.id}
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Game vs ${game.opponentName}${game.isMyTurn ? ", your turn" : ""}`}
                style={[styles.gameCard, game.isMyTurn && styles.gameCardMyTurn]}
                onPress={() => router.push(`/game/${game.id}`)}
              >
                {game.isMyTurn && (
                  <View style={styles.yourTurnBanner}>
                    <Text style={styles.yourTurnText}>
                      YOUR TURN — @{game.opponentName} is waiting
                    </Text>
                  </View>
                )}
                <View style={styles.gameCardBody}>
                  {game.opponentPhoto ? (
                    <Image source={{ uri: game.opponentPhoto }} style={styles.gameAvatar} />
                  ) : (
                    <View style={styles.gameAvatarPlaceholder}>
                      <Text style={styles.gameAvatarInitial}>
                        {game.opponentName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.gameInfo}>
                    <Text style={styles.gameOpponent}>vs. {game.opponentName}</Text>
                    <View style={styles.lettersRow}>
                      <Text style={styles.lettersLabel}>You: </Text>
                      <Text style={styles.lettersValue}>
                        {game.myLetters.length > 0 ? game.myLetters.join(".") : "--"}
                      </Text>
                      <Text style={styles.lettersSep}> | </Text>
                      <Text style={styles.lettersLabel}>Them: </Text>
                      <Text style={styles.lettersValue}>
                        {game.opponentLetters.length > 0 ? game.opponentLetters.join(".") : "--"}
                      </Text>
                    </View>
                  </View>
                  {game.isMyTurn ? (
                    <View style={styles.goButton}>
                      <Text style={styles.goButtonText}>Go</Text>
                    </View>
                  ) : (
                    <Ionicons name="time-outline" size={24} color={SKATE.colors.gray} />
                  )}
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

export default function ChallengesScreen() {
  return (
    <ScreenErrorBoundary screenName="Play S.K.A.T.E.">
      <PlaySkateContent />
    </ScreenErrorBoundary>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
  },
  scrollContent: {
    padding: SKATE.spacing.lg,
    paddingBottom: SKATE.spacing.xxl * 2,
  },

  // Header
  heroTitle: {
    color: SKATE.colors.white,
    fontSize: SKATE.fontSize.hero,
    fontWeight: SKATE.fontWeight.black,
    letterSpacing: 2,
    textAlign: "center",
    marginBottom: SKATE.spacing.xxl,
    marginTop: SKATE.spacing.md,
  },

  // Action buttons
  quickMatchButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SKATE.colors.orange,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.xl,
    marginBottom: SKATE.spacing.md,
    minHeight: 80,
  },
  challengeButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.xl,
    marginBottom: SKATE.spacing.lg,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
    minHeight: 80,
  },
  actionButtonIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: SKATE.spacing.lg,
  },
  actionButtonText: {
    flex: 1,
  },
  actionTitle: {
    color: SKATE.colors.white,
    fontSize: SKATE.fontSize.xl,
    fontWeight: SKATE.fontWeight.bold,
    letterSpacing: 1,
  },
  actionSubtitle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: SKATE.fontSize.md,
    marginTop: 2,
  },

  // Quick Match overlay
  matchOverlay: {
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    borderWidth: 1,
    borderColor: SKATE.colors.orange,
    padding: SKATE.spacing.xxl,
    marginBottom: SKATE.spacing.lg,
    alignItems: "center",
  },
  matchOverlayText: {
    color: SKATE.colors.lightGray,
    fontSize: SKATE.fontSize.lg,
    marginTop: SKATE.spacing.md,
  },
  matchOverlayTitle: {
    color: SKATE.colors.neon,
    fontSize: SKATE.fontSize.title,
    fontWeight: SKATE.fontWeight.bold,
    marginTop: SKATE.spacing.md,
  },
  matchOverlayOpponent: {
    color: SKATE.colors.white,
    fontSize: SKATE.fontSize.xxl,
    fontWeight: SKATE.fontWeight.bold,
    marginTop: SKATE.spacing.sm,
  },
  matchAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: SKATE.colors.orange,
  },
  matchAvatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: SKATE.colors.darkGray,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: SKATE.colors.orange,
  },
  letsGoButton: {
    backgroundColor: SKATE.colors.orange,
    paddingVertical: SKATE.spacing.md,
    paddingHorizontal: SKATE.spacing.xxl * 2,
    borderRadius: SKATE.borderRadius.lg,
    marginTop: SKATE.spacing.xl,
    minHeight: SKATE.accessibility.minimumTouchTarget,
    justifyContent: "center",
    alignItems: "center",
  },
  letsGoText: {
    color: SKATE.colors.white,
    fontSize: SKATE.fontSize.xl,
    fontWeight: SKATE.fontWeight.black,
    letterSpacing: 2,
  },
  dismissButton: {
    marginTop: SKATE.spacing.md,
    padding: SKATE.spacing.sm,
    minHeight: SKATE.accessibility.minimumTouchTarget,
    justifyContent: "center",
  },
  dismissText: {
    color: SKATE.colors.gray,
    fontSize: SKATE.fontSize.md,
  },

  // Divider
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: SKATE.spacing.lg,
    gap: SKATE.spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: SKATE.colors.darkGray,
  },
  dividerText: {
    color: SKATE.colors.gray,
    fontSize: SKATE.fontSize.xs,
    fontWeight: SKATE.fontWeight.bold,
    letterSpacing: 2,
  },

  // Empty games
  emptyGames: {
    alignItems: "center",
    paddingVertical: SKATE.spacing.xxl * 2,
  },
  emptyGamesText: {
    color: SKATE.colors.white,
    fontSize: SKATE.fontSize.lg,
    fontWeight: SKATE.fontWeight.bold,
    marginTop: SKATE.spacing.md,
  },
  emptyGamesSubtext: {
    color: SKATE.colors.gray,
    fontSize: SKATE.fontSize.md,
    marginTop: SKATE.spacing.xs,
  },

  // Game cards
  gameCard: {
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
    marginBottom: SKATE.spacing.md,
    overflow: "hidden",
  },
  gameCardMyTurn: {
    borderColor: SKATE.colors.orange,
  },
  yourTurnBanner: {
    backgroundColor: SKATE.colors.orange,
    paddingVertical: SKATE.spacing.sm,
    paddingHorizontal: SKATE.spacing.lg,
  },
  yourTurnText: {
    color: SKATE.colors.white,
    fontSize: SKATE.fontSize.sm,
    fontWeight: SKATE.fontWeight.bold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  gameCardBody: {
    flexDirection: "row",
    alignItems: "center",
    padding: SKATE.spacing.lg,
  },
  gameAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: SKATE.spacing.md,
  },
  gameAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: SKATE.spacing.md,
    backgroundColor: SKATE.colors.darkGray,
    justifyContent: "center",
    alignItems: "center",
  },
  gameAvatarInitial: {
    color: SKATE.colors.orange,
    fontSize: SKATE.fontSize.xl,
    fontWeight: SKATE.fontWeight.bold,
  },
  gameInfo: {
    flex: 1,
  },
  gameOpponent: {
    color: SKATE.colors.white,
    fontSize: SKATE.fontSize.lg,
    fontWeight: SKATE.fontWeight.bold,
  },
  lettersRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  lettersLabel: {
    color: SKATE.colors.gray,
    fontSize: SKATE.fontSize.sm,
  },
  lettersValue: {
    color: SKATE.colors.lightGray,
    fontSize: SKATE.fontSize.sm,
    fontWeight: SKATE.fontWeight.bold,
  },
  lettersSep: {
    color: SKATE.colors.darkGray,
    fontSize: SKATE.fontSize.sm,
  },
  goButton: {
    backgroundColor: SKATE.colors.orange,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  goButtonText: {
    color: SKATE.colors.white,
    fontSize: SKATE.fontSize.md,
    fontWeight: SKATE.fontWeight.bold,
  },
});
