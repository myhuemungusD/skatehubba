/**
 * VideoPlayer - Displays uploaded trick video with loading states.
 *
 * Uses the `getVideoUrl` Cloud Function to generate short-lived signed URLs
 * for video playback instead of permanent download URLs.
 */

import { useState, useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { Play, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { functions } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import type { VideoDoc } from "@/lib/remoteSkate";

interface VideoPlayerProps {
  video: (VideoDoc & { id: string }) | null;
  gameId: string;
  label: string;
  className?: string;
}

const getVideoUrl = httpsCallable<
  { gameId: string; storagePath: string },
  { signedUrl: string; expiresAt: string }
>(functions, "getVideoUrl");

export function VideoPlayer({ video, gameId, label, className }: VideoPlayerProps) {
  const [hasError, setHasError] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);

  useEffect(() => {
    // Reset state when video changes
    setSignedUrl(null);
    setHasError(false);

    if (!video || video.status !== "ready" || !video.storagePath) return;

    let cancelled = false;
    setIsLoadingUrl(true);

    getVideoUrl({ gameId, storagePath: video.storagePath })
      .then((result) => {
        if (!cancelled) {
          setSignedUrl(result.data.signedUrl);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          logger.error("[VideoPlayer] Failed to get signed URL", err);
          setHasError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingUrl(false);
      });

    return () => {
      cancelled = true;
    };
  }, [video?.id, video?.status, video?.storagePath, gameId]);

  if (!video) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg bg-neutral-900 border border-neutral-800 p-6 min-h-[180px]",
          className
        )}
      >
        <Play className="h-6 w-6 text-neutral-600" />
        <span className="text-sm text-neutral-500">Waiting for {label}...</span>
      </div>
    );
  }

  if (video.status === "uploading") {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg bg-neutral-900 border border-neutral-800 p-6 min-h-[180px]",
          className
        )}
      >
        <Loader2 className="h-6 w-6 text-yellow-400 animate-spin" />
        <span className="text-sm text-neutral-400">Uploading {label}...</span>
      </div>
    );
  }

  if (video.status === "failed") {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg bg-red-500/5 border border-red-500/20 p-6 min-h-[180px]",
          className
        )}
      >
        <AlertCircle className="h-6 w-6 text-red-400" />
        <span className="text-sm text-red-400">Upload failed</span>
        {video.errorMessage && (
          <span className="text-xs text-red-400/70">{video.errorMessage}</span>
        )}
      </div>
    );
  }

  if (isLoadingUrl) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg bg-neutral-900 border border-neutral-800 p-6 min-h-[180px]",
          className
        )}
      >
        <Loader2 className="h-6 w-6 text-yellow-400 animate-spin" />
        <span className="text-sm text-neutral-400">Loading {label}...</span>
      </div>
    );
  }

  if (hasError || !signedUrl) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg bg-red-500/5 border border-red-500/20 p-6 min-h-[180px]",
          className
        )}
      >
        <AlertCircle className="h-6 w-6 text-red-400" />
        <span className="text-sm text-red-400">Failed to load video</span>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg overflow-hidden bg-black", className)}>
      <div className="relative">
        <p className="text-xs text-neutral-400 px-3 py-1.5 bg-neutral-900/80 absolute top-0 left-0 right-0 z-10">
          {label}
        </p>
        <video
          src={signedUrl}
          controls
          playsInline
          preload="metadata"
          className="w-full max-h-[300px] object-contain"
          onError={() => setHasError(true)}
        >
          <track kind="captions" />
        </video>
      </div>
    </div>
  );
}
