/**
 * useRemoteSkateGame - Hook for Remote S.K.A.T.E. game state
 *
 * Real-time Firestore subscriptions for game, rounds, and video docs.
 * Provides derived UI state and actions.
 *
 * @module hooks/useRemoteSkateGame
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useToast } from "./use-toast";
import {
  RemoteSkateService,
  validateVideo,
  uploadVideo,
  type GameDoc,
  type RoundDoc,
  type VideoDoc,
} from "../lib/remoteSkate";
import { auth } from "../lib/firebase";
import { collection, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { logger } from "../lib/logger";

// =============================================================================
// TYPES
// =============================================================================

export interface RemoteSkateGameState {
  // Data
  game: (GameDoc & { id: string }) | null;
  rounds: (RoundDoc & { id: string })[];
  currentRound: (RoundDoc & { id: string }) | null;
  setVideo: (VideoDoc & { id: string }) | null;
  replyVideo: (VideoDoc & { id: string }) | null;

  // UI state
  isLoading: boolean;
  error: string | null;
  uploadProgress: number | null;
  isUploading: boolean;
  isResolving: boolean;

  // Derived
  isMyTurn: boolean;
  myRole: "offense" | "defense" | null;
  myLetters: string;
  opponentLetters: string;
  opponentUid: string | null;
  isGameOver: boolean;
  winnerUid: string | null;
  loserUid: string | null;

  // Actions
  uploadSetVideo: (file: File) => Promise<void>;
  uploadReplyVideo: (file: File) => Promise<void>;
  resolveRound: (result: "landed" | "missed") => Promise<void>;
}

// =============================================================================
// HOOK
// =============================================================================

export function useRemoteSkateGame(gameId: string | null): RemoteSkateGameState {
  const { toast } = useToast();
  const uid = auth.currentUser?.uid;

  // State
  const [game, setGame] = useState<(GameDoc & { id: string }) | null>(null);
  const [rounds, setRounds] = useState<(RoundDoc & { id: string })[]>([]);
  const [setVideo, setSetVideo] = useState<(VideoDoc & { id: string }) | null>(null);
  const [replyVideo, setReplyVideo] = useState<(VideoDoc & { id: string }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isResolving, setIsResolving] = useState(false);

  // Subscribe to game
  useEffect(() => {
    if (!gameId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);

    const unsub = RemoteSkateService.subscribeToGame(gameId, (g) => {
      setIsLoading(false);
      if (g) {
        setGame(g);
        setError(null);
      } else {
        setError("Game not found");
        setGame(null);
      }
    });
    return () => unsub();
  }, [gameId]);

  // Subscribe to rounds
  useEffect(() => {
    if (!gameId) return;
    const unsub = RemoteSkateService.subscribeToRounds(gameId, (r) => {
      setRounds(r);
    });
    return () => unsub();
  }, [gameId]);

  // Current round = last round
  const currentRound = useMemo(() => {
    if (rounds.length === 0) return null;
    return rounds[rounds.length - 1];
  }, [rounds]);

  // Subscribe to set video for current round
  useEffect(() => {
    if (!currentRound?.setVideoId) {
      setSetVideo(null);
      return;
    }
    const unsub = RemoteSkateService.subscribeToVideo(currentRound.setVideoId, (v) => {
      setSetVideo(v);
    });
    return () => unsub();
  }, [currentRound?.setVideoId]);

  // Subscribe to reply video for current round
  useEffect(() => {
    if (!currentRound?.replyVideoId) {
      setReplyVideo(null);
      return;
    }
    const unsub = RemoteSkateService.subscribeToVideo(currentRound.replyVideoId, (v) => {
      setReplyVideo(v);
    });
    return () => unsub();
  }, [currentRound?.replyVideoId]);

  // Derived state
  const derived = useMemo(() => {
    if (!game || !uid) {
      return {
        isMyTurn: false,
        myRole: null as "offense" | "defense" | null,
        myLetters: "",
        opponentLetters: "",
        opponentUid: null as string | null,
        isGameOver: false,
        winnerUid: null as string | null,
        loserUid: null as string | null,
      };
    }

    const isPlayerA = game.playerAUid === uid;
    const opponentUid = isPlayerA ? game.playerBUid : game.playerAUid;
    const myLetters = game.letters?.[uid] || "";
    const opponentLetters = opponentUid ? game.letters?.[opponentUid] || "" : "";
    const isMyTurn = game.currentTurnUid === uid;
    const isGameOver = game.status === "complete";

    let myRole: "offense" | "defense" | null = null;
    if (currentRound) {
      if (currentRound.offenseUid === uid) myRole = "offense";
      else if (currentRound.defenseUid === uid) myRole = "defense";
    }

    // Determine winner/loser
    let winnerUid: string | null = null;
    let loserUid: string | null = null;
    if (isGameOver) {
      const aLetters = game.letters?.[game.playerAUid] || "";
      const bLetters = game.playerBUid ? game.letters?.[game.playerBUid] || "" : "";
      if (aLetters.length >= 5) {
        loserUid = game.playerAUid;
        winnerUid = game.playerBUid;
      } else if (bLetters.length >= 5) {
        loserUid = game.playerBUid;
        winnerUid = game.playerAUid;
      }
    }

    return {
      isMyTurn,
      myRole,
      myLetters,
      opponentLetters,
      opponentUid,
      isGameOver,
      winnerUid,
      loserUid,
    };
  }, [game, uid, currentRound]);

  // Upload set video
  const uploadSetVideo = useCallback(
    async (file: File) => {
      if (!gameId || !uid || !currentRound) return;

      // Validate
      const validation = await validateVideo(file);
      if (!validation.valid) {
        toast({ title: "Invalid video", description: validation.error, variant: "destructive" });
        return;
      }

      setIsUploading(true);
      setUploadProgress(0);

      const videoId = doc(collection(db, "videos")).id;

      uploadVideo(
        { file, uid, gameId, roundId: currentRound.id, videoId, role: "set" },
        validation.durationMs!,
        {
          onProgress: (p) => setUploadProgress(p),
          onComplete: async () => {
            setIsUploading(false);
            setUploadProgress(null);
            toast({ title: "Video uploaded", description: "Your set trick video is ready." });
            try {
              await RemoteSkateService.markSetComplete(gameId, currentRound.id);
            } catch (err) {
              logger.error("[useRemoteSkateGame] Failed to mark set complete", err);
            }
          },
          onError: (err) => {
            setIsUploading(false);
            setUploadProgress(null);
            toast({
              title: "Upload failed",
              description: err.message + ". Tap to retry.",
              variant: "destructive",
            });
          },
        }
      );
    },
    [gameId, uid, currentRound, toast]
  );

  // Upload reply video
  const uploadReplyVideo = useCallback(
    async (file: File) => {
      if (!gameId || !uid || !currentRound) return;

      const validation = await validateVideo(file);
      if (!validation.valid) {
        toast({ title: "Invalid video", description: validation.error, variant: "destructive" });
        return;
      }

      setIsUploading(true);
      setUploadProgress(0);

      const videoId = doc(collection(db, "videos")).id;

      uploadVideo(
        { file, uid, gameId, roundId: currentRound.id, videoId, role: "reply" },
        validation.durationMs!,
        {
          onProgress: (p) => setUploadProgress(p),
          onComplete: async () => {
            setIsUploading(false);
            setUploadProgress(null);
            toast({ title: "Video uploaded", description: "Your reply video is ready." });
            try {
              await RemoteSkateService.markReplyComplete(gameId, currentRound.id);
            } catch (err) {
              logger.error("[useRemoteSkateGame] Failed to mark reply complete", err);
            }
          },
          onError: (err) => {
            setIsUploading(false);
            setUploadProgress(null);
            toast({
              title: "Upload failed",
              description: err.message + ". Tap to retry.",
              variant: "destructive",
            });
          },
        }
      );
    },
    [gameId, uid, currentRound, toast]
  );

  // Resolve round
  const resolveRound = useCallback(
    async (result: "landed" | "missed") => {
      if (!gameId || !currentRound) return;

      setIsResolving(true);
      try {
        await RemoteSkateService.resolveRound(gameId, currentRound.id, result);
        toast({
          title: result === "landed" ? "Landed!" : "Missed!",
          description:
            result === "landed"
              ? "Defense matched the trick. Roles swap."
              : "Defense missed. They get a letter.",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to resolve round";
        toast({ title: "Error", description: msg, variant: "destructive" });
      } finally {
        setIsResolving(false);
      }
    },
    [gameId, currentRound, toast]
  );

  return {
    game,
    rounds,
    currentRound,
    setVideo,
    replyVideo,
    isLoading,
    error,
    uploadProgress,
    isUploading,
    isResolving,
    ...derived,
    uploadSetVideo,
    uploadReplyVideo,
    resolveRound,
  };
}
