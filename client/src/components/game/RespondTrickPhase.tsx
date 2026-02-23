import { Play, Swords } from "lucide-react";
import { VideoRecorder } from "./VideoRecorder";
import { Input } from "@/components/ui/input";
import type { GameTurn } from "@/lib/api/game/types";

interface RespondTrickPhaseProps {
  trickDescription: string;
  onTrickDescriptionChange: (value: string) => void;
  onRecordingComplete: (blob: Blob, durationMs: number) => void;
  isUploading: boolean;
  submitPending: boolean;
  lastTrickDescription?: string;
  turns: GameTurn[];
  onVideoClick: (url: string) => void;
}

export function RespondTrickPhase({
  trickDescription,
  onTrickDescriptionChange,
  onRecordingComplete,
  isUploading,
  submitPending,
  lastTrickDescription,
  turns,
  onVideoClick,
}: RespondTrickPhaseProps) {
  const lastSetTurn = [...turns].reverse().find((t) => t.turnType === "set");

  return (
    <div className="p-6 rounded-lg bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 space-y-4">
      <div className="flex items-center gap-2">
        <Swords className="w-5 h-5 text-blue-400" />
        <h2 className="text-lg font-semibold text-white">Your Turn to Respond</h2>
      </div>

      {/* Show the trick they need to match */}
      {lastTrickDescription && (
        <div className="p-4 rounded-lg bg-neutral-900 border border-neutral-700">
          <div className="text-xs text-neutral-500 mb-1">Trick to match:</div>
          <div className="text-white font-bold">{lastTrickDescription}</div>
        </div>
      )}

      {/* Show the set video */}
      {lastSetTurn?.videoUrl && (
        <button
          onClick={() => onVideoClick(lastSetTurn.videoUrl)}
          className="flex items-center gap-2 text-sm text-yellow-400 hover:text-yellow-300 transition-colors"
          type="button"
        >
          <Play className="w-4 h-4" />
          Watch their attempt
        </button>
      )}

      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-2">Your Response</label>
        <Input
          placeholder="Describe your attempt..."
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
          Describe your attempt to enable recording.
        </p>
      )}

      {isUploading && (
        <div className="text-center text-sm text-neutral-400 font-mono">Uploading...</div>
      )}
    </div>
  );
}
