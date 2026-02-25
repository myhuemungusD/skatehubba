import { Swords } from "lucide-react";
import { VideoRecorder } from "./VideoRecorder";
import { TrickAutocomplete } from "./TrickAutocomplete";
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
        <h2 className="text-lg font-semibold text-white">Your Move</h2>
      </div>

      {/* Show the trick they need to match */}
      {lastTrickDescription && (
        <div className="p-4 rounded-lg bg-neutral-900 border border-neutral-700">
          <div className="text-xs text-neutral-500 mb-1">Trick to match:</div>
          <div className="text-white font-bold text-lg">{lastTrickDescription}</div>
        </div>
      )}

      {/* Setter's clip — autoplay, loop, muted (skate parks are loud) */}
      {lastSetTurn?.videoUrl && (
        <div className="relative w-full aspect-[9/16] max-h-[300px] bg-black rounded-lg overflow-hidden">
          <video
            src={lastSetTurn.videoUrl}
            className="w-full h-full object-cover"
            autoPlay
            loop
            muted
            playsInline
            onClick={() => onVideoClick(lastSetTurn.videoUrl)}
          >
            <track kind="captions" />
          </video>
          <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/60 text-xs text-neutral-400">
            Their clip — tap to fullscreen
          </div>
        </div>
      )}

      <div>
        <label
          htmlFor="respond-trick-input"
          className="block text-sm font-medium text-neutral-300 mb-2"
        >
          Your Response
        </label>
        <TrickAutocomplete
          id="respond-trick-input"
          value={trickDescription}
          onChange={onTrickDescriptionChange}
          placeholder="Describe your attempt..."
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
