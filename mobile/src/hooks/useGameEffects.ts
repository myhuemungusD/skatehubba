import { useEffect, useState } from "react";
import { useGameStore } from "@/store/gameStore";
import { useNetworkStore, useReconnectionStatus } from "@/store/networkStore";
import { logEvent } from "@/lib/analytics/logEvent";
import type { GameOverlay, SkateLetter } from "@/types";

interface GameSession {
  status: string;
  turnPhase: string;
  currentTurn: string | null;
  currentAttacker: string | null;
  currentSetMove: { trickName: string | null } | null;
  player1Id: string;
  player2Id: string;
  player1Letters: SkateLetter[];
  player2Letters: SkateLetter[];
  winnerId?: string | null;
  roundNumber: number;
}

interface UseGameEffectsParams {
  gameId: string | null;
  rawGameId: string | undefined;
  isInvalidId: boolean;
  userId: string | undefined;
  gameSession: GameSession | null | undefined;
  abandonGameMutation: { mutate: () => void };
}

/**
 * Extracts all side-effect logic from the GameScreen into a single hook.
 * Handles: store init/cleanup, analytics, offline reconnection, turn overlays, letter announcements.
 */
export function useGameEffects({
  gameId,
  rawGameId,
  isInvalidId,
  userId,
  gameSession,
  abandonGameMutation,
}: UseGameEffectsParams) {
  const { initGame, resetGame, showOverlay } = useGameStore();
  const { setActiveGame, resetReconnectState } = useNetworkStore();
  const { expired: reconnectExpired } = useReconnectionStatus();
  const [lastAnnouncedLetter, setLastAnnouncedLetter] = useState<SkateLetter | null>(null);

  // Initialize game store
  useEffect(() => {
    if (gameId && userId) {
      initGame(gameId, userId);
    }
    return () => {
      resetGame();
    };
  }, [gameId, userId, initGame, resetGame]);

  // Log invalid deep link attempts for security monitoring
  useEffect(() => {
    if (isInvalidId) {
      logEvent("deep_link_invalid", { raw_id: rawGameId, route: "game" });
    }
  }, [isInvalidId, rawGameId]);

  // Track active game for offline handling (120-second reconnection window)
  useEffect(() => {
    if (gameId && gameSession?.status === "active") {
      setActiveGame(gameId);
    } else {
      setActiveGame(null);
    }
    return () => {
      setActiveGame(null);
      resetReconnectState();
    };
  }, [gameId, gameSession?.status, setActiveGame, resetReconnectState]);

  // Handle reconnection window expiry - forfeit the game
  useEffect(() => {
    if (reconnectExpired && gameSession?.status === "active") {
      logEvent("game_forfeited", { battle_id: gameId, reason: "reconnect_timeout" });
      abandonGameMutation.mutate();
      resetReconnectState();
    }
  }, [reconnectExpired, gameSession?.status, gameId, abandonGameMutation, resetReconnectState]);

  // Track battle joined event
  useEffect(() => {
    if (gameSession?.status === "active" && userId) {
      logEvent("battle_joined", {
        battle_id: gameId,
        creator_id: gameSession?.player1Id === userId ? undefined : gameSession?.player1Id,
      });
    }
  }, [gameSession?.status, gameId, userId, gameSession?.player1Id]);

  // Show turn announcements
  useEffect(() => {
    if (gameSession?.status !== "active" || !userId) return;

    const turnPhase = gameSession?.turnPhase;
    const currentTurn = gameSession?.currentTurn;
    const currentAttacker = gameSession?.currentAttacker;
    const trickName = gameSession?.currentSetMove?.trickName;
    const isMe = currentTurn === userId;
    const iAmAttacker = currentAttacker === userId;

    let overlay: GameOverlay | null = null;

    if (turnPhase === "attacker_recording" && isMe && iAmAttacker) {
      overlay = {
        type: "turn_start",
        title: "YOUR SET",
        subtitle: "Record the trick your opponent must match",
        playerId: userId,
        letter: null,
        autoDismissMs: 2500,
      };
    } else if (turnPhase === "defender_recording" && isMe && !iAmAttacker) {
      overlay = {
        type: "turn_start",
        title: "YOUR TURN",
        subtitle: trickName ? `Match: ${trickName}` : "Match the trick!",
        playerId: userId,
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
    } else if ((turnPhase as string) === "attacker_uploaded" && !isMe) {
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
    userId,
    showOverlay,
    gameSession?.currentSetMove?.trickName,
  ]);

  // Announce new letters
  useEffect(() => {
    if (!gameSession?.player1Id || !userId) return;

    const myLetters =
      gameSession?.player1Id === userId
        ? (gameSession?.player1Letters ?? [])
        : (gameSession?.player2Letters ?? []);

    const opponentLetters =
      gameSession?.player1Id === userId
        ? (gameSession?.player2Letters ?? [])
        : (gameSession?.player1Letters ?? []);

    const allLetters = [...myLetters, ...opponentLetters];
    const latestLetter = allLetters[allLetters.length - 1];

    if (latestLetter && latestLetter !== lastAnnouncedLetter) {
      setLastAnnouncedLetter(latestLetter);

      const gotLetter = myLetters.length > 0 && myLetters[myLetters.length - 1] === latestLetter;

      if (gotLetter) {
        showOverlay({
          type: "letter_gained",
          title: "YOU GOT A LETTER",
          subtitle: myLetters.length === 5 ? "You've been S.K.A.T.E.d!" : null,
          playerId: userId,
          letter: latestLetter,
          autoDismissMs: 3000,
        });
      }
    }
  }, [
    gameSession?.player1Letters,
    gameSession?.player2Letters,
    gameSession?.player1Id,
    userId,
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
}
