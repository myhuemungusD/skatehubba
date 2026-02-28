/**
 * VideoPlayer - Displays uploaded trick video with loading states
 *
 * Uses signed URLs via the getVideoUrl Cloud Function for secure video access.
 * downloadURL in the video doc is always null — video access is mediated
 * through signed URLs that verify game participant membership.
 */

import { useState } from "react";
import { Play, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVideoUrl } from "@/hooks/useVideoUrl";
import type { VideoDoc } from "@/lib/remoteSkate";

interface VideoPlayerProps {
  video: (VideoDoc & { id: string }) | null;
  label: string;
  className?: string;
}

export function VideoPlayer({ video, label, className }: VideoPlayerProps) {
  const [hasPlaybackError, setHasPlaybackError] = useState(false);

  const {
    url: signedUrl,
    isLoading: isUrlLoading,
    error: urlError,
  } = useVideoUrl({
    gameId: video?.status === "ready" ? video.gameId : null,
    storagePath: video?.status === "ready" ? video.storagePath : null,
  });

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

  // Loading signed URL
  if (isUrlLoading) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg bg-neutral-900 border border-neutral-800 p-6 min-h-[180px]",
          className
        )}
      >
        <Loader2 className="h-6 w-6 text-neutral-400 animate-spin" />
        <span className="text-sm text-neutral-400">Loading {label}...</span>
      </div>
    );
  }

  // Signed URL fetch error or playback error
  if (urlError || hasPlaybackError) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg bg-red-500/5 border border-red-500/20 p-6 min-h-[180px]",
          className
        )}
      >
        <AlertCircle className="h-6 w-6 text-red-400" />
        <span className="text-sm text-red-400">Failed to play video</span>
        {urlError && <span className="text-xs text-red-400/70">{urlError}</span>}
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
          src={signedUrl || undefined}
          controls
          playsInline
          preload="metadata"
          className="w-full max-h-[300px] object-contain"
          onError={() => setHasPlaybackError(true)}
        >
          <track kind="captions" />
        </video>
      </div>
    </div>
  );
}
