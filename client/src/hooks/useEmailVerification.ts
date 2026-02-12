import { useMemo, useState, useCallback } from "react";
import { useAuth } from "./useAuth";
import { apiRequest } from "../lib/api/client";
import { isDevAdmin } from "../lib/devAdmin";

const RESEND_COOLDOWN_MS = 60000; // 1 minute cooldown

export function useEmailVerification() {
  const authContext = useAuth();
  const user = authContext?.user ?? null;
  const isAuthenticated = authContext?.isAuthenticated ?? false;
  const [lastResendTime, setLastResendTime] = useState<number>(0);
  const [isResending, setIsResending] = useState(false);

  const isEmailUser = useMemo(() => {
    if (!user) return false;
    return user.providerData.some((p) => p.providerId === "password");
  }, [user]);

  const isVerified = useMemo(() => {
    if (!user) return false;
    if (user.emailVerified) return true;
    return user.providerData.some((p) => p.providerId !== "password");
  }, [user]);

  const requiresVerification = useMemo(() => {
    return isAuthenticated && isEmailUser && !user?.emailVerified;
  }, [isAuthenticated, isEmailUser, user?.emailVerified]);

  const canResend = useMemo(() => {
    return Date.now() - lastResendTime > RESEND_COOLDOWN_MS;
  }, [lastResendTime]);

  const resendVerificationEmail = useCallback(async () => {
    if (!user) {
      throw new Error("No user signed in");
    }

    if (!canResend) {
      const waitTime = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - lastResendTime)) / 1000);
      throw new Error(`Please wait ${waitTime} seconds before resending`);
    }

    setIsResending(true);
    try {
      await apiRequest({
        method: "POST",
        path: "/api/auth/resend-verification",
      });
      setLastResendTime(Date.now());
    } finally {
      setIsResending(false);
    }
  }, [user, canResend, lastResendTime]);

  // Dev admin bypass — skip verification gate entirely
  if (isDevAdmin()) {
    return {
      isVerified: true,
      requiresVerification: false,
      isEmailUser: false,
      canResend: false,
      isResending: false,
      resendVerificationEmail: async () => {},
      userEmail: "admin@skatehubba.local",
    };
  }

  return {
    isVerified,
    requiresVerification,
    isEmailUser,
    canResend,
    isResending,
    resendVerificationEmail,
    userEmail: user?.email,
  };
}
