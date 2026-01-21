import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { SiGoogle } from "react-icons/si";
import { UserCircle, Copy, Check } from "lucide-react";
import { useAuth } from "../context/AuthProvider";
import { trackEvent } from "../lib/analytics";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { Label } from "../components/ui/label";
import { useToast } from "../hooks/use-toast";
import { setAuthPersistence } from "../lib/firebase";

/**
 * Detect if running in an embedded browser (Instagram, Facebook, etc.)
 * Google blocks OAuth in these webviews for security reasons
 */
function isEmbeddedBrowser(): boolean {
  const ua = navigator.userAgent || navigator.vendor || '';
  return (
    ua.includes('FBAN') || // Facebook App
    ua.includes('FBAV') || // Facebook App
    ua.includes('Instagram') ||
    ua.includes('Twitter') ||
    ua.includes('Line/') ||
    ua.includes('KAKAOTALK') ||
    ua.includes('Snapchat') ||
    ua.includes('TikTok') ||
    (ua.includes('wv') && ua.includes('Android')) // Android WebView
  );
}

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const auth = useAuth();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAnonymousLoading, setIsAnonymousLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true); // Default to staying signed in
  const [inEmbeddedBrowser, setInEmbeddedBrowser] = useState(false);
  const [copied, setCopied] = useState(false);

  // Check for embedded browser on mount
  useEffect(() => {
    const isEmbedded = isEmbeddedBrowser();
    setInEmbeddedBrowser(isEmbedded);
    console.log('[Login] User agent:', navigator.userAgent);
    console.log('[Login] Is embedded browser:', isEmbedded);
  }, []);

  // Redirect when authenticated
  useEffect(() => {
    if (auth?.user) {
      setLocation("/dashboard");
    }
  }, [auth?.user, setLocation]);

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      // Set persistence before signing in
      await setAuthPersistence(rememberMe);
      await auth?.signInWithGoogle();
      toast({
        title: "Welcome! 🛹",
        description: "You've successfully signed in with Google."
      });
      trackEvent('login', { method: 'google', rememberMe });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed";
      toast({
        title: "Google sign-in failed",
        description: message,
        variant: "destructive",
      });
      setIsGoogleLoading(false);
    }
  };

  const handleAnonymousSignIn = async () => {
    setIsAnonymousLoading(true);
    try {
      // Set persistence before signing in
      await setAuthPersistence(rememberMe);
      await auth?.signInAnonymously();
      toast({
        title: "Welcome! 🛹",
        description: "You've signed in as a guest."
      });
      trackEvent('login', { method: 'anonymous', rememberMe });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed";
      toast({
        title: "Guest sign-in failed",
        description: message,
        variant: "destructive",
      });
      setIsAnonymousLoading(false);
    }
  };

  const isLoading = isGoogleLoading || isAnonymousLoading;

  return (
    <div className="min-h-screen bg-[#181818] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="h-12 w-12 text-orange-500 mr-2 text-4xl">🛹</div>
            <h1 className="text-3xl font-bold text-white">SkateHubba</h1>
          </div>
          <p className="text-gray-400">Sign in to continue</p>
        </div>

        <Card className="bg-[#232323] border-gray-700">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center text-white">Welcome Back</CardTitle>
            <CardDescription className="text-center text-gray-400">
              Choose how you'd like to sign in
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Remember Me Checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="rememberMe"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
                className="border-gray-500 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
              />
              <Label
                htmlFor="rememberMe"
                className="text-sm text-gray-300 cursor-pointer"
              >
                Keep me signed in
              </Label>
            </div>

            {/* Embedded Browser Warning */}
            {inEmbeddedBrowser && (
              <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-3 mb-4">
                <p className="text-yellow-200 text-sm text-center">
                  <strong>Google Sign-In not available</strong> in this browser.
                  <br />
                  <span className="text-yellow-300/80">
                    Copy the link below and paste in Safari/Chrome, or use Guest sign-in.
                  </span>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2 border-yellow-600 text-yellow-200 hover:bg-yellow-900/50"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(window.location.href);
                      setCopied(true);
                      toast({
                        title: "Link copied!",
                        description: "Paste it in Safari or Chrome to sign in with Google."
                      });
                      setTimeout(() => setCopied(false), 2000);
                    } catch {
                      // Fallback for browsers that don't support clipboard API
                      toast({
                        title: "Copy this link",
                        description: window.location.href
                      });
                    }
                  }}
                >
                  {copied ? (
                    <Check className="w-4 h-4 mr-2" />
                  ) : (
                    <Copy className="w-4 h-4 mr-2" />
                  )}
                  {copied ? "Copied!" : "Copy Link"}
                </Button>
              </div>
            )}

            {/* Google Sign-In Button */}
            <Button
              onClick={handleGoogleSignIn}
              disabled={isLoading || inEmbeddedBrowser}
              className={`w-full bg-white hover:bg-gray-100 text-black font-semibold flex items-center justify-center gap-2 h-12 ${
                inEmbeddedBrowser ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              data-testid="button-google-signin"
            >
              <SiGoogle className="w-5 h-5" />
              {isGoogleLoading ? "Signing in..." : "Continue with Google"}
            </Button>

            <div className="flex items-center my-4">
              <div className="flex-grow border-t border-gray-600"></div>
              <span className="mx-3 text-gray-400 text-sm">or</span>
              <div className="flex-grow border-t border-gray-600"></div>
            </div>

            {/* Anonymous Sign-In Button */}
            <Button
              onClick={handleAnonymousSignIn}
              disabled={isLoading}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold flex items-center justify-center gap-2 h-12"
              data-testid="button-anonymous-signin"
            >
              <UserCircle className="w-5 h-5" />
              {isAnonymousLoading ? "Signing in..." : "Continue as Guest"}
            </Button>

            <p className="text-xs text-center text-gray-500 mt-6">
              By signing in, you agree to our Terms of Service and Privacy Policy
            </p>

            {/* Link to Full Auth Page */}
            <div className="text-center mt-6 pt-4 border-t border-gray-700">
              <p className="text-sm text-gray-400 mb-2">
                Need to create an account?
              </p>
              <Button
                onClick={() => setLocation("/auth")}
                variant="link"
                className="text-orange-400 hover:text-orange-300"
                data-testid="link-full-auth"
              >
                Sign up with email →
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
