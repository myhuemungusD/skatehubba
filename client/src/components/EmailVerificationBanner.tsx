import { useState } from "react";
import { AlertTriangle, Mail, X } from "lucide-react";
import { Button } from "./ui/button";
import { useEmailVerification } from "../hooks/useEmailVerification";
import { useToast } from "../hooks/use-toast";

/**
 * Persistent banner shown to users who haven't verified their email.
 * Dismissible but will reappear on page reload until email is verified.
 */
export function EmailVerificationBanner() {
  const { requiresVerification, resendVerificationEmail, isResending, canResend, userEmail } =
    useEmailVerification();
  const { toast } = useToast();
  const [isDismissed, setIsDismissed] = useState(false);

  if (!requiresVerification || isDismissed) {
    return null;
  }

  const handleResend = async () => {
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
  };

  return (
    <div
      className="bg-orange-500/90 text-black px-4 py-2"
      role="alert"
      data-testid="email-verification-banner"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-medium truncate">
            Verify your email to unlock posting.
          </span>
          <span className="text-xs opacity-75 hidden sm:inline truncate">
            Sent to {userEmail || "your email"}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
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
            onClick={() => setIsDismissed(true)}
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
