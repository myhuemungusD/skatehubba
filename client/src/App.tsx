
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
import { OrganizationStructuredData, WebAppStructuredData } from "./components/StructuredData";
import { analytics as firebaseAnalytics } from "./lib/firebase";
import { usePerformanceMonitor } from "./hooks/usePerformanceMonitor";
import { useSkipLink } from "./hooks/useSkipLink";
import { AISkateChat } from "./components/AISkateChat";
import { FeedbackButton } from "./components/FeedbackButton";
import ErrorBoundary from "./components/ErrorBoundary";
import { logger } from "./lib/logger";
import { handleGoogleRedirect, logoutUser } from "./lib/auth";

// Eager load critical pages
import UnifiedLanding from "./pages/unified-landing";
import DashboardLayout from "./components/layout/DashboardLayout";
import ProtectedRoute, { type Params } from "./lib/protected-route";

// Lazy load non-critical pages for better performance
const Landing = lazy(() => import("./pages/landing"));
const NewLanding = lazy(() => import("./pages/new-landing"));
const Home = lazy(() => import("./pages/home"));
const Tutorial = lazy(() => import("./pages/tutorial"));
const Demo = lazy(() => import("./pages/demo"));
const DonationPage = lazy(() => import("./pages/donate"));
const LoginPage = lazy(() => import("./pages/login"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const SignupPage = lazy(() => import("./pages/signup"));
const SigninPage = lazy(() => import("./pages/signin"));
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

function RootRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/feed", { replace: true });
  }, [setLocation]);

  return null;
}

function DashboardFeedRoute(_props: { params: Params }) {
  return (
    <DashboardLayout>
      <Home />
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
  const auth = useAuth();
  const userId = auth.user!.uid;
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

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Switch>
        <Route path="/auth" component={AuthPage} />
        <Route path="/login" component={LoginPage} />
        <Route path="/old" component={Landing} />
        <Route path="/new" component={NewLanding} />
        <Route path="/home" component={Home} />
        <Route path="/landing" component={UnifiedLanding} />
        <Route path="/demo" component={Demo} />
        <Route path="/donate" component={DonationPage} />
        <Route path="/shop" component={ShopPage} />
        <Route path="/cart" component={CartPage} />
        <Route path="/checkout" component={CheckoutPage} />
        <Route path="/order-confirmation" component={OrderConfirmationPage} />
        <Route path="/closet" component={ClosetPage} />
        <Route path="/game/active" component={SkateGamePage} />
        <Route path="/game" component={ChallengeLobbyPage} />
        <Route path="/signup" component={SignupPage} />
        <Route path="/signin" component={SigninPage} />
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

        <ProtectedRoute path="/feed" component={DashboardFeedRoute} />
        <ProtectedRoute path="/map" component={DashboardMapRoute} />
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

function GoogleRedirectHandler() {
  const { toast } = useToast();

  useEffect(() => {
    // Run in background - don't block app initialization
    const checkGoogleRedirect = async () => {
      try {
        const result = await handleGoogleRedirect();
        if (result) {
          // User just returned from Google redirect
          logger.info('[Google Auth] Successfully authenticated via redirect');
          toast({
            title: "Welcome! 🛹",
            description: "You've successfully signed in with Google."
          });
        }
        // No result = normal page load (not a redirect), do nothing
      } catch (error: any) {
        logger.error('[Google Auth] Redirect authentication failed:', error.message);
        
        // Clean up: sign out from Firebase to avoid broken state
        try {
          await logoutUser();
        } catch (logoutError) {
          logger.warn('[Google Auth] Cleanup logout failed:', logoutError);
        }
        
        // Show user-friendly error
        toast({
          title: "Sign-in failed",
          description: error?.message || "Unable to complete Google Sign-In. Please try again.",
          variant: "destructive"
        });
      }
    };

    checkGoogleRedirect();
  }, [toast]);

  return null; // Non-blocking - runs in background
}

export default function App() {
  // Monitor performance in development
  usePerformanceMonitor();
  
  // Enable skip link for accessibility
  useSkipLink();

  useEffect(() => {
    if (firebaseAnalytics) {
      logger.info('Firebase Analytics initialized successfully');
    }
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <GoogleRedirectHandler />
            <OrganizationStructuredData
              data={{
                name: "SkateHubba",
                url: "https://skatehubba.com",
                logo: "https://skatehubba.com/icon-512.png",
                description: "Remote SKATE battles, legendary spot check-ins, and live lobbies. Join the ultimate skateboarding social platform.",
                sameAs: [
                  "https://twitter.com/skatehubba_app",
                  "https://instagram.com/skatehubba",
                ],
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
