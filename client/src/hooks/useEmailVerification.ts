import { useMemo, useState, useCallback } from "react";
import { sendEmailVerification } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "./useAuth";

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
    if (user.isAnonymous) return true;
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
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("No user signed in");
    }

    if (!canResend) {
      const waitTime = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - lastResendTime)) / 1000);
      throw new Error(`Please wait ${waitTime} seconds before resending`);
    }

    setIsResending(true);
    try {
      await sendEmailVerification(currentUser);
      setLastResendTime(Date.now());
    } finally {
      setIsResending(false);
    }
  }, [canResend, lastResendTime]);

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
