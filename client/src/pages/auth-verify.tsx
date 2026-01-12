import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { applyActionCode, confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { Card, CardContent } from "../components/ui/card";
import { CheckCircle, XCircle, Loader2, Lock, Eye, EyeOff } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Link } from "wouter";

export default function AuthVerifyPage() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "reset-password">("loading");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<string | null>(null);
  const [oobCode, setOobCode] = useState<string | null>(null);
  
  // Password reset state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    const handleAction = async () => {
      try {
        // Import auth dynamically to catch initialization errors
        const { auth } = await import("../lib/firebase");
        
        if (!auth) {
          setStatus("error");
          setMessage("Firebase authentication not configured. Please contact support.");
          return;
        }

        // Get the action code from URL query params
        const urlParams = new URLSearchParams(window.location.search);
        const urlMode = urlParams.get('mode');
        const urlOobCode = urlParams.get('oobCode');
        
        setMode(urlMode);
        setOobCode(urlOobCode);

        if (!urlOobCode) {
          setStatus("error");
          setMessage("Invalid link. Missing verification code.");
          return;
        }

        if (urlMode === 'verifyEmail') {
          // Apply the verification code
          await applyActionCode(auth, urlOobCode);
          setStatus("success");
          setMessage("Your email has been verified successfully!");
          
          // Auto-redirect to signin after 3 seconds
          setTimeout(() => {
            setLocation("/signin");
          }, 3000);
        } else if (urlMode === 'resetPassword') {
          // Verify the password reset code is valid
          await verifyPasswordResetCode(auth, urlOobCode);
          setStatus("reset-password");
          setMessage("Enter your new password below.");
        } else {
          setStatus("error");
          setMessage("Invalid or expired verification link.");
        }
      } catch (error: any) {
        console.error("Action error:", error);
        setStatus("error");
        if (error.code === 'auth/expired-action-code') {
          setMessage("This link has expired. Please request a new one.");
        } else if (error.code === 'auth/invalid-action-code') {
          setMessage("This link is invalid or has already been used.");
        } else {
          setMessage(error.message || "Verification failed. The link may be invalid or expired.");
        }
      }
    };

    handleAction();
  }, [setLocation]);

  // Handle password reset submission
  const handlePasswordReset = async () => {
    setPasswordError("");
    
    // Validate password
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setPasswordError("Password must contain an uppercase letter.");
      return;
    }
    if (!/[a-z]/.test(newPassword)) {
      setPasswordError("Password must contain a lowercase letter.");
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setPasswordError("Password must contain a number.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setIsResetting(true);
    try {
      const { auth } = await import("../lib/firebase");
      if (!auth || !oobCode) {
        throw new Error("Authentication not configured");
      }
      
      await confirmPasswordReset(auth, oobCode, newPassword);
      setStatus("success");
      setMessage("Your password has been reset successfully!");
      
      // Auto-redirect to signin after 3 seconds
      setTimeout(() => {
        setLocation("/auth");
      }, 3000);
    } catch (error: any) {
      console.error("Password reset error:", error);
      if (error.code === 'auth/expired-action-code') {
        setPasswordError("This reset link has expired. Please request a new one.");
      } else if (error.code === 'auth/weak-password') {
        setPasswordError("Password is too weak. Please choose a stronger password.");
      } else {
        setPasswordError(error.message || "Failed to reset password. Please try again.");
      }
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#181818] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="h-12 w-12 text-orange-500 mr-2 text-4xl">🛹</div>
            <h1 className="text-3xl font-bold text-white">SkateHubba</h1>
          </div>
        </div>

        <Card className="bg-[#232323] border-gray-700">
          <CardContent className="pt-6">
            {status === "loading" && (
              <div className="text-center py-8">
                <Loader2 className="w-16 h-16 text-orange-500 animate-spin mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">Verifying Email...</h2>
                <p className="text-gray-400">Please wait while we verify your email address.</p>
              </div>
            )}

            {status === "success" && (
              <div className="text-center py-8">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">
                  {mode === 'resetPassword' ? 'Password Reset!' : 'Email Verified!'} ✅
                </h2>
                <p className="text-gray-300 mb-6">{message}</p>
                <p className="text-gray-400 text-sm mb-4">Redirecting to sign in...</p>
                <Link href="/auth">
                  <Button 
                    className="bg-orange-500 hover:bg-orange-600 text-white"
                    data-testid="button-goto-signin"
                  >
                    Go to Sign In
                  </Button>
                </Link>
              </div>
            )}

            {status === "reset-password" && (
              <div className="py-6">
                <h2 className="text-2xl font-bold text-white mb-2 text-center">Reset Password</h2>
                <p className="text-gray-400 text-center mb-6">{message}</p>
                
                <div className="space-y-4">
                  {/* New Password */}
                  <div className="space-y-2">
                    <Label htmlFor="new-password" className="text-gray-300">New Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="new-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="pl-10 pr-10 bg-[#181818] border-gray-600 text-white placeholder:text-gray-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3 text-gray-400 hover:text-gray-300"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500">
                      Must be 8+ characters with uppercase, lowercase, and number
                    </p>
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password" className="text-gray-300">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="confirm-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pl-10 bg-[#181818] border-gray-600 text-white placeholder:text-gray-500"
                      />
                    </div>
                  </div>

                  {/* Error Message */}
                  {passwordError && (
                    <p className="text-sm text-red-400">{passwordError}</p>
                  )}

                  {/* Submit Button */}
                  <Button
                    onClick={handlePasswordReset}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                    disabled={isResetting}
                  >
                    {isResetting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Resetting...
                      </>
                    ) : (
                      'Reset Password'
                    )}
                  </Button>
                </div>
              </div>
            )}

            {status === "error" && (
              <div className="text-center py-8">
                <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">
                  {mode === 'resetPassword' ? 'Reset Failed' : 'Verification Failed'}
                </h2>
                <p className="text-gray-300 mb-6">{message}</p>
                <div className="space-y-2">
                  {mode === 'resetPassword' ? (
                    <Link href="/auth">
                      <Button 
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                      >
                        Request New Reset Link
                      </Button>
                    </Link>
                  ) : (
                    <Link href="/signup">
                      <Button 
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                        data-testid="button-try-again"
                      >
                        Try Signing Up Again
                      </Button>
                    </Link>
                  )}
                  <Link href="/">
                    <Button 
                      variant="outline" 
                      className="w-full border-gray-600 text-gray-300 hover:bg-gray-800"
                      data-testid="button-back-home"
                    >
                      Back to Home
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
