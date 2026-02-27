import type { ComponentType } from "react";
import { Route, Link, useLocation } from "wouter";
import { useAuth } from "../hooks/useAuth";

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
  allowMissingProfile?: boolean;
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
 * Inline auth-required screen shown when an unauthenticated user visits a
 * protected route. Renders in-place (no redirect) so the URL stays on the
 * requested page and the user gets a clear call-to-action to sign in.
 */
function AuthRequiredScreen() {
  const nextParam = encodeURIComponent(getCurrentPath());

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="text-center max-w-md mx-auto px-4">
        <div className="h-16 w-16 rounded-full bg-neutral-800 flex items-center justify-center mx-auto mb-4">
          <svg
            className="h-8 w-8 text-neutral-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Sign in required</h1>
        <p className="text-neutral-400 mb-6">You need to sign in to access this page.</p>
        <div className="space-y-3">
          <Link
            href={`/signin?next=${nextParam}`}
            className="block w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors text-center"
          >
            Sign In
          </Link>
          <Link
            href="/auth"
            className="block text-neutral-400 hover:text-white text-sm transition-colors"
          >
            Don&apos;t have an account? Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Protected Route Guard
 *
 * Auth Resolution Logic (single source of truth):
 * 1. Not authenticated → Show inline auth-required screen (no silent redirect)
 * 2. Authenticated, profileStatus === "missing" → Redirect to /profile/setup?next={currentPath}
 * 3. Authenticated, profileStatus === "exists" → Render route
 *
 * Profile existence is determined by auth store profileStatus which checks
 * if the Firestore profile document exists for the user.
 */
export default function ProtectedRoute({
  path,
  component: Component,
  allowMissingProfile = false,
}: ProtectedRouteProps) {
  const auth = useAuth();
  const [, setLocation] = useLocation();

  return (
    <Route path={path}>
      {(params: Params) => {
        const bypass = isE2EBypass();
        if (auth.loading || !auth.isInitialized) {
          return <FullScreenSpinner />;
        }

        if (!auth.isAuthenticated && !bypass) {
          return <AuthRequiredScreen />;
        }

        if (!bypass && auth.profileStatus === "unknown") {
          return <FullScreenSpinner />;
        }

        if (!bypass && auth.profileStatus === "missing" && !allowMissingProfile) {
          const nextPath = encodeURIComponent(getCurrentPath());
          setLocation(`/profile/setup?next=${nextPath}`, { replace: true });
          return <FullScreenSpinner />;
        }

        return <Component params={params} />;
      }}
    </Route>
  );
}
