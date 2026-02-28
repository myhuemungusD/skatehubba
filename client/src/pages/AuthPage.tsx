/**
 * Authentication Page
 *
 * Production-grade authentication UI with sign-in and sign-up tabs.
 * Supports email/password and Google OAuth authentication.
 *
 * @module pages/auth
 */

import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";

import { Card } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useToast } from "../hooks/use-toast";
import { useAuth } from "../hooks/useAuth";
import { useAuthStore } from "../store/authStore";
import { logger } from "../lib/logger";
import { setAuthPersistence } from "../lib/firebase";
import { getAuthErrorMessage, isAuthConfigError } from "../lib/firebase/auth-errors";
import { isEmbeddedBrowser } from "./auth/authSchemas";
import { SignInTab } from "./auth/SignInTab";
import { SignUpTab } from "./auth/SignUpTab";
import { ForgotPasswordModal } from "./auth/ForgotPasswordModal";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const auth = useAuth();

  const [activeTab, setActiveTab] = useState<"signin" | "signup">(() => {
    if (typeof window === "undefined") return "signup";
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    return tab === "signin" ? "signin" : "signup";
  });
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [inEmbeddedBrowser, setInEmbeddedBrowser] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  // H8: Parse ?next= param with hardened open-redirect protection
  const getNextUrl = (): string => {
    if (typeof window === "undefined") return "/hub";
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    if (next) {
      try {
        const decoded = decodeURIComponent(next);
        // Reject absolute URLs and protocol-relative URLs
        if (/^[a-z][a-z0-9+.-]*:/i.test(decoded)) return "/hub";
        if (decoded.startsWith("//")) return "/hub";
        if (!decoded.startsWith("/")) return "/hub";
        // Reject double-encoded payloads
        if (/%[0-9a-f]{2}/i.test(decoded)) return "/hub";
        // Reject auth-loop paths
        if (/^\/(signin|login|logout)(\/|$|\?)/i.test(decoded)) return "/hub";
        return decoded;
      } catch {
        // Invalid encoding
      }
    }
    return "/hub";
  };

  // Redirect when authenticated and profile status is known.
  // Sign-up tab handles its own navigation (creates profile inline then
  // redirects to /hub), so we only redirect to /profile/setup from sign-in.
  useEffect(() => {
    if (!auth?.isAuthenticated || auth?.profileStatus === "unknown") return;

    if (auth.profileStatus === "exists" || auth.profileStatus === "missing") {
      setLocation(getNextUrl());
    }
  }, [auth?.isAuthenticated, auth?.profileStatus, activeTab, setLocation]);

  // Check for embedded browser on mount
  useEffect(() => {
    const isEmbedded = isEmbeddedBrowser();
    setInEmbeddedBrowser(isEmbedded);
    logger.log("[AuthPage] User agent:", navigator.userAgent);
    logger.log("[AuthPage] Is embedded browser:", isEmbedded);
  }, []);

  // Redirect based on current profile status after sign-in.
  // Reads directly from the Zustand store to get the latest state
  // (the hook value may be stale since we're inside an async handler).
  const redirectAfterSignIn = useCallback(() => {
    const { profileStatus } = useAuthStore.getState();
    if (profileStatus === "exists" || profileStatus === "missing") {
      setLocation(getNextUrl());
    } else {
      // Fallback: profile status couldn't be determined, go to hub
      // and let the protected route handle it
      setLocation(getNextUrl());
    }
  }, [setLocation]);

  const handleGoogleSignIn = async () => {
    if (!auth?.signInWithGoogle) {
      toast({
        title: "Error",
        description: "Authentication not ready. Please refresh.",
        variant: "destructive",
      });
      return;
    }
    setIsGoogleLoading(true);
    setGoogleError(null);
    try {
      await setAuthPersistence(true);
      await auth.signInWithGoogle();
      toast({
        title: "Welcome!",
        description: "You have successfully signed in with Google.",
      });
      redirectAfterSignIn();
    } catch (error) {
      const message = getAuthErrorMessage(error);
      if (isAuthConfigError(error)) {
        setGoogleError(message);
      }
      toast({
        title: "Google Sign In Failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#181818] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <span className="text-4xl mr-2"></span>
            <h1 className="text-3xl font-bold text-white">SkateHubba</h1>
          </div>
          <p className="text-gray-400">Find and share the best skate spots</p>
        </div>

        {/* Google sign-in config error */}
        {googleError && (
          <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-4 mb-4">
            <p className="text-red-200 text-sm font-semibold mb-1">Google Sign-In Error</p>
            <p className="text-red-300/80 text-sm">{googleError}</p>
          </div>
        )}

        {/* Auth Card */}
        <Card className="bg-[#232323] border-gray-700">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "signin" | "signup")}>
            <TabsList className="grid w-full grid-cols-2 bg-[#181818]">
              <TabsTrigger
                value="signin"
                className="data-[state=active]:bg-orange-500 data-[state=active]:text-white"
              >
                Sign In
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="data-[state=active]:bg-orange-500 data-[state=active]:text-white"
              >
                Sign Up
              </TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <SignInTab
                signIn={auth?.signInWithEmail}
                onGoogleSignIn={handleGoogleSignIn}
                isGoogleLoading={isGoogleLoading}
                isExternalLoading={auth?.loading ?? false}
                inEmbeddedBrowser={inEmbeddedBrowser}
                onForgotPassword={() => setShowForgotPassword(true)}
              />
            </TabsContent>

            <TabsContent value="signup">
              <SignUpTab
                signUp={auth?.signUpWithEmail}
                onGoogleSignIn={handleGoogleSignIn}
                isGoogleLoading={isGoogleLoading}
                isExternalLoading={auth?.loading ?? false}
                inEmbeddedBrowser={inEmbeddedBrowser}
              />
            </TabsContent>
          </Tabs>
        </Card>

        {/* Back to Home */}
        <div className="text-center mt-6">
          <Link href="/landing" className="text-gray-400 hover:text-white text-sm">
            Back to Home
          </Link>
        </div>
      </div>

      {showForgotPassword && (
        <ForgotPasswordModal
          onClose={() => setShowForgotPassword(false)}
          resetPassword={auth?.resetPassword}
        />
      )}
    </div>
  );
}
