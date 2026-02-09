import type { ComponentType } from "react";
import { Route, useLocation } from "wouter";
import { useAuth } from "../hooks/useAuth";

type Params = Record<string, string | undefined>;

function FullScreenSpinner() {
  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="text-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-orange-500 mx-auto mb-4" />
        <p className="text-neutral-400">Loading...</p>
      </div>
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
        <p className="text-neutral-400">You do not have permission to access this page.</p>
      </div>
    </div>
  );
}

interface AdminRouteProps {
  path: string;
  component: ComponentType<{ params: Params }>;
}

export default function AdminRoute({ path, component: Component }: AdminRouteProps) {
  const auth = useAuth();
  const [, setLocation] = useLocation();

  return (
    <Route path={path}>
      {(params: Params) => {
        if (auth.loading || !auth.isInitialized) {
          return <FullScreenSpinner />;
        }

        if (!auth.isAuthenticated) {
          setLocation("/signin", { replace: true });
          return null;
        }

        if (!auth.isAdmin) {
          return <AccessDenied />;
        }

        return <Component params={params} />;
      }}
    </Route>
  );
}
