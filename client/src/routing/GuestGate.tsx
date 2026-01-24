import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { GUEST_MODE } from "../config/flags";
import { useAuth } from "../hooks/useAuth";
import { ensureProfile } from "../lib/profile/ensureProfile";

const ALLOWED_GUEST_ROUTES = new Set<string>(["/map", "/skate-game", "/game", "/game/active"]);

export function GuestGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [loc, setLoc] = useLocation();
  const [ready, setReady] = useState(false);

  const isAllowed = useMemo(() => {
    if (ALLOWED_GUEST_ROUTES.has(loc)) return true;
    if (loc.startsWith("/map/")) return true;
    if (loc.startsWith("/spots/")) return true;
    return false;
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
