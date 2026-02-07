import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle, XCircle, Mail } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { useToast } from "../hooks/use-toast";
import { buildApiUrl } from "../lib/api/client";

export default function VerifyEmailPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [verificationStatus, setVerificationStatus] = useState<"pending" | "success" | "error">(
    "pending"
  );
  const [message, setMessage] = useState("");
  const hasStarted = useRef(false);

  // Get token from URL params
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    if (!token) {
      setVerificationStatus("error");
      setMessage("No verification token provided.");
      return;
    }

    async function verifyToken() {
      try {
        // Read CSRF token from cookie
        const csrfToken = document.cookie
          .split("; ")
          .find((row) => row.startsWith("csrfToken="))
          ?.split("=")[1];

        const response = await fetch(buildApiUrl("/api/auth/verify-email"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
          },
          credentials: "include",
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Verification failed");
        }

        setVerificationStatus("success");
        setMessage(data.message || "Email verified successfully!");
        toast({
          title: "Email Verified!",
          description: "You can now sign in to your account.",
        });
      } catch (error) {
        setVerificationStatus("error");
        const errorMsg = error instanceof Error ? error.message : "Email verification failed.";
        setMessage(errorMsg);
        toast({
          title: "Verification Failed",
          description: "The verification link may be expired or invalid.",
          variant: "destructive",
        });
      }
    }

    void verifyToken();
  }, [token, toast]);

  return (
    <div className="min-h-screen bg-[#181818] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="h-12 w-12 text-orange-500 mr-2 text-4xl">SH</div>
            <h1 className="text-3xl font-bold text-white">SkateHubba</h1>
          </div>
        </div>

        <Card className="bg-[#232323] border-gray-700">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              {verificationStatus === "pending" && (
                <Mail className="h-16 w-16 text-orange-500 animate-pulse" />
              )}
              {verificationStatus === "success" && (
                <CheckCircle className="h-16 w-16 text-green-500" />
              )}
              {verificationStatus === "error" && <XCircle className="h-16 w-16 text-red-500" />}
            </div>
            <CardTitle className="text-2xl text-white">
              {verificationStatus === "pending" && "Verifying Email..."}
              {verificationStatus === "success" && "Email Verified!"}
              {verificationStatus === "error" && "Verification Failed"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            <p className="text-gray-300">
              {verificationStatus === "pending"
                ? "Please wait while we verify your email address..."
                : message}
            </p>

            {verificationStatus === "success" && (
              <div className="space-y-4">
                <p className="text-green-400 text-sm">
                  Your email is now verified. You have full access to SkateHubba.
                </p>
                <Button
                  onClick={() => setLocation("/signin")}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                  data-testid="button-sign-in"
                >
                  Sign In to Your Account
                </Button>
              </div>
            )}

            {verificationStatus === "error" && (
              <div className="space-y-4">
                <p className="text-red-400 text-sm">
                  The verification link may be expired or invalid. Please try signing in or request
                  a new verification email.
                </p>
                <div className="space-y-2">
                  <Button
                    onClick={() => setLocation("/signin")}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                    data-testid="button-try-signin"
                  >
                    Sign In
                  </Button>
                  <Button
                    onClick={() => setLocation("/signup")}
                    variant="outline"
                    className="w-full border-gray-600 text-gray-300 hover:bg-gray-700"
                    data-testid="button-signup"
                  >
                    Create New Account
                  </Button>
                </div>
              </div>
            )}

            {verificationStatus === "pending" && (
              <Button
                onClick={() => setLocation("/")}
                variant="link"
                className="text-gray-400 hover:text-white"
                data-testid="button-back-home"
              >
                Back to Home
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
