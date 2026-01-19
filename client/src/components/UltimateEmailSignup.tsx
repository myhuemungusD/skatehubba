import React, { useState, useEffect } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Users, CheckCircle, ArrowRight, Sparkles } from "lucide-react";
import { useBetaSignup } from "@/hooks/useBetaSignup";

interface UltimateEmailSignupProps {
  /** Layout variant for different contexts */
  variant?: "hero" | "inline" | "minimal" | "sidebar";
  /** Custom CTA text */
  ctaText?: string;
  /** Show social proof elements */
  showSocialProof?: boolean;
  /** Track conversion source for analytics */
  source?: string;
  /** Success callback */
  onSuccess?: (data: { email: string; status: string }) => void;
  /** Custom styling classes */
  className?: string;
}

export default function UltimateEmailSignup({
  variant = "hero",
  ctaText,
  showSocialProof = true,
  onSuccess,
  className = "",
}: UltimateEmailSignupProps) {
  const [email, setEmail] = useState("");
  const [platform, setPlatform] = useState<"ios" | "android">("ios");
  const { state, submit, setState } = useBetaSignup();

  // Social proof counter (simulated for demo)
  const [subscriberCount, setSubscriberCount] = useState(1247);

  useEffect(() => {
    // Simulate real-time counter updates for psychological effect
    const interval = setInterval(() => {
      if (Math.random() > 0.95) {
        // 5% chance every second
        setSubscriberCount((prev) => prev + 1);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const getVariantStyles = () => {
    switch (variant) {
      case "hero":
        return {
          container: "max-w-lg mx-auto space-y-6",
          form: "space-y-4",
          input:
            "bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:border-orange-500 h-12 text-lg",
          button:
            "bg-orange-500 hover:bg-orange-600 text-white h-12 text-lg font-semibold transition-all duration-300 hover:scale-105 hover:shadow-lg",
        };
      case "inline":
        return {
          container: "max-w-md space-y-4",
          form: "flex flex-col sm:flex-row gap-3",
          input:
            "bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:border-orange-500",
          button:
            "bg-orange-500 hover:bg-orange-600 text-white px-6 font-semibold transition-all duration-200",
        };
      case "minimal":
        return {
          container: "max-w-sm space-y-3",
          form: "space-y-3",
          input:
            "bg-white/10 border-white/20 text-white placeholder-white/60 focus:border-orange-400",
          button: "bg-orange-500 hover:bg-orange-600 text-white font-medium",
        };
      case "sidebar":
        return {
          container: "space-y-4",
          form: "space-y-3",
          input:
            "bg-gray-900 border-gray-700 text-white placeholder-gray-500 focus:border-orange-500",
          button: "bg-orange-500 hover:bg-orange-600 text-white w-full font-semibold",
        };
      default:
        return {
          container: "max-w-md space-y-4",
          form: "space-y-4",
          input:
            "bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:border-orange-500",
          button: "bg-orange-500 hover:bg-orange-600 text-white font-semibold",
        };
    }
  };

  const styles = getVariantStyles();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await submit({ email, platform });

    if (result === "success") {
      onSuccess?.({ email, status: "ok" });
      setEmail("");
    }
  };

  // Success state
  if (state.status === "success" && variant === "hero") {
    return (
      <div className={`${styles.container} ${className}`}>
        <div className="bg-success/20 border border-success rounded-xl p-6 text-center">
          <CheckCircle className="h-12 w-12 text-success mx-auto mb-4" />
          <h3 className="text-success font-bold text-xl mb-2">You're In! 🎉</h3>
          <p className="text-success/90 mb-4">Get ready for updates, drops & exclusive sessions.</p>
          <button
            onClick={() => setState({ status: "idle" })}
            className="text-orange-400 hover:text-orange-300 text-sm flex items-center justify-center gap-2 mx-auto"
            data-testid="button-subscribe-another"
          >
            Subscribe another email <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${className}`} data-testid="email-signup-form">
      {/* Social proof */}
      {showSocialProof && variant === "hero" && (
        <div className="flex justify-center items-center gap-8 text-sm text-gray-400 mb-6">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-orange-500" />
            <span>Join {subscriberCount.toLocaleString()}+ skaters</span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-success" />
            <span>Free beta access</span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.form}>
        <Input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`${styles.input} ${variant === "inline" ? "flex-1" : ""}`}
          disabled={state.status === "submitting"}
          required
          data-testid="input-email"
        />

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setPlatform("ios")}
            className={`h-11 rounded-lg border text-sm font-semibold transition ${
              platform === "ios"
                ? "border-orange-400 bg-orange-500/20 text-orange-200"
                : "border-white/10 bg-white/5 text-white/70 hover:border-orange-300"
            }`}
          >
            iOS
          </button>
          <button
            type="button"
            onClick={() => setPlatform("android")}
            className={`h-11 rounded-lg border text-sm font-semibold transition ${
              platform === "android"
                ? "border-orange-400 bg-orange-500/20 text-orange-200"
                : "border-white/10 bg-white/5 text-white/70 hover:border-orange-300"
            }`}
          >
            Android
          </button>
        </div>

        <Button
          type="submit"
          disabled={state.status === "submitting" || !email}
          className={styles.button}
          data-testid="button-signup"
        >
          {state.status === "submitting" ? (
            <span className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Signing up...
            </span>
          ) : (
            ctaText || (variant === "hero" ? "Join the Beta" : "Get Updates")
          )}
        </Button>
      </form>

      {state.status === "error" && (
        <p className="text-red-400 text-sm text-center" data-testid="text-validation-error">
          {state.message}
        </p>
      )}

      {state.status === "offline" && (
        <p className="text-yellow-300 text-sm text-center" data-testid="text-offline">
          You appear offline. Reconnect to join the beta.
        </p>
      )}

      {state.status === "success" && variant !== "hero" && (
        <p className="text-success text-sm text-center" data-testid="text-success">
          You're on the list. We'll keep you posted.
        </p>
      )}

      {/* Minimal social proof for non-hero variants */}
      {showSocialProof && variant !== "hero" && (
        <p className="text-gray-400 text-xs text-center">
          Join {subscriberCount.toLocaleString()}+ skaters • Free beta access
        </p>
      )}
    </div>
  );
}
