/**
 * useGameVideoUpload
 *
 * Encapsulates Firebase Storage upload logic for game turn videos.
 * Extracts a thumbnail in parallel with the main video upload.
 */

import { useState, useCallback, useRef } from "react";
import type { UseMutateAsyncFunction } from "@tanstack/react-query";
import { extractThumbnail } from "@/lib/video/thumbnailExtractor";
import { useToast } from "@/hooks/use-toast";
import type { FirebaseStorage } from "firebase/storage";
import type { SubmitTurnRequest, SubmitTurnResponse } from "@/lib/api/game/types";

// Lazy-loaded Firebase Storage singleton
let storageInstance: FirebaseStorage | null = null;
async function getFirebaseStorage() {
  if (!storageInstance) {
    const { getStorage } = await import("firebase/storage");
    const { app } = await import("@/lib/firebase");
    storageInstance = getStorage(app);
  }
  return storageInstance;
}

async function uploadVideoBlob(path: string, blob: Blob): Promise<string> {
  const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
  const storage = await getFirebaseStorage();
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

interface UseGameVideoUploadParams {
  gameId: string | null;
  userId: string | undefined;
  trickDescription: string;
  submitTurnAsync: UseMutateAsyncFunction<
    SubmitTurnResponse,
    Error,
    { gameId: string } & SubmitTurnRequest
  >;
  onSuccess: () => void;
}

export function useGameVideoUpload({
  gameId,
  userId,
  trickDescription,
  submitTurnAsync,
  onSuccess,
}: UseGameVideoUploadParams) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);

  // Ref to avoid stale closure in the callback
  const trickDescriptionRef = useRef(trickDescription);
  trickDescriptionRef.current = trickDescription;

  const handleRecordingComplete = useCallback(
    async (blob: Blob, durationMs: number) => {
      const description = trickDescriptionRef.current.trim();
      if (!gameId || !userId || !description) return;

      setIsUploading(true);
      try {
        const timestamp = Date.now();
        const videoPath = `games/${gameId}/turns/${userId}_${timestamp}.webm`;

        // Extract thumbnail and upload video in parallel
        const [thumbnailBlob, videoUrl] = await Promise.all([
          extractThumbnail(blob).catch(() => null),
          uploadVideoBlob(videoPath, blob),
        ]);

        // Upload thumbnail if extracted
        let thumbnailUrl: string | undefined;
        if (thumbnailBlob) {
          const thumbPath = `games/${gameId}/turns/${userId}_${timestamp}_thumb.jpg`;
          thumbnailUrl = await uploadVideoBlob(thumbPath, thumbnailBlob);
        }

        // Submit turn — auto-send, no preview, no confirmation
        await submitTurnAsync({
          gameId,
          trickDescription: description,
          videoUrl,
          videoDurationMs: durationMs,
          thumbnailUrl,
        });

        onSuccess();
      } catch (err) {
        // Mutation errors handled by useSubmitTurn toast.
        // Upload errors (Firebase Storage) need explicit handling.
        toast({
          title: "Upload failed",
          description: err instanceof Error ? err.message : "Try again.",
          variant: "destructive",
        });
      } finally {
        setIsUploading(false);
      }
    },
    [gameId, userId, submitTurnAsync, toast, onSuccess]
  );

  return { handleRecordingComplete, isUploading };
}
