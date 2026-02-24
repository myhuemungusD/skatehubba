import { Button } from "@/components/ui/button";

interface VideoPlayerModalProps {
  videoUrl: string;
  onClose: () => void;
}

export function VideoPlayerModal({ videoUrl, onClose }: VideoPlayerModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
      <button
        className="absolute inset-0 bg-black/90 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close video"
        type="button"
      />
      <div className="relative bg-neutral-900 rounded-none sm:rounded-lg p-2 sm:p-4 w-full sm:max-w-lg">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-medium text-neutral-400">Video</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="aspect-[9/16] bg-black rounded-none sm:rounded-lg overflow-hidden">
          <video
            src={videoUrl}
            className="w-full h-full object-contain"
            controls
            autoPlay
            playsInline
            controlsList="nodownload noplaybackrate"
            disablePictureInPicture
          >
            <track kind="captions" />
          </video>
        </div>
      </div>
    </div>
  );
}
