/**
 * Authentication Page
 *
 * Production-grade authentication UI with sign-in and sign-up tabs.
 * Supports email/password and Google OAuth authentication.
 *
 * @module pages/auth
 */

import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";

import { Card } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useToast } from "../hooks/use-toast";
import { useAuth } from "../hooks/useAuth";
import { logger } from "../lib/logger";
import { setAuthPersistence } from "../lib/firebase";
import { isEmbeddedBrowser } from "./auth/authSchemas";
import { SignInTab } from "./auth/SignInTab";
import { SignUpTab } from "./auth/SignUpTab";
import { ForgotPasswordModal } from "./auth/ForgotPasswordModal";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const auth = useAuth();

  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signup");
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [inEmbeddedBrowser, setInEmbeddedBrowser] = useState(false);

  // Parse ?next= param for redirect after login
  const getNextUrl = (): string => {
    if (typeof window === "undefined") return "/hub";
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    if (next) {
      try {
        const decoded = decodeURIComponent(next);
        // Security: only allow relative paths
        if (decoded.startsWith("/") && !decoded.startsWith("//")) {
          return decoded;
        }
      } catch {
        // Invalid encoding
      }
    }
    return "/hub";
  };

  // Redirect when authenticated and profile status is known
  useEffect(() => {
    if (!auth?.isAuthenticated || auth?.profileStatus === "unknown") return;

    if (auth.profileStatus === "exists") {
      setLocation(getNextUrl());
    } else if (auth.profileStatus === "missing") {
      const nextUrl = getNextUrl();
      const setupUrl =
        nextUrl !== "/hub"
          ? `/profile/setup?next=${encodeURIComponent(nextUrl)}`
          : "/profile/setup";
      setLocation(setupUrl);
    }
  }, [auth?.isAuthenticated, auth?.profileStatus, setLocation]);

  // Check for embedded browser on mount
  useEffect(() => {
    const isEmbedded = isEmbeddedBrowser();
    setInEmbeddedBrowser(isEmbedded);
    logger.log("[AuthPage] User agent:", navigator.userAgent);
    logger.log("[AuthPage] Is embedded browser:", isEmbedded);
  }, []);

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
    try {
      await setAuthPersistence(true);
      await auth.signInWithGoogle();
      toast({
        title: "Welcome!",
        description: "You have successfully signed in with Google.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google sign in failed";
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
          <Link href="/" className="text-gray-400 hover:text-white text-sm">
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
