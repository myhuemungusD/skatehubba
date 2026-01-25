import { useMemo, useState } from "react";
import { useAuth } from "./useAuth";
import type { WriteAccessReason } from "../components/auth/WriteAccessModal";

interface WriteGuardState {
  open: boolean;
  reason: WriteAccessReason;
}

export function useWriteGuard() {
  const { user, isAuthenticated, needsProfileSetup } = useAuth();
  const [state, setState] = useState<WriteGuardState>({
    open: false,
    reason: "anonymous",
  });

  const isAnonymous = user?.isAnonymous ?? false;
  const canWrite = useMemo(
    () => isAuthenticated && !isAnonymous && !needsProfileSetup,
    [isAuthenticated, isAnonymous, needsProfileSetup]
  );

  const guard = () => {
    if (canWrite) return true;
    setState({
      open: true,
      reason: needsProfileSetup ? "profile" : "anonymous",
    });
    return false;
  };

  return {
    canWrite,
    isAnonymous,
    needsProfileSetup,
    guard,
    modal: {
      open: state.open,
      reason: state.reason,
      onOpenChange: (open: boolean) =>
        setState((prev) => ({
          ...prev,
          open,
        })),
    },
  };
}

