import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Mail, User, Lock, Loader2, AtSign } from "lucide-react";
import { Link, useLocation } from "wouter";

import { Button } from "../../components/ui/button";
import { CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useToast } from "../../hooks/use-toast";
import { logger } from "../../lib/logger";
import { apiRequest } from "../../lib/api/client";
import { setAuthPersistence } from "../../lib/firebase";
import { useAuthStore } from "../../store/authStore";
import { signUpSchema, type SignUpForm } from "./authSchemas";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { useUsernameCheck } from "../profile/hooks/useUsernameCheck";
import type {
  ProfileCreatePayload,
  ProfileCreateResponse,
} from "../profile/schemas/profileSchemas";

interface SignUpTabProps {
  signUp: ((email: string, password: string, name?: string) => Promise<void>) | undefined;
  onGoogleSignIn: () => Promise<void>;
  isGoogleLoading: boolean;
  isExternalLoading: boolean;
  inEmbeddedBrowser: boolean;
}

export function SignUpTab({
  signUp,
  onGoogleSignIn: _onGoogleSignIn,
  isGoogleLoading: _isGoogleLoading,
  isExternalLoading,
  inEmbeddedBrowser,
}: SignUpTabProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const form = useForm<SignUpForm>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "", username: "", stance: undefined },
    mode: "onChange",
  });

  const username = form.watch("username");

  const {
    usernameStatus,
    usernameMessage,
    availabilityBadge,
    checkUsernameAvailability,
    setUsernameStatus,
    setUsernameMessage,
  } = useUsernameCheck(username);

  const isFormLoading = isExternalLoading || form.formState.isSubmitting || isCreatingProfile;

  const submitDisabled = Boolean(
    isFormLoading ||
    isGoogleLoading ||
    (username &&
      (usernameStatus === "taken" || usernameStatus === "invalid" || usernameStatus === "checking"))
  );

  async function createProfile(profileUsername: string, stance?: string) {
    if (usernameStatus === "unverified" || usernameStatus === "idle") {
      const result = await checkUsernameAvailability(profileUsername, 2500);
      if (result === "taken") {
        setUsernameStatus("taken");
        setUsernameMessage("That username is already taken.");
        throw new Error("Username is already taken.");
      }
    }

    const payload: ProfileCreatePayload = {
      username: profileUsername,
      stance: (stance as "regular" | "goofy") || undefined,
    };

    const response = await apiRequest<ProfileCreateResponse, ProfileCreatePayload>({
      method: "POST",
      path: "/api/profile/create",
      body: payload,
    });

    useAuthStore.getState().setProfile({
      ...response.profile,
      createdAt: new Date(response.profile.createdAt),
      updatedAt: new Date(response.profile.updatedAt),
    });
  }

  const handleSignUp = async (data: SignUpForm) => {
    if (!signUp) {
      toast({
        title: "Error",
        description: "Authentication not ready. Please refresh.",
        variant: "destructive",
      });
      return;
    }
    logger.log("[AuthPage] handleSignUp called:", { email: data.email, username: data.username });
    try {
      // Step 1: Create Firebase account + backend session
      await signUp(data.email, data.password, data.name);
      logger.log("[AuthPage] Sign up successful, creating profile...");

      // Step 2: Create profile
      setIsCreatingProfile(true);
      await createProfile(data.username, data.stance || undefined);
      logger.log("[AuthPage] Profile created successfully!");

      toast({
        title: "Welcome to SkateHubba!",
        description: "Your account and profile are ready. Check your email to verify.",
      });
      setLocation("/hub");
    } catch (error) {
      logger.error("[AuthPage] Sign up error:", error);
      const authError = error as { message?: string; code?: string };
      const message = authError.message || "Sign up failed. Please try again.";
      toast({
        title: "Registration Failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsCreatingProfile(false);
    }
  };

  const handleGoogleSignUp = async () => {
    const usernameValue = form.getValues("username");
    const stanceValue = form.getValues("stance");

    if (!usernameValue?.trim()) {
      form.setError("username", { message: "Pick a username before signing up" });
      return;
    }

    const isValid = await form.trigger(["username", "stance"]);
    if (!isValid) return;

    setIsGoogleLoading(true);
    try {
      // Step 1: Google OAuth
      await setAuthPersistence(true);
      await useAuthStore.getState().signInWithGoogle();
      logger.log("[AuthPage] Google sign-up successful");

      // Step 2: Create profile if user doesn't already have one
      const { profileStatus } = useAuthStore.getState();
      if (profileStatus === "exists") {
        toast({ title: "Welcome back!", description: "You already have a profile." });
        setLocation("/hub");
        return;
      }

      setIsCreatingProfile(true);
      await createProfile(usernameValue, stanceValue || undefined);
      logger.log("[AuthPage] Profile created after Google sign-up!");

      toast({
        title: "Welcome to SkateHubba!",
        description: "Your account and profile are ready.",
      });
      setLocation("/hub");
    } catch (error) {
      logger.error("[AuthPage] Google sign-up error:", error);
      const message = error instanceof Error ? error.message : "Google sign up failed";
      toast({
        title: "Sign Up Failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsGoogleLoading(false);
      setIsCreatingProfile(false);
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
              <User aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
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
              <Mail aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
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
              <Lock aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
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
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-300"
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" className="h-4 w-4" />
                ) : (
                  <Eye aria-hidden="true" className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Must contain at least 8 characters with uppercase, lowercase, and numbers
            </p>
            {form.formState.errors.password && (
              <p className="text-sm text-red-400">{form.formState.errors.password.message}</p>
            )}
          </div>

          {/* Profile section divider */}
          <div className="flex items-center gap-3 pt-2">
            <div className="flex-grow border-t border-gray-700" />
            <span className="text-xs text-gray-500 uppercase tracking-wider">Profile</span>
            <div className="flex-grow border-t border-gray-700" />
          </div>

          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="signup-username" className="text-gray-300">
              Username
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <AtSign aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="signup-username"
                  placeholder="skatelegend"
                  autoComplete="username"
                  {...form.register("username", {
                    onChange: (event) => {
                      const next = String(event.target.value || "").toLowerCase();
                      form.setValue("username", next, { shouldValidate: true });
                    },
                  })}
                  className="pl-10 bg-[#181818] border-gray-600 text-white placeholder:text-gray-500"
                />
              </div>
              <div className="min-w-[120px]" aria-live="polite">
                {availabilityBadge}
              </div>
            </div>
            {usernameMessage && !form.formState.errors.username && (
              <p className="text-xs text-gray-400">{usernameMessage}</p>
            )}
            {form.formState.errors.username && (
              <p className="text-sm text-red-400">{form.formState.errors.username.message}</p>
            )}
          </div>

          {/* Stance */}
          <div className="space-y-2">
            <Label htmlFor="signup-stance" className="text-gray-300">
              Stance
            </Label>
            <select
              id="signup-stance"
              className="h-10 w-full rounded-md bg-[#181818] border border-gray-600 text-white px-3 text-sm"
              {...form.register("stance")}
            >
              <option value="">Select stance (optional)</option>
              <option value="regular">Regular</option>
              <option value="goofy">Goofy</option>
            </select>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            className="w-full bg-orange-500 hover:bg-orange-600 text-white"
            disabled={submitDisabled}
          >
            {isFormLoading ? (
              <>
                <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                {isCreatingProfile ? "Setting up profile..." : "Creating Account..."}
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
          onSignIn={handleGoogleSignUp}
          isLoading={isGoogleLoading || isCreatingProfile}
          inEmbeddedBrowser={inEmbeddedBrowser}
        />
      </CardContent>
    </>
  );
}
