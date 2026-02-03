import { Video } from "lucide-react";
import { ComingSoon } from "../components/ComingSoon";

export default function TrickMintPage() {
  return (
    <ComingSoon
      title="TrickMint"
      description="Upload your best tricks and mint them as NFTs. Video upload and trick verification coming soon."
      icon={
        <div className="w-20 h-20 rounded-full bg-orange-500/10 flex items-center justify-center">
          <Video className="w-10 h-10 text-orange-500" />
        </div>
      }
    />
  );
}
