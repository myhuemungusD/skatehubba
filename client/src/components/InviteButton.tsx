import { useState, useCallback } from "react";
import { Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface InviteButtonProps {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
  className?: string;
  label?: string;
}

export function InviteButton({
  variant = "outline",
  size = "default",
  className,
  label = "Invite",
}: InviteButtonProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const inviteUrl = `${window.location.origin}/auth`;

  const handleInvite = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "SkateHubba — S.K.A.T.E. me",
          text: "Challenge me to a game of S.K.A.T.E. on SkateHubba",
          url: inviteUrl,
        });
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast({ title: "Invite link copied" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Could not copy link", variant: "destructive" });
    }
  }, [inviteUrl, toast]);

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleInvite}
      className={cn(
        "transition-all duration-200",
        copied && variant !== "ghost" && "border-green-500/50 text-green-400",
        className
      )}
    >
      <span className={cn("transition-transform duration-200", copied && "scale-110")}>
        {copied ? (
          <Check className="h-4 w-4" />
        ) : (
          <Share2 className="h-4 w-4" />
        )}
      </span>
      {size !== "icon" && (
        <span className="ml-2">{copied ? "Copied!" : label}</span>
      )}
    </Button>
  );
}
