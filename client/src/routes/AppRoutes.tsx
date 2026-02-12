import { useEffect, Suspense } from "react";
import { Route, Switch, useLocation } from "wouter";
import { useAuth } from "../hooks/useAuth";
import { LoadingScreen } from "../components/LoadingScreen";
import ProtectedRoute from "../lib/protected-route";
import AdminRoute from "../lib/admin-route";

// Eager load critical pages
import UnifiedLanding from "../pages/unified-landing";

import {
  AuthPage,
  LoginPage,
  SignupPage,
  SigninPage,
  ForgotPasswordPage,
  ProfileSetup,
  VerifyPage,
  AuthVerifyPage,
  VerifyEmailPage,
  VerifiedPage,
  Demo,
  PrivacyPage,
  TermsPage,
  SpecsPage,
} from "./lazyPages";

import {
  AppShellSpotDetailRoute,
  AppShellTrickmintRoute,
  AppShellTutorialRoute,
  AppShellSkaterProfileRoute,
  AppShellPublicProfileRoute,
  DashboardHubRoute,
  DashboardPlayRoute,
  DashboardProfileRoute,
  DashboardMapRoute,
  DashboardLeaderboardRoute,
  AdminDashboardRoute,
  AdminReportsRoute,
  AdminUsersRoute,
  AdminAuditLogRoute,
  AdminMetricsRoute,
} from "./routeWrappers";

/**
 * Routing Policy (Zero-Duplication Architecture)
 *
 * PUBLIC ROUTES:
 * - / (unauthenticated) -> /auth (sign-up first, industry-standard auth flow)
 * - /landing -> Public landing page (SEO/marketing, accessible but not default)
 * - /home -> Member hub (authenticated users only, action dashboard)
 *
 * AUTHENTICATED ROUTES:
 * - /home -> Main authenticated view (member hub)
 * - /feed -> Activity feed
 * - /map -> Spot map
 * - /skate-game -> S.K.A.T.E. battles
 * - /leaderboard -> Rankings
 *
 * ROUTING STRATEGY:
 * - Root (/) redirects unauthenticated users to /auth (sign-up default)
 * - Root (/) redirects authenticated users to /hub
 * - Auth page: sign-up tab is default for new users, sign-in one click away
 * - Sign in/Sign up: checks for profile, redirects to /profile/setup if missing
 * - Profile setup: redirects to /hub after completion
 * - Landing page: still accessible at /landing for marketing/SEO
 * - Legacy routes (/old, /new) removed - zero duplication architecture
 */

function RootRedirect() {
  const { user, loading, isInitialized, profileStatus } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (loading || !isInitialized) return;

    if (user) {
      // Wait for profile status to resolve before redirecting
      if (profileStatus === "unknown") return;

      if (profileStatus === "missing") {
        setLocation("/profile/setup", { replace: true });
      } else {
        setLocation("/hub", { replace: true });
      }
    } else {
      setLocation("/auth", { replace: true });
    }
  }, [user, loading, isInitialized, profileStatus, setLocation]);

  return <LoadingScreen />;
}

function isE2EBypass(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.hostname !== "localhost") return false;
  return window.sessionStorage.getItem("e2eAuthBypass") === "true";
}

function ProfileSetupRoute() {
  const auth = useAuth();
  const [, setLocation] = useLocation();
  const bypass = isE2EBypass();

  useEffect(() => {
    if (bypass) return;
    if (!auth.isAuthenticated) {
      setLocation("/signin", { replace: true });
      return;
    }

    if (auth.profileStatus === "exists") {
      setLocation("/hub", { replace: true });
    }
  }, [auth.isAuthenticated, auth.profileStatus, bypass, setLocation]);

  if (!bypass && (auth.loading || auth.profileStatus === "unknown")) {
    return <LoadingScreen />;
  }

  return <ProfileSetup />;
}

export default function AppRoutes() {
  const auth = useAuth();

  if (
    auth.loading ||
    !auth.isInitialized ||
    (auth.isAuthenticated && auth.profileStatus === "unknown")
  ) {
    return <LoadingScreen />;
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Switch>
        {/* Auth Routes */}
        <Route path="/auth" component={AuthPage} />
        <Route path="/login" component={LoginPage} />
        <Route path="/signup" component={SignupPage} />
        <Route path="/signin" component={SigninPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/verify" component={VerifyPage} />
        <Route path="/auth/verify" component={AuthVerifyPage} />
        <Route path="/verify-email" component={VerifyEmailPage} />
        <Route path="/verified" component={VerifiedPage} />
        <Route path="/profile/setup" component={ProfileSetupRoute} />

        {/* Public Routes */}
        <Route path="/landing" component={UnifiedLanding} />
        <Route path="/demo" component={Demo} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/terms" component={TermsPage} />
        <Route path="/specs" component={SpecsPage} />
        <Route path="/skater/:handle" component={AppShellSkaterProfileRoute} />
        <Route path="/p/:username" component={AppShellPublicProfileRoute} />

        {/* ============================================================== */}
        {/* ADMIN ROUTES (Role-gated: admin only)                         */}
        {/* Sub-routes MUST come before /admin — wouter Switch uses        */}
        {/* first-match and /admin would greedily match /admin/reports     */}
        {/* ============================================================== */}
        <AdminRoute path="/admin/reports" component={AdminReportsRoute} />
        <AdminRoute path="/admin/users" component={AdminUsersRoute} />
        <AdminRoute path="/admin/metrics" component={AdminMetricsRoute} />
        <AdminRoute path="/admin/audit-log" component={AdminAuditLogRoute} />
        <AdminRoute path="/admin" component={AdminDashboardRoute} />

        {/* ============================================================== */}
        {/* NEW CONSOLIDATED ROUTES (DashboardLayout) */}
        {/* ============================================================== */}
        <ProtectedRoute path="/hub" component={DashboardHubRoute} allowMissingProfile />
        <ProtectedRoute path="/play" component={DashboardPlayRoute} allowMissingProfile />
        <ProtectedRoute path="/me" component={DashboardProfileRoute} allowMissingProfile />
        <ProtectedRoute path="/map" component={DashboardMapRoute} allowMissingProfile />
        <ProtectedRoute
          path="/leaderboard"
          component={DashboardLeaderboardRoute}
          allowMissingProfile
        />

        {/* Spot Detail - still uses AppShell for full-screen modal experience */}
        <ProtectedRoute path="/spots/:id" component={AppShellSpotDetailRoute} allowMissingProfile />

        {/* ============================================================== */}
        {/* LEGACY ROUTES (Redirect to new structure for backward compat) */}
        {/* ============================================================== */}
        <ProtectedRoute path="/home" component={DashboardHubRoute} allowMissingProfile />
        <ProtectedRoute path="/feed" component={DashboardHubRoute} allowMissingProfile />
        <ProtectedRoute path="/dashboard" component={DashboardHubRoute} allowMissingProfile />
        <ProtectedRoute path="/closet" component={DashboardProfileRoute} allowMissingProfile />
        <ProtectedRoute path="/settings" component={DashboardProfileRoute} allowMissingProfile />
        <ProtectedRoute path="/checkins" component={DashboardProfileRoute} allowMissingProfile />
        <ProtectedRoute path="/game/active" component={DashboardPlayRoute} allowMissingProfile />
        <ProtectedRoute path="/game" component={DashboardPlayRoute} allowMissingProfile />
        <ProtectedRoute path="/skate-game" component={DashboardPlayRoute} allowMissingProfile />
        <ProtectedRoute path="/showcase" component={DashboardHubRoute} allowMissingProfile />

        {/* Protected legacy routes */}
        <ProtectedRoute path="/trickmint" component={AppShellTrickmintRoute} />
        <ProtectedRoute path="/tutorial" component={AppShellTutorialRoute} />

        {/* Root redirect */}
        <Route path="/" component={RootRedirect} />
      </Switch>
    </Suspense>
  );
}
