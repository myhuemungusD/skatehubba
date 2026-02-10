import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api/client";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import type { AdminUser, UsersResponse } from "./types";
import { TrustBadge, TierBadge, UserRowSkeleton } from "./components/UserBadges";
import { UserManageDialog } from "./components/UserManageDialog";
import {
  TrustLevelConfirmDialog,
  TierConfirmDialog,
  BanConfirmDialog,
} from "./components/ConfirmationDialogs";
import { useAdminUserMutations } from "./hooks/useAdminUserMutations";

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

  const { trustLevelMutation, tierOverrideMutation, modActionMutation, proVerifyMutation } =
    useAdminUserMutations();

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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

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

                <TierBadge tier={user.accountTier} />
                <TrustBadge level={user.trustLevel} />

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

      {/* Dialogs */}
      <UserManageDialog
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
        onTrustLevelChange={(userId, currentLevel, newLevel) =>
          setTrustLevelConfirm({ userId, currentLevel, newLevel })
        }
        onTierChange={(userId, currentTier, newTier) =>
          setTierConfirm({ userId, currentTier, newTier })
        }
        onWarn={(userId) =>
          modActionMutation.mutate({
            targetUserId: userId,
            actionType: "warn",
            reasonCode: "admin_warning",
            notes: "Warning issued from admin dashboard",
          })
        }
        onTempBan={(user) => setBanDialog({ user, type: "temp_ban" })}
        onPermBan={(user) => setBanDialog({ user, type: "perm_ban" })}
        onProVerify={(userId, status) => proVerifyMutation.mutate({ userId, status })}
        proVerifyMutation={proVerifyMutation}
        modActionMutation={modActionMutation}
      />

      <TrustLevelConfirmDialog
        confirm={trustLevelConfirm}
        onClose={() => setTrustLevelConfirm(null)}
        onConfirm={() => {
          if (!trustLevelConfirm) return;
          trustLevelMutation.mutate({
            userId: trustLevelConfirm.userId,
            trustLevel: trustLevelConfirm.newLevel,
          });
          if (selectedUser && selectedUser.id === trustLevelConfirm.userId) {
            setSelectedUser({ ...selectedUser, trustLevel: trustLevelConfirm.newLevel });
          }
          setTrustLevelConfirm(null);
        }}
        isPending={trustLevelMutation.isPending}
      />

      <TierConfirmDialog
        confirm={tierConfirm}
        onClose={() => setTierConfirm(null)}
        onConfirm={() => {
          if (!tierConfirm) return;
          tierOverrideMutation.mutate({
            userId: tierConfirm.userId,
            accountTier: tierConfirm.newTier,
          });
          if (selectedUser && selectedUser.id === tierConfirm.userId) {
            setSelectedUser({ ...selectedUser, accountTier: tierConfirm.newTier });
          }
          setTierConfirm(null);
        }}
        isPending={tierOverrideMutation.isPending}
      />

      <BanConfirmDialog
        banDialog={banDialog}
        banNotes={banNotes}
        onNotesChange={setBanNotes}
        onClose={() => {
          setBanDialog(null);
          setBanNotes("");
        }}
        onConfirm={() => {
          if (!banDialog) return;
          modActionMutation.mutate({
            targetUserId: banDialog.user.id,
            actionType: banDialog.type,
            reasonCode: "admin_ban",
            notes: banNotes || "Ban issued from admin dashboard",
          });
          setSelectedUser(null);
          setBanDialog(null);
          setBanNotes("");
        }}
        isPending={modActionMutation.isPending}
      />
    </div>
  );
}
