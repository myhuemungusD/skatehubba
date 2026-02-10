import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Textarea } from "../../../components/ui/textarea";
import { Loader2 } from "lucide-react";

// ============================================================================
// Trust Level Confirmation
// ============================================================================

const trustLevelLabels: Record<number, string> = {
  0: "TL0 - New User",
  1: "TL1 - Trusted",
  2: "TL2 - Veteran",
};

interface TrustLevelDialogProps {
  confirm: { userId: string; currentLevel: number; newLevel: number } | null;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function TrustLevelConfirmDialog({
  confirm,
  onClose,
  onConfirm,
  isPending,
}: TrustLevelDialogProps) {
  return (
    <Dialog open={confirm !== null} onOpenChange={() => onClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirm Trust Level Change</DialogTitle>
          <DialogDescription className="text-neutral-400">
            Change trust level from{" "}
            <span className="font-medium text-white">
              {trustLevelLabels[confirm?.currentLevel ?? 0]}
            </span>{" "}
            to{" "}
            <span className="font-medium text-white">
              {trustLevelLabels[confirm?.newLevel ?? 0]}
            </span>
            ? This affects the user's rate limits and permissions.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            className="border-neutral-600 text-neutral-300"
            onClick={() => onClose()}
          >
            Cancel
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white"
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? (
              <>
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                Updating...
              </>
            ) : (
              "Confirm"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Tier Override Confirmation
// ============================================================================

interface TierDialogProps {
  confirm: { userId: string; currentTier: string; newTier: string } | null;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function TierConfirmDialog({ confirm, onClose, onConfirm, isPending }: TierDialogProps) {
  return (
    <Dialog open={confirm !== null} onOpenChange={() => onClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirm Tier Override</DialogTitle>
          <DialogDescription className="text-neutral-400">
            Change account tier from{" "}
            <span className="font-medium text-white">{confirm?.currentTier}</span> to{" "}
            <span className="font-medium text-white">{confirm?.newTier}</span>?
            {confirm?.newTier === "free" && confirm?.currentTier === "premium" && (
              <span className="block mt-1 text-yellow-400">
                Downgrading from Premium will revoke paid features. Consider issuing a Stripe refund
                separately if applicable.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            className="border-neutral-600 text-neutral-300"
            onClick={() => onClose()}
          >
            Cancel
          </Button>
          <Button
            className="bg-orange-600 hover:bg-orange-700 text-white"
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? (
              <>
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                Updating...
              </>
            ) : (
              "Confirm"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Ban Confirmation
// ============================================================================

interface BanDialogProps {
  banDialog: { user: { id: string }; type: "temp_ban" | "perm_ban" } | null;
  banNotes: string;
  onNotesChange: (notes: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function BanConfirmDialog({
  banDialog,
  banNotes,
  onNotesChange,
  onClose,
  onConfirm,
  isPending,
}: BanDialogProps) {
  return (
    <Dialog open={banDialog !== null} onOpenChange={() => onClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-white">
        <DialogHeader>
          <DialogTitle>
            {banDialog?.type === "perm_ban" ? "Permanent Ban" : "Temporary Ban"}
          </DialogTitle>
          <DialogDescription className="text-neutral-400">
            {banDialog?.type === "perm_ban"
              ? "This will permanently ban the user from the platform."
              : "This will temporarily ban the user."}
          </DialogDescription>
        </DialogHeader>
        <div>
          <label className="text-sm text-neutral-400 block mb-1">Reason</label>
          <Textarea
            value={banNotes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Reason for ban..."
            className="bg-neutral-800 border-neutral-700 text-white"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            className="border-neutral-600 text-neutral-300"
            onClick={() => onClose()}
          >
            Cancel
          </Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                Applying...
              </>
            ) : (
              "Confirm Ban"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
