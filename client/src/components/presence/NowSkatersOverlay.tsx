import { useMemo, useState } from "react";
import { Eye, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { usePresenceNearby } from "@/features/presence/usePresenceNearby";
import { usePresenceHeartbeat } from "@/features/presence/usePresenceHeartbeat";

interface NowSkatersOverlayProps {
  location?: { lat: number; lng: number } | null;
}

export function NowSkatersOverlay({ location }: NowSkatersOverlayProps) {
  const { user } = useAuth();
  const isAnonymous = user?.isAnonymous ?? false;
  const { users } = usePresenceNearby({ location, radiusMiles: 10 });
  const presence = usePresenceHeartbeat({ location });
  const [showLayer, setShowLayer] = useState(true);

  const visibleUsers = useMemo(() => {
    if (!users.length) return [];
    return users.filter((entry) => entry.privacy !== "hidden");
  }, [users]);

  const countLabel = visibleUsers.length.toLocaleString();

  return (
    <Card className="absolute top-4 right-4 z-[1000] w-[min(320px,90vw)] border border-white/10 bg-black/60 text-white backdrop-blur p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-yellow-400">
          <Users className="h-4 w-4" />
          Skaters now
        </div>
        <Badge className="bg-yellow-500/20 text-yellow-300">{countLabel}</Badge>
      </div>

      <div className="flex items-center justify-between text-xs text-neutral-300">
        <span>Show “Now” layer</span>
        <Toggle
          pressed={showLayer}
          onPressedChange={setShowLayer}
          className="h-8 px-3 text-xs data-[state=on]:bg-yellow-500 data-[state=on]:text-black"
        >
          {showLayer ? "On" : "Off"}
        </Toggle>
      </div>

      <div className="flex items-center justify-between text-xs text-neutral-300">
        <span>Share presence</span>
        <Toggle
          pressed={presence.preferences.enabled}
          onPressedChange={presence.setEnabled}
          disabled={isAnonymous}
          className="h-8 px-3 text-xs data-[state=on]:bg-yellow-500 data-[state=on]:text-black"
        >
          {presence.preferences.enabled ? "On" : "Off"}
        </Toggle>
      </div>

      <div className="flex items-center justify-between text-xs text-neutral-300">
        <span>Privacy</span>
        <div className="flex gap-2">
          {(["public", "approximate", "hidden"] as const).map((privacy) => (
            <Button
              key={privacy}
              size="sm"
              variant={presence.preferences.privacy === privacy ? "default" : "outline"}
              disabled={isAnonymous}
              className={
                presence.preferences.privacy === privacy
                  ? "bg-yellow-500 text-black hover:bg-yellow-400"
                  : "border-white/10 text-neutral-300 hover:bg-white/10"
              }
              onClick={() => presence.setPrivacy(privacy)}
            >
              {privacy}
            </Button>
          ))}
        </div>
      </div>

      {!showLayer ? (
        <div className="rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-neutral-400">
          “Now” layer hidden.
        </div>
      ) : isAnonymous ? (
        <div className="rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-neutral-400">
          Ghost Mode hides skater identities. Sign in to see who’s out there.
        </div>
      ) : (
        <div className="max-h-48 overflow-auto space-y-2">
          {visibleUsers.length === 0 ? (
            <div className="text-xs text-neutral-400">No active skaters within range.</div>
          ) : (
            visibleUsers.map((skater) => (
              <div
                key={skater.uid}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-neutral-800" />
                  <div>
                    <div className="text-sm text-white">{skater.displayName}</div>
                    <div className="text-xs text-neutral-400">{skater.status}</div>
                  </div>
                </div>
                <Eye className="h-4 w-4 text-yellow-400" />
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}
