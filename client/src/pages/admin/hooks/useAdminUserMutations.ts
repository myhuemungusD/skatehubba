import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../../lib/api/client";
import { useToast } from "../../../hooks/use-toast";

export function useAdminUserMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const trustLevelMutation = useMutation({
    mutationFn: ({ userId, trustLevel }: { userId: string; trustLevel: number }) =>
      apiRequest({
        method: "PATCH",
        path: `/api/admin/users/${userId}/trust-level`,
        body: { trustLevel },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast({ title: "Trust level updated" });
    },
    onError: () => {
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
      toast({ title: "Account tier updated" });
    },
    onError: () => {
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

  return {
    trustLevelMutation,
    tierOverrideMutation,
    modActionMutation,
    proVerifyMutation,
  };
}
