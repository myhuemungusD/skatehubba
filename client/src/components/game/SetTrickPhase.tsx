import { Video, AlertTriangle } from "lucide-react";
import { VideoRecorder } from "./VideoRecorder";
import { TrickAutocomplete } from "./TrickAutocomplete";
import { Button } from "@/components/ui/button";

interface SetTrickPhaseProps {
  trickDescription: string;
  onTrickDescriptionChange: (value: string) => void;
  onRecordingComplete: (blob: Blob, durationMs: number) => void;
  isUploading: boolean;
  submitPending: boolean;
  onSetterBail?: () => void;
  setterBailPending?: boolean;
}

export function SetTrickPhase({
  trickDescription,
  onTrickDescriptionChange,
  onRecordingComplete,
  isUploading,
  submitPending,
  onSetterBail,
  setterBailPending,
}: SetTrickPhaseProps) {
  return (
    <div className="p-6 rounded-lg bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border border-orange-500/30">
      <div className="flex items-center gap-2 mb-4">
        <Video className="w-5 h-5 text-orange-400" />
        <h2 className="text-lg font-semibold text-white">Set Your Trick</h2>
      </div>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="set-trick-name"
            className="block text-sm font-medium text-neutral-300 mb-2"
          >
            Trick Name
          </label>
          <TrickAutocomplete
            id="set-trick-name"
            value={trickDescription}
            onChange={onTrickDescriptionChange}
            disabled={isUploading}
          />
          <p className="text-xs text-neutral-500 mt-1">One take. No preview. Auto-sends on stop.</p>
        </div>

        {trickDescription.trim() ? (
          <VideoRecorder
            onRecordingComplete={onRecordingComplete}
            disabled={isUploading || submitPending}
          />
        ) : (
          <p className="text-xs text-neutral-500 text-center py-4">
            Name your trick to enable recording.
          </p>
        )}

        {isUploading && (
          <div className="text-center text-sm text-neutral-400 font-mono">Uploading...</div>
        )}

        {/* Setter bail — if you can't land what you set, you take the letter */}
        {onSetterBail && (
          <div className="pt-2 border-t border-neutral-700/50">
            <Button
              onClick={onSetterBail}
              disabled={setterBailPending || isUploading}
              variant="ghost"
              className="w-full text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-2"
            >
              <AlertTriangle className="w-4 h-4" />I bailed my own trick
            </Button>
            <p className="text-xs text-neutral-500 text-center mt-1">
              Can't land it? You take the letter. That's the rule.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
