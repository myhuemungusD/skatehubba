import { useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface VideoPlayerModalProps {
  videoUrl: string;
  onClose: () => void;
}

export function VideoPlayerModal({ videoUrl, onClose }: VideoPlayerModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Video player"
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- backdrop dismiss handled by Escape key listener above */}
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-neutral-900 rounded-none sm:rounded-lg p-2 sm:p-4 w-full sm:max-w-lg">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-medium text-neutral-400">Video</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="aspect-[9/16] bg-black rounded-none sm:rounded-lg overflow-hidden">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- user-generated skate trick videos have no captions */}
          <video
            src={videoUrl}
            className="w-full h-full object-contain"
            controls
            autoPlay
            playsInline
            controlsList="nodownload noplaybackrate"
            disablePictureInPicture
          />
        </div>
      </div>
    </div>
  );
}
