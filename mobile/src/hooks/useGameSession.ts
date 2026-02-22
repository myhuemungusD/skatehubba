import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { doc, onSnapshot, Timestamp } from "firebase/firestore";
import { ref, uploadBytesResumable } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { z } from "zod";
import { db, storage, auth, functions } from "@/lib/firebase.config";
import { showMessage } from "react-native-flash-message";
import { useGameStore } from "@/store/gameStore";
import type { GameSession } from "@/types";

/** Number of retry attempts (not including initial attempt) */
const MAX_RETRIES = 3;
/** Exponential backoff delays in ms for each retry */
const RETRY_DELAYS: readonly [number, number, number] = [2000, 4000, 8000];

/** Generate a unique idempotency key for deduplication */
function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

const gameKeys = {
  all: ["games"] as const,
  session: (id: string) => [...gameKeys.all, "session", id] as const,
};

// Zod schemas for runtime validation
const SkateLetterSchema = z.enum(["S", "K", "A", "T", "E"]);

const MoveResultSchema = z.enum(["landed", "bailed", "pending"]);

const JudgmentVotesSchema = z.object({
  attackerVote: z.enum(["landed", "bailed"]).nullable(),
  defenderVote: z.enum(["landed", "bailed"]).nullable(),
});

const MoveSchema = z.object({
  id: z.string(),
  roundNumber: z.number(),
  playerId: z.string(),
  type: z.enum(["set", "match"]),
  trickName: z.string().nullable(),
  clipUrl: z.string(),
  storagePath: z.string().nullable().optional().default(null),
  thumbnailUrl: z.string().nullable(),
  durationSec: z.number().default(15),
  result: MoveResultSchema.default("pending"),
  judgmentVotes: JudgmentVotesSchema.optional(),
  createdAt: z.union([
    z.date(),
    z.string().transform((s) => new Date(s)),
    z.custom<Timestamp>((v) => v instanceof Timestamp).transform((t) => t.toDate()),
  ]),
});

const TurnPhaseSchema = z.enum([
  "attacker_recording",
  "defender_recording",
  "judging",
  "round_complete",
]);

const GameSessionStatusSchema = z.enum(["waiting", "active", "completed", "abandoned"]);

const timestampOrDate = z.union([
  z.date(),
  z.string().transform((s) => new Date(s)),
  z.custom<Timestamp>((v) => v instanceof Timestamp).transform((t) => t.toDate()),
]);

const nullableTimestampOrDate = z
  .union([z.null(), z.undefined(), timestampOrDate])
  .transform((v) => v ?? null);

const GameSessionSchema = z.object({
  player1Id: z.string(),
  player2Id: z.string(),
  player1DisplayName: z.string().default("Player 1"),
  player2DisplayName: z.string().default("Player 2"),
  player1PhotoURL: z.string().nullable().default(null),
  player2PhotoURL: z.string().nullable().default(null),
  player1Letters: z.array(SkateLetterSchema).default([]),
  player2Letters: z.array(SkateLetterSchema).default([]),
  currentTurn: z.string(),
  currentAttacker: z.string().optional(),
  turnPhase: TurnPhaseSchema.default("attacker_recording"),
  roundNumber: z.number().default(1),
  status: GameSessionStatusSchema,
  winnerId: z.string().nullable().default(null),
  moves: z.array(MoveSchema).default([]),
  currentSetMove: MoveSchema.nullable().optional().default(null),
  createdAt: timestampOrDate,
  updatedAt: nullableTimestampOrDate.optional().default(null),
  completedAt: nullableTimestampOrDate.optional().default(null),
  // Vote timeout fields
  voteDeadline: nullableTimestampOrDate.optional().default(null),
  voteReminderSent: z.boolean().nullable().optional().default(null),
  voteTimeoutOccurred: z.boolean().nullable().optional().default(null),
});

function parseGameSession(id: string, data: Record<string, unknown>): GameSession {
  const parsed = GameSessionSchema.safeParse(data);

  if (!parsed.success) {
    console.error("[parseGameSession] Validation failed:", parsed.error.issues);
    // Return a partial session with safe defaults for graceful degradation
    throw new Error(`Invalid game session data: ${parsed.error.issues[0]?.message}`);
  }

  const session = parsed.data;
  return {
    id,
    player1Id: session.player1Id,
    player2Id: session.player2Id,
    player1DisplayName: session.player1DisplayName,
    player2DisplayName: session.player2DisplayName,
    player1PhotoURL: session.player1PhotoURL,
    player2PhotoURL: session.player2PhotoURL,
    player1Letters: session.player1Letters,
    player2Letters: session.player2Letters,
    currentTurn: session.currentTurn,
    currentAttacker: session.currentAttacker ?? session.currentTurn,
    turnPhase: session.turnPhase,
    roundNumber: session.roundNumber,
    status: session.status,
    winnerId: session.winnerId,
    moves: session.moves,
    currentSetMove: session.currentSetMove ?? null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    completedAt: session.completedAt,
    voteDeadline: session.voteDeadline,
    voteReminderSent: session.voteReminderSent,
    voteTimeoutOccurred: session.voteTimeoutOccurred,
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadWithRetry(
  storageRef: ReturnType<typeof ref>,
  blob: Blob,
  onProgress: (progress: number) => void
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, blob, {
          contentType: "video/mp4",
        });

        uploadTask.on(
          "state_changed",
          (snapshot) => {
            if (snapshot.totalBytes > 0) {
              const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
              onProgress(progress);
            }
          },
          (error) => reject(error),
          () => {
            // No longer fetching download URL — video access is now
            // mediated by the getVideoUrl Cloud Function with signed URLs
            resolve();
          }
        );
      });
      return;
    } catch (error) {
      lastError = error as Error;
      if (attempt < MAX_RETRIES) {
        // eslint-disable-next-line no-console
        console.log(`[Upload] Retry ${attempt + 1}/${MAX_RETRIES} after error`);
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

  useEffect(() => {
    if (!gameId) return;

    const docRef = doc(db, "game_sessions", gameId);

    unsubscribeRef.current = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const session = parseGameSession(snapshot.id, snapshot.data() as Record<string, unknown>);
          queryClient.setQueryData(gameKeys.session(gameId), session);
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
  }, [gameId, queryClient]);

  return {
    gameSession: queryClient.getQueryData<GameSession>(gameKeys.session(gameId || "")),
    isLoading: !queryClient.getQueryData(gameKeys.session(gameId || "")),
  };
}

interface SubmitTrickResponse {
  success: boolean;
  moveId: string;
  duplicate: boolean;
}

export function useSubmitTrick(gameId: string) {
  const queryClient = useQueryClient();
  const { setUploadProgress, setUploadStatus, clearUpload } = useGameStore();

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
      const idempotencyKey = generateIdempotencyKey();

      // Build storage path matching storage.rules: /videos/{userId}/{gameId}/{roundId}/{fileName}
      // Use randomUUID for non-enumerable filenames (same function as idempotency keys)
      const currentSession = queryClient.getQueryData<GameSession>(gameKeys.session(gameId));
      const roundId = currentSession
        ? `round_${currentSession.roundNumber}`
        : `round_${Date.now()}`;
      const storagePath = `videos/${userId}/${gameId}/${roundId}/${crypto.randomUUID()}.mp4`;
      const storageRef = ref(storage, storagePath);

      setUploadStatus("uploading");

      const response = await fetch(localVideoUri);
      const blob = await response.blob();

      await uploadWithRetry(storageRef, blob, (progress) => {
        setUploadProgress(progress);
      });

      setUploadStatus("processing");

      // Submit trick via Cloud Function (server-side validation + transaction)
      const submitTrick = httpsCallable<
        {
          gameId: string;
          clipUrl: string;
          storagePath: string;
          trickName: string | null;
          isSetTrick: boolean;
          idempotencyKey: string;
        },
        SubmitTrickResponse
      >(functions, "submitTrick");

      const result = await submitTrick({
        gameId,
        clipUrl: "",
        storagePath,
        trickName,
        isSetTrick,
        idempotencyKey,
      });

      setUploadStatus("complete");
      return result.data;
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
  vote: "landed" | "bailed";
  finalResult: "landed" | "bailed" | null;
  waitingForOtherVote: boolean;
  winnerId: string | null;
  gameCompleted: boolean;
  duplicate: boolean;
}

export function useJudgeTrick(gameId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      moveId,
      vote,
    }: {
      moveId: string;
      vote: "landed" | "bailed";
    }): Promise<JudgeTrickResponse> => {
      if (!auth.currentUser) {
        throw new Error("Not authenticated");
      }

      const idempotencyKey = generateIdempotencyKey();

      // Server-side Cloud Function handles the actual judgment
      // Uses transaction to prevent race conditions when both players vote simultaneously
      const judgeTrick = httpsCallable<
        {
          gameId: string;
          moveId: string;
          vote: "landed" | "bailed";
          idempotencyKey: string;
        },
        JudgeTrickResponse
      >(functions, "judgeTrick");

      const response = await judgeTrick({ gameId, moveId, vote, idempotencyKey });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: gameKeys.session(gameId) });

      if (data.waitingForOtherVote) {
        showMessage({
          message: "Vote recorded! Waiting for other player...",
          type: "info",
        });
      } else if (data.gameCompleted) {
        showMessage({
          message: "Game Over!",
          type: "info",
        });
      } else if (data.finalResult === "landed") {
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
        message: error.message || "Failed to submit vote",
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

      // SECURITY: Use Cloud Function instead of direct Firestore write.
      // game_sessions rules block all client writes (allow update: if false),
      // so direct updateDoc calls would be silently rejected by Firestore.
      const joinGame = httpsCallable<{ gameId: string }, { success: boolean }>(
        functions,
        "joinGame"
      );

      await joinGame({ gameId });
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
  return useMutation({
    mutationFn: async () => {
      if (!auth.currentUser) {
        throw new Error("Not authenticated");
      }

      // SECURITY: Use Cloud Function instead of direct Firestore write.
      // Direct client writes to game_sessions are blocked by Firestore rules.
      // Additionally, letting the client set winnerId is a game integrity risk
      // since a malicious client could set themselves as the winner.
      const abandonGame = httpsCallable<{ gameId: string }, { success: boolean }>(
        functions,
        "abandonGame"
      );

      await abandonGame({ gameId });
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
