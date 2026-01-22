import { useState } from "react";
import { BetaSignupInput, type BetaSignupInputT } from "@/lib/validation/betaSignup";

type UiState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success" }
  | { status: "offline" }
  | { status: "error"; message: string };

export function useBetaSignup() {
  const [state, setState] = useState<UiState>({ status: "idle" });

  async function submit(input: BetaSignupInputT): Promise<UiState["status"]> {
    const parsed = BetaSignupInput.safeParse(input);
    if (!parsed.success) {
      setState({ status: "error", message: "Enter a valid email and platform." });
      return "error";
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setState({ status: "offline" });
      return "offline";
    }

    setState({ status: "submitting" });

    try {
      const response = await fetch("/api/beta-signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          payload?.error === "VALIDATION_ERROR"
            ? "That email doesn’t look right."
            : payload?.error === "RATE_LIMITED"
              ? "You already joined recently. Try again later."
              : "Could not join beta. Try again.";
        setState({ status: "error", message });
        return "error";
      }

      setState({ status: "success" });
      return "success";
    } catch {
      setState({ status: "error", message: "Network error. Check your connection and try again." });
      return "error";
    }
  }

  return { state, submit, setState };
}
