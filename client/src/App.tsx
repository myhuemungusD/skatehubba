import { useEffect } from "react";
import { Router } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "./components/ui/toaster";
import { TooltipProvider } from "./components/ui/tooltip";
import { useToast } from "./hooks/use-toast";
import { useAuth } from "./hooks/useAuth";
import { useAuthListener } from "./hooks/useAuthListener";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";
import { StagingBanner } from "./components/StagingBanner";
import { OrganizationStructuredData, WebAppStructuredData } from "./components/StructuredData";
import { analytics as firebaseAnalytics } from "./lib/firebase";
import { usePerformanceMonitor } from "./hooks/usePerformanceMonitor";
import { useSkipLink } from "./hooks/useSkipLink";
import { FeedbackButton } from "./components/FeedbackButton";
import ErrorBoundary from "./components/ErrorBoundary";
import { logger } from "./lib/logger";
import AppRoutes from "./routes/AppRoutes";

function BuildStamp() {
  const commit = import.meta.env.EXPO_PUBLIC_COMMIT_SHA || "dev";
  const buildTime = import.meta.env.EXPO_PUBLIC_BUILD_TIME || new Date().toISOString();
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
      build: {commit} | {buildTime}
    </footer>
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

  // Expose UID only in dev, Cypress, or explicit E2E mode
  const { user, isInitialized } = useAuth();
  useEffect(() => {
    if (!isInitialized) return;
    const exposeUid =
      import.meta.env.DEV ||
      (typeof window !== "undefined" && window.Cypress) ||
      import.meta.env.EXPO_PUBLIC_E2E === "true";
    if (exposeUid && typeof window !== "undefined") {
      window.__SKATEHUBBA_UID__ = user?.uid ?? null;
    }
  }, [isInitialized, user]);

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
            <AppRoutes />
          </Router>
          <BuildStamp />
          <Toaster />
          <PWAInstallPrompt />
          <FeedbackButton />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
