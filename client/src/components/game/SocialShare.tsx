import { useState } from "react";
import { Share2, Copy, Check, Twitter, Facebook, MessageCircle } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface SocialShareProps {
  gameId: string;
  playerOne: string;
  playerTwo: string;
  thumbnailUrl?: string;
  result?: string;
  className?: string;
}

/**
 * Social sharing component for S.K.A.T.E. game clips
 * Supports Twitter, Facebook, WhatsApp, and direct link copying
 */
export function SocialShare({
  gameId,
  playerOne,
  playerTwo,
  thumbnailUrl,
  result,
  className,
}: SocialShareProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const shareUrl = `https://skatehubba.com/play?game=${gameId}`;
  const shareText = result
    ? `🛹 ${result} in S.K.A.T.E. battle: ${playerOne} vs ${playerTwo} on SkateHubba!`
    : `🛹 Watch ${playerOne} vs ${playerTwo} battle it out in S.K.A.T.E. on SkateHubba!`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({
        title: "Link copied!",
        description: "Share this link with your crew",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Failed to copy",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const handleShare = (platform: "twitter" | "facebook" | "whatsapp") => {
    let url = "";

    switch (platform) {
      case "twitter":
        url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}&hashtags=skateboarding,SKATE,SkateHubba`;
        break;
      case "facebook":
        url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`;
        break;
      case "whatsapp":
        url = `https://wa.me/?text=${encodeURIComponent(shareText + " " + shareUrl)}`;
        break;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `${playerOne} vs ${playerTwo} - S.K.A.T.E. Battle`,
          text: shareText,
          url: shareUrl,
        });
        toast({
          title: "Shared successfully!",
          description: "Thanks for spreading the word",
        });
      } catch (error) {
        // User cancelled or share failed
        if ((error as Error).name !== "AbortError") {
          console.error("Share failed:", error);
        }
      }
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-2 border-gray-600 text-gray-300 hover:bg-gray-700", className)}
          data-testid="button-share-game"
        >
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-neutral-900 border-neutral-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#fafafa]">Share This Battle</DialogTitle>
          <DialogDescription className="text-gray-300">
            Show your crew this epic S.K.A.T.E. battle
          </DialogDescription>
        </DialogHeader>

        {/* Preview Card */}
        <div className="rounded-lg border border-neutral-800 bg-black/40 p-4 mb-4">
          {thumbnailUrl && (
            <div className="aspect-video bg-gray-800 rounded-md mb-3 overflow-hidden">
              <img src={thumbnailUrl} alt="Game preview" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="text-sm">
            <p className="font-semibold text-[#fafafa] mb-1">
              {playerOne} vs {playerTwo}
            </p>
            <p className="text-gray-400 text-xs">S.K.A.T.E. Battle on SkateHubba</p>
          </div>
        </div>

        {/* Share Buttons */}
        <div className="space-y-3">
          {/* Native Share (Mobile) */}
          {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
            <Button
              onClick={handleNativeShare}
              className="w-full bg-orange-400 text-black hover:bg-orange-500 font-semibold"
              data-testid="button-native-share"
            >
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
          )}

          {/* Social Media Buttons */}
          <div className="grid grid-cols-3 gap-3">
            <Button
              onClick={() => handleShare("twitter")}
              variant="outline"
              className="border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400"
              data-testid="button-share-twitter"
            >
              <Twitter className="h-4 w-4 mr-2" />
              Twitter
            </Button>
            <Button
              onClick={() => handleShare("facebook")}
              variant="outline"
              className="border-blue-600/30 bg-blue-600/10 hover:bg-blue-600/20 text-blue-300"
              data-testid="button-share-facebook"
            >
              <Facebook className="h-4 w-4 mr-2" />
              Facebook
            </Button>
            <Button
              onClick={() => handleShare("whatsapp")}
              variant="outline"
              className="border-green-500/30 bg-green-500/10 hover:bg-green-500/20 text-green-400"
              data-testid="button-share-whatsapp"
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              WhatsApp
            </Button>
          </div>

          {/* Copy Link */}
          <div className="space-y-2">
            <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">
              Or copy link
            </label>
            <div className="flex gap-2">
              <div className="flex-1 bg-black/60 border border-neutral-800 rounded-md px-3 py-2 text-sm text-gray-300 truncate">
                {shareUrl}
              </div>
              <Button
                onClick={handleCopyLink}
                variant="outline"
                size="sm"
                className="border-orange-400/50 text-orange-400 hover:bg-orange-400/20 shrink-0"
                data-testid="button-copy-link"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Share Stats (Optional) */}
        <div className="pt-3 border-t border-neutral-800">
          <p className="text-xs text-gray-500 text-center">
            Help grow the community by sharing epic battles
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
