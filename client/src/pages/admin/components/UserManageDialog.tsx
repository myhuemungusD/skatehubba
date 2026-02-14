import type { UseMutationResult } from "@tanstack/react-query";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Shield, Ban, CheckCircle, Loader2 } from "lucide-react";
import type { AdminUser } from "../types";

interface UserManageDialogProps {
  user: AdminUser | null;
  onClose: () => void;
  onTrustLevelChange: (userId: string, currentLevel: number, newLevel: number) => void;
  onTierChange: (userId: string, currentTier: string, newTier: string) => void;
  onWarn: (userId: string) => void;
  onTempBan: (user: AdminUser) => void;
  onPermBan: (user: AdminUser) => void;
  onProVerify: (userId: string, status: string) => void;
  proVerifyMutation: UseMutationResult<unknown, Error, { userId: string; status: string }, unknown>;
  modActionMutation: UseMutationResult<
    unknown,
    Error,
    { targetUserId: string; actionType: string; reasonCode: string; notes: string },
    unknown
  >;
}

export function UserManageDialog({
  user,
  onClose,
  onTrustLevelChange,
  onTierChange,
  onWarn,
  onTempBan,
  onPermBan,
  onProVerify,
  proVerifyMutation,
  modActionMutation,
}: UserManageDialogProps) {
  return (
    <Dialog open={user !== null} onOpenChange={() => onClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>
            {user?.firstName || ""} {user?.lastName || "User"}
          </DialogTitle>
          <DialogDescription className="text-neutral-400">{user?.email}</DialogDescription>
        </DialogHeader>

        {user && (
          <div className="space-y-4">
            {/* Trust Level */}
            <div>
              <label className="text-sm text-neutral-400 block mb-1.5">Trust Level</label>
              <Select
                value={String(user.trustLevel)}
                onValueChange={(val) => {
                  const newLevel = Number(val);
                  if (newLevel !== user.trustLevel) {
                    onTrustLevelChange(user.id, user.trustLevel, newLevel);
                  }
                }}
              >
                <SelectTrigger className="bg-neutral-800 border-neutral-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-neutral-800 border-neutral-700">
                  <SelectItem value="0">TL0 - New User</SelectItem>
                  <SelectItem value="1">TL1 - Trusted</SelectItem>
                  <SelectItem value="2">TL2 - Veteran</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Account Tier Override */}
            <div>
              <label className="text-sm text-neutral-400 block mb-1.5">Account Tier</label>
              <Select
                value={user.accountTier}
                onValueChange={(val) => {
                  if (val !== user.accountTier) {
                    onTierChange(user.id, user.accountTier, val);
                  }
                }}
              >
                <SelectTrigger className="bg-neutral-800 border-neutral-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-neutral-800 border-neutral-700">
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="pro">Pro (Sponsored)</SelectItem>
                  <SelectItem value="premium">Premium ($9.99)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Pro Verification */}
            <div>
              <label className="text-sm text-neutral-400 block mb-1.5">Pro Verification</label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className={`h-7 text-xs ${
                    user.moderation?.proVerificationStatus === "verified"
                      ? "bg-green-500/20 text-green-400 border-green-500/30"
                      : "border-green-500/30 text-green-400"
                  }`}
                  onClick={() => onProVerify(user.id, "verified")}
                  disabled={proVerifyMutation.isPending}
                >
                  {proVerifyMutation.isPending ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle className="h-3 w-3 mr-1" />
                  )}
                  Verify
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-red-500/30 text-red-400"
                  onClick={() => onProVerify(user.id, "rejected")}
                  disabled={proVerifyMutation.isPending}
                >
                  Reject
                </Button>
              </div>
            </div>

            {/* Ban Actions */}
            <div>
              <label className="text-sm text-neutral-400 block mb-1.5">Moderation Actions</label>
              <div className="flex gap-2">
                {user.moderation?.isBanned ? (
                  <span className="text-xs text-red-400 flex items-center gap-1">
                    <Ban className="h-3 w-3" />
                    Currently banned
                    {user.moderation?.banExpiresAt && (
                      <span>
                        (expires {new Date(user.moderation.banExpiresAt).toLocaleDateString()})
                      </span>
                    )}
                  </span>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-yellow-500/30 text-yellow-400"
                      onClick={() => onWarn(user.id)}
                      disabled={modActionMutation.isPending}
                    >
                      {modActionMutation.isPending ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Shield className="h-3 w-3 mr-1" />
                      )}
                      Warn
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-orange-500/30 text-orange-400"
                      onClick={() => onTempBan(user)}
                    >
                      Temp Ban
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-red-500/30 text-red-400"
                      onClick={() => onPermBan(user)}
                    >
                      <Ban className="h-3 w-3 mr-1" />
                      Perm Ban
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            className="border-neutral-600 text-neutral-300"
            onClick={() => onClose()}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
