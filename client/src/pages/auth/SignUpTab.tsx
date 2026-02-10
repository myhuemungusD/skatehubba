import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Mail, User, Lock, Loader2 } from "lucide-react";
import { Link, useLocation } from "wouter";

import { Button } from "../../components/ui/button";
import { CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useToast } from "../../hooks/use-toast";
import { logger } from "../../lib/logger";
import { signUpSchema, type SignUpForm } from "./authSchemas";
import { GoogleSignInButton } from "./GoogleSignInButton";

interface SignUpTabProps {
  signUp: ((email: string, password: string, name?: string) => Promise<void>) | undefined;
  onGoogleSignIn: () => Promise<void>;
  isGoogleLoading: boolean;
  isExternalLoading: boolean;
  inEmbeddedBrowser: boolean;
}

export function SignUpTab({
  signUp,
  onGoogleSignIn,
  isGoogleLoading,
  isExternalLoading,
  inEmbeddedBrowser,
}: SignUpTabProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<SignUpForm>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const isFormLoading = isExternalLoading || form.formState.isSubmitting;

  const handleSignUp = async (data: SignUpForm) => {
    if (!signUp) {
      toast({
        title: "Error",
        description: "Authentication not ready. Please refresh.",
        variant: "destructive",
      });
      return;
    }
    logger.log("[AuthPage] handleSignUp called:", { email: data.email });
    try {
      await signUp(data.email, data.password, data.name);
      logger.log("[AuthPage] Sign up successful!");
      toast({
        title: "Account Created!",
        description: "We sent a verification email. Now pick a username!",
      });
      setLocation("/profile/setup");
    } catch (error) {
      logger.error("[AuthPage] Sign up error:", error);
      const authError = error as { message?: string; code?: string };
      const message = authError.message || "Sign up failed. Please try again.";
      logger.error("[AuthPage] Displaying error:", message);
      toast({
        title: "Registration Failed",
        description: message,
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <CardHeader>
        <CardTitle className="text-xl text-white">Create Account</CardTitle>
        <CardDescription className="text-gray-400">
          Join the community and start sharing spots
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(handleSignUp)} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="signup-name" className="text-gray-300">
              Name
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="signup-name"
                placeholder="Your name"
                {...form.register("name")}
                className="pl-10 bg-[#181818] border-gray-600 text-white placeholder:text-gray-500"
              />
            </div>
            {form.formState.errors.name && (
              <p className="text-sm text-red-400">{form.formState.errors.name.message}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="signup-email" className="text-gray-300">
              Email
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="signup-email"
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
            <Label htmlFor="signup-password" className="text-gray-300">
              Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="signup-password"
                type={showPassword ? "text" : "password"}
                placeholder=""
                {...form.register("password")}
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
              Must contain at least 8 characters with uppercase, lowercase, and numbers
            </p>
            {form.formState.errors.password && (
              <p className="text-sm text-red-400">{form.formState.errors.password.message}</p>
            )}
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
                Creating Account...
              </>
            ) : (
              "Create Account"
            )}
          </Button>

          {/* Terms */}
          <p className="text-xs text-center text-gray-500">
            By creating an account, you agree to our{" "}
            <Link href="/terms" className="text-orange-500 hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-orange-500 hover:underline">
              Privacy Policy
            </Link>
          </p>
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
