import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { CheckCircle, Loader2, Upload, XCircle } from "lucide-react";

import { useAuth } from "../../context/AuthProvider";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Progress } from "../../components/ui/progress";
import { Textarea } from "../../components/ui/textarea";
import { usernameSchema } from "@shared/schema";

/**
 * Enterprise rules applied:
 * - Deterministic navigation (single redirect).
 * - Runtime validation of API responses (Zod).
 * - Username availability check is cancelable (AbortController) + debounced.
 * - No undefined variables / no implicit contracts.
 * - Upload path remains JSON-based for now (base64) but guarded and isolated.
 *   TODO (recommended): move avatar upload to Storage and send storagePath.
 */

const stanceSchema = z.enum(["regular", "goofy"]);
const experienceLevelSchema = z.enum(["beginner", "intermediate", "advanced", "pro"]);

const formSchema = z.object({
  username: usernameSchema,
  stance: stanceSchema.optional(),
  experienceLevel: experienceLevelSchema.optional(),
  favoriteTricks: z.string().max(200).optional(),
  bio: z.string().max(500).optional(),
  crewName: z.string().max(80).optional(),
});

type FormValues = z.infer<typeof formSchema>;
type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

type ProfileCreatePayload = {
  username?: string;
  stance?: "regular" | "goofy";
  experienceLevel?: "beginner" | "intermediate" | "advanced" | "pro";
  favoriteTricks?: string[];
  bio?: string;
  crewName?: string;
  avatarBase64?: string;
  skip?: boolean;
};

const ProfileCreateResponseSchema = z.object({
  profile: z.object({
    uid: z.string(),
    username: z.string(),
    stance: stanceSchema.nullable(),
    experienceLevel: experienceLevelSchema.nullable(),
    favoriteTricks: z.array(z.string()),
    bio: z.string().nullable(),
    spotsVisited: z.number(),
    crewName: z.string().nullable(),
    credibilityScore: z.number(),
    avatarUrl: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});

type ProfileCreateResponse = z.infer<typeof ProfileCreateResponseSchema>;

const UsernameCheckResponseSchema = z.object({
  available: z.boolean(),
});

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function getCsrfToken(): string | undefined {
  // Keep optional in case your backend enforces it.
  // If you are bearer-token-only, you should remove CSRF entirely server + client.
  if (typeof document === "undefined") return undefined;
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith("csrfToken="))
    ?.split("=")[1];
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("avatar_read_failed"));
    };
    reader.onerror = () => reject(new Error("avatar_read_failed"));
    reader.readAsDataURL(file);
  });
}

function parseFavoriteTricks(value: string | undefined): string[] {
  if (!value) return [];
  const items = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Enterprise guardrails: cap count, cap item length, dedupe.
  const MAX_ITEMS = 20;
  const MAX_ITEM_LEN = 30;

  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of items) {
    const t = raw.slice(0, MAX_ITEM_LEN);
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_ITEMS) break;
  }

  return out;
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function sendProfileCreateRequest(
  payload: ProfileCreatePayload,
  token: string,
  onProgress: (progress: number) => void
): Promise<ProfileCreateResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/profile/create");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", "application/json");

    const csrfToken = getCsrfToken();
    if (csrfToken) xhr.setRequestHeader("X-CSRF-Token", csrfToken);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const progress = Math.round((event.loaded / event.total) * 100);
      onProgress(progress);
    };

    xhr.onload = () => {
      const ok = xhr.status >= 200 && xhr.status < 300;
      if (!ok) {
        const body = xhr.responseText || "profile_create_failed";
        reject(new Error(body));
        return;
      }

      const json = safeJsonParse(xhr.responseText);
      try {
        const parsed = ProfileCreateResponseSchema.parse(json);
        resolve(parsed);
      } catch (e) {
        reject(new Error("profile_create_response_invalid"));
      }
    };

    xhr.onerror = () => reject(new Error("network_error"));
    xhr.send(JSON.stringify(payload));
  });
}

export default function ProfileSetup() {
  const auth = useAuth();
  const [, setLocation] = useLocation();

  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [usernameMessage, setUsernameMessage] = useState<string>("");

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const usernameCheckAbortRef = useRef<AbortController | null>(null);
  const usernameCheckSeqRef = useRef(0);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      username: "",
      stance: undefined,
      experienceLevel: undefined,
      favoriteTricks: "",
      bio: "",
      crewName: "",
    },
  });

  const username = watch("username");
  const bio = watch("bio");

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
      setUsernameMessage("3–20 characters, letters and numbers only.");
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
          `/api/profile/username-check?username=${encodeURIComponent(parsed.data)}`,
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
      } catch (err) {
        // If request was aborted, do nothing
        if (controller.signal.aborted) return;

        // Ignore stale responses
        if (seq !== usernameCheckSeqRef.current) return;

        setUsernameStatus("invalid");
        setUsernameMessage("Could not verify username right now.");
      }
    }, 500);

    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
  }, [username]);

  // Avatar preview (object URL)
  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(null);
      return;
    }
    const previewUrl = URL.createObjectURL(avatarFile);
    setAvatarPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [avatarFile]);

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
    return null;
  }, [usernameStatus]);

  const handleAvatarChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setAvatarError(null);
    const file = event.target.files?.[0];
    if (!file) {
      setAvatarFile(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setAvatarError("Only image files are allowed.");
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("Avatar must be under 5MB.");
      return;
    }

    setAvatarFile(file);
  }, []);

  const submitProfile = useCallback(
    async (values: FormValues, skip?: boolean) => {
      if (!auth.user) {
        setSubmitError("You need to be signed in.");
        return;
      }

      setSubmitting(true);
      setUploadProgress(0);
      setSubmitError(null);

      try {
        // Optional: forceRefresh = false is fine; server should accept recent token.
        const token = await auth.user.getIdToken();

        const payload: ProfileCreatePayload = {
          username: skip ? undefined : values.username,
          stance: values.stance,
          experienceLevel: values.experienceLevel,
          favoriteTricks: parseFavoriteTricks(values.favoriteTricks),
          bio: values.bio?.trim() ? values.bio.trim() : undefined,
          crewName: values.crewName?.trim() ? values.crewName.trim() : undefined,
          skip,
        };

        // NOTE: For enterprise scale, do not send base64 via JSON.
        // TODO: upload to Storage and pass a storagePath instead.
        if (avatarFile && !skip) {
          payload.avatarBase64 = await fileToDataUrl(avatarFile);
        }

        const response = await sendProfileCreateRequest(payload, token, setUploadProgress);

        // Keep auth state in sync immediately if your provider supports it.
        // If your AuthProvider already refetches profile automatically, this is still safe.
        if (typeof auth.setProfile === "function") {
          auth.setProfile({
            ...response.profile,
            createdAt: new Date(response.profile.createdAt),
            updatedAt: new Date(response.profile.updatedAt),
          });
        }

        // Deterministic single redirect
        setLocation("/dashboard", { replace: true });
      } catch (error) {
        console.error("[ProfileSetup] Failed to create profile", error);
        setSubmitError("We couldn't create your profile. Try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [auth, avatarFile, setLocation]
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
        favoriteTricks: "",
        bio: "",
        crewName: "",
      },
      true
    );
  }, [submitProfile]);

  const submitDisabled =
    !isValid ||
    usernameStatus === "taken" ||
    usernameStatus === "invalid" ||
    usernameStatus === "checking" ||
    submitting ||
    Boolean(avatarError);

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
                <option value="pro">Pro</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-neutral-200" htmlFor="favoriteTricks">
              Favorite Tricks
            </label>
            <Input
              id="favoriteTricks"
              placeholder="kickflip, heelflip, treflip"
              className="h-12 bg-neutral-900/60 border-neutral-700 text-white"
              {...register("favoriteTricks")}
            />
            <p className="text-xs text-neutral-400">Comma-separated, up to 20 tricks.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-neutral-200" htmlFor="bio">
              Bio
            </label>
            <Textarea
              id="bio"
              placeholder="Tell the crew about yourself..."
              className="min-h-[100px] bg-neutral-900/60 border-neutral-700 text-white resize-none"
              {...register("bio")}
            />
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>Max 500 characters.</span>
              <span>{bio?.length ?? 0}/500</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-neutral-200" htmlFor="crewName">
              Crew name
            </label>
            <Input
              id="crewName"
              placeholder="Midnight Push"
              className="h-12 bg-neutral-900/60 border-neutral-700 text-white"
              {...register("crewName")}
            />
          </div>

          <div className="space-y-3 rounded-2xl border border-white/10 bg-neutral-900/40 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-neutral-200">Avatar</p>
                <p className="text-xs text-neutral-400">PNG/JPG/WebP/GIF. Max 5MB.</p>
              </div>
              {avatarPreview && (
                <img
                  src={avatarPreview}
                  alt="Avatar preview"
                  className="h-12 w-12 rounded-full object-cover ring-2 ring-yellow-500"
                />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-yellow-500/40 px-4 py-2 text-sm text-yellow-200 hover:bg-yellow-500/10">
                <Upload className="h-4 w-4" />
                Upload avatar
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </label>
              {avatarFile && (
                <button
                  type="button"
                  className="text-xs text-neutral-400 underline"
                  onClick={() => setAvatarFile(null)}
                >
                  Remove
                </button>
              )}
            </div>

            {avatarError && <p className="text-xs text-red-400">{avatarError}</p>}
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
            >
              {submitting ? "Creating profile..." : "Create profile"}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="h-12 w-full text-neutral-300 hover:bg-white/5 md:w-auto"
              onClick={handleSkip}
              disabled={submitting}
            >
              Skip for now
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
