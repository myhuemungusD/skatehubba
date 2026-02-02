import { useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  Timestamp,
  arrayUnion,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage, auth } from "@/lib/firebase.config";
import { showMessage } from "react-native-flash-message";
import { useGameStore } from "@/store/gameStore";
import type {
  GameSession,
  Move,
  TurnPhase,
  SkateLetter,
  MoveResult,
} from "@/types";
import { SKATE_LETTERS } from "@/types";

// Query key factory
const gameKeys = {
  all: ["games"] as const,
  session: (id: string) => [...gameKeys.all, "session", id] as const,
};

/**
 * Converts Firestore document data to GameSession type
 */
function parseGameSession(
  id: string,
  data: Record<string, unknown>
): GameSession {
  return {
    id,
    player1Id: data.player1Id as string,
    player2Id: data.player2Id as string,
    player1DisplayName: (data.player1DisplayName as string) || "Player 1",
    player2DisplayName: (data.player2DisplayName as string) || "Player 2",
    player1PhotoURL: (data.player1PhotoURL as string) || null,
    player2PhotoURL: (data.player2PhotoURL as string) || null,
    player1Letters: (data.player1Letters as SkateLetter[]) || [],
    player2Letters: (data.player2Letters as SkateLetter[]) || [],
    currentTurn: data.currentTurn as string,
    currentAttacker: (data.currentAttacker as string) || data.currentTurn as string,
    turnPhase: (data.turnPhase as TurnPhase) || "attacker_recording",
    roundNumber: (data.roundNumber as number) || 1,
    status: data.status as GameSession["status"],
    winnerId: (data.winnerId as string) || null,
    moves: ((data.moves as Array<Record<string, unknown>>) || []).map(
      (m) => ({
        id: m.id as string,
        roundNumber: m.roundNumber as number,
        playerId: m.playerId as string,
        type: m.type as "set" | "match",
        trickName: (m.trickName as string) || null,
        clipUrl: m.clipUrl as string,
        thumbnailUrl: (m.thumbnailUrl as string) || null,
        durationSec: (m.durationSec as number) || 15,
        result: (m.result as MoveResult) || "pending",
        votes: (m.votes as Move["votes"]) || { clean: 0, sketch: 0, redo: 0 },
        createdAt: m.createdAt instanceof Timestamp
          ? m.createdAt.toDate()
          : new Date(m.createdAt as string),
      })
    ),
    currentSetMove:
      data.currentSetMove
        ? {
            id: (data.currentSetMove as Record<string, unknown>).id as string,
            roundNumber: (data.currentSetMove as Record<string, unknown>).roundNumber as number,
            playerId: (data.currentSetMove as Record<string, unknown>).playerId as string,
            type: (data.currentSetMove as Record<string, unknown>).type as "set" | "match",
            trickName: ((data.currentSetMove as Record<string, unknown>).trickName as string) || null,
            clipUrl: (data.currentSetMove as Record<string, unknown>).clipUrl as string,
            thumbnailUrl: ((data.currentSetMove as Record<string, unknown>).thumbnailUrl as string) || null,
            durationSec: ((data.currentSetMove as Record<string, unknown>).durationSec as number) || 15,
            result: ((data.currentSetMove as Record<string, unknown>).result as MoveResult) || "pending",
            votes: ((data.currentSetMove as Record<string, unknown>).votes as Move["votes"]) || { clean: 0, sketch: 0, redo: 0 },
            createdAt:
              (data.currentSetMove as Record<string, unknown>).createdAt instanceof Timestamp
                ? ((data.currentSetMove as Record<string, unknown>).createdAt as Timestamp).toDate()
                : new Date((data.currentSetMove as Record<string, unknown>).createdAt as string),
          }
        : null,
    createdAt:
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : new Date(data.createdAt as string),
    updatedAt:
      data.updatedAt instanceof Timestamp
        ? data.updatedAt.toDate()
        : data.updatedAt
        ? new Date(data.updatedAt as string)
        : null,
    completedAt:
      data.completedAt instanceof Timestamp
        ? data.completedAt.toDate()
        : data.completedAt
        ? new Date(data.completedAt as string)
        : null,
  };
}

/**
 * Hook for real-time game session synchronization with Firestore.
 * Uses onSnapshot for real-time updates and React Query for caching.
 */
export function useGameSession(gameId: string | null) {
  const queryClient = useQueryClient();
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const { setOptimisticGameSession } = useGameStore();

  // Set up real-time listener
  useEffect(() => {
    if (!gameId) return;

    const docRef = doc(db, "game_sessions", gameId);

    unsubscribeRef.current = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const session = parseGameSession(
            snapshot.id,
            snapshot.data() as Record<string, unknown>
          );

          // Update React Query cache
          queryClient.setQueryData(gameKeys.session(gameId), session);

          // Update optimistic state
          setOptimisticGameSession(session);
        }
      },
      (error) => {
        console.error("[useGameSession] Snapshot error:", error);
        showMessage({
          message: "Connection error. Retrying...",
          type: "warning",
        });
      }
    );

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [gameId, queryClient, setOptimisticGameSession]);

  // Query for initial data (will be updated by snapshot)
  const query = useQuery({
    queryKey: gameKeys.session(gameId || ""),
    queryFn: async () => {
      // This won't actually run since we use onSnapshot
      // but it provides the type signature for React Query
      return null as GameSession | null;
    },
    enabled: false, // Disabled since we use onSnapshot
  });

  return {
    gameSession: queryClient.getQueryData<GameSession>(
      gameKeys.session(gameId || "")
    ),
    isLoading: !queryClient.getQueryData(gameKeys.session(gameId || "")),
    error: query.error,
  };
}

/**
 * Hook for submitting a trick (set or match attempt)
 */
export function useSubmitTrick(gameId: string) {
  const queryClient = useQueryClient();
  const { setUploadProgress, setUploadStatus, clearUpload, applyOptimisticMove } =
    useGameStore();

  return useMutation({
    mutationFn: async ({
      localVideoUri,
      trickName,
      isSetTrick,
    }: {
      localVideoUri: string;
      trickName: string | null;
      isSetTrick: boolean;
    }) => {
      if (!auth.currentUser) {
        throw new Error("Not authenticated");
      }

      const userId = auth.currentUser.uid;
      const timestamp = Date.now();
      const moveId = `move_${userId}_${timestamp}`;

      // Upload video to Firebase Storage
      const storagePath = `game_sessions/${gameId}/${moveId}.mp4`;
      const storageRef = ref(storage, storagePath);

      const response = await fetch(localVideoUri);
      const blob = await response.blob();

      const uploadTask = uploadBytesResumable(storageRef, blob, {
        contentType: "video/mp4",
      });

      const clipUrl = await new Promise<string>((resolve, reject) => {
        uploadTask.on(
          "state_changed",
          (snapshot) => {
            if (snapshot.totalBytes > 0) {
              const progress = Math.round(
                (snapshot.bytesTransferred / snapshot.totalBytes) * 100
              );
              setUploadProgress(progress);
            }
          },
          (error) => {
            setUploadStatus("failed", error.message);
            reject(error);
          },
          async () => {
            setUploadStatus("processing");
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          }
        );
      });

      // Get current game state
      const currentSession = queryClient.getQueryData<GameSession>(
        gameKeys.session(gameId)
      );

      if (!currentSession) {
        throw new Error("Game session not found");
      }

      // Create move object
      const move: Move = {
        id: moveId,
        roundNumber: currentSession.roundNumber,
        playerId: userId,
        type: isSetTrick ? "set" : "match",
        trickName,
        clipUrl,
        thumbnailUrl: null,
        durationSec: 15,
        result: isSetTrick ? "pending" : "pending",
        votes: { clean: 0, sketch: 0, redo: 0 },
        createdAt: new Date(),
      };

      // Apply optimistic update
      applyOptimisticMove(move);

      // Determine next turn phase and player
      const nextPhase: TurnPhase = isSetTrick
        ? "defender_recording"
        : "judging";

      const nextTurn = isSetTrick
        ? currentSession.player1Id === userId
          ? currentSession.player2Id
          : currentSession.player1Id
        : currentSession.currentTurn;

      // Update Firestore
      const gameDocRef = doc(db, "game_sessions", gameId);
      await updateDoc(gameDocRef, {
        moves: arrayUnion(move),
        currentSetMove: isSetTrick ? move : currentSession.currentSetMove,
        turnPhase: nextPhase,
        currentTurn: nextTurn,
        updatedAt: serverTimestamp(),
      });

      setUploadStatus("complete");
      return move;
    },
    onSuccess: () => {
      clearUpload();
      showMessage({
        message: "Trick submitted!",
        type: "success",
      });
    },
    onError: (error: Error) => {
      showMessage({
        message: error.message || "Failed to submit trick",
        type: "danger",
      });
    },
  });
}

/**
 * Hook for judging a trick attempt (determining if it was landed)
 */
export function useJudgeTrick(gameId: string) {
  const queryClient = useQueryClient();
  const { applyOptimisticLetter, applyOptimisticTurnPhase } = useGameStore();

  return useMutation({
    mutationFn: async ({
      moveId,
      result,
    }: {
      moveId: string;
      result: "landed" | "bailed";
    }) => {
      if (!auth.currentUser) {
        throw new Error("Not authenticated");
      }

      const currentSession = queryClient.getQueryData<GameSession>(
        gameKeys.session(gameId)
      );

      if (!currentSession) {
        throw new Error("Game session not found");
      }

      // Find the move and update its result
      const updatedMoves = currentSession.moves.map((m) =>
        m.id === moveId ? { ...m, result } : m
      );

      // Determine if defender gets a letter (they bailed)
      const defenderId =
        currentSession.currentAttacker === currentSession.player1Id
          ? currentSession.player2Id
          : currentSession.player1Id;

      const isPlayer1Defender = defenderId === currentSession.player1Id;
      const currentLetters = isPlayer1Defender
        ? currentSession.player1Letters
        : currentSession.player2Letters;

      let newLetters = currentLetters;
      let winnerId: string | null = null;
      let gameStatus = currentSession.status;

      if (result === "bailed") {
        // Defender gets a letter
        const nextLetterIndex = currentLetters.length;
        if (nextLetterIndex < SKATE_LETTERS.length) {
          const newLetter = SKATE_LETTERS[nextLetterIndex];
          newLetters = [...currentLetters, newLetter];

          // Apply optimistic letter update
          applyOptimisticLetter(defenderId, newLetter);

          // Check if game is over (defender has SKATE)
          if (newLetters.length === 5) {
            winnerId = currentSession.currentAttacker;
            gameStatus = "completed";
          }
        }
      }

      // Determine next round state
      const nextRound =
        result === "landed"
          ? currentSession.roundNumber // Defender landed, they become attacker same round
          : currentSession.roundNumber + 1;

      const nextAttacker =
        result === "landed"
          ? defenderId // Defender landed, they set next trick
          : currentSession.currentAttacker; // Attacker keeps setting

      const nextTurnPhase: TurnPhase =
        gameStatus === "completed" ? "round_complete" : "attacker_recording";

      // Apply optimistic turn phase update
      applyOptimisticTurnPhase(nextTurnPhase);

      // Update Firestore
      const gameDocRef = doc(db, "game_sessions", gameId);
      const updateData: Record<string, unknown> = {
        moves: updatedMoves,
        turnPhase: nextTurnPhase,
        currentTurn: nextAttacker,
        currentAttacker: nextAttacker,
        roundNumber: nextRound,
        currentSetMove: null,
        updatedAt: serverTimestamp(),
        ...(isPlayer1Defender
          ? { player1Letters: newLetters }
          : { player2Letters: newLetters }),
      };

      if (gameStatus === "completed") {
        updateData.status = "completed";
        updateData.winnerId = winnerId;
        updateData.completedAt = serverTimestamp();
      }

      await updateDoc(gameDocRef, updateData);

      return { result, winnerId, gameStatus };
    },
    onSuccess: (data) => {
      if (data.gameStatus === "completed") {
        showMessage({
          message: "Game Over!",
          type: "info",
        });
      } else if (data.result === "landed") {
        showMessage({
          message: "Trick landed! Roles switch.",
          type: "success",
        });
      } else {
        showMessage({
          message: "Bailed! Letter earned.",
          type: "warning",
        });
      }
    },
    onError: (error: Error) => {
      showMessage({
        message: error.message || "Failed to judge trick",
        type: "danger",
      });
    },
  });
}

/**
 * Hook for joining/accepting a game (player2 accepts)
 */
export function useJoinGame(gameId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!auth.currentUser) {
        throw new Error("Not authenticated");
      }

      const gameDocRef = doc(db, "game_sessions", gameId);
      await updateDoc(gameDocRef, {
        status: "active",
        updatedAt: serverTimestamp(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gameKeys.session(gameId) });
      showMessage({
        message: "Game started!",
        type: "success",
      });
    },
    onError: (error: Error) => {
      showMessage({
        message: error.message || "Failed to join game",
        type: "danger",
      });
    },
  });
}

/**
 * Hook for abandoning/forfeiting a game
 */
export function useAbandonGame(gameId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!auth.currentUser) {
        throw new Error("Not authenticated");
      }

      const currentSession = queryClient.getQueryData<GameSession>(
        gameKeys.session(gameId)
      );

      if (!currentSession) {
        throw new Error("Game session not found");
      }

      // The player who didn't abandon wins
      const winnerId =
        auth.currentUser.uid === currentSession.player1Id
          ? currentSession.player2Id
          : currentSession.player1Id;

      const gameDocRef = doc(db, "game_sessions", gameId);
      await updateDoc(gameDocRef, {
        status: "abandoned",
        winnerId,
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    },
    onSuccess: () => {
      showMessage({
        message: "Game forfeited",
        type: "info",
      });
    },
    onError: (error: Error) => {
      showMessage({
        message: error.message || "Failed to forfeit game",
        type: "danger",
      });
    },
  });
}

export default useGameSession;
