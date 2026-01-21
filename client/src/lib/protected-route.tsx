import type { ComponentType } from "react";
import { Route, useLocation } from "wouter";
import { useAuth } from "../context/AuthProvider";

export type Params = Record<string, string | undefined>;

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

export default function ProtectedRoute({ path, component: Component }: ProtectedRouteProps) {
  const auth = useAuth();
  const [, setLocation] = useLocation();

  return (
    <Route path={path}>
      {(params: Params) => {
        if (auth.loading) {
          return <FullScreenSpinner />;
        }

        if (!auth.isAuthenticated) {
          setLocation("/login", { replace: true });
          return null;
        }

        if (auth.profileStatus === "unknown") {
          return <FullScreenSpinner />;
        }

        if (auth.profileStatus === "missing") {
          setLocation("/profile/setup", { replace: true });
          return null;
        }

        return <Component params={params} />;
      }}
    </Route>
  );
}
