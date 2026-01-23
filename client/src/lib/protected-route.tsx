import type { ComponentType } from "react";
import { Route, useLocation } from "wouter";
import { useAuth } from "../context/AuthProvider";

export type Params = Record<string, string | undefined>;

function isE2EBypass(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.hostname !== "localhost") return false;
  return window.sessionStorage.getItem("e2eAuthBypass") === "true";
}

/**
 * Get the current path for "next" redirect preservation
 */
function getCurrentPath(): string {
  if (typeof window === "undefined") return "/home";
  return window.location.pathname + window.location.search;
}

interface ProtectedRouteProps {
  path: string;
  component: ComponentType<{ params: Params }>;
}

function FullScreenSpinner() {
  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="text-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-yellow-500 mx-auto mb-4" />
        <p className="text-neutral-400">Loading...</p>
      </div>
    </div>
  );
}

/**
 * Protected Route Guard
 *
 * Auth Resolution Logic (single source of truth):
 * 1. Not authenticated → /login?next={currentPath}
 * 2. Authenticated, profileStatus === "missing" → /profile/setup?next={currentPath}
 * 3. Authenticated, profileStatus === "exists" → render route
 *
 * Profile existence is determined by AuthProvider.profileStatus which checks
 * if the Firestore profile document exists for the user.
 */
export default function ProtectedRoute({ path, component: Component }: ProtectedRouteProps) {
  const auth = useAuth();
  const [, setLocation] = useLocation();

  return (
    <Route path={path}>
      {(params: Params) => {
        const bypass = isE2EBypass();
        if (auth.loading) {
          return <FullScreenSpinner />;
        }

        const nextPath = encodeURIComponent(getCurrentPath());

        if (!auth.isAuthenticated && !bypass) {
          setLocation(`/login?next=${nextPath}`, { replace: true });
          return null;
        }

        if (!bypass && auth.profileStatus === "unknown") {
          return <FullScreenSpinner />;
        }

        if (!bypass && auth.profileStatus === "missing") {
          setLocation(`/profile/setup?next=${nextPath}`, { replace: true });
          return null;
        }

        return <Component params={params} />;
      }}
    </Route>
  );
}
