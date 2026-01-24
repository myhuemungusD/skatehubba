import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, useSearch } from "wouter";
import { AlertTriangle, CheckCircle, Loader2, XCircle } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Progress } from "../../components/ui/progress";
import { usernameSchema } from "@shared/schema";
import { apiRequest, buildApiUrl } from "../../lib/api/client";
import { getUserFriendlyMessage, isApiError } from "../../lib/api/errors";

/**
 * Enterprise rules applied:
 * - Deterministic navigation (single redirect).
 * - Runtime validation of API responses (Zod).
 * - Username availability check is cancelable (AbortController) + debounced.
 * - No undefined variables / no implicit contracts.
 * - Upload path remains JSON-based for now (base64) but guarded and isolated.
 *   TODO (recommended): move avatar upload to Storage and send storagePath.
 * - Supports ?next= param to preserve user's intended destination.
 */

const stanceSchema = z.enum(["regular", "goofy"]);
const experienceLevelSchema = z.enum(["beginner", "intermediate", "advanced"]);

const formSchema = z.object({
  username: usernameSchema.optional().or(z.literal("")),
  stance: stanceSchema.optional(),
  experienceLevel: experienceLevelSchema.optional(),
  sponsorFlow: z.string().max(100).optional(),
  sponsorTeam: z.string().max(100).optional(),
  hometownShop: z.string().max(100).optional(),
});

type FormValues = z.infer<typeof formSchema>;
type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid" | "unverified";

type ProfileCreatePayload = {
  username?: string;
  stance?: "regular" | "goofy";
  experienceLevel?: "beginner" | "intermediate" | "advanced";
  sponsorFlow?: string;
  sponsorTeam?: string;
  hometownShop?: string;
  skip?: boolean;
};

const UsernameCheckResponseSchema = z.object({
  available: z.boolean(),
});

type ProfileCreateResponse = {
  profile: {
    uid: string;
    username: string;
    stance: "regular" | "goofy" | null;
    experienceLevel: "beginner" | "intermediate" | "advanced" | "pro" | null;
    favoriteTricks: string[];
    bio: string | null;
    spotsVisited: number;
    crewName: string | null;
    credibilityScore: number;
    avatarUrl: string | null;
    sponsorFlow?: string | null;
    sponsorTeam?: string | null;
    hometownShop?: string | null;
    createdAt: string;
    updatedAt: string;
  };
};

export default function ProfileSetup() {
  const auth = useAuth();
  const [, setLocation] = useLocation();
  const searchString = useSearch();

  // Parse ?next= param for redirect after profile creation
  const getNextUrl = useCallback((): string => {
    const params = new URLSearchParams(searchString);
    const next = params.get("next");
    if (next) {
      try {
        const decoded = decodeURIComponent(next);
        // Security: only allow relative paths, no external redirects
        if (decoded.startsWith("/") && !decoded.startsWith("//")) {
          return decoded;
        }
      } catch {
        // Invalid encoding, fall back to default
      }
    }
    return "/landing";
  }, [searchString]);

  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [usernameMessage, setUsernameMessage] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const usernameCheckAbortRef = useRef<AbortController | null>(null);
  const usernameCheckSeqRef = useRef(0);
  const usernameWarnedRef = useRef(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      username: "",
      stance: undefined,
      experienceLevel: undefined,
      sponsorFlow: "",
      sponsorTeam: "",
      hometownShop: "",
    },
  });

  const username = watch("username");

  // Username availability: debounced + cancelable + race-safe
  useEffect(() => {
    // Cancel any in-flight request when username changes
    usernameCheckAbortRef.current?.abort();
    usernameCheckAbortRef.current = null;

    if (!username) {
      setUsernameStatus("idle");
      setUsernameMessage("");
      return;
    }

    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success) {
      setUsernameStatus("invalid");
      setUsernameMessage("3-20 characters, letters and numbers only.");
      return;
    }

    const seq = ++usernameCheckSeqRef.current;
    const controller = new AbortController();
    usernameCheckAbortRef.current = controller;

    const handle = window.setTimeout(async () => {
      try {
        setUsernameStatus("checking");
        setUsernameMessage("");

        const res = await fetch(
          buildApiUrl(`/api/profile/username-check?username=${encodeURIComponent(parsed.data)}`),
          { signal: controller.signal }
        );

        if (!res.ok) throw new Error("username_check_failed");

        const data = UsernameCheckResponseSchema.parse(await res.json());

        // Ignore stale responses
        if (seq !== usernameCheckSeqRef.current) return;

        if (data.available) {
          setUsernameStatus("available");
          setUsernameMessage("Username is available.");
        } else {
          setUsernameStatus("taken");
          setUsernameMessage("That username is already taken.");
        }
      } catch (error) {
        // If request was aborted, do nothing
        if (controller.signal.aborted) return;

        // Ignore stale responses
        if (seq !== usernameCheckSeqRef.current) return;

        // Network or server issue - allow submit, but show warning
        if (!usernameWarnedRef.current) {
          console.warn("[ProfileSetup] Username check failed", error);
          usernameWarnedRef.current = true;
        }
        setUsernameStatus("unverified");
        setUsernameMessage("Could not verify username. We'll check on submit.");
      }
    }, 500);

    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
  }, [username]);

  const availabilityBadge = useMemo(() => {
    if (usernameStatus === "available") {
      return (
        <span className="inline-flex items-center gap-1 text-sm text-emerald-400">
          <CheckCircle className="h-4 w-4" />
          Available
        </span>
      );
    }
    if (usernameStatus === "taken") {
      return (
        <span className="inline-flex items-center gap-1 text-sm text-red-400">
          <XCircle className="h-4 w-4" />
          Taken
        </span>
      );
    }
    if (usernameStatus === "checking") {
      return (
        <span className="inline-flex items-center gap-1 text-sm text-yellow-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking
        </span>
      );
    }
    if (usernameStatus === "unverified") {
      return (
        <span className="inline-flex items-center gap-1 text-sm text-yellow-300">
          <AlertTriangle className="h-4 w-4" />
          Unverified
        </span>
      );
    }
    return null;
  }, [usernameStatus]);

  const checkUsernameAvailability = useCallback(
    async (value: string, timeoutMs: number): Promise<"available" | "taken" | "unknown"> => {
      if (typeof window === "undefined") return "unknown";
      const parsed = usernameSchema.safeParse(value);
      if (!parsed.success) return "unknown";

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(
          buildApiUrl(`/api/profile/username-check?username=${encodeURIComponent(parsed.data)}`),
          { signal: controller.signal }
        );
        if (!res.ok) return "unknown";
        const data = UsernameCheckResponseSchema.parse(await res.json());
        return data.available ? "available" : "taken";
      } catch {
        return "unknown";
      } finally {
        window.clearTimeout(timeout);
      }
    },
    []
  );

  const submitProfile = useCallback(
    async (values: FormValues, skip?: boolean) => {
      if (!auth.user) {
        setSubmitError("You need to be signed in.");
        return;
      }

      if (!skip && !values.username?.trim()) {
        setSubmitError("Username is required unless you skip.");
        return;
      }

      setSubmitting(true);
      setUploadProgress(0);
      setSubmitError(null);

      try {
        if (!skip && usernameStatus === "unverified" && values.username?.trim()) {
          const result = await checkUsernameAvailability(values.username, 2500);
          if (result === "taken") {
            setUsernameStatus("taken");
            setUsernameMessage("That username is already taken.");
            setSubmitError("That username is already taken.");
            setSubmitting(false);
            return;
          }
          if (result === "available") {
            setUsernameStatus("available");
            setUsernameMessage("Username is available.");
          }
        }

        const payload: ProfileCreatePayload = {
          username: skip ? undefined : values.username,
          stance: values.stance,
          experienceLevel: values.experienceLevel,
          sponsorFlow: values.sponsorFlow?.trim() ? values.sponsorFlow.trim() : undefined,
          sponsorTeam: values.sponsorTeam?.trim() ? values.sponsorTeam.trim() : undefined,
          hometownShop: values.hometownShop?.trim() ? values.hometownShop.trim() : undefined,
          skip,
        };

        const response = await apiRequest<ProfileCreateResponse, ProfileCreatePayload>({
          method: "POST",
          path: "/api/profile/create",
          body: payload,
        });

        auth.setProfile({
          ...response.profile,
          createdAt: new Date(response.profile.createdAt),
          updatedAt: new Date(response.profile.updatedAt),
        });

        // Profile created successfully - redirect to intended destination or home
        const nextUrl = getNextUrl();
        setLocation(nextUrl, { replace: true });
      } catch (error) {
        console.error("[ProfileSetup] Failed to create profile", error);
        if (isApiError(error)) {
          const details = error.details as Record<string, unknown> | undefined;
          const errorCode = typeof details?.error === "string" ? details.error : undefined;
          if (errorCode === "username_taken") {
            setUsernameStatus("taken");
            setUsernameMessage("That username is already taken.");
            setSubmitError("That username is already taken.");
          } else if (errorCode === "invalid_username") {
            setUsernameStatus("invalid");
            setUsernameMessage("Invalid username format.");
            setSubmitError("Invalid username format.");
          } else if (errorCode === "auth_required" || error.code === "UNAUTHORIZED") {
            setSubmitError("Please sign in again to continue.");
          } else if (errorCode === "rate_limited" || error.code === "RATE_LIMIT") {
            setSubmitError("You're moving fast. Take a breather and try again.");
          } else {
            setSubmitError(getUserFriendlyMessage(error));
          }
        } else {
          setSubmitError("We couldn't create your profile. Try again.");
        }
      } finally {
        setSubmitting(false);
      }
    },
    [auth, setLocation, getNextUrl, checkUsernameAvailability, usernameStatus]
  );

  const onSubmit = useCallback(
    (values: FormValues) => {
      void submitProfile(values, false);
    },
    [submitProfile]
  );

  const handleSkip = useCallback(() => {
    void submitProfile(
      {
        username: "",
        stance: undefined,
        experienceLevel: undefined,
        sponsorFlow: "",
        sponsorTeam: "",
        hometownShop: "",
      },
      true
    );
  }, [submitProfile]);

  const submitDisabled = Boolean(
    submitting ||
    (username &&
      (usernameStatus === "taken" || usernameStatus === "invalid" || usernameStatus === "checking"))
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur md:p-10">
        <header className="space-y-3 text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-yellow-500/80">Onboarding</p>
          <h1 className="text-3xl font-bold text-white md:text-4xl">
            Build your SkateHubba profile
          </h1>
          <p className="text-sm text-neutral-300">
            Lock in a unique handle and show the crew how you skate. This only happens once.
          </p>
        </header>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-neutral-200" htmlFor="username">
              Username
            </label>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <Input
                id="username"
                data-testid="profile-username"
                placeholder="skatelegend"
                className="h-12 bg-neutral-900/60 border-neutral-700 text-white"
                {...register("username", {
                  onChange: (event) => {
                    const next = String(event.target.value || "").toLowerCase();
                    setValue("username", next, { shouldValidate: true });
                  },
                })}
              />
              <div className="min-w-[140px]">{availabilityBadge}</div>
            </div>
            <p className="text-xs text-neutral-400">{usernameMessage}</p>
            {errors.username && <p className="text-xs text-red-400">{errors.username.message}</p>}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-neutral-200" htmlFor="stance">
                Stance
              </label>
              <select
                id="stance"
                className="h-12 w-full rounded-lg bg-neutral-900/60 border border-neutral-700 text-white px-3"
                {...register("stance")}
              >
                <option value="">Select stance</option>
                <option value="regular">Regular</option>
                <option value="goofy">Goofy</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-neutral-200" htmlFor="experienceLevel">
                Experience Level
              </label>
              <select
                id="experienceLevel"
                className="h-12 w-full rounded-lg bg-neutral-900/60 border border-neutral-700 text-white px-3"
                {...register("experienceLevel")}
              >
                <option value="">Select level</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
              <p className="text-xs text-neutral-400 mt-1">
                Pro status available via verification only
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-neutral-200" htmlFor="sponsorFlow">
              Sponsor/Flow (Optional)
            </label>
            <Input
              id="sponsorFlow"
              placeholder="e.g., Nike SB"
              className="h-12 bg-neutral-900/60 border-neutral-700 text-white"
              {...register("sponsorFlow")}
            />
            <p className="text-xs text-neutral-400">Your current sponsor or flow sponsor</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-neutral-200" htmlFor="sponsorTeam">
              Sponsor/Team (Optional)
            </label>
            <Input
              id="sponsorTeam"
              placeholder="e.g., Element Skateboards"
              className="h-12 bg-neutral-900/60 border-neutral-700 text-white"
              {...register("sponsorTeam")}
            />
            <p className="text-xs text-neutral-400">Your board sponsor or team affiliation</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-neutral-200" htmlFor="hometownShop">
              Hometown Shop (Optional)
            </label>
            <Input
              id="hometownShop"
              placeholder="e.g., Local Skate Shop"
              className="h-12 bg-neutral-900/60 border-neutral-700 text-white"
              {...register("hometownShop")}
            />
            <p className="text-xs text-neutral-400">Your local skate shop</p>
          </div>

          {submitting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span>Uploading profile</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2 bg-neutral-800" />
            </div>
          )}

          {submitError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {submitError}
            </div>
          )}

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Button
              type="submit"
              className="h-12 w-full bg-yellow-500 text-black hover:bg-yellow-400 md:w-auto"
              disabled={submitDisabled}
              data-testid="profile-submit"
            >
              {submitting ? "Creating profile..." : "Create profile"}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="h-12 w-full text-neutral-300 hover:bg-white/5 md:w-auto"
              onClick={handleSkip}
              disabled={submitting}
              data-testid="profile-skip"
            >
              Skip for now
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
