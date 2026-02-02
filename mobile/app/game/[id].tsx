import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Video, ResizeMode } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import { useAuth } from "@/hooks/useAuth";
import {
  useGameSession,
  useSubmitTrick,
  useJudgeTrick,
  useJoinGame,
  useAbandonGame,
} from "@/hooks/useGameSession";
import { useGameStore, usePlayerRole, useActiveOverlay } from "@/store/gameStore";
import { LetterIndicator } from "@/components/game/LetterIndicator";
import { TurnOverlay } from "@/components/game/TurnOverlay";
import { TrickRecorder } from "@/components/game/TrickRecorder";
import { ResultScreen } from "@/components/game/ResultScreen";
import { logEvent } from "@/lib/analytics/logEvent";
import type { GameOverlay, SkateLetter } from "@/types";

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
  const { id: gameId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  // Game state from Firestore
  const { gameSession, isLoading } = useGameSession(gameId || null);

  // Local UI state from Zustand
  const {
    initGame,
    resetGame,
    showOverlay,
    dismissOverlay,
    openCamera,
    showCamera,
    pendingUpload,
  } = useGameStore();

  const activeOverlay = useActiveOverlay();
  const { isAttacker, isDefender, isMyTurn } = usePlayerRole();

  // Local state
  const [showRecorder, setShowRecorder] = useState(false);
  const [lastAnnouncedLetter, setLastAnnouncedLetter] = useState<SkateLetter | null>(null);

  // Mutations
  const submitTrickMutation = useSubmitTrick(gameId || "");
  const judgeTrickMutation = useJudgeTrick(gameId || "");
  const joinGameMutation = useJoinGame(gameId || "");
  const abandonGameMutation = useAbandonGame(gameId || "");

  // Initialize game store
  useEffect(() => {
    if (gameId && user?.uid) {
      initGame(gameId, user.uid);
    }

    return () => {
      resetGame();
    };
  }, [gameId, user?.uid, initGame, resetGame]);

  // Track battle joined event
  useEffect(() => {
    if (gameSession && user?.uid && gameSession.status === "active") {
      logEvent("battle_joined", {
        battle_id: gameId,
        creator_id:
          gameSession.player1Id === user.uid
            ? undefined
            : gameSession.player1Id,
      });
    }
  }, [gameSession?.status, gameId, user?.uid, gameSession?.player1Id]);

  // Show turn announcements
  useEffect(() => {
    if (!gameSession || gameSession.status !== "active" || !user?.uid) return;

    const { turnPhase, currentTurn, currentAttacker } = gameSession;
    const isMe = currentTurn === user.uid;
    const iAmAttacker = currentAttacker === user.uid;

    // Determine overlay based on turn phase
    let overlay: GameOverlay | null = null;

    if (turnPhase === "attacker_recording" && isMe && iAmAttacker) {
      overlay = {
        type: "turn_start",
        title: "YOUR SET",
        subtitle: "Record the trick your opponent must match",
        playerId: user.uid,
        letter: null,
        autoDismissMs: 2500,
      };
    } else if (turnPhase === "defender_recording" && isMe && !iAmAttacker) {
      overlay = {
        type: "turn_start",
        title: "YOUR TURN",
        subtitle: gameSession.currentSetMove?.trickName
          ? `Match: ${gameSession.currentSetMove.trickName}`
          : "Match the trick!",
        playerId: user.uid,
        letter: null,
        autoDismissMs: 2500,
      };
    } else if (turnPhase === "defender_recording" && !isMe) {
      overlay = {
        type: "waiting_opponent",
        title: "WAITING",
        subtitle: "Opponent is recording their attempt...",
        playerId: null,
        letter: null,
        autoDismissMs: null,
      };
    } else if (turnPhase === "attacker_uploaded" && !isMe) {
      overlay = {
        type: "waiting_opponent",
        title: "WAITING",
        subtitle: "Opponent is setting a trick...",
        playerId: null,
        letter: null,
        autoDismissMs: null,
      };
    }

    if (overlay) {
      showOverlay(overlay);
    }
  }, [
    gameSession?.turnPhase,
    gameSession?.currentTurn,
    gameSession?.currentAttacker,
    gameSession?.status,
    user?.uid,
    showOverlay,
    gameSession?.currentSetMove?.trickName,
  ]);

  // Announce new letters
  useEffect(() => {
    if (!gameSession || !user?.uid) return;

    const myLetters =
      gameSession.player1Id === user.uid
        ? gameSession.player1Letters
        : gameSession.player2Letters;

    const opponentLetters =
      gameSession.player1Id === user.uid
        ? gameSession.player2Letters
        : gameSession.player1Letters;

    // Check for new letter (compare with last announced)
    const allLetters = [...myLetters, ...opponentLetters];
    const latestLetter = allLetters[allLetters.length - 1];

    if (latestLetter && latestLetter !== lastAnnouncedLetter) {
      setLastAnnouncedLetter(latestLetter);

      const gotLetter =
        myLetters.length > 0 && myLetters[myLetters.length - 1] === latestLetter;

      if (gotLetter) {
        showOverlay({
          type: "letter_gained",
          title: "YOU GOT A LETTER",
          subtitle: myLetters.length === 5 ? "You've been S.K.A.T.E.d!" : null,
          playerId: user.uid,
          letter: latestLetter,
          autoDismissMs: 3000,
        });
      }
    }
  }, [
    gameSession?.player1Letters,
    gameSession?.player2Letters,
    gameSession?.player1Id,
    user?.uid,
    lastAnnouncedLetter,
    showOverlay,
  ]);

  // Handle game completion
  useEffect(() => {
    if (gameSession?.status === "completed" && gameId) {
      logEvent("battle_completed", {
        battle_id: gameId,
        winner_id: gameSession.winnerId || undefined,
        total_rounds: gameSession.roundNumber,
      });
    }
  }, [gameSession?.status, gameSession?.winnerId, gameSession?.roundNumber, gameId]);

  // Handlers
  const handleRecordTrick = useCallback(() => {
    setShowRecorder(true);
  }, []);

  const handleRecordComplete = useCallback(
    (videoUri: string, trickName: string | null) => {
      setShowRecorder(false);

      if (!gameSession) return;

      const isSettingTrick =
        gameSession.turnPhase === "attacker_recording" && isAttacker;

      submitTrickMutation.mutate({
        localVideoUri: videoUri,
        trickName,
        isSetTrick: isSettingTrick,
      });
    },
    [gameSession, isAttacker, submitTrickMutation]
  );

  const handleJudge = useCallback(
    (result: "landed" | "bailed") => {
      if (!gameSession?.currentSetMove) return;

      // Find the latest match move
      const latestMatchMove = [...gameSession.moves]
        .reverse()
        .find((m) => m.type === "match" && m.result === "pending");

      if (latestMatchMove) {
        judgeTrickMutation.mutate({
          moveId: latestMatchMove.id,
          result,
        });
      }
    },
    [gameSession, judgeTrickMutation]
  );

  const handleJoinGame = useCallback(() => {
    joinGameMutation.mutate();
  }, [joinGameMutation]);

  const handleForfeit = useCallback(() => {
    Alert.alert(
      "Forfeit Game",
      "Are you sure you want to forfeit? Your opponent will win.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Forfeit",
          style: "destructive",
          onPress: () => abandonGameMutation.mutate(),
        },
      ]
    );
  }, [abandonGameMutation]);

  const handleExit = useCallback(() => {
    router.replace("/(tabs)/challenges");
  }, [router]);

  const handleRematch = useCallback(() => {
    if (!gameSession) return;

    const opponentId =
      gameSession.player1Id === user?.uid
        ? gameSession.player2Id
        : gameSession.player1Id;

    router.push(`/challenge/new?opponentUid=${opponentId}`);
  }, [gameSession, user?.uid, router]);

  // Computed values
  const canRecord = useMemo(() => {
    if (!gameSession || !isMyTurn) return false;

    return (
      (gameSession.turnPhase === "attacker_recording" && isAttacker) ||
      (gameSession.turnPhase === "defender_recording" && isDefender)
    );
  }, [gameSession, isMyTurn, isAttacker, isDefender]);

  const canJudge = useMemo(() => {
    if (!gameSession || gameSession.turnPhase !== "judging") return false;

    // In a real app, you might have community voting
    // For now, the attacker judges
    return isAttacker;
  }, [gameSession, isAttacker]);

  const isWaiting = useMemo(() => {
    if (!gameSession) return false;

    return (
      (gameSession.turnPhase === "attacker_recording" && !isAttacker) ||
      (gameSession.turnPhase === "defender_recording" && !isDefender) ||
      (gameSession.turnPhase === "attacker_uploaded" && isAttacker)
    );
  }, [gameSession, isAttacker, isDefender]);

  // Loading state
  if (isLoading || !gameSession) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={SKATE.colors.orange} />
        <Text style={styles.loadingText}>Loading battle...</Text>
      </View>
    );
  }

  // Game completed - show result screen
  if (
    gameSession.status === "completed" ||
    gameSession.status === "abandoned"
  ) {
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
      <View style={styles.container}>
        <View style={styles.waitingCard}>
          <Ionicons name="flash" size={48} color={SKATE.colors.orange} />
          <Text style={styles.waitingTitle}>CHALLENGE RECEIVED</Text>
          <Text style={styles.waitingSubtitle}>
            {gameSession.player1DisplayName} wants to battle!
          </Text>

          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Accept the challenge and start the battle"
            style={styles.acceptButton}
            onPress={handleJoinGame}
            disabled={joinGameMutation.isPending}
          >
            {joinGameMutation.isPending ? (
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
            onPress={handleExit}
          >
            <Text style={styles.declineButtonText}>Decline</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Waiting for opponent to join (player 1 view)
  if (gameSession.status === "waiting" && user?.uid === gameSession.player1Id) {
    return (
      <View style={styles.container}>
        <View style={styles.waitingCard}>
          <ActivityIndicator size="large" color={SKATE.colors.orange} />
          <Text style={styles.waitingTitle}>WAITING FOR OPPONENT</Text>
          <Text style={styles.waitingSubtitle}>
            {gameSession.player2DisplayName} hasn't accepted yet...
          </Text>

          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Cancel the challenge"
            style={styles.cancelButton}
            onPress={handleExit}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Main battle UI
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Forfeit game"
          style={styles.headerButton}
          onPress={handleForfeit}
        >
          <Ionicons name="flag" size={24} color={SKATE.colors.blood} />
        </TouchableOpacity>

        <View style={styles.roundBadge}>
          <Text style={styles.roundText}>ROUND {gameSession.roundNumber}</Text>
        </View>

        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Exit to challenges"
          style={styles.headerButton}
          onPress={handleExit}
        >
          <Ionicons name="close" size={24} color={SKATE.colors.white} />
        </TouchableOpacity>
      </View>

      {/* Player Status Cards */}
      <View style={styles.playersSection}>
        <LetterIndicator
          letters={gameSession.player1Letters}
          playerName={gameSession.player1DisplayName}
          isCurrentPlayer={gameSession.player1Id === user?.uid}
          isAttacker={gameSession.currentAttacker === gameSession.player1Id}
        />

        <View style={styles.vsContainer}>
          <Text style={styles.vsText}>VS</Text>
        </View>

        <LetterIndicator
          letters={gameSession.player2Letters}
          playerName={gameSession.player2DisplayName}
          isCurrentPlayer={gameSession.player2Id === user?.uid}
          isAttacker={gameSession.currentAttacker === gameSession.player2Id}
        />
      </View>

      {/* Current Trick Preview (when defender needs to match) */}
      {gameSession.currentSetMove &&
        gameSession.turnPhase === "defender_recording" && (
          <View style={styles.trickPreview}>
            <Text style={styles.trickPreviewTitle}>TRICK TO MATCH</Text>
            {gameSession.currentSetMove.trickName && (
              <Text style={styles.trickName}>
                {gameSession.currentSetMove.trickName}
              </Text>
            )}
            <Video
              source={{ uri: gameSession.currentSetMove.clipUrl }}
              style={styles.previewVideo}
              useNativeControls
              isLooping
              resizeMode={ResizeMode.CONTAIN}
            />
          </View>
        )}

      {/* Judging Section */}
      {gameSession.turnPhase === "judging" && (
        <View style={styles.judgingSection}>
          <Text style={styles.judgingTitle}>DID THEY LAND IT?</Text>

          {/* Show the match attempt video */}
          {(() => {
            const latestMatch = [...gameSession.moves]
              .reverse()
              .find((m) => m.type === "match");
            if (latestMatch) {
              return (
                <Video
                  source={{ uri: latestMatch.clipUrl }}
                  style={styles.judgingVideo}
                  useNativeControls
                  isLooping
                  resizeMode={ResizeMode.CONTAIN}
                />
              );
            }
            return null;
          })()}

          {canJudge && (
            <View style={styles.judgingButtons}>
              <TouchableOpacity
                accessible
                accessibilityRole="button"
                accessibilityLabel="Mark trick as landed"
                style={[styles.judgeButton, styles.landedButton]}
                onPress={() => handleJudge("landed")}
                disabled={judgeTrickMutation.isPending}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={32}
                  color={SKATE.colors.white}
                />
                <Text style={styles.judgeButtonText}>LANDED</Text>
              </TouchableOpacity>

              <TouchableOpacity
                accessible
                accessibilityRole="button"
                accessibilityLabel="Mark trick as bailed"
                style={[styles.judgeButton, styles.bailedButton]}
                onPress={() => handleJudge("bailed")}
                disabled={judgeTrickMutation.isPending}
              >
                <Ionicons
                  name="close-circle"
                  size={32}
                  color={SKATE.colors.white}
                />
                <Text style={styles.judgeButtonText}>BAILED</Text>
              </TouchableOpacity>
            </View>
          )}

          {!canJudge && (
            <View style={styles.waitingJudgment}>
              <ActivityIndicator color={SKATE.colors.orange} />
              <Text style={styles.waitingJudgmentText}>
                Waiting for judgment...
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Action Area */}
      <View style={styles.actionArea}>
        {canRecord && (
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel={
              isAttacker ? "Record trick to set" : "Record your attempt"
            }
            style={styles.recordButton}
            onPress={handleRecordTrick}
            disabled={submitTrickMutation.isPending}
          >
            {submitTrickMutation.isPending ? (
              <View style={styles.uploadingContainer}>
                <ActivityIndicator color={SKATE.colors.white} />
                <Text style={styles.uploadingText}>
                  {pendingUpload?.progress
                    ? `${pendingUpload.progress}%`
                    : "Uploading..."}
                </Text>
              </View>
            ) : (
              <>
                <Ionicons
                  name="videocam"
                  size={32}
                  color={SKATE.colors.white}
                />
                <Text style={styles.recordButtonText}>
                  {isAttacker ? "RECORD TRICK" : "RECORD ATTEMPT"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {isWaiting && gameSession.turnPhase !== "judging" && (
          <View style={styles.waitingIndicator}>
            <ActivityIndicator color={SKATE.colors.orange} size="large" />
            <Text style={styles.waitingText}>Waiting for opponent...</Text>
          </View>
        )}
      </View>

      {/* Turn Overlay */}
      <TurnOverlay overlay={activeOverlay} onDismiss={dismissOverlay} />

      {/* Trick Recorder Modal */}
      <TrickRecorder
        visible={showRecorder}
        onClose={() => setShowRecorder(false)}
        onRecordComplete={handleRecordComplete}
        isSettingTrick={isAttacker}
        trickToMatch={
          gameSession.currentSetMove?.trickName || undefined
        }
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SKATE.spacing.lg,
    paddingTop: 60, // Safe area
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
  playersSection: {
    flexDirection: "row",
    padding: SKATE.spacing.lg,
    gap: SKATE.spacing.sm,
    alignItems: "flex-start",
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
  trickPreview: {
    margin: SKATE.spacing.lg,
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.md,
    borderWidth: 2,
    borderColor: SKATE.colors.orange,
  },
  trickPreviewTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: SKATE.colors.orange,
    letterSpacing: 2,
    marginBottom: SKATE.spacing.sm,
    textAlign: "center",
  },
  trickName: {
    fontSize: 18,
    fontWeight: "bold",
    color: SKATE.colors.white,
    textAlign: "center",
    marginBottom: SKATE.spacing.md,
  },
  previewVideo: {
    width: "100%",
    height: 200,
    borderRadius: SKATE.borderRadius.md,
    backgroundColor: SKATE.colors.ink,
  },
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
    marginBottom: SKATE.spacing.lg,
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
  actionArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SKATE.spacing.xl,
  },
  recordButton: {
    backgroundColor: SKATE.colors.blood,
    paddingHorizontal: SKATE.spacing.xxl * 2,
    paddingVertical: SKATE.spacing.xl,
    borderRadius: SKATE.borderRadius.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.md,
    borderWidth: 3,
    borderColor: SKATE.colors.white,
    shadowColor: SKATE.colors.blood,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 8,
  },
  recordButtonText: {
    color: SKATE.colors.white,
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 2,
  },
  uploadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.md,
  },
  uploadingText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  waitingIndicator: {
    alignItems: "center",
    gap: SKATE.spacing.lg,
  },
  waitingText: {
    color: SKATE.colors.lightGray,
    fontSize: 16,
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
