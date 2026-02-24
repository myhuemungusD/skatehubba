import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Lock, CheckCircle, XCircle, Eye, EyeOff } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { useToast } from "../hooks/use-toast";
import { buildApiUrl } from "../lib/api/client";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

function isValidTokenFormat(token: string): boolean {
  return token.length > 0 && token.length <= 128 && /^[a-f0-9]+$/i.test(token);
}

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [status, setStatus] = useState<"form" | "submitting" | "success" | "error">("form");
  const [errorMessage, setErrorMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const hasCheckedToken = useRef(false);

  const token = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("token");
  }, []);

  const passwordError = useMemo(() => {
    if (!password) return null;
    if (password.length < PASSWORD_MIN_LENGTH)
      return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
    if (!PASSWORD_REGEX.test(password)) return "Must include uppercase, lowercase, and a number";
    return null;
  }, [password]);

  const confirmError = useMemo(() => {
    if (!confirmPassword) return null;
    if (password !== confirmPassword) return "Passwords don't match";
    return null;
  }, [password, confirmPassword]);

  const canSubmit =
    password.length >= PASSWORD_MIN_LENGTH && !passwordError && !confirmError && confirmPassword;

  // Validate token on mount
  useEffect(() => {
    if (hasCheckedToken.current) return;
    hasCheckedToken.current = true;

    if (!token || !isValidTokenFormat(token)) {
      setStatus("error");
      setErrorMessage("Invalid or missing reset link. Please request a new one.");
    }
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !token) return;

    setStatus("submitting");

    try {
      const csrfMatch = document.cookie.match(/(?:^|;\s*)csrfToken=([^;]*)/);
      const csrfToken = csrfMatch?.[1] ? decodeURIComponent(csrfMatch[1]) : undefined;

      const response = await fetch(buildApiUrl("/api/auth/reset-password"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ token, newPassword: password }),
      });

      let data: { error?: string; message?: string };
      try {
        data = await response.json();
      } catch {
        throw new Error("Unexpected server response. Please try again later.");
      }

      if (!response.ok) {
        throw new Error(data.error || "Password reset failed");
      }

      setStatus("success");
      toast({
        title: "Password Reset!",
        description: "Your password has been updated. You can now sign in.",
      });
    } catch (error) {
      setStatus("error");
      const msg = error instanceof Error ? error.message : "Password reset failed.";
      setErrorMessage(msg);
      toast({
        title: "Reset Failed",
        description: msg,
        variant: "destructive",
      });
    }
  }

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
              {status === "success" && <CheckCircle className="h-16 w-16 text-green-500" />}
              {status === "error" && <XCircle className="h-16 w-16 text-red-500" />}
              {(status === "form" || status === "submitting") && (
                <Lock className="h-16 w-16 text-orange-500" />
              )}
            </div>
            <CardTitle className="text-2xl text-white">
              {status === "success" && "Password Updated!"}
              {status === "error" && "Reset Failed"}
              {(status === "form" || status === "submitting") && "Set New Password"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {status === "success" && (
              <div className="text-center space-y-4">
                <p className="text-green-400 text-sm">
                  Your password has been reset. All other sessions have been logged out for security.
                </p>
                <Button
                  onClick={() => setLocation("/signin")}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                  data-testid="button-sign-in"
                >
                  Sign In with New Password
                </Button>
              </div>
            )}

            {status === "error" && (
              <div className="text-center space-y-4">
                <p className="text-red-400 text-sm">{errorMessage}</p>
                <div className="space-y-2">
                  <Button
                    onClick={() => setLocation("/forgot-password")}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                    data-testid="button-request-new"
                  >
                    Request New Reset Link
                  </Button>
                  <Button
                    onClick={() => setLocation("/signin")}
                    variant="outline"
                    className="w-full border-gray-600 text-gray-300 hover:bg-gray-700"
                    data-testid="button-signin"
                  >
                    Back to Sign In
                  </Button>
                </div>
              </div>
            )}

            {(status === "form" || status === "submitting") && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="New password (8+ chars, mixed case, number)"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={PASSWORD_MIN_LENGTH}
                      autoComplete="new-password"
                      className="pl-10 pr-10 bg-[#181818] border-gray-600 text-white placeholder:text-gray-500"
                      data-testid="input-new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-300"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {passwordError && (
                    <p className="text-xs text-red-400" role="alert">
                      {passwordError}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={PASSWORD_MIN_LENGTH}
                      autoComplete="new-password"
                      className="pl-10 bg-[#181818] border-gray-600 text-white placeholder:text-gray-500"
                      data-testid="input-confirm-password"
                    />
                  </div>
                  {confirmError && (
                    <p className="text-xs text-red-400" role="alert">
                      {confirmError}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                  disabled={status === "submitting" || !canSubmit}
                  data-testid="button-reset-submit"
                >
                  {status === "submitting" ? "Resetting..." : "Reset Password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
