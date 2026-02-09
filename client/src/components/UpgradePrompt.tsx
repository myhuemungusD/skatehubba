import { useState } from "react";
import { Lock, Crown, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { useAccountTier } from "../hooks/useAccountTier";
import { useToast } from "../hooks/use-toast";
import { apiRequest } from "../lib/api/client";

interface UpgradePromptProps {
  isOpen: boolean;
  onClose: () => void;
  feature?: string;
}

export function UpgradePrompt({ isOpen, onClose, feature }: UpgradePromptProps) {
  const { tier } = useAccountTier();
  const { toast } = useToast();
  const [isPurchasing, setIsPurchasing] = useState(false);

  if (tier === "pro" || tier === "premium") {
    return null;
  }

  const handlePurchase = async () => {
    setIsPurchasing(true);
    try {
      const idempotencyKey = `${Date.now()}-${crypto.randomUUID()}`;
      const { url } = await apiRequest<{ url: string }>({
        method: "POST",
        path: "/api/tier/create-checkout-session",
        body: { idempotencyKey },
      });

      if (url) {
        window.location.href = url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        duration: 5000,
      });
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-neutral-900 border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-center flex items-center justify-center gap-2">
            <Lock className="w-5 h-5 text-[#ff6a00]" />
            Unlock {feature || "This Feature"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <p className="text-gray-400 text-center text-sm">
            You're on the free plan. Upgrade to get the full SkateHubba experience.
          </p>

          {/* Premium Option */}
          <Card className="bg-gradient-to-br from-[#ff6a00]/20 to-orange-900/20 border-[#ff6a00] border-2">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-[#ff6a00] flex items-center justify-center">
                  <Crown className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-white">Premium</h3>
                  <p className="text-[#ff6a00] font-semibold">$9.99 one-time</p>
                </div>
              </div>
              <ul className="space-y-2 text-sm text-gray-300 mb-4">
                <li className="flex items-center gap-2">
                  <span className="text-[#ff6a00]">&#10003;</span> All features unlocked for life
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#ff6a00]">&#10003;</span> S.K.A.T.E. games
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#ff6a00]">&#10003;</span> Add spots, check-ins, ratings
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#ff6a00]">&#10003;</span> Post clips and media
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#ff6a00]">&#10003;</span> Award Pro to other skaters
                </li>
              </ul>
              <Button
                onClick={handlePurchase}
                disabled={isPurchasing}
                className="w-full bg-[#ff6a00] hover:bg-[#ff6a00]/90 text-white font-bold h-12 text-base"
              >
                {isPurchasing ? "Processing..." : "Get Premium - $9.99"}
              </Button>
            </CardContent>
          </Card>

          {/* Pro Option */}
          <Card className="bg-neutral-800 border-gray-600">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
                  <Users className="w-5 h-5 text-gray-300" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Pro</h3>
                  <p className="text-gray-400 text-sm">
                    Get vouched by a Pro or Premium skater. Like getting sponsored for real.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <p className="text-gray-500 text-xs text-center">
            Free users can still browse the map and explore spots.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
