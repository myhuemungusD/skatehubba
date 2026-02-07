import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { GUEST_MODE } from "../config/flags";
import { useAuth } from "../hooks/useAuth";
import { ensureProfile } from "../lib/profile/ensureProfile";

const ALLOWED_GUEST_ROUTES = new Set<string>([
  "/hub",
  "/map",
  "/play",
  "/me",
  "/leaderboard",
  // Legacy routes that redirect to new paths
  "/home",
  "/skate-game",
  "/game",
  "/game/active",
]);

/** Routes that must always render, even without a user in GUEST_MODE */
const AUTH_ROUTES = new Set<string>([
  "/auth",
  "/login",
  "/signin",
  "/signup",
  "/forgot-password",
  "/verify",
  "/verify-email",
  "/verified",
  "/landing",
  "/privacy",
  "/terms",
  "/specs",
  "/demo",
]);

function isAuthRoute(pathname: string): boolean {
  if (AUTH_ROUTES.has(pathname)) return true;
  if (pathname.startsWith("/auth/")) return true;
  if (pathname.startsWith("/profile/")) return true;
  if (pathname.startsWith("/p/")) return true;
  if (pathname.startsWith("/skater/")) return true;
  return false;
}

export function GuestGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [loc, setLoc] = useLocation();
  const [ready, setReady] = useState(false);

  const isAllowed = useMemo(() => {
    const pathname = loc.split("?")[0];
    if (ALLOWED_GUEST_ROUTES.has(pathname)) return true;
    if (pathname.startsWith("/map/")) return true;
    if (pathname.startsWith("/spots/")) return true;
    return false;
  }, [loc]);

  const pathname = loc.split("?")[0];
  const onAuthRoute = isAuthRoute(pathname);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!GUEST_MODE) {
        setReady(true);
        return;
      }

      // Always allow auth/public routes to render, even without a user
      if (onAuthRoute) {
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
  }, [user, loading, isAllowed, onAuthRoute, setLoc]);

  if (!ready) return null;
  return <>{children}</>;
}
