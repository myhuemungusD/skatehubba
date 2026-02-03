import { Swords } from "lucide-react";
import { ComingSoon } from "../components/ComingSoon";

export default function ChallengeLobby() {
  return (
    <ComingSoon
      title="S.K.A.T.E. Battles"
      description="Challenge other skaters to remote S.K.A.T.E. battles. Real-time matchmaking and video battles coming soon."
      icon={
        <div className="w-20 h-20 rounded-full bg-orange-500/10 flex items-center justify-center">
          <Swords className="w-10 h-10 text-orange-500" />
        </div>
      }
    />
  );
}
