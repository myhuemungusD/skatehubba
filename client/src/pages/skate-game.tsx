import { Swords } from "lucide-react";
import { ComingSoon } from "../components/ComingSoon";

export default function SkateGamePage() {
  return (
    <ComingSoon
      title="S.K.A.T.E. Arena"
      description="Live S.K.A.T.E. battles with real-time gameplay. Video upload, trick verification, and matchmaking coming soon."
      icon={
        <div className="w-20 h-20 rounded-full bg-orange-500/10 flex items-center justify-center">
          <Swords className="w-10 h-10 text-orange-500" />
        </div>
      }
    />
  );
}
