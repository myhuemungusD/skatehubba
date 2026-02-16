import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { createElement } from "react";
import { buildApiUrl } from "../../../lib/api/client";
import { logger } from "../../../lib/logger";
import {
  usernameSchema,
  UsernameCheckResponseSchema,
  type UsernameStatus,
} from "../schemas/profileSchemas";

export function useUsernameCheck(username: string | undefined) {
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [usernameMessage, setUsernameMessage] = useState<string>("");

  const usernameCheckAbortRef = useRef<AbortController | null>(null);
  const usernameCheckSeqRef = useRef(0);
  const usernameWarnedRef = useRef(false);

  // Username availability: debounced + cancelable + race-safe
  useEffect(() => {
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

        if (seq !== usernameCheckSeqRef.current) return;

        if (data.available) {
          setUsernameStatus("available");
          setUsernameMessage("Username is available.");
        } else {
          setUsernameStatus("taken");
          setUsernameMessage("That username is already taken.");
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (seq !== usernameCheckSeqRef.current) return;

        if (!usernameWarnedRef.current) {
          logger.warn("[ProfileSetup] Username check failed", error);
          usernameWarnedRef.current = true;
        }
        setUsernameStatus("idle");
        setUsernameMessage("");
      }
    }, 500);

    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
  }, [username]);

  const availabilityBadge = useMemo(() => {
    if (usernameStatus === "available") {
      return createElement(
        "span",
        { className: "inline-flex items-center gap-1 text-sm text-emerald-400" },
        createElement(CheckCircle, { className: "h-4 w-4" }),
        "Available"
      );
    }
    if (usernameStatus === "taken") {
      return createElement(
        "span",
        { className: "inline-flex items-center gap-1 text-sm text-red-400" },
        createElement(XCircle, { className: "h-4 w-4" }),
        "Taken"
      );
    }
    if (usernameStatus === "checking") {
      return createElement(
        "span",
        { className: "inline-flex items-center gap-1 text-sm text-yellow-300" },
        createElement(Loader2, { className: "h-4 w-4 animate-spin" }),
        "Checking"
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

  return {
    usernameStatus,
    setUsernameStatus,
    usernameMessage,
    setUsernameMessage,
    availabilityBadge,
    checkUsernameAvailability,
  };
}
