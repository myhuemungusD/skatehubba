import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useState, useCallback, useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import { useAuth } from "@/hooks/useAuth";
import {
  useGameSession,
  useSubmitTrick,
  useJudgeTrick,
  useJoinGame,
  useAbandonGame,
  useSetterBail,
} from "@/hooks/useGameSession";
import { useVideoUrl } from "@/hooks/useVideoUrl";
import { useGameStore, usePlayerRole, useActiveOverlay } from "@/store/gameStore";
import { useReconnectionStatus } from "@/store/networkStore";
import { useGameEffects } from "@/hooks/useGameEffects";
import { GameHeader } from "@/components/game/GameHeader";
import { PlayersSection } from "@/components/game/PlayersSection";
import { TrickPreviewSection } from "@/components/game/TrickPreviewSection";
import { JudgingSection } from "@/components/game/JudgingSection";
import { GameActionArea } from "@/components/game/GameActionArea";
import { ChallengeReceivedView } from "@/components/game/ChallengeReceivedView";
import { WaitingForOpponentView } from "@/components/game/WaitingForOpponentView";
import { TurnOverlay } from "@/components/game/TurnOverlay";
import { TrickRecorder } from "@/components/game/TrickRecorder";
import { ResultScreen } from "@/components/game/ResultScreen";
import type { SkateLetter, Move } from "@/types";

/** Firestore auto-generated IDs: exactly 20 alphanumeric characters. */
const VALID_GAME_ID = /^[a-zA-Z0-9]{20}$/;

/** Find the most recent match move with a pending result. */
function findLatestPendingMatch(moves: Move[]): Move | null {
  return [...moves].reverse().find((m) => m.type === "match" && m.result === "pending") ?? null;
}

/**
 * Main S.K.A.T.E. Battle Screen
 *
 * Implements the turn-based trick challenge flow:
 * 1. Attacker records and sets a trick
 * 2. Defender watches the trick and records their attempt
 * 3. Result is judged (landed or bailed)
 * 4. If bailed, defender gets a letter
 * 5. If defender has S-K-A-T-E, attacker wins
 */
export default function GameScreen() {
  const router = useRouter();
  const { id: rawGameId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  // Validate gameId format — reject malicious deep links
  const gameId = rawGameId && VALID_GAME_ID.test(rawGameId) ? rawGameId : null;
  const isInvalidId = !!rawGameId && !gameId;

  // Game state from Firestore
  const { gameSession, isLoading } = useGameSession(gameId);

  // Local UI state from Zustand
  const { dismissOverlay, pendingUpload } = useGameStore();
  const activeOverlay = useActiveOverlay();
  const { isAttacker, isDefender, isMyTurn } = usePlayerRole(gameSession);

  // Network state for offline handling
  const { isConnected } = useReconnectionStatus();

  // Local state
  const [showRecorder, setShowRecorder] = useState(false);
  const [lastAnnouncedLetter, setLastAnnouncedLetter] = useState<SkateLetter | null>(null);

  // Mutations
  const submitTrickMutation = useSubmitTrick(gameId || "");
  const judgeTrickMutation = useJudgeTrick(gameId || "");
  const joinGameMutation = useJoinGame(gameId || "");
  const abandonGameMutation = useAbandonGame(gameId || "");
  const setterBailMutation = useSetterBail(gameId || "");

  // Consolidated side effects (analytics, overlays, offline, caching)
  useGameEffects({
    gameId,
    rawGameId,
    isInvalidId,
    userId: user?.uid,
    gameSession,
    lastAnnouncedLetter,
    setLastAnnouncedLetter,
    abandonGameMutation,
  });

  // Handlers
  const handleRecordTrick = useCallback(() => {
    setShowRecorder(true);
  }, []);

  const handleRecordComplete = useCallback(
    (videoUri: string, trickName: string | null) => {
      setShowRecorder(false);

      if (!gameSession) return;

      const isSettingTrick = gameSession.turnPhase === "attacker_recording" && isAttacker;

      submitTrickMutation.mutate({
        localVideoUri: videoUri,
        trickName,
        isSetTrick: isSettingTrick,
      });
    },
    [gameSession, isAttacker, submitTrickMutation]
  );

  const handleJudge = useCallback(
    (vote: "landed" | "bailed") => {
      if (!gameSession?.currentSetMove) return;

      const latestMatch = findLatestPendingMatch(gameSession.moves);

      if (!latestMatch) return;

      judgeTrickMutation.mutate({
        moveId: latestMatch.id,
        vote,
      });
    },
    [gameSession, judgeTrickMutation]
  );

  const handleJoinGame = useCallback(() => {
    joinGameMutation.mutate();
  }, [joinGameMutation]);

  const handleForfeit = useCallback(() => {
    Alert.alert("Forfeit Game", "Are you sure you want to forfeit? Your opponent will win.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Forfeit",
        style: "destructive",
        onPress: () => abandonGameMutation.mutate(),
      },
    ]);
  }, [abandonGameMutation]);

  const handleSetterBail = useCallback(() => {
    Alert.alert("Bail Your Trick", "You'll take a letter and roles will swap. Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "I Bailed",
        style: "destructive",
        onPress: () => setterBailMutation.mutate(),
      },
    ]);
  }, [setterBailMutation]);

  const handleExit = useCallback(() => {
    router.replace("/(tabs)/challenges");
  }, [router]);

  const handleRematch = useCallback(() => {
    if (!gameSession) return;

    const opponentId =
      gameSession.player1Id === user?.uid ? gameSession.player2Id : gameSession.player1Id;

    router.push(`/challenge/new?opponentUid=${opponentId}`);
  }, [gameSession, user?.uid, router]);

  const handleCloseRecorder = useCallback(() => {
    setShowRecorder(false);
  }, []);

  // Computed values
  const canRecord = useMemo(() => {
    if (!isConnected) return false;
    if (!gameSession || !isMyTurn) return false;

    return (
      (gameSession.turnPhase === "attacker_recording" && isAttacker) ||
      (gameSession.turnPhase === "defender_recording" && isDefender)
    );
  }, [gameSession, isMyTurn, isAttacker, isDefender, isConnected]);

  const { canJudge, hasVoted, myVote, opponentVote } = useMemo(() => {
    if (!isConnected) {
      return { canJudge: false, hasVoted: false, myVote: null, opponentVote: null };
    }
    if (!gameSession || gameSession.turnPhase !== "judging" || !user?.uid) {
      return { canJudge: false, hasVoted: false, myVote: null, opponentVote: null };
    }

    const latestMatchMove = findLatestPendingMatch(gameSession.moves);

    if (!latestMatchMove || !latestMatchMove.judgmentVotes) {
      return { canJudge: true, hasVoted: false, myVote: null, opponentVote: null };
    }

    const votes = latestMatchMove.judgmentVotes;
    const myVote = isAttacker ? votes.attackerVote : votes.defenderVote;
    const opponentVote = isAttacker ? votes.defenderVote : votes.attackerVote;
    const hasVoted = myVote !== null;

    return { canJudge: !hasVoted, hasVoted, myVote, opponentVote };
  }, [gameSession, user?.uid, isAttacker, isConnected]);

  const isWaiting = useMemo(() => {
    if (!gameSession) return false;

    return (
      (gameSession.turnPhase === "attacker_recording" && !isAttacker) ||
      (gameSession.turnPhase === "defender_recording" && !isDefender)
    );
  }, [gameSession, isAttacker, isDefender]);

  const latestMatchMove = useMemo(() => {
    if (!gameSession) return null;
    return [...gameSession.moves].reverse().find((m) => m.type === "match") || null;
  }, [gameSession]);

  // Resolve video URLs via signed URL Cloud Function
  const setMoveVideo = useVideoUrl(
    gameSession?.currentSetMove?.storagePath,
    gameId || "",
    gameSession?.currentSetMove?.clipUrl
  );
  const matchMoveVideo = useVideoUrl(
    latestMatchMove?.storagePath,
    gameId || "",
    latestMatchMove?.clipUrl
  );

  // Invalid game ID from deep link
  if (isInvalidId) {
    if (__DEV__) {
      console.warn("[GameScreen] Invalid game ID from deep link:", rawGameId);
    }
    return (
      <View testID="game-invalid-id" style={styles.loadingContainer}>
        <Ionicons name="warning" size={48} color={SKATE.colors.blood} />
        <Text style={styles.loadingText}>Invalid game link</Text>
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Go back to challenges"
          style={styles.cancelButton}
          onPress={() => router.replace("/(tabs)/challenges")}
        >
          <Text style={styles.cancelButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Loading state
  if (isLoading || !gameSession) {
    return (
      <View testID="game-loading" style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={SKATE.colors.orange} />
        <Text style={styles.loadingText}>Loading battle...</Text>
      </View>
    );
  }

  // Game completed — show result screen
  if (gameSession.status === "completed" || gameSession.status === "abandoned") {
    return (
      <ResultScreen
        gameSession={gameSession}
        currentUserId={user?.uid || ""}
        onExit={handleExit}
        onRematch={handleRematch}
      />
    );
  }

  // Waiting for player 2 to accept
  if (gameSession.status === "waiting" && user?.uid === gameSession.player2Id) {
    return (
      <ChallengeReceivedView
        challengerName={gameSession.player1DisplayName}
        onAccept={handleJoinGame}
        onDecline={handleExit}
        isAccepting={joinGameMutation.isPending}
      />
    );
  }

  // Waiting for opponent to join (player 1 view)
  if (gameSession.status === "waiting" && user?.uid === gameSession.player1Id) {
    return (
      <WaitingForOpponentView opponentName={gameSession.player2DisplayName} onCancel={handleExit} />
    );
  }

  // Main battle UI
  return (
    <View testID="game-battle-screen" style={styles.container}>
      <GameHeader
        roundNumber={gameSession.roundNumber}
        paddingTop={insets.top}
        onForfeit={handleForfeit}
        onExit={handleExit}
        myLetterCount={
          gameSession.player1Id === user?.uid
            ? gameSession.player1Letters.length
            : gameSession.player2Letters.length
        }
        oppLetterCount={
          gameSession.player1Id === user?.uid
            ? gameSession.player2Letters.length
            : gameSession.player1Letters.length
        }
      />

      <PlayersSection
        player1Letters={gameSession.player1Letters}
        player1DisplayName={gameSession.player1DisplayName}
        player1Id={gameSession.player1Id}
        player2Letters={gameSession.player2Letters}
        player2DisplayName={gameSession.player2DisplayName}
        player2Id={gameSession.player2Id}
        currentUserId={user?.uid}
        currentAttacker={gameSession.currentAttacker}
      />

      {gameSession.currentSetMove && gameSession.turnPhase === "defender_recording" && (
        <TrickPreviewSection
          trickName={gameSession.currentSetMove.trickName}
          videoUrl={setMoveVideo.url}
          videoIsLoading={setMoveVideo.isLoading}
        />
      )}

      {gameSession.turnPhase === "judging" && (
        <JudgingSection
          latestMatchMove={latestMatchMove}
          matchMoveVideoUrl={matchMoveVideo.url}
          matchMoveVideoIsLoading={matchMoveVideo.isLoading}
          canJudge={canJudge}
          hasVoted={hasVoted}
          myVote={myVote}
          opponentVote={opponentVote}
          onJudge={handleJudge}
          isJudging={judgeTrickMutation.isPending}
        />
      )}

      <GameActionArea
        canRecord={canRecord}
        isAttacker={isAttacker}
        isWaiting={isWaiting}
        isJudging={gameSession.turnPhase === "judging"}
        isUploading={submitTrickMutation.isPending}
        uploadProgress={pendingUpload?.progress}
        onRecordTrick={handleRecordTrick}
        onSetterBail={
          isAttacker && gameSession.turnPhase === "attacker_recording"
            ? handleSetterBail
            : undefined
        }
        setterBailPending={setterBailMutation.isPending}
      />

      <TurnOverlay overlay={activeOverlay} onDismiss={dismissOverlay} />

      <TrickRecorder
        visible={showRecorder}
        onClose={handleCloseRecorder}
        onRecordComplete={handleRecordComplete}
        isSettingTrick={isAttacker}
        trickToMatch={gameSession.currentSetMove?.trickName || undefined}
        isUploading={submitTrickMutation.isPending}
        uploadProgress={pendingUpload?.progress || 0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
    justifyContent: "center",
    alignItems: "center",
    gap: SKATE.spacing.lg,
  },
  loadingText: {
    color: SKATE.colors.lightGray,
    fontSize: 16,
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
