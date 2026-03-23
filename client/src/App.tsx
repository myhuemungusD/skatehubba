import { useEffect } from "react";
import { Switch, Route, Redirect } from "wouter";
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

export function App() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
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
          {!hasProfile ? <Redirect to="/profile/setup" /> : <DashboardLayout><HubPage /></DashboardLayout>}
        </ProtectedRoute>
      </Route>
      <Route path="/play">
        <ProtectedRoute>
          {!hasProfile ? <Redirect to="/profile/setup" /> : <DashboardLayout><PlayPage /></DashboardLayout>}
        </ProtectedRoute>
      </Route>
      <Route path="/game/:id">
        {(params) => (
          <ProtectedRoute>
            <DashboardLayout><GamePage gameId={params.id} /></DashboardLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/map">
        <ProtectedRoute>
          <DashboardLayout><MapPage /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/leaderboard">
        <ProtectedRoute>
          <DashboardLayout><LeaderboardPage /></DashboardLayout>
        </ProtectedRoute>
      </Route>

      {/* Catch-all */}
      <Route>
        <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-2">404</h1>
            <p className="text-gray-400">Page not found</p>
          </div>
        </div>
      </Route>
    </Switch>
  );
}
