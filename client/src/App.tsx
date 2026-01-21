import { useEffect, lazy, Suspense } from "react";
import { Router, Route, Switch, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "./components/ui/toaster";
import { TooltipProvider } from "./components/ui/tooltip";
import { useToast } from "./hooks/use-toast";
import { useAuth, AuthProvider } from "./context/AuthProvider";
import { LoadingScreen } from "./components/LoadingScreen";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";
import { StagingBanner } from "./components/StagingBanner";
import { OrganizationStructuredData, WebAppStructuredData } from "./components/StructuredData";
import { analytics as firebaseAnalytics } from "./lib/firebase";
import { usePerformanceMonitor } from "./hooks/usePerformanceMonitor";
import { useSkipLink } from "./hooks/useSkipLink";
import { AISkateChat } from "./components/AISkateChat";
import { FeedbackButton } from "./components/FeedbackButton";
import ErrorBoundary from "./components/ErrorBoundary";
import { logger } from "./lib/logger";

// Eager load critical pages
import UnifiedLanding from "./pages/unified-landing";
import DashboardLayout from "./components/layout/DashboardLayout";
import ProtectedRoute, { type Params } from "./lib/protected-route";

// Lazy load non-critical pages for better performance
const Home = lazy(() => import("./pages/home"));
const FeedPage = lazy(() => import("./pages/feed"));
const Tutorial = lazy(() => import("./pages/tutorial"));
const Demo = lazy(() => import("./pages/demo"));

const LoginPage = lazy(() => import("./pages/login"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const SignupPage = lazy(() => import("./pages/signup"));
const SigninPage = lazy(() => import("./pages/signin"));
const ProfileSetup = lazy(() => import("./pages/profile/ProfileSetup"));
const VerifyPage = lazy(() => import("./pages/verify"));
const AuthVerifyPage = lazy(() => import("./pages/auth-verify"));
const VerifyEmailPage = lazy(() => import("./pages/verify-email"));
const VerifiedPage = lazy(() => import("./pages/verified"));
const ShopPage = lazy(() => import("./pages/shop"));
const CartPage = lazy(() => import("./pages/cart"));
const CheckoutPage = lazy(() => import("./pages/checkout"));
const OrderConfirmationPage = lazy(() => import("./pages/order-confirmation"));
const ClosetPage = lazy(() => import("./pages/closet"));
const MapPage = lazy(() => import("./pages/map"));
const SpotDetailPage = lazy(() => import("./pages/spots/SpotDetailPage"));
const SkateGamePage = lazy(() => import("./pages/skate-game"));
const ChallengeLobbyPage = lazy(() => import("./pages/ChallengeLobby"));
const LeaderboardPage = lazy(() => import("./pages/leaderboard"));
const TrickMintPage = lazy(() => import("./pages/trickmint"));
const SkaterProfilePage = lazy(() => import("./pages/skater/profile"));
const PrivacyPage = lazy(() => import("./pages/privacy"));
const TermsPage = lazy(() => import("./pages/terms"));
const SpecsPage = lazy(() => import("./pages/specs"));
const CheckinsPage = lazy(() => import("./pages/checkins"));

const PublicProfileView = lazy(() => import("./features/social/public-profile/PublicProfileView"));
const BoltsShowcase = lazy(() => import("./features/social/bolts-showcase/BoltsShowcase"));

/**
 * Routing Policy (Zero-Duplication Architecture)
 *
 * PUBLIC ROUTES:
 * - / (unauthenticated) → /landing (conversion-focused landing page)
 * - /landing → Public landing page with CTA to enter platform
 * - /home → Member hub (authenticated users only, action dashboard)
 *
 * AUTHENTICATED ROUTES:
 * - /home → Main authenticated view (member hub)
 * - /feed → Activity feed
 * - /map → Spot map
 * - /skate-game → S.K.A.T.E. battles
 * - /leaderboard → Rankings
 *
 * ROUTING STRATEGY:
 * - Root (/) redirects unauthenticated users to /landing
 * - Root (/) redirects authenticated users to /home
 * - Landing page: minimal, conversion-focused ("Get Started" CTA → /signin)
 * - Sign in/Sign up: checks for profile, redirects to /profile-setup if missing
 * - Profile setup: redirects to /home after completion
 * - Home page: member hub with quick actions (Feed/Map/Battle/Profile)
 * - Legacy routes (/old, /new) removed - zero duplication architecture
 */
function RootRedirect() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (loading) return;

    if (user) {
      // Authenticated: Go to home
      setLocation("/home", { replace: true });
    } else {
      // Unauthenticated: Go to landing
      setLocation("/landing", { replace: true });
    }
  }, [user, loading, setLocation]);

  return <LoadingScreen />;
}

function DashboardFeedRoute(_props: { params: Params }) {
  return (
    <DashboardLayout>
      <FeedPage />
    </DashboardLayout>
  );
}

function DashboardMapRoute(_props: { params: Params }) {
  return (
    <DashboardLayout>
      <MapPage />
    </DashboardLayout>
  );
}

function DashboardSpotDetailRoute(props: { params: Params }) {
  return (
    <DashboardLayout>
      <SpotDetailPage params={props.params} />
    </DashboardLayout>
  );
}

function DashboardSkateGameRoute(_props: { params: Params }) {
  return (
    <DashboardLayout>
      <SkateGamePage />
    </DashboardLayout>
  );
}

function DashboardLeaderboardRoute(_props: { params: Params }) {
  return (
    <DashboardLayout>
      <LeaderboardPage />
    </DashboardLayout>
  );
}

function DashboardTrickmintRoute(_props: { params: Params }) {
  return (
    <DashboardLayout>
      <TrickMintPage />
    </DashboardLayout>
  );
}

function DashboardTutorialRoute(_props: { params: Params }) {
  const { user } = useAuth();
  const userId = user!.uid;
  return (
    <DashboardLayout>
      <Tutorial userId={userId} />
    </DashboardLayout>
  );
}

function DashboardCheckinsRoute(_props: { params: Params }) {
  return (
    <DashboardLayout>
      <CheckinsPage />
    </DashboardLayout>
  );
}

function ProfileSetupRoute() {
  const auth = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!auth.isAuthenticated) {
      setLocation("/auth", { replace: true });
      return;
    }

    if (auth.profileStatus === "exists") {
      setLocation("/dashboard", { replace: true });
    }
  }, [auth.isAuthenticated, auth.profileStatus, setLocation]);

  if (auth.loading || auth.profileStatus === "unknown") {
    return <LoadingScreen />;
  }

  return <ProfileSetup />;
}

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Switch>
        <Route path="/auth" component={AuthPage} />
        <Route path="/login" component={LoginPage} />
        <Route path="/home" component={Home} />
        <Route path="/landing" component={UnifiedLanding} />
        <Route path="/new-landing" component={UnifiedLanding} />
        <Route path="/demo" component={Demo} />
        <Route path="/shop" component={ShopPage} />
        <Route path="/cart" component={CartPage} />
        <Route path="/checkout" component={CheckoutPage} />
        <Route path="/order-confirmation" component={OrderConfirmationPage} />
        <Route path="/closet" component={ClosetPage} />
        <Route path="/game/active" component={SkateGamePage} />
        <Route path="/game" component={ChallengeLobbyPage} />
        <Route path="/signup" component={SignupPage} />
        <Route path="/signin" component={SigninPage} />
        <Route path="/profile-setup" component={ProfileSetup} />
        <Route path="/verify" component={VerifyPage} />
        <Route path="/auth/verify" component={AuthVerifyPage} />
        <Route path="/verify-email" component={VerifyEmailPage} />
        <Route path="/verified" component={VerifiedPage} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/terms" component={TermsPage} />
        <Route path="/specs" component={SpecsPage} />
        <Route path="/skater/:handle" component={SkaterProfilePage} />
        <Route path="/p/:username" component={PublicProfileView} />
        <Route path="/showcase" component={BoltsShowcase} />
        <Route path="/profile/setup" component={ProfileSetupRoute} />

        <ProtectedRoute path="/dashboard" component={DashboardFeedRoute} />
        <ProtectedRoute path="/feed" component={DashboardFeedRoute} />
        <ProtectedRoute path="/map" component={DashboardMapRoute} />
        <ProtectedRoute path="/spots/:id" component={DashboardSpotDetailRoute} />
        <ProtectedRoute path="/skate-game" component={DashboardSkateGameRoute} />
        <ProtectedRoute path="/leaderboard" component={DashboardLeaderboardRoute} />
        <ProtectedRoute path="/trickmint" component={DashboardTrickmintRoute} />
        <ProtectedRoute path="/tutorial" component={DashboardTutorialRoute} />
        <ProtectedRoute path="/checkins" component={DashboardCheckinsRoute} />

        <Route path="/" component={RootRedirect} />
      </Switch>
    </Suspense>
  );
}

// Note: Google redirect result is handled by AuthProvider in AuthContext.tsx
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
        title: "Welcome! 🛹",
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

  useEffect(() => {
    if (firebaseAnalytics) {
      logger.info("Firebase Analytics initialized successfully");
    }
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
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
              <AppRoutes />
            </Router>
            <Toaster />
            <PWAInstallPrompt />
            <AISkateChat />
            <FeedbackButton />
          </TooltipProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
