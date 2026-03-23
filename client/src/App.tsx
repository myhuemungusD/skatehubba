import { useEffect } from "react";
import { Switch, Route, Redirect, Link } from "wouter";
import { useAuth } from "./hooks/useAuth";
import { useAuthStore } from "./store/authStore";
import { AuthPage } from "./pages/AuthPage";
import { HubPage } from "./pages/HubPage";
import { PlayPage } from "./pages/PlayPage";
import { GamePage } from "./pages/GamePage";
import { MapPage } from "./pages/MapPage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { ProfileSetupPage } from "./pages/ProfileSetupPage";
import { LandingPage } from "./pages/LandingPage";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import { LoadingScreen } from "./components/ui/LoadingScreen";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, initialized } = useAuth();
  if (!initialized || loading) return <LoadingScreen />;
  if (!isAuthenticated) return <Redirect to="/auth" />;
  return <>{children}</>;
}

function RequireProfile({ children }: { children: React.ReactNode }) {
  const { hasProfile } = useAuth();
  if (!hasProfile) return <Redirect to="/profile/setup" />;
  return <>{children}</>;
}

export function App() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    const unsubscribe = initialize();
    return () => unsubscribe();
  }, [initialize]);

  const { initialized, loading, isAuthenticated, hasProfile } = useAuth();

  if (!initialized || loading) return <LoadingScreen />;

  return (
    <Switch>
      {/* Public routes */}
      <Route path="/auth" component={AuthPage} />
      <Route path="/landing" component={LandingPage} />

      {/* Root redirect */}
      <Route path="/">
        {isAuthenticated ? <Redirect to="/hub" /> : <Redirect to="/landing" />}
      </Route>

      {/* Profile setup (required before dashboard) */}
      <Route path="/profile/setup">
        <ProtectedRoute>
          <ProfileSetupPage />
        </ProtectedRoute>
      </Route>

      {/* Dashboard routes */}
      <Route path="/hub">
        <ProtectedRoute>
          <RequireProfile><DashboardLayout><HubPage /></DashboardLayout></RequireProfile>
        </ProtectedRoute>
      </Route>
      <Route path="/play">
        <ProtectedRoute>
          <RequireProfile><DashboardLayout><PlayPage /></DashboardLayout></RequireProfile>
        </ProtectedRoute>
      </Route>
      <Route path="/game/:id">
        {(params) => (
          <ProtectedRoute>
            <RequireProfile><DashboardLayout><GamePage gameId={params.id} /></DashboardLayout></RequireProfile>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/map">
        <ProtectedRoute>
          <RequireProfile><DashboardLayout><MapPage /></DashboardLayout></RequireProfile>
        </ProtectedRoute>
      </Route>
      <Route path="/leaderboard">
        <ProtectedRoute>
          <RequireProfile><DashboardLayout><LeaderboardPage /></DashboardLayout></RequireProfile>
        </ProtectedRoute>
      </Route>

      {/* Catch-all */}
      <Route>
        <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-2">404</h1>
            <p className="text-gray-400 mb-4">Page not found</p>
            <Link href="/" className="text-brand-500 hover:underline">Go home</Link>
          </div>
        </div>
      </Route>
    </Switch>
  );
}
