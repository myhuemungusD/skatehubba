/**
 * Play S.K.A.T.E. — Optimized 2-Click Start (matches web flow)
 *
 * Top: "Play Random" + "Challenge Player" big action buttons
 * Middle: Searching/waiting overlay when matchmaking
 * Bottom: Existing challenges list
 */

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase.config";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useRouter } from "expo-router";
import { Challenge } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { SKATE } from "@/theme";
import { ChallengesSkeleton } from "@/components/common/Skeleton";
import { ScreenErrorBoundary } from "@/components/common/ScreenErrorBoundary";
import { RemoteSkateService } from "@/lib/remoteSkateService";
import { showMessage } from "react-native-flash-message";

type MatchState = "idle" | "searching" | "waiting";

function ChallengesScreenContent() {
  const { user, isAuthenticated } = useRequireAuth();
  const router = useRouter();

  const [matchState, setMatchState] = useState<MatchState>("idle");
  const [waitingGameId, setWaitingGameId] = useState<string | null>(null);
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [searchUsername, setSearchUsername] = useState("");
  const [isCreatingChallenge, setIsCreatingChallenge] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  const { data: challenges, isLoading } = useQuery({
    queryKey: ["challenges", user?.uid],
    queryFn: async () => {
      if (!user) return [];

      const q = query(
        collection(db, "challenges"),
        where("participants", "array-contains", user.uid)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        deadline: doc.data().deadline?.toDate(),
      })) as Challenge[];
    },
    enabled: !!user,
  });

  // Clean up game subscription on unmount
  useEffect(() => {
    return () => {
      if (unsubRef.current) unsubRef.current();
    };
  }, []);

  // Subscribe to waiting game — auto-transition when opponent joins
  useEffect(() => {
    if (matchState !== "waiting" || !waitingGameId) return;

    const unsub = RemoteSkateService.subscribeToGame(waitingGameId, (game) => {
      if (game && game.status === "active") {
        showMessage({ message: "Opponent joined! Game on!", type: "success" });
        setMatchState("idle");
        setWaitingGameId(null);
        router.push(`/game/${waitingGameId}`);
      }
    });

    unsubRef.current = unsub;
    return () => {
      unsub();
      unsubRef.current = null;
    };
  }, [matchState, waitingGameId, router]);

  // ── Play Random ────────────────────────────────────────────────────────────
  const handlePlayRandom = useCallback(async () => {
    setMatchState("searching");
    try {
      const { gameId, matched } = await RemoteSkateService.findRandomGame();
      if (matched) {
        showMessage({ message: "Match found! Let's go!", type: "success" });
        setMatchState("idle");
        router.push(`/game/${gameId}`);
      } else {
        // Waiting for opponent — subscription above handles transition
        setWaitingGameId(gameId);
        setMatchState("waiting");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to find match";
      showMessage({ message: msg, type: "danger" });
      setMatchState("idle");
    }
  }, [router]);

  // ── Cancel Search ──────────────────────────────────────────────────────────
  const handleCancelSearch = useCallback(async () => {
    if (waitingGameId) {
      try {
        await RemoteSkateService.cancelWaitingGame(waitingGameId);
      } catch {
        // Ignore — game may already be matched
      }
    }
    setWaitingGameId(null);
    setMatchState("idle");
  }, [waitingGameId]);

  // ── Challenge by Username ──────────────────────────────────────────────────
  const handleChallengeSubmit = useCallback(async () => {
    const trimmed = searchUsername.trim();
    if (!trimmed) return;

    setIsCreatingChallenge(true);
    try {
      const gameId = await RemoteSkateService.createGame();
      showMessage({
        message: `Game created! Share the ID with @${trimmed} to start.`,
        type: "success",
      });
      setShowSearchInput(false);
      setSearchUsername("");
      router.push(`/game/${gameId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create game";
      showMessage({ message: msg, type: "danger" });
    } finally {
      setIsCreatingChallenge(false);
    }
  }, [searchUsername, router]);

  // Unauthenticated users are redirected to sign-in by the root layout guard.
  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={SKATE.colors.orange} />
      </View>
    );
  }

  const renderChallenge = ({ item }: { item: Challenge }) => {
    const isCreator = item.createdBy === user?.uid;
    const opponentId = isCreator ? item.opponent : item.createdBy;

    return (
      <TouchableOpacity
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${isCreator ? "Your challenge" : "Challenge from opponent"} versus ${opponentId}, deadline ${format(item.deadline, "MMM d, h:mm a")}, status ${item.status}`}
        style={styles.card}
        onPress={() => router.push(`/challenge/${item.id}`)}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>
            {isCreator ? "Your Challenge" : "Challenge from Opponent"}
          </Text>
          <StatusBadge status={item.status} />
        </View>

        <Text style={styles.opponent}>vs. {opponentId}</Text>
        <Text style={styles.deadline}>Deadline: {format(item.deadline, "MMM d, h:mm a")}</Text>

        {item.status === "pending" && !isCreator && (
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Respond to challenge now"
            style={styles.respondButton}
          >
            <Text style={styles.respondButtonText}>Respond Now</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  // ── Searching / Waiting overlay ────────────────────────────────────────────
  if (matchState === "searching" || matchState === "waiting") {
    return (
      <View testID="challenges-screen" style={styles.container}>
        <View style={styles.searchingOverlay}>
          <View style={styles.spinnerRing}>
            <ActivityIndicator size="large" color="#a855f7" />
          </View>
          <Text style={styles.searchingTitle}>
            {matchState === "searching" ? "Finding Opponent..." : "Waiting for Opponent..."}
          </Text>
          <Text style={styles.searchingSubtext}>
            {matchState === "searching"
              ? "Looking for available games"
              : "Your game is live — someone will join soon!"}
          </Text>
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Cancel search"
            style={styles.cancelButton}
            onPress={handleCancelSearch}
          >
            <Ionicons name="close" size={18} color={SKATE.colors.lightGray} />
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Search Player input ────────────────────────────────────────────────────
  if (showSearchInput) {
    return (
      <View testID="challenges-screen" style={styles.container}>
        <View style={styles.searchSection}>
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.backButton}
            onPress={() => {
              setShowSearchInput(false);
              setSearchUsername("");
            }}
          >
            <Ionicons name="arrow-back" size={16} color={SKATE.colors.lightGray} />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>

          <Text style={styles.searchTitle}>Challenge a Skater</Text>
          <Text style={styles.searchSubtext}>Enter their username to start a battle</Text>

          <TextInput
            style={styles.searchInput}
            value={searchUsername}
            onChangeText={setSearchUsername}
            placeholder="@username"
            placeholderTextColor={SKATE.colors.gray}
            autoCapitalize="none"
            autoCorrect={false}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional UX: user just tapped "Challenge Player"
            autoFocus
            editable={!isCreatingChallenge}
            onSubmitEditing={handleChallengeSubmit}
            returnKeyType="go"
          />

          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Send challenge"
            style={[
              styles.challengeSubmitButton,
              (!searchUsername.trim() || isCreatingChallenge) && styles.disabledButton,
            ]}
            onPress={handleChallengeSubmit}
            disabled={!searchUsername.trim() || isCreatingChallenge}
          >
            {isCreatingChallenge ? (
              <ActivityIndicator size="small" color={SKATE.colors.ink} />
            ) : (
              <>
                <Ionicons name="send" size={18} color={SKATE.colors.ink} />
                <Text style={styles.challengeSubmitText}>Challenge</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Main view: 2 big action buttons + challenges list ──────────────────────
  return (
    <View testID="challenges-screen" style={styles.container}>
      <FlatList
        testID="challenges-list"
        data={challenges}
        renderItem={renderChallenge}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            {/* Two big action buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                accessible
                accessibilityRole="button"
                accessibilityLabel="Play random opponent"
                testID="play-random"
                style={styles.actionCard}
                onPress={handlePlayRandom}
              >
                <View style={[styles.actionIcon, styles.actionIconPurple]}>
                  <Ionicons name="shuffle" size={28} color="#a855f7" />
                </View>
                <Text style={styles.actionTitle}>Play Random</Text>
                <Text style={styles.actionDesc}>Instant match</Text>
              </TouchableOpacity>

              <TouchableOpacity
                accessible
                accessibilityRole="button"
                accessibilityLabel="Challenge a specific player"
                testID="challenge-player"
                style={styles.actionCard}
                onPress={() => setShowSearchInput(true)}
              >
                <View style={[styles.actionIcon, styles.actionIconYellow]}>
                  <Ionicons name="search" size={28} color="#eab308" />
                </View>
                <Text style={styles.actionTitle}>Challenge Player</Text>
                <Text style={styles.actionDesc}>Pick a skater</Text>
              </TouchableOpacity>
            </View>

            {/* Section label for challenges list */}
            {challenges && challenges.length > 0 && (
              <Text style={styles.sectionLabel}>Your Challenges</Text>
            )}
          </>
        }
        ListEmptyComponent={
          isLoading ? (
            <ChallengesSkeleton />
          ) : (
            <View testID="challenges-empty" style={styles.emptyState}>
              <Ionicons name="videocam-outline" size={64} color={SKATE.colors.gray} />
              <Text style={styles.emptyText}>No challenges yet</Text>
              <Text style={styles.emptySubtext}>Tap Play Random to jump into a game!</Text>
            </View>
          )
        }
      />
    </View>
  );
}

export default function ChallengesScreen() {
  return (
    <ScreenErrorBoundary screenName="Challenges">
      <ChallengesScreenContent />
    </ScreenErrorBoundary>
  );
}

function StatusBadge({ status }: { status: Challenge["status"] }) {
  const colors = {
    pending: SKATE.colors.orange,
    accepted: "#007aff",
    completed: SKATE.colors.neon,
    forfeit: SKATE.colors.blood,
  };

  return (
    <View style={[styles.badge, { backgroundColor: colors[status] }]}>
      <Text style={styles.badgeText}>{status.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
  },
  list: {
    padding: SKATE.spacing.lg,
    gap: SKATE.spacing.md,
  },

  // ── Action buttons ──────────────────────────────────────────────────────
  actionRow: {
    flexDirection: "row",
    gap: SKATE.spacing.md,
    marginBottom: SKATE.spacing.xl,
  },
  actionCard: {
    flex: 1,
    alignItems: "center",
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    paddingVertical: SKATE.spacing.xl,
    paddingHorizontal: SKATE.spacing.md,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
    gap: SKATE.spacing.sm,
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: SKATE.spacing.xs,
  },
  actionIconPurple: {
    backgroundColor: "rgba(168, 85, 247, 0.15)",
  },
  actionIconYellow: {
    backgroundColor: "rgba(234, 179, 8, 0.15)",
  },
  actionTitle: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  actionDesc: {
    color: SKATE.colors.gray,
    fontSize: 12,
    textAlign: "center",
  },

  // ── Section label ─────────────────────────────────────────────────────────
  sectionLabel: {
    color: SKATE.colors.lightGray,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: SKATE.spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  // ── Challenge cards ─────────────────────────────────────────────────────
  card: {
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.lg,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SKATE.spacing.sm,
  },
  cardTitle: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
  },
  badge: {
    paddingHorizontal: SKATE.spacing.sm,
    paddingVertical: SKATE.spacing.xs,
    borderRadius: SKATE.borderRadius.sm,
  },
  badgeText: {
    color: SKATE.colors.white,
    fontSize: 10,
    fontWeight: "bold",
  },
  opponent: {
    color: SKATE.colors.orange,
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: SKATE.spacing.xs,
  },
  deadline: {
    color: SKATE.colors.lightGray,
    fontSize: 14,
  },
  respondButton: {
    backgroundColor: SKATE.colors.orange,
    padding: SKATE.spacing.md,
    borderRadius: SKATE.borderRadius.md,
    marginTop: SKATE.spacing.md,
    alignItems: "center",
    minHeight: SKATE.accessibility.minimumTouchTarget,
  },
  respondButtonText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
  },

  // ── Empty state ─────────────────────────────────────────────────────────
  emptyState: {
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
  },
  emptyText: {
    color: SKATE.colors.white,
    fontSize: 20,
    fontWeight: "bold",
    marginTop: SKATE.spacing.lg,
  },
  emptySubtext: {
    color: SKATE.colors.lightGray,
    fontSize: 14,
    marginTop: SKATE.spacing.sm,
  },

  // ── Searching / Waiting overlay ─────────────────────────────────────────
  searchingOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: SKATE.spacing.lg,
    padding: SKATE.spacing.xl,
  },
  spinnerRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(168, 85, 247, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(168, 85, 247, 0.3)",
  },
  searchingTitle: {
    color: SKATE.colors.white,
    fontSize: 20,
    fontWeight: "bold",
  },
  searchingSubtext: {
    color: SKATE.colors.gray,
    fontSize: 14,
    textAlign: "center",
  },
  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
    paddingVertical: SKATE.spacing.md,
    paddingHorizontal: SKATE.spacing.xl,
    borderRadius: SKATE.borderRadius.lg,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
    minHeight: SKATE.accessibility.minimumTouchTarget,
  },
  cancelButtonText: {
    color: SKATE.colors.lightGray,
    fontSize: 14,
  },

  // ── Search Player input ─────────────────────────────────────────────────
  searchSection: {
    padding: SKATE.spacing.xl,
    gap: SKATE.spacing.lg,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.xs,
    minHeight: SKATE.accessibility.minimumTouchTarget,
    justifyContent: "flex-start",
  },
  backButtonText: {
    color: SKATE.colors.lightGray,
    fontSize: 14,
  },
  searchTitle: {
    color: SKATE.colors.white,
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
  },
  searchSubtext: {
    color: SKATE.colors.gray,
    fontSize: 14,
    textAlign: "center",
    marginTop: -SKATE.spacing.sm,
  },
  searchInput: {
    backgroundColor: SKATE.colors.grime,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
    borderRadius: SKATE.borderRadius.lg,
    paddingHorizontal: SKATE.spacing.lg,
    paddingVertical: SKATE.spacing.md,
    color: SKATE.colors.white,
    fontSize: 16,
    minHeight: SKATE.accessibility.minimumTouchTarget,
  },
  challengeSubmitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SKATE.spacing.sm,
    backgroundColor: "#eab308",
    paddingVertical: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.lg,
    minHeight: SKATE.accessibility.minimumTouchTarget,
  },
  challengeSubmitText: {
    color: SKATE.colors.ink,
    fontSize: 16,
    fontWeight: "bold",
  },
  disabledButton: {
    opacity: 0.5,
  },
});
