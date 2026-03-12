import { useState, useCallback } from "react";
import { Share2, Check, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface InviteButtonProps {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  label?: string;
  prominent?: boolean;
}

export function InviteButton({
  variant = "outline",
  size = "default",
  className,
  label = "Invite a Friend",
  prominent = false,
}: InviteButtonProps) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [copied, setCopied] = useState(false);

  const username = profile?.username;
  const inviteUrl = username
    ? `${window.location.origin}/skater/${username}`
    : `${window.location.origin}/auth`;

  const shareTitle = username ? `@${username} invited you to SkateHubba` : "Join me on SkateHubba";

  const shareText = username
    ? `@${username} wants to play S.K.A.T.E. with you on SkateHubba! Join up and challenge them.`
    : "Challenge me to a game of S.K.A.T.E. on SkateHubba!";

  const handleInvite = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: inviteUrl,
        });
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
    }

    const clipboardText = `${shareText}\n${inviteUrl}`;
    try {
      await navigator.clipboard.writeText(clipboardText);
      setCopied(true);
      toast({ title: "Invite link copied!" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Could not copy link", variant: "destructive" });
    }
  }, [inviteUrl, shareTitle, shareText, toast]);

  if (prominent) {
    return (
      <button
        onClick={handleInvite}
        className={cn(
          "w-full flex items-center gap-4 rounded-xl border-2 border-dashed border-orange-500/40 bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-orange-500/10 p-4 hover:border-orange-500/70 hover:from-orange-500/20 hover:via-amber-500/20 hover:to-orange-500/20 transition-all group active:scale-[0.98]",
          copied && "border-green-500/50 from-green-500/10 via-green-500/10 to-green-500/10",
          className
        )}
      >
        <div
          className={cn(
            "flex items-center justify-center w-12 h-12 rounded-xl shrink-0 transition-colors",
            copied ? "bg-green-500/20" : "bg-orange-500/15 group-hover:bg-orange-500/25"
          )}
        >
          {copied ? (
            <Check className="w-6 h-6 text-green-400" />
          ) : (
            <UserPlus className="w-6 h-6 text-orange-400" />
          )}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p
            className={cn(
              "text-base font-bold transition-colors",
              copied ? "text-green-400" : "text-white group-hover:text-orange-400"
            )}
          >
            {copied ? "Invite Copied!" : "Invite a Friend"}
          </p>
          <p className="text-xs text-neutral-400">
            {username
              ? `Share your invite as @${username}`
              : "Send a link via text, social, or email"}
          </p>
        </div>
        <Share2
          className={cn(
            "w-5 h-5 shrink-0 transition-colors",
            copied ? "text-green-400" : "text-neutral-500 group-hover:text-orange-400"
          )}
          aria-hidden="true"
        />
      </button>
    );
  }

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
        {copied ? <Check className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
      </span>
      {size !== "icon" && <span className="ml-2">{copied ? "Copied!" : label}</span>}
    </Button>
  );
}
