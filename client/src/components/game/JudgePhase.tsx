import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface JudgePhaseProps {
  opponentName: string;
  lastTrickDescription?: string;
  onJudge: (result: "landed" | "missed") => void;
  isPending: boolean;
}

export function JudgePhase({ opponentName, lastTrickDescription, onJudge, isPending }: JudgePhaseProps) {
  return (
    <div className="p-6 rounded-lg bg-gradient-to-r from-yellow-500/10 to-red-500/10 border border-yellow-500/30 space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-yellow-400" />
        <h2 className="text-lg font-semibold text-white">Judge the Trick</h2>
      </div>

      <p className="text-sm text-neutral-400">Did you land {opponentName}'s trick?</p>

      {lastTrickDescription && (
        <div className="p-4 rounded-lg bg-neutral-900 border border-neutral-700">
          <div className="text-xs text-neutral-500 mb-1">Trick:</div>
          <div className="text-white font-bold">{lastTrickDescription}</div>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          onClick={() => onJudge("landed")}
          disabled={isPending}
          className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3"
        >
          LAND
        </Button>
        <Button
          onClick={() => onJudge("missed")}
          disabled={isPending}
          className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3"
        >
          BAIL
        </Button>
      </div>

      <p className="text-xs text-neutral-500 text-center">
        BAIL = you get a letter. LAND = roles swap. No take-backs.
      </p>
    </div>
  );
}
