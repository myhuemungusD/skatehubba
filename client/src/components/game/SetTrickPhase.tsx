import { Video } from "lucide-react";
import { VideoRecorder } from "./VideoRecorder";
import { Input } from "@/components/ui/input";

interface SetTrickPhaseProps {
  trickDescription: string;
  onTrickDescriptionChange: (value: string) => void;
  onRecordingComplete: (blob: Blob, durationMs: number) => void;
  isUploading: boolean;
  submitPending: boolean;
}

export function SetTrickPhase({
  trickDescription,
  onTrickDescriptionChange,
  onRecordingComplete,
  isUploading,
  submitPending,
}: SetTrickPhaseProps) {
  return (
    <div className="p-6 rounded-lg bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border border-orange-500/30">
      <div className="flex items-center gap-2 mb-4">
        <Video className="w-5 h-5 text-orange-400" />
        <h2 className="text-lg font-semibold text-white">Set Your Trick</h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-2">Trick Name</label>
          <Input
            placeholder="Kickflip, Heelflip, Tre Flip..."
            value={trickDescription}
            onChange={(e) => onTrickDescriptionChange(e.target.value)}
            className="bg-neutral-900 border-neutral-700"
            maxLength={500}
            disabled={isUploading}
          />
        </div>

        {trickDescription.trim() ? (
          <VideoRecorder
            onRecordingComplete={onRecordingComplete}
            disabled={isUploading || submitPending}
          />
        ) : (
          <p className="text-xs text-neutral-500 text-center py-4">
            Enter trick name to enable recording.
          </p>
        )}

        {isUploading && (
          <div className="text-center text-sm text-neutral-400 font-mono">Uploading...</div>
        )}
      </div>
    </div>
  );
}
