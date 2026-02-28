import { type ReactNode, useEffect } from "react";
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

  const isLoading = auth.loading || !auth.isInitialized;
  const isResolvingProfile = auth.profileStatus === "unknown";

  // Determine redirect target (null means no redirect needed)
  let redirectTo: string | null = null;

  if (!isLoading) {
    const currentPath =
      typeof window !== "undefined" ? window.location.pathname + window.location.search : "/hub";
    const nextParam = encodeURIComponent(currentPath);

    if (!auth.isAuthenticated) {
      redirectTo = `/signin?next=${nextParam}`;
    } else if (!isResolvingProfile) {
      if (auth.profileStatus === "missing" && !allowMissingProfile) {
        redirectTo = `/profile/setup?next=${nextParam}`;
      } else if (requireVerified && !auth.isEmailVerified) {
        redirectTo = "/verify";
      }
    }
  }

  // Perform navigation in an effect to avoid side effects during render
  useEffect(() => {
    if (redirectTo) {
      setLocation(redirectTo, { replace: true });
    }
  }, [redirectTo, setLocation]);

  if (isLoading || isResolvingProfile) {
    return <FullScreenSpinner />;
  }

  if (redirectTo) {
    return null;
  }

  return <>{children}</>;
}
