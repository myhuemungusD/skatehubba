import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../hooks/useAuth";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { useToast } from "../hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Link, useLocation } from "wouter";
import { Mail, Lock, Eye, EyeOff, User, AtSign, Loader2, Phone } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { getAuthErrorMessage, isAuthConfigError } from "../lib/firebase/auth-errors";
import { apiRequest } from "../lib/api/client";
import { useAuthStore } from "../store/authStore";
import { useUsernameCheck } from "./profile/hooks/useUsernameCheck";
import type { ProfileCreatePayload, ProfileCreateResponse } from "./profile/schemas/profileSchemas";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
const USERNAME_REGEX = /^[a-zA-Z0-9]+$/;

type SignupMethod = "email" | "phone";

export default function SignupPage() {
  const [signupMethod, setSignupMethod] = useState<SignupMethod>("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [stance, setStance] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  // Phone auth state
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  const { toast } = useToast();
  const auth = useAuth();
  const [, setLocation] = useLocation();

  const {
    usernameStatus,
    usernameMessage,
    availabilityBadge,
    checkUsernameAvailability,
    setUsernameStatus,
    setUsernameMessage,
  } = useUsernameCheck(username);

  const passwordError = useMemo(() => {
    if (!password) return null;
    if (password.length < PASSWORD_MIN_LENGTH)
      return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
    if (!PASSWORD_REGEX.test(password)) return "Must include uppercase, lowercase, and a number";
    return null;
  }, [password]);

  const usernameError = useMemo(() => {
    if (!username) return null;
    if (username.length < 3) return "Username must be at least 3 characters";
    if (username.length > 20) return "Username must be at most 20 characters";
    if (!USERNAME_REGEX.test(username)) return "Only letters and numbers allowed";
    return null;
  }, [username]);

  const usernameReady =
    username.length >= 3 &&
    !usernameError &&
    usernameStatus !== "taken" &&
    usernameStatus !== "invalid" &&
    usernameStatus !== "checking";

  const canSubmitEmail =
    name.trim().length > 0 &&
    email &&
    password.length >= PASSWORD_MIN_LENGTH &&
    !passwordError &&
    usernameReady;

  const canSendCode = name.trim().length > 0 && phoneNumber.length >= 10 && usernameReady;

  const canConfirmCode = verificationCode.length >= 6 && codeSent;

  // Redirect if already authenticated with profile
  useEffect(() => {
    if (!auth?.isAuthenticated) return;
    if (auth?.profileStatus === "exists") {
      setLocation("/hub");
    }
  }, [auth?.isAuthenticated, auth?.profileStatus, setLocation]);

  async function createProfile(profileUsername: string, profileStance?: string) {
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
      stance: (profileStance as "regular" | "goofy") || undefined,
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

  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmitEmail) return;
    setIsLoading(true);

    try {
      await auth?.signUpWithEmail(email, password, name.trim());

      setIsCreatingProfile(true);
      await createProfile(username, stance || undefined);

      toast({
        title: "Welcome to SkateHubba!",
        description: "Your account and profile are ready. Check your email to verify.",
      });
      setLocation("/hub");
    } catch (err: unknown) {
      toast({
        title: "Registration Failed",
        description: getAuthErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsCreatingProfile(false);
    }
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!canSendCode) return;
    setIsLoading(true);

    try {
      const formattedPhone = phoneNumber.startsWith("+")
        ? phoneNumber
        : `+1${phoneNumber.replace(/\D/g, "")}`;
      await auth?.sendPhoneVerification(formattedPhone, "recaptcha-container");
      setCodeSent(true);
      toast({
        title: "Code sent",
        description: `A verification code was sent to ${formattedPhone}`,
      });
    } catch (err: unknown) {
      toast({
        title: "Failed to send code",
        description: getAuthErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleConfirmCode(e: React.FormEvent) {
    e.preventDefault();
    if (!canConfirmCode) return;
    setIsLoading(true);

    try {
      await auth?.confirmPhoneCode(verificationCode, name.trim());

      setIsCreatingProfile(true);
      await createProfile(username, stance || undefined);

      toast({
        title: "Welcome to SkateHubba!",
        description: "Your account and profile are ready.",
      });
      setLocation("/hub");
    } catch (err: unknown) {
      toast({
        title: "Verification failed",
        description: getAuthErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsCreatingProfile(false);
    }
  }

  async function handleGoogleSignUp() {
    if (!username.trim()) {
      toast({
        title: "Username required",
        description: "Pick a username before signing up with Google.",
        variant: "destructive",
      });
      return;
    }
    if (usernameError) return;

    setIsLoading(true);
    setGoogleError(null);
    try {
      await auth?.signInWithGoogle();

      const { profileStatus } = useAuthStore.getState();
      if (profileStatus === "exists") {
        toast({ title: "Welcome back!", description: "You already have a profile." });
        setLocation("/hub");
        return;
      }

      setIsCreatingProfile(true);
      await createProfile(username, stance || undefined);

      toast({
        title: "Welcome to SkateHubba!",
        description: "Your account and profile are ready.",
      });
      setLocation("/hub");
    } catch (err: unknown) {
      const message = getAuthErrorMessage(err);
      if (isAuthConfigError(err)) {
        setGoogleError(message);
      }
      toast({
        title: "Google sign-up failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsCreatingProfile(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#181818] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="h-12 w-12 text-orange-500 mr-2 text-4xl">SH</div>
            <h1 className="text-3xl font-bold text-white">SkateHubba</h1>
          </div>
          <p className="text-gray-400">Join the skateboarding community</p>
        </div>

        {googleError && (
          <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-4 mb-4">
            <p className="text-red-200 text-sm font-semibold mb-1">Google Sign-In Error</p>
            <p className="text-red-300/80 text-sm">{googleError}</p>
          </div>
        )}

        <Card className="bg-[#232323] border-gray-700">
          <CardHeader>
            <CardTitle className="text-2xl text-white">Create Account</CardTitle>
            <CardDescription className="text-gray-400">
              Sign up with your email, phone number, or Google
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Signup method tabs */}
            <div className="flex rounded-lg bg-[#181818] p-1 mb-6" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={signupMethod === "email"}
                onClick={() => {
                  setSignupMethod("email");
                  setCodeSent(false);
                }}
                className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors ${
                  signupMethod === "email"
                    ? "bg-orange-500 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <Mail className="h-4 w-4" />
                Email
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={signupMethod === "phone"}
                onClick={() => {
                  setSignupMethod("phone");
                  setCodeSent(false);
                }}
                className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors ${
                  signupMethod === "phone"
                    ? "bg-orange-500 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <Phone className="h-4 w-4" />
                Phone
              </button>
            </div>

            <div className="space-y-4">
              {/* Email method fields */}
              {signupMethod === "email" && (
                <form onSubmit={handleEmailSignup} className="space-y-4">
                  {/* Name */}
                  <div className="space-y-2">
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Your name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        autoComplete="name"
                        className="pl-10 bg-[#181818] border-gray-600 text-white placeholder:text-gray-500"
                        data-testid="input-signup-name"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        className="pl-10 bg-[#181818] border-gray-600 text-white placeholder:text-gray-500"
                        data-testid="input-signup-email"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Password (8+ chars, mixed case, number)"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={PASSWORD_MIN_LENGTH}
                        autoComplete="new-password"
                        className="pl-10 pr-10 bg-[#181818] border-gray-600 text-white placeholder:text-gray-500"
                        data-testid="input-signup-password"
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

                  {/* Profile section */}
                  <div className="flex items-center gap-3 pt-2">
                    <div className="flex-grow border-t border-gray-700" />
                    <span className="text-xs text-gray-500 uppercase tracking-wider">Profile</span>
                    <div className="flex-grow border-t border-gray-700" />
                  </div>

                  {/* Username */}
                  <div className="space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="relative flex-1">
                        <AtSign className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Username"
                          type="text"
                          value={username}
                          onChange={(e) =>
                            setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))
                          }
                          required
                          autoComplete="username"
                          className="pl-10 bg-[#181818] border-gray-600 text-white placeholder:text-gray-500"
                          data-testid="input-signup-username"
                        />
                      </div>
                      <div className="min-w-[120px]" aria-live="polite">
                        {availabilityBadge}
                      </div>
                    </div>
                    {usernameError && (
                      <p className="text-xs text-red-400" role="alert">
                        {usernameError}
                      </p>
                    )}
                    {usernameMessage && !usernameError && (
                      <p className="text-xs text-gray-400">{usernameMessage}</p>
                    )}
                  </div>

                  {/* Stance */}
                  <div className="space-y-2">
                    <select
                      value={stance}
                      onChange={(e) => setStance(e.target.value)}
                      className="h-10 w-full rounded-md bg-[#181818] border border-gray-600 text-white px-3 text-sm"
                      data-testid="input-signup-stance"
                    >
                      <option value="">Select stance (optional)</option>
                      <option value="regular">Regular</option>
                      <option value="goofy">Goofy</option>
                    </select>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                    disabled={isLoading || !canSubmitEmail}
                    data-testid="button-signup-submit"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {isCreatingProfile ? "Setting up profile..." : "Creating Account..."}
                      </>
                    ) : (
                      "Sign Up with Email"
                    )}
                  </Button>
                </form>
              )}

              {/* Phone method fields */}
              {signupMethod === "phone" && (
                <>
                  {!codeSent ? (
                    <form onSubmit={handleSendCode} className="space-y-4">
                      {/* Name */}
                      <div className="space-y-2">
                        <div className="relative">
                          <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                          <Input
                            placeholder="Your name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            autoComplete="name"
                            className="pl-10 bg-[#181818] border-gray-600 text-white placeholder:text-gray-500"
                            data-testid="input-signup-name-phone"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="relative">
                          <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                          <Input
                            placeholder="Phone number (e.g. +1234567890)"
                            type="tel"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            required
                            autoComplete="tel"
                            className="pl-10 bg-[#181818] border-gray-600 text-white placeholder:text-gray-500"
                            data-testid="input-signup-phone"
                          />
                        </div>
                        <p className="text-xs text-gray-500">
                          Include country code (e.g. +1 for US). We'll send a verification code.
                        </p>
                      </div>

                      {/* Profile section */}
                      <div className="flex items-center gap-3 pt-2">
                        <div className="flex-grow border-t border-gray-700" />
                        <span className="text-xs text-gray-500 uppercase tracking-wider">
                          Profile
                        </span>
                        <div className="flex-grow border-t border-gray-700" />
                      </div>

                      {/* Username */}
                      <div className="space-y-2">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <div className="relative flex-1">
                            <AtSign className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                            <Input
                              placeholder="Username"
                              type="text"
                              value={username}
                              onChange={(e) =>
                                setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))
                              }
                              required
                              autoComplete="username"
                              className="pl-10 bg-[#181818] border-gray-600 text-white placeholder:text-gray-500"
                              data-testid="input-signup-username-phone"
                            />
                          </div>
                          <div className="min-w-[120px]" aria-live="polite">
                            {availabilityBadge}
                          </div>
                        </div>
                        {usernameError && (
                          <p className="text-xs text-red-400" role="alert">
                            {usernameError}
                          </p>
                        )}
                        {usernameMessage && !usernameError && (
                          <p className="text-xs text-gray-400">{usernameMessage}</p>
                        )}
                      </div>

                      {/* Stance */}
                      <div className="space-y-2">
                        <select
                          value={stance}
                          onChange={(e) => setStance(e.target.value)}
                          className="h-10 w-full rounded-md bg-[#181818] border border-gray-600 text-white px-3 text-sm"
                          data-testid="input-signup-stance-phone"
                        >
                          <option value="">Select stance (optional)</option>
                          <option value="regular">Regular</option>
                          <option value="goofy">Goofy</option>
                        </select>
                      </div>

                      <Button
                        type="submit"
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                        disabled={isLoading || !canSendCode}
                        data-testid="button-signup-send-code"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending code...
                          </>
                        ) : (
                          "Send Verification Code"
                        )}
                      </Button>
                    </form>
                  ) : (
                    <form onSubmit={handleConfirmCode} className="space-y-4">
                      <div className="space-y-2">
                        <p className="text-sm text-gray-400">
                          Enter the 6-digit code sent to your phone
                        </p>
                        <div className="relative">
                          <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                          <Input
                            placeholder="Verification code"
                            type="text"
                            inputMode="numeric"
                            value={verificationCode}
                            onChange={(e) =>
                              setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                            }
                            required
                            autoComplete="one-time-code"
                            className="pl-10 bg-[#181818] border-gray-600 text-white placeholder:text-gray-500 tracking-widest text-center text-lg"
                            data-testid="input-signup-verification-code"
                          />
                        </div>
                      </div>

                      <Button
                        type="submit"
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                        disabled={isLoading || !canConfirmCode}
                        data-testid="button-signup-confirm-code"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {isCreatingProfile ? "Setting up profile..." : "Verifying..."}
                          </>
                        ) : (
                          "Verify & Sign Up"
                        )}
                      </Button>

                      <button
                        type="button"
                        onClick={() => {
                          setCodeSent(false);
                          setVerificationCode("");
                        }}
                        className="w-full text-sm text-gray-400 hover:text-white transition-colors"
                      >
                        Didn't receive a code? Try again
                      </button>
                    </form>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center my-6">
              <div className="flex-grow border-t border-gray-600"></div>
              <span className="mx-3 text-gray-400 text-sm">or</span>
              <div className="flex-grow border-t border-gray-600"></div>
            </div>

            <Button
              type="button"
              onClick={handleGoogleSignUp}
              disabled={isLoading}
              className="w-full bg-white hover:bg-gray-100 text-black font-semibold flex items-center justify-center gap-2"
              data-testid="button-signup-google"
            >
              <SiGoogle className="w-5 h-5" />
              Sign up with Google
            </Button>

            <div className="mt-6 text-center">
              <p className="text-gray-400">
                Already have an account?{" "}
                <Link
                  href="/signin"
                  className="text-orange-400 hover:text-orange-300 font-semibold"
                  data-testid="link-to-signin"
                >
                  Sign In
                </Link>
              </p>
            </div>

            <div className="mt-4 text-center">
              <Link href="/">
                <span
                  className="text-gray-400 hover:text-white cursor-pointer inline-block"
                  data-testid="link-back-home"
                >
                  Back to Home
                </span>
              </Link>
            </div>

            {/* Invisible reCAPTCHA container for phone auth */}
            <div id="recaptcha-container" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
