import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Mail, Lock, Loader2 } from "lucide-react";

import { Button } from "../../components/ui/button";
import { CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Checkbox } from "../../components/ui/checkbox";
import { useToast } from "../../hooks/use-toast";
import { logger } from "../../lib/logger";
import { setAuthPersistence } from "../../lib/firebase";
import { signInSchema, type SignInForm } from "./authSchemas";
import { GoogleSignInButton } from "./GoogleSignInButton";

interface SignInTabProps {
  signIn: ((email: string, password: string) => Promise<void>) | undefined;
  onGoogleSignIn: () => Promise<void>;
  isGoogleLoading: boolean;
  isExternalLoading: boolean;
  inEmbeddedBrowser: boolean;
  onForgotPassword: () => void;
}

export function SignInTab({
  signIn,
  onGoogleSignIn,
  isGoogleLoading,
  isExternalLoading,
  inEmbeddedBrowser,
  onForgotPassword,
}: SignInTabProps) {
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const form = useForm<SignInForm>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const isFormLoading = isExternalLoading || form.formState.isSubmitting;

  const handleSignIn = async (data: SignInForm) => {
    if (!signIn) {
      toast({
        title: "Error",
        description: "Authentication not ready. Please refresh.",
        variant: "destructive",
      });
      return;
    }
    try {
      logger.log("[AuthPage] Attempting sign in...");
      await setAuthPersistence(rememberMe);
      await signIn(data.email, data.password);
      logger.log("[AuthPage] Sign in successful");
      toast({
        title: "Welcome back! ",
        description: "You have successfully signed in.",
      });
    } catch (error) {
      logger.error("[AuthPage] Sign in error:", error);
      const authError = error as { message?: string; code?: string };
      const message = authError.message || "Sign in failed. Please check your credentials.";
      toast({
        title: "Sign In Failed",
        description: message,
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <CardHeader>
        <CardTitle className="text-xl text-white">Welcome Back</CardTitle>
        <CardDescription className="text-gray-400">
          Sign in to your account to continue
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(handleSignIn)} className="space-y-4">
          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="signin-email" className="text-gray-300">
              Email
            </Label>
            <div className="relative">
              <Mail aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="signin-email"
                type="email"
                placeholder="you@example.com"
                {...form.register("email")}
                className="pl-10 bg-[#181818] border-gray-600 text-white placeholder:text-gray-500"
              />
            </div>
            {form.formState.errors.email && (
              <p className="text-sm text-red-400">{form.formState.errors.email.message}</p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="signin-password" className="text-gray-300">
                Password
              </Label>
              <button
                type="button"
                onClick={onForgotPassword}
                className="text-sm text-orange-500 hover:text-orange-400"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <Lock aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="signin-password"
                type={showPassword ? "text" : "password"}
                placeholder=""
                {...form.register("password")}
                className="pl-10 pr-10 bg-[#181818] border-gray-600 text-white placeholder:text-gray-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-3 p-1 text-gray-400 hover:text-gray-300"
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" className="h-4 w-4" />
                ) : (
                  <Eye aria-hidden="true" className="h-4 w-4" />
                )}
              </button>
            </div>
            {form.formState.errors.password && (
              <p className="text-sm text-red-400">{form.formState.errors.password.message}</p>
            )}
          </div>

          {/* Remember Me */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="rememberMe"
              checked={rememberMe}
              onCheckedChange={(checked) => setRememberMe(checked === true)}
              aria-label="Keep me signed in"
              className="border-gray-500 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
            />
            <Label htmlFor="rememberMe" className="text-sm text-gray-300 cursor-pointer">
              Keep me signed in
            </Label>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            className="w-full bg-orange-500 hover:bg-orange-600 text-white"
            disabled={isFormLoading}
          >
            {isFormLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing In...
              </>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>

        <GoogleSignInButton
          onSignIn={onGoogleSignIn}
          isLoading={isGoogleLoading}
          inEmbeddedBrowser={inEmbeddedBrowser}
        />
      </CardContent>
    </>
  );
}
