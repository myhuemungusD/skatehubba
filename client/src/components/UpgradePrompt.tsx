import { Lock, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Card, CardContent } from "./ui/card";
import { useAccountTier } from "../hooks/useAccountTier";

interface UpgradePromptProps {
  isOpen: boolean;
  onClose: () => void;
  feature?: string;
}

export function UpgradePrompt({ isOpen, onClose, feature }: UpgradePromptProps) {
  const { tier } = useAccountTier();

  if (tier === "pro" || tier === "premium") {
    return null;
  }

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
            You're on the free plan. Get vouched by a Pro skater to unlock the full SkateHubba
            experience.
          </p>

          {/* Pro Option */}
          <Card className="bg-gradient-to-br from-[#ff6a00]/20 to-orange-900/20 border-[#ff6a00] border-2">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-[#ff6a00] flex items-center justify-center">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-white">Go Pro</h3>
                  <p className="text-[#ff6a00] font-semibold">Vouched by a Pro skater</p>
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
              <p className="text-gray-400 text-sm text-center">
                Like getting sponsored for real. Find a Pro skater to vouch for you.
              </p>
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
