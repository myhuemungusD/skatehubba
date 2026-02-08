import { type ReactNode } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../hooks/useAuth";

interface AuthGuardProps {
  children: ReactNode;
  /** If true, allow users who haven't set up a profile yet */
  allowMissingProfile?: boolean;
  /** If true, require email verification (redirects unverified users to /verify) */
  requireVerified?: boolean;
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
 * Auth Guard Component
 *
 * Wraps children with authentication and verification checks:
 * 1. Not authenticated -> redirects to /signin?next={currentPath}
 * 2. Authenticated, profileStatus === "missing" -> redirects to /profile/setup?next={currentPath}
 * 3. Authenticated, email not verified + requireVerified -> redirects to /verify
 * 4. All checks pass -> renders children
 *
 * Use this as a wrapper component (not a route-level HOC) when you need
 * fine-grained control over auth gating within a page or layout.
 */
export function AuthGuard({
  children,
  allowMissingProfile = false,
  requireVerified = false,
}: AuthGuardProps) {
  const auth = useAuth();
  const [, setLocation] = useLocation();

  // Still loading auth state
  if (auth.loading || !auth.isInitialized) {
    return <FullScreenSpinner />;
  }

  const currentPath =
    typeof window !== "undefined" ? window.location.pathname + window.location.search : "/hub";
  const nextParam = encodeURIComponent(currentPath);

  // 1. Not authenticated -> redirect to signin
  if (!auth.isAuthenticated) {
    setLocation(`/signin?next=${nextParam}`, { replace: true });
    return null;
  }

  // Still resolving profile status
  if (auth.profileStatus === "unknown") {
    return <FullScreenSpinner />;
  }

  // 2. Profile missing -> redirect to profile setup
  if (auth.profileStatus === "missing" && !allowMissingProfile) {
    setLocation(`/profile/setup?next=${nextParam}`, { replace: true });
    return null;
  }

  // 3. Email not verified -> redirect to verify page
  if (requireVerified && !auth.isEmailVerified) {
    setLocation("/verify", { replace: true });
    return null;
  }

  return <>{children}</>;
}
