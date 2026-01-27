function BuildStamp() {
  // These can be replaced at build time by your CI/CD (e.g. Vercel, Turbo, etc.)
  const commit = import.meta.env.VITE_COMMIT_SHA || "dev";
  const buildTime = import.meta.env.VITE_BUILD_TIME || new Date().toISOString();
  const guestMode = GUEST_MODE ? "true" : "false";
  return (
    <footer
      style={{
        position: "fixed",
        bottom: 0,
        right: 0,
        fontSize: 10,
        opacity: 0.6,
        zIndex: 9999,
        background: "#222",
        color: "#fff",
        padding: "2px 8px",
        borderRadius: "6px 0 0 0",
      }}
    >
      build: {commit} | {buildTime} | guest_mode={guestMode}
    </footer>
  );
}
import { useEffect, lazy, Suspense } from "react";
import { Router, Route, Switch, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "./components/ui/toaster";
import { TooltipProvider } from "./components/ui/tooltip";
import { useToast } from "./hooks/use-toast";
import { useAuth } from "./hooks/useAuth";
import { GUEST_MODE } from "./config/flags";
import { useAuthListener } from "./hooks/useAuthListener";
import { LoadingScreen } from "./components/LoadingScreen";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";
import { StagingBanner } from "./components/StagingBanner";
import { OrganizationStructuredData, WebAppStructuredData } from "./components/StructuredData";
import { analytics as firebaseAnalytics } from "./lib/firebase";
import { GuestGate } from "./routing/GuestGate";
import { usePerformanceMonitor } from "./hooks/usePerformanceMonitor";
import { useSkipLink } from "./hooks/useSkipLink";
import { AISkateChat } from "./components/AISkateChat";
import { FeedbackButton } from "./components/FeedbackButton";
import ErrorBoundary from "./components/ErrorBoundary";
import { logger } from "./lib/logger";

// Eager load critical pages
import UnifiedLanding from "./pages/unified-landing";
import AppShell from "./components/layout/AppShell";
import DashboardLayout from "./components/layout/DashboardLayout";
import ProtectedRoute, { type Params } from "./lib/protected-route";

// Lazy load non-critical pages for better performance
// Consolidated pages (new architecture)
const HubPage = lazy(() => import("./pages/hub"));
const PlayPage = lazy(() => import("./pages/play"));
const ProfilePage = lazy(() => import("./pages/me"));

// Standalone pages
const Tutorial = lazy(() => import("./pages/tutorial"));
const Demo = lazy(() => import("./pages/demo"));
const MapPage = lazy(() => import("./pages/map"));
const ShopPage = lazy(() => import("./pages/shop"));
const CartPage = lazy(() => import("./pages/cart"));
const CheckoutPage = lazy(() => import("./pages/checkout"));
const OrderConfirmationPage = lazy(() => import("./pages/order-confirmation"));
const SpotDetailPage = lazy(() => import("./pages/spots/SpotDetailPage"));
const TrickMintPage = lazy(() => import("./pages/trickmint"));

// Auth pages
const LoginPage = lazy(() => import("./pages/login"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const SignupPage = lazy(() => import("./pages/signup"));
const SigninPage = lazy(() => import("./pages/signin"));
const ForgotPasswordPage = lazy(() => import("./pages/forgot-password"));
const ProfileSetup = lazy(() => import("./pages/profile/ProfileSetup"));
const VerifyPage = lazy(() => import("./pages/verify"));
const AuthVerifyPage = lazy(() => import("./pages/auth-verify"));
const VerifyEmailPage = lazy(() => import("./pages/verify-email"));
const VerifiedPage = lazy(() => import("./pages/verified"));

// Public pages
const SkaterProfilePage = lazy(() => import("./pages/skater/profile"));
const PrivacyPage = lazy(() => import("./pages/privacy"));
const TermsPage = lazy(() => import("./pages/terms"));
const SpecsPage = lazy(() => import("./pages/specs"));
const PublicProfileView = lazy(() => import("./features/social/public-profile/PublicProfileView"));

/**
 * Routing Policy (Zero-Duplication Architecture)
 *
 * PUBLIC ROUTES:
 * - / (unauthenticated) -> /landing (conversion-focused landing page)
 * - /landing -> Public landing page with CTA to enter platform
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
 * - Root (/) redirects unauthenticated users to /landing
 * - Root (/) redirects authenticated users to /home
 * - Landing page: minimal, conversion-focused ("Get Started" CTA -> /signin)
 * - Sign in/Sign up: checks for profile, redirects to /profile/setup if missing
 * - Profile setup: redirects to /home after completion
 * - Home page: member hub with quick actions (Feed/Map/Battle/Profile)
 * - Legacy routes (/old, /new) removed - zero duplication architecture
 */
function RootRedirect() {
  const { user, loading, isInitialized } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (loading || !isInitialized) return;

    if (GUEST_MODE) {
      setLocation("/map", { replace: true });
      return;
    }

    if (user) {
      setLocation("/hub", { replace: true });
    } else {
      setLocation("/landing", { replace: true });
    }
  }, [user, loading, isInitialized, setLocation]);

  return <LoadingScreen />;
}

function AppShellOrderConfirmationRoute() {
  return (
    <AppShell>
      <OrderConfirmationPage />
    </AppShell>
  );
}

function AppShellSpotDetailRoute(props: { params: Params }) {
  return (
    <AppShell>
      <SpotDetailPage params={props.params} />
    </AppShell>
  );
}

function AppShellTrickmintRoute(_props: { params: Params }) {
  return (
    <AppShell>
      <TrickMintPage />
    </AppShell>
  );
}

function AppShellTutorialRoute(_props: { params: Params }) {
  const { user, loading, isInitialized } = useAuth();
  if (loading || !isInitialized || !user) {
    return <LoadingScreen />;
  }
  const userId = user.uid;
  return (
    <AppShell>
      <Tutorial userId={userId} />
    </AppShell>
  );
}

function AppShellSkaterProfileRoute(_props: { params: Params }) {
  return (
    <AppShell>
      <SkaterProfilePage />
    </AppShell>
  );
}

function AppShellPublicProfileRoute(_props: { params: Params }) {
  return (
    <AppShell>
      <PublicProfileView />
    </AppShell>
  );
}

// ============================================================================
// DASHBOARD LAYOUT ROUTES (New Consolidated Pages)
// ============================================================================

function DashboardHubRoute() {
  return (
    <DashboardLayout>
      <HubPage />
    </DashboardLayout>
  );
}

function DashboardPlayRoute() {
  return (
    <DashboardLayout>
      <PlayPage />
    </DashboardLayout>
  );
}

function DashboardProfileRoute() {
  return (
    <DashboardLayout>
      <ProfilePage />
    </DashboardLayout>
  );
}

function DashboardMapRoute() {
  return (
    <DashboardLayout>
      <MapPage />
    </DashboardLayout>
  );
}

function DashboardShopRoute() {
  return (
    <DashboardLayout>
      <ShopPage />
    </DashboardLayout>
  );
}

function DashboardCartRoute() {
  return (
    <DashboardLayout>
      <CartPage />
    </DashboardLayout>
  );
}

function DashboardCheckoutRoute() {
  return (
    <DashboardLayout>
      <CheckoutPage />
    </DashboardLayout>
  );
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
      setLocation("/login", { replace: true });
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

function AppRoutes() {
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
        {/* NEW CONSOLIDATED ROUTES (DashboardLayout) */}
        {/* ============================================================== */}
        <ProtectedRoute path="/hub" component={DashboardHubRoute} allowMissingProfile />
        <ProtectedRoute path="/play" component={DashboardPlayRoute} allowMissingProfile />
        <ProtectedRoute path="/me" component={DashboardProfileRoute} allowMissingProfile />
        <ProtectedRoute path="/map" component={DashboardMapRoute} allowMissingProfile />
        <ProtectedRoute path="/shop" component={DashboardShopRoute} allowMissingProfile />
        <ProtectedRoute path="/cart" component={DashboardCartRoute} allowMissingProfile />
        <ProtectedRoute path="/checkout" component={DashboardCheckoutRoute} allowMissingProfile />
        <ProtectedRoute path="/order-confirmation" component={AppShellOrderConfirmationRoute} allowMissingProfile />

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
        <ProtectedRoute path="/leaderboard" component={DashboardPlayRoute} allowMissingProfile />
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

// Note: Google redirect result is handled by the auth store listener
// This component just shows a welcome toast after successful redirect login
// We detect this by checking sessionStorage for a flag set before redirect
function GoogleRedirectWelcome() {
  const { toast } = useToast();
  const { user, loading } = useAuth();

  useEffect(() => {
    // Check if we just completed a Google redirect login
    const wasGoogleRedirect = sessionStorage.getItem("googleRedirectPending");

    if (wasGoogleRedirect && !loading && user) {
      // Clear the flag
      sessionStorage.removeItem("googleRedirectPending");

      logger.info("[Google Auth] Successfully authenticated via redirect");
      toast({
        title: "Welcome!",
        description: "You've successfully signed in with Google.",
      });
    } else if (wasGoogleRedirect && !loading && !user) {
      // Redirect failed - clear the flag and show error
      sessionStorage.removeItem("googleRedirectPending");
      logger.error("[Google Auth] Redirect authentication failed - no user after redirect");
      toast({
        title: "Sign-in failed",
        description: "Unable to complete Google Sign-In. Please try again.",
        variant: "destructive",
      });
    }
  }, [user, loading, toast]);

  return null;
}

export default function App() {
  // Monitor performance in development
  usePerformanceMonitor();

  // Enable skip link for accessibility
  useSkipLink();

  // Initialize auth listener (Zustand)
  useAuthListener();

  useEffect(() => {
    if (firebaseAnalytics) {
      logger.info("Firebase Analytics initialized successfully");
    }
  }, []);

  // Guest Mode contract log (safety rail)
  const { user, profile, isInitialized } = useAuth();
  useEffect(() => {
    if (!isInitialized) return;
    logger.info(
      `[GUEST_MODE] guest_mode=${GUEST_MODE} uid=${user?.uid ?? "none"} profile_exists=${!!profile}`
    );
    // Expose UID only in dev, Cypress, or explicit E2E mode
    const exposeUid =
      import.meta.env.DEV ||
      (typeof window !== "undefined" && (window as any).Cypress) ||
      import.meta.env.VITE_E2E === "true";
    if (exposeUid && typeof window !== "undefined") {
      (window as any).__SKATEHUBBA_UID__ = user?.uid ?? null;
    }
  }, [isInitialized, user, profile]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          {/* Environment indicator - shows in staging/local only */}
          <StagingBanner />
          <GoogleRedirectWelcome />
          <OrganizationStructuredData
            data={{
              name: "SkateHubba",
              url: "https://skatehubba.com",
              logo: "https://skatehubba.com/icon-512.png",
              description:
                "Remote SKATE battles, legendary spot check-ins, and live lobbies. Join the ultimate skateboarding social platform.",
              sameAs: ["https://twitter.com/skatehubba_app", "https://instagram.com/skatehubba"],
            }}
          />
          <WebAppStructuredData
            data={{
              name: "SkateHubba",
              url: "https://skatehubba.com",
              description: "Stream. Connect. Skate. Your skateboarding social universe.",
              applicationCategory: "SportsApplication",
              operatingSystem: "Any",
              offers: {
                price: "0",
                priceCurrency: "USD",
              },
            }}
          />
          <Router>
            <GuestGate>
              <AppRoutes />
            </GuestGate>
          </Router>
          <BuildStamp />
          <Toaster />
          <PWAInstallPrompt />
          <AISkateChat />
          <FeedbackButton />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
