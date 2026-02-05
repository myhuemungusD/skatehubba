import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { GUEST_MODE } from "../config/flags";
import { useAuth } from "../hooks/useAuth";
import { ensureProfile } from "../lib/profile/ensureProfile";

// Routes that don't make sense in guest mode (auth flows, landing).
// Everything else is allowed by default so new routes work without updating this list.
const GUEST_BLOCKED_ROUTES = new Set<string>([
  "/landing",
  "/auth",
  "/login",
  "/signup",
  "/signin",
  "/forgot-password",
  "/verify",
  "/auth/verify",
  "/verify-email",
  "/verified",
  "/profile/setup",
]);

export function GuestGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [loc, setLoc] = useLocation();
  const [ready, setReady] = useState(false);

  const isAllowed = useMemo(() => {
    return !GUEST_BLOCKED_ROUTES.has(loc);
  }, [loc]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!GUEST_MODE) {
        setReady(true);
        return;
      }

      if (loading) return;
      if (!user) return;

      try {
        await ensureProfile(user.uid);
      } catch {
        // Optionally log error
      }
      if (!cancelled) {
        if (!isAllowed) setLoc("/map", { replace: true });
        setReady(true);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [user, loading, isAllowed, setLoc]);

  if (!ready) return null;
  return <>{children}</>;
}
