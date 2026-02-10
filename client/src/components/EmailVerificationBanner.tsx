import { useState, useCallback } from "react";
import { AlertTriangle, Mail, X } from "lucide-react";
import { Button } from "./ui/button";
import { useEmailVerification } from "../hooks/useEmailVerification";
import { useToast } from "../hooks/use-toast";

const DISMISS_KEY_PREFIX = "skatehubba_email_banner_dismissed_";

function getDismissKey(email: string | null | undefined) {
  return DISMISS_KEY_PREFIX + (email || "unknown");
}

/**
 * Compact banner shown to users who haven't verified their email.
 * Dismissal persists across page loads via localStorage (per-user).
 */
export function EmailVerificationBanner() {
  const { requiresVerification, resendVerificationEmail, isResending, canResend, userEmail } =
    useEmailVerification();
  const { toast } = useToast();
  const dismissKey = getDismissKey(userEmail);
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      return localStorage.getItem(dismissKey) === "true";
    } catch {
      return false;
    }
  });

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
    try {
      localStorage.setItem(dismissKey, "true");
    } catch {
      // Storage full or unavailable — dismiss for this session only
    }
  }, [dismissKey]);

  const handleResend = useCallback(async () => {
    try {
      await resendVerificationEmail();
      toast({
        title: "Verification email sent!",
        description: "Check your inbox and spam folder.",
      });
    } catch (error: any) {
      toast({
        title: "Could not send email",
        description: error.message,
        variant: "destructive",
      });
    }
  }, [resendVerificationEmail, toast]);

  if (!requiresVerification || isDismissed) {
    return null;
  }

  return (
    <div
      className="bg-orange-500/90 text-black px-3 py-1.5 sm:px-4 sm:py-2"
      role="alert"
      data-testid="email-verification-banner"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
          <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
          <span className="text-xs sm:text-sm font-medium truncate">
            Verify your email to unlock posting.
          </span>
          <span className="text-xs opacity-75 hidden sm:inline truncate">
            Sent to {userEmail || "your email"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <Button
            onClick={handleResend}
            disabled={isResending || !canResend}
            variant="ghost"
            size="sm"
            className="text-black hover:bg-black/10 h-7 px-2 text-xs"
            data-testid="banner-resend-button"
          >
            <Mail className="w-3 h-3 mr-1" />
            {isResending ? "Sending..." : "Resend"}
          </Button>
          <Button
            onClick={handleDismiss}
            variant="ghost"
            size="sm"
            className="text-black hover:bg-black/10 h-7 w-7 p-0"
            aria-label="Dismiss banner"
            data-testid="banner-dismiss-button"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
