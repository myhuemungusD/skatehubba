import { useCallback, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "../../../hooks/useAuth";
import { apiRequest } from "../../../lib/api/client";
import { getUserFriendlyMessage, isApiError } from "../../../lib/api/errors";
import { logger } from "../../../lib/logger";
import type {
  FormValues,
  ProfileCreatePayload,
  ProfileCreateResponse,
  UsernameStatus,
} from "../schemas/profileSchemas";

export function useProfileSubmit(
  usernameStatus: UsernameStatus,
  setUsernameStatus: (s: UsernameStatus) => void,
  setUsernameMessage: (m: string) => void,
  checkUsernameAvailability: (
    value: string,
    timeoutMs: number
  ) => Promise<"available" | "taken" | "unknown">
) {
  const auth = useAuth();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const getNextUrl = useCallback((): string => {
    const params = new URLSearchParams(searchString);
    const next = params.get("next");
    if (next) {
      try {
        const decoded = decodeURIComponent(next);
        if (decoded.startsWith("/") && !decoded.startsWith("//")) {
          return decoded;
        }
      } catch {
        // Invalid encoding, fall back to default
      }
    }
    return "/hub";
  }, [searchString]);

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
          stance: values.stance || undefined,
          experienceLevel: values.experienceLevel || undefined,
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

        const nextUrl = getNextUrl();
        setLocation(nextUrl, { replace: true });
      } catch (error) {
        logger.error("[ProfileSetup] Failed to create profile", error);
        if (isApiError(error)) {
          const details = error.details as Record<string, unknown> | undefined;
          const errorCode =
            typeof details?.error === "string" ? details.error.toLowerCase() : undefined;
          if (errorCode === "username_taken") {
            setUsernameStatus("taken");
            setUsernameMessage("That username is already taken.");
            setSubmitError("That username is already taken.");
          } else if (errorCode === "invalid_username") {
            setUsernameStatus("invalid");
            setUsernameMessage("Invalid username format.");
            setSubmitError("Invalid username format.");
          } else if (errorCode === "username_required") {
            setSubmitError("Username is required. Pick a handle or skip for now.");
          } else if (
            errorCode === "invalid_payload" ||
            errorCode === "validation_error" ||
            error.code === "VALIDATION_ERROR"
          ) {
            setSubmitError("Some profile fields are invalid. Check your entries and try again.");
          } else if (errorCode === "auth_required" || error.code === "UNAUTHORIZED") {
            setSubmitError("Your session has expired. Please refresh the page and sign in again.");
          } else if (errorCode === "invalid_csrf_token") {
            setSubmitError("Session token mismatch. Please refresh the page and try again.");
          } else if (errorCode === "rate_limited" || error.code === "RATE_LIMIT") {
            setSubmitError("Too many attempts. Wait a minute and try again.");
          } else if (errorCode === "database_unavailable" || errorCode === "service_unavailable") {
            setSubmitError("Our servers are temporarily unavailable. Please try again shortly.");
          } else if (errorCode === "profile_create_failed") {
            setSubmitError(
              "Could not save your profile. This is a server issue — please try again in a moment."
            );
          } else {
            setSubmitError(error.message || getUserFriendlyMessage(error));
          }
        } else if (error instanceof TypeError) {
          setSubmitError("Network error — check your connection and try again.");
        } else {
          setSubmitError("We couldn't create your profile. Try again.");
        }
      } finally {
        setSubmitting(false);
      }
    },
    [
      auth,
      setLocation,
      getNextUrl,
      checkUsernameAvailability,
      usernameStatus,
      setUsernameStatus,
      setUsernameMessage,
    ]
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

  return {
    submitting,
    uploadProgress,
    submitError,
    onSubmit,
    handleSkip,
  };
}
