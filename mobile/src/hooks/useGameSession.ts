import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  Timestamp,
  arrayUnion,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { db, storage, auth, functions } from "@/lib/firebase.config";
import { showMessage } from "react-native-flash-message";
import { useGameStore } from "@/store/gameStore";
import type { GameSession, Move, TurnPhase, SkateLetter, MoveResult } from "@/types";

const MAX_UPLOAD_RETRIES = 3;
const RETRY_DELAYS = [2000, 4000, 8000];

const gameKeys = {
  all: ["games"] as const,
  session: (id: string) => [...gameKeys.all, "session", id] as const,
};

function parseMove(m: Record<string, unknown>): Move {
  return {
    id: m.id as string,
    roundNumber: m.roundNumber as number,
    playerId: m.playerId as string,
    type: m.type as "set" | "match",
    trickName: (m.trickName as string) || null,
    clipUrl: m.clipUrl as string,
    thumbnailUrl: (m.thumbnailUrl as string) || null,
    durationSec: (m.durationSec as number) || 15,
    result: (m.result as MoveResult) || "pending",
    createdAt:
      m.createdAt instanceof Timestamp
        ? m.createdAt.toDate()
        : new Date(m.createdAt as string),
  };
}

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
    currentAttacker:
      (data.currentAttacker as string) || (data.currentTurn as string),
    turnPhase: (data.turnPhase as TurnPhase) || "attacker_recording",
    roundNumber: (data.roundNumber as number) || 1,
    status: data.status as GameSession["status"],
    winnerId: (data.winnerId as string) || null,
    moves: ((data.moves as Array<Record<string, unknown>>) || []).map(parseMove),
    currentSetMove: data.currentSetMove
      ? parseMove(data.currentSetMove as Record<string, unknown>)
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

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadWithRetry(
  storageRef: ReturnType<typeof ref>,
  blob: Blob,
  onProgress: (progress: number) => void
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_UPLOAD_RETRIES; attempt++) {
    try {
      return await new Promise<string>((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, blob, {
          contentType: "video/mp4",
        });

        uploadTask.on(
          "state_changed",
          (snapshot) => {
            if (snapshot.totalBytes > 0) {
              const progress = Math.round(
                (snapshot.bytesTransferred / snapshot.totalBytes) * 100
              );
              onProgress(progress);
            }
          },
          (error) => reject(error),
          async () => {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          }
        );
      });
    } catch (error) {
      lastError = error as Error;
      if (attempt < MAX_UPLOAD_RETRIES) {
        console.log(
          `[Upload] Retry ${attempt + 1}/${MAX_UPLOAD_RETRIES} after error`
        );
        await sleep(RETRY_DELAYS[attempt]);
        onProgress(0); // Reset progress for retry
      }
    }
  }

  throw lastError || new Error("Upload failed after retries");
}

export function useGameSession(gameId: string | null) {
  const queryClient = useQueryClient();
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const { setOptimisticGameSession } = useGameStore();

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
          queryClient.setQueryData(gameKeys.session(gameId), session);
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

  return {
    gameSession: queryClient.getQueryData<GameSession>(
      gameKeys.session(gameId || "")
    ),
    isLoading: !queryClient.getQueryData(gameKeys.session(gameId || "")),
  };
}

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

      const storagePath = `game_sessions/${gameId}/${moveId}.mp4`;
      const storageRef = ref(storage, storagePath);

      setUploadStatus("uploading");

      const response = await fetch(localVideoUri);
      const blob = await response.blob();

      const clipUrl = await uploadWithRetry(storageRef, blob, (progress) => {
        setUploadProgress(progress);
      });

      setUploadStatus("processing");

      const currentSession = queryClient.getQueryData<GameSession>(
        gameKeys.session(gameId)
      );

      if (!currentSession) {
        throw new Error("Game session not found");
      }

      const move: Move = {
        id: moveId,
        roundNumber: currentSession.roundNumber,
        playerId: userId,
        type: isSetTrick ? "set" : "match",
        trickName,
        clipUrl,
        thumbnailUrl: null,
        durationSec: 15,
        result: "pending",
        createdAt: new Date(),
      };

      applyOptimisticMove(move);

      const nextPhase: TurnPhase = isSetTrick ? "defender_recording" : "judging";
      const nextTurn = isSetTrick
        ? currentSession.player1Id === userId
          ? currentSession.player2Id
          : currentSession.player1Id
        : currentSession.currentTurn;

      const gameDocRef = doc(db, "game_sessions", gameId);
      await updateDoc(gameDocRef, {
        moves: arrayUnion({
          ...move,
          createdAt: serverTimestamp(),
        }),
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
      setUploadStatus("failed", error.message);
      showMessage({
        message: error.message || "Failed to submit trick. Please try again.",
        type: "danger",
      });
    },
  });
}

interface JudgeTrickResponse {
  success: boolean;
  result: "landed" | "bailed";
  winnerId: string | null;
  gameCompleted: boolean;
}

export function useJudgeTrick(gameId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      moveId,
      result,
    }: {
      moveId: string;
      result: "landed" | "bailed";
    }): Promise<JudgeTrickResponse> => {
      if (!auth.currentUser) {
        throw new Error("Not authenticated");
      }

      // Server-side Cloud Function handles the actual judgment
      // to prevent client-side cheating
      const judgeTrick = httpsCallable<
        { gameId: string; moveId: string; result: "landed" | "bailed" },
        JudgeTrickResponse
      >(functions, "judgeTrick");

      const response = await judgeTrick({ gameId, moveId, result });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: gameKeys.session(gameId) });

      if (data.gameCompleted) {
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
