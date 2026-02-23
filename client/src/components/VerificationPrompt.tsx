import { AlertCircle, Mail } from "lucide-react";
import { Button } from "./ui/button";
import { useEmailVerification } from "../hooks/useEmailVerification";
import { useToast } from "../hooks/use-toast";

interface VerificationPromptProps {
  action?: string;
  className?: string;
}

export function VerificationPrompt({
  action = "this feature",
  className = "",
}: VerificationPromptProps) {
  const { resendVerificationEmail, isResending, canResend, userEmail } = useEmailVerification();
  const { toast } = useToast();

  const handleResend = async () => {
    try {
      await resendVerificationEmail();
      toast({
        title: "Verification email sent!",
        description: "Check your inbox and spam folder.",
      });
    } catch (error: unknown) {
      toast({
        title: "Could not send email",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <div
      className={`bg-orange-500/10 border border-orange-500/30 rounded-lg p-4 ${className}`}
      role="alert"
      aria-label="Email verification required"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-orange-400 font-medium text-sm">
            Verify your email to unlock {action}
          </p>
          <p className="text-gray-400 text-xs mt-1">
            We sent a verification link to {userEmail || "your email"}
          </p>
          <Button
            onClick={handleResend}
            disabled={isResending || !canResend}
            variant="ghost"
            size="sm"
            className="mt-2 text-orange-400 hover:text-orange-300 hover:bg-orange-500/10 p-0 h-auto"
            data-testid="button-resend-inline"
          >
            <Mail className="w-3 h-3 mr-1" aria-hidden="true" />
            {isResending ? "Sending..." : "Resend verification email"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function VerificationGate({
  children,
  action,
  fallback,
}: {
  children: React.ReactNode;
  action?: string;
  fallback?: React.ReactNode;
}) {
  const { requiresVerification } = useEmailVerification();

  if (requiresVerification) {
    return fallback ?? <VerificationPrompt action={action} />;
  }

  return <>{children}</>;
}
