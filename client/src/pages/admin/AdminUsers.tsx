import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api/client";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Textarea } from "../../components/ui/textarea";
import { useToast } from "../../hooks/use-toast";
import { Search, ChevronLeft, ChevronRight, Shield, Ban, CheckCircle, Loader2 } from "lucide-react";

interface UserModeration {
  userId: string;
  isBanned: boolean;
  banExpiresAt: string | null;
  reputationScore: number;
  proVerificationStatus: string;
  isProVerified: boolean;
}

interface AdminUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  accountTier: string;
  trustLevel: number;
  isActive: boolean;
  isEmailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  moderation: UserModeration | null;
}

interface UsersResponse {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

function TrustBadge({ level }: { level: number }) {
  const config = {
    0: { label: "TL0", className: "text-neutral-400 border-neutral-600" },
    1: { label: "TL1", className: "text-blue-400 border-blue-500/30" },
    2: { label: "TL2", className: "text-green-400 border-green-500/30" },
  }[level] ?? { label: `TL${level}`, className: "text-neutral-400 border-neutral-600" };

  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const config: Record<string, string> = {
    free: "text-neutral-400 border-neutral-600",
    pro: "text-orange-400 border-orange-500/30 bg-orange-500/10",
    premium: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  };

  return (
    <Badge variant="outline" className={config[tier] || config.free}>
      {tier}
    </Badge>
  );
}

function UserRowSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 border-b border-neutral-800 last:border-b-0">
      <Skeleton className="h-8 w-8 rounded-full bg-neutral-800" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-36 bg-neutral-800" />
        <Skeleton className="h-3 w-48 bg-neutral-800" />
      </div>
      <Skeleton className="h-6 w-12 bg-neutral-800" />
      <Skeleton className="h-6 w-12 bg-neutral-800" />
    </div>
  );
}

export default function AdminUsers() {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [banDialog, setBanDialog] = useState<{
    user: AdminUser;
    type: "temp_ban" | "perm_ban";
  } | null>(null);
  const [banNotes, setBanNotes] = useState("");
  const [trustLevelConfirm, setTrustLevelConfirm] = useState<{
    userId: string;
    currentLevel: number;
    newLevel: number;
  } | null>(null);
  const [tierConfirm, setTierConfirm] = useState<{
    userId: string;
    currentTier: string;
    newTier: string;
  } | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<UsersResponse>({
    queryKey: ["admin", "users", search, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) params.set("search", search);
      return apiRequest({
        method: "GET",
        path: `/api/admin/users?${params}`,
      });
    },
  });

  const trustLevelMutation = useMutation({
    mutationFn: ({ userId, trustLevel }: { userId: string; trustLevel: number }) =>
      apiRequest({
        method: "PATCH",
        path: `/api/admin/users/${userId}/trust-level`,
        body: { trustLevel },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setTrustLevelConfirm(null);
      toast({ title: "Trust level updated" });
    },
    onError: () => {
      setTrustLevelConfirm(null);
      toast({ title: "Failed to update trust level", variant: "destructive" });
    },
  });

  const tierOverrideMutation = useMutation({
    mutationFn: ({ userId, accountTier }: { userId: string; accountTier: string }) =>
      apiRequest({
        method: "PATCH",
        path: `/api/admin/users/${userId}/tier`,
        body: { accountTier },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setTierConfirm(null);
      toast({ title: "Account tier updated" });
    },
    onError: () => {
      setTierConfirm(null);
      toast({ title: "Failed to update tier", variant: "destructive" });
    },
  });

  const modActionMutation = useMutation({
    mutationFn: (input: {
      targetUserId: string;
      actionType: string;
      reasonCode: string;
      notes: string;
    }) =>
      apiRequest({
        method: "POST",
        path: "/api/admin/mod-action",
        body: { ...input, reversible: true },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      setBanDialog(null);
      setBanNotes("");
      toast({ title: "Moderation action applied" });
    },
    onError: () => {
      toast({ title: "Failed to apply action", variant: "destructive" });
    },
  });

  const proVerifyMutation = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: string }) =>
      apiRequest({
        method: "POST",
        path: "/api/admin/pro-verify",
        body: { userId, status, evidence: [], notes: "Admin dashboard action" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast({ title: "Pro verification status updated" });
    },
    onError: () => {
      toast({ title: "Failed to update pro status", variant: "destructive" });
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const trustLevelLabels: Record<number, string> = {
    0: "TL0 - New User",
    1: "TL1 - Trusted",
    2: "TL2 - Veteran",
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Manage user trust levels, bans, and pro verification
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by email or name..."
            className="pl-9 bg-neutral-900 border-neutral-700 text-white"
          />
        </div>
        <Button type="submit" variant="outline" className="border-neutral-700 text-neutral-300">
          Search
        </Button>
      </form>

      {/* Users List */}
      <Card className="bg-neutral-900/50 border-neutral-800">
        {isLoading ? (
          <div>
            <UserRowSkeleton />
            <UserRowSkeleton />
            <UserRowSkeleton />
            <UserRowSkeleton />
            <UserRowSkeleton />
          </div>
        ) : users.length === 0 ? (
          <CardContent className="p-8 text-center">
            <p className="text-neutral-400">No users found.</p>
          </CardContent>
        ) : (
          <div>
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-4 p-4 border-b border-neutral-800 last:border-b-0 hover:bg-neutral-900/80 transition-colors"
              >
                {/* User Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-white truncate">
                      {user.firstName || ""} {user.lastName || ""}
                      {!user.firstName && !user.lastName && "Unnamed User"}
                    </span>
                    {user.moderation?.isBanned && (
                      <Badge
                        variant="outline"
                        className="text-red-400 border-red-500/30 bg-red-500/10 text-[10px]"
                      >
                        BANNED
                      </Badge>
                    )}
                    {user.moderation?.isProVerified && (
                      <Badge
                        variant="outline"
                        className="text-green-400 border-green-500/30 bg-green-500/10 text-[10px]"
                      >
                        PRO
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 truncate">{user.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-neutral-600">
                      Joined{" "}
                      {new Date(user.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    {user.lastLoginAt && (
                      <span className="text-[10px] text-neutral-600">
                        Last login{" "}
                        {new Date(user.lastLoginAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Badges */}
                <TierBadge tier={user.accountTier} />
                <TrustBadge level={user.trustLevel} />

                {/* Actions */}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-neutral-700 text-neutral-300"
                  onClick={() => setSelectedUser(user)}
                >
                  Manage
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-neutral-500">
            Showing {(page - 1) * 20 + 1}-{Math.min(page * 20, total)} of {total}
          </p>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-neutral-700 text-neutral-400"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-neutral-700 text-neutral-400"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* User Management Dialog */}
      <Dialog open={selectedUser !== null} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="bg-neutral-900 border-neutral-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedUser?.firstName || ""} {selectedUser?.lastName || "User"}
            </DialogTitle>
            <DialogDescription className="text-neutral-400">
              {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4">
              {/* Trust Level */}
              <div>
                <label className="text-sm text-neutral-400 block mb-1.5">Trust Level</label>
                <Select
                  value={String(selectedUser.trustLevel)}
                  onValueChange={(val) => {
                    const newLevel = Number(val);
                    if (newLevel !== selectedUser.trustLevel) {
                      setTrustLevelConfirm({
                        userId: selectedUser.id,
                        currentLevel: selectedUser.trustLevel,
                        newLevel,
                      });
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
                  value={selectedUser.accountTier}
                  onValueChange={(val) => {
                    if (val !== selectedUser.accountTier) {
                      setTierConfirm({
                        userId: selectedUser.id,
                        currentTier: selectedUser.accountTier,
                        newTier: val,
                      });
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
                      selectedUser.moderation?.proVerificationStatus === "verified"
                        ? "bg-green-500/20 text-green-400 border-green-500/30"
                        : "border-green-500/30 text-green-400"
                    }`}
                    onClick={() =>
                      proVerifyMutation.mutate({ userId: selectedUser.id, status: "verified" })
                    }
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
                    onClick={() =>
                      proVerifyMutation.mutate({ userId: selectedUser.id, status: "rejected" })
                    }
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
                  {selectedUser.moderation?.isBanned ? (
                    <span className="text-xs text-red-400 flex items-center gap-1">
                      <Ban className="h-3 w-3" />
                      Currently banned
                      {selectedUser.moderation?.banExpiresAt && (
                        <span>
                          (expires{" "}
                          {new Date(selectedUser.moderation.banExpiresAt).toLocaleDateString()})
                        </span>
                      )}
                    </span>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-yellow-500/30 text-yellow-400"
                        onClick={() =>
                          modActionMutation.mutate({
                            targetUserId: selectedUser.id,
                            actionType: "warn",
                            reasonCode: "admin_warning",
                            notes: "Warning issued from admin dashboard",
                          })
                        }
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
                        onClick={() => setBanDialog({ user: selectedUser, type: "temp_ban" })}
                      >
                        Temp Ban
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-red-500/30 text-red-400"
                        onClick={() => setBanDialog({ user: selectedUser, type: "perm_ban" })}
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
              onClick={() => setSelectedUser(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trust Level Confirmation Dialog */}
      <Dialog open={trustLevelConfirm !== null} onOpenChange={() => setTrustLevelConfirm(null)}>
        <DialogContent className="bg-neutral-900 border-neutral-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Trust Level Change</DialogTitle>
            <DialogDescription className="text-neutral-400">
              Change trust level from{" "}
              <span className="font-medium text-white">
                {trustLevelLabels[trustLevelConfirm?.currentLevel ?? 0]}
              </span>{" "}
              to{" "}
              <span className="font-medium text-white">
                {trustLevelLabels[trustLevelConfirm?.newLevel ?? 0]}
              </span>
              ? This affects the user's rate limits and permissions.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-neutral-600 text-neutral-300"
              onClick={() => setTrustLevelConfirm(null)}
            >
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={trustLevelMutation.isPending}
              onClick={() => {
                if (!trustLevelConfirm) return;
                trustLevelMutation.mutate({
                  userId: trustLevelConfirm.userId,
                  trustLevel: trustLevelConfirm.newLevel,
                });
                if (selectedUser && selectedUser.id === trustLevelConfirm.userId) {
                  setSelectedUser({ ...selectedUser, trustLevel: trustLevelConfirm.newLevel });
                }
              }}
            >
              {trustLevelMutation.isPending ? (
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

      {/* Tier Override Confirmation Dialog */}
      <Dialog open={tierConfirm !== null} onOpenChange={() => setTierConfirm(null)}>
        <DialogContent className="bg-neutral-900 border-neutral-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Tier Override</DialogTitle>
            <DialogDescription className="text-neutral-400">
              Change account tier from{" "}
              <span className="font-medium text-white">{tierConfirm?.currentTier}</span> to{" "}
              <span className="font-medium text-white">{tierConfirm?.newTier}</span>?
              {tierConfirm?.newTier === "free" && tierConfirm?.currentTier === "premium" && (
                <span className="block mt-1 text-yellow-400">
                  Downgrading from Premium will revoke paid features. Consider issuing a Stripe
                  refund separately if applicable.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-neutral-600 text-neutral-300"
              onClick={() => setTierConfirm(null)}
            >
              Cancel
            </Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              disabled={tierOverrideMutation.isPending}
              onClick={() => {
                if (!tierConfirm) return;
                tierOverrideMutation.mutate({
                  userId: tierConfirm.userId,
                  accountTier: tierConfirm.newTier,
                });
                if (selectedUser && selectedUser.id === tierConfirm.userId) {
                  setSelectedUser({ ...selectedUser, accountTier: tierConfirm.newTier });
                }
              }}
            >
              {tierOverrideMutation.isPending ? (
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

      {/* Ban Confirmation Dialog */}
      <Dialog
        open={banDialog !== null}
        onOpenChange={() => {
          setBanDialog(null);
          setBanNotes("");
        }}
      >
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
              onChange={(e) => setBanNotes(e.target.value)}
              placeholder="Reason for ban..."
              className="bg-neutral-800 border-neutral-700 text-white"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-neutral-600 text-neutral-300"
              onClick={() => {
                setBanDialog(null);
                setBanNotes("");
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (!banDialog) return;
                modActionMutation.mutate({
                  targetUserId: banDialog.user.id,
                  actionType: banDialog.type,
                  reasonCode: "admin_ban",
                  notes: banNotes || "Ban issued from admin dashboard",
                });
                setSelectedUser(null);
              }}
              disabled={modActionMutation.isPending}
            >
              {modActionMutation.isPending ? (
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
    </div>
  );
}
