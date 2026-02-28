import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GameDispute, GameTurn } from "@/lib/api/game/types";

interface DisputesSectionProps {
  pendingDisputesAgainstMe: GameDispute[];
  disputeableTurns: GameTurn[];
  isGameOver: boolean;
  onResolveDispute: (disputeId: number, finalResult: "landed" | "missed") => void;
  onDispute: (turnId: number) => void;
  resolveDisputePending: boolean;
  fileDisputePending: boolean;
}

export function DisputesSection({
  pendingDisputesAgainstMe,
  disputeableTurns,
  isGameOver,
  onResolveDispute,
  onDispute,
  resolveDisputePending,
  fileDisputePending,
}: DisputesSectionProps) {
  return (
    <>
      {/* Pending disputes against you */}
      {pendingDisputesAgainstMe.length > 0 && (
        <div className="space-y-3">
          {pendingDisputesAgainstMe.map((dispute) => (
            <div
              key={dispute.id}
              className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30"
            >
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-amber-400">
                  Dispute Against Your Call
                </span>
              </div>
              <p className="text-xs text-neutral-400 mb-3">
                Your opponent is disputing your BAIL call. One of you will receive a permanent
                reputation penalty.
              </p>
              <div className="flex gap-3">
                <Button
                  onClick={() => onResolveDispute(dispute.id, "landed")}
                  disabled={resolveDisputePending}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-sm"
                >
                  Overturn to LAND
                </Button>
                <Button
                  onClick={() => onResolveDispute(dispute.id, "missed")}
                  disabled={resolveDisputePending}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-sm"
                >
                  Uphold BAIL
                </Button>
              </div>
              <p className="text-xs text-neutral-500 mt-2 text-center">
                Loser of dispute gets a permanent reputation penalty. Final.
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Disputeable turns (your BAIL'd tricks you can dispute) */}
      {disputeableTurns.length > 0 && !isGameOver && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-neutral-400">Dispute Available</h3>
          {disputeableTurns.map((turn) => (
            <div
              key={turn.id}
              className="p-3 rounded-lg bg-neutral-800/50 border border-neutral-700 flex items-center justify-between"
            >
              <div>
                <span className="text-sm text-white">
                  Turn {turn.turnNumber}: {turn.trickDescription}
                </span>
                <span className="text-xs text-red-400 ml-2">BAIL</span>
              </div>
              <Button
                onClick={() => onDispute(turn.id)}
                disabled={fileDisputePending}
                variant="outline"
                size="sm"
                className="text-amber-400 border-amber-400/30 hover:bg-amber-500/10"
              >
                Dispute
              </Button>
            </div>
          ))}
          <p className="text-xs text-neutral-500">
            1 dispute per game. Loser gets permanent reputation penalty.
          </p>
        </div>
      )}
    </>
  );
}
