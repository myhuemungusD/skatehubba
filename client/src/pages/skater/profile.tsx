import { useEffect, useMemo } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChallengeButton } from "@/components/skater/ChallengeButton";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { UserProfile } from "@shared/schema";
import { Layers, Wrench, Circle, Footprints } from "lucide-react";

const CLOSET_CATEGORIES = [
  { label: "Decks", icon: Layers },
  { label: "Trucks", icon: Wrench },
  { label: "Wheels", icon: Circle },
  { label: "Shoes", icon: Footprints },
] as const;

export default function SkaterProfile() {
  const params = useParams();
  const handle = params.handle || "";
  const authContext = useAuth();
  const user = authContext?.user ?? null;
  const { toast } = useToast();

  const { data: profile, isLoading: profileLoading } = useQuery<UserProfile>({
    queryKey: ["/api/profiles", handle],
    enabled: !!handle,
  });

  useEffect(() => {
    if (!profileLoading && !profile) {
      toast({
        title: "Skater not found",
        description: `@${handle} isn't in the system yet.`,
        variant: "destructive",
      });
    }
  }, [profileLoading, profile, handle, toast]);

  const canChallenge = useMemo(() => {
    return !!(profile && user && profile.id !== user.uid);
  }, [profile, user]);

  if (profileLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pt-8">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pt-8">
        <Card className="bg-gray-900 border-gray-700 p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Profile Not Found</h2>
          <p className="text-neutral-400">@{handle} doesn't exist yet.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="text-white">
      {/* Header / hero */}
      <section className="mx-auto w-full max-w-6xl px-4 pt-8 md:pt-12">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="relative h-16 w-16 overflow-hidden rounded-full ring-2 ring-success/70">
              {profile.photoURL ? (
                <img
                  src={profile.photoURL}
                  alt={profile.displayName || handle}
                  className="h-full w-full object-cover"
                  data-testid="profile-avatar"
                />
              ) : (
                <div className="grid h-full w-full place-items-center bg-neutral-900 text-neutral-400 text-xl">
                  {profile.displayName?.charAt(0)?.toUpperCase() ?? "S"}
                </div>
              )}
            </div>
            <div>
              <h1
                className="text-2xl font-bold text-white tracking-tight"
                data-testid="profile-display-name"
              >
                {profile.displayName ?? handle}
              </h1>
              <p className="text-success/90" data-testid="profile-handle">
                @{handle}
              </p>
              <p className="text-sm text-neutral-300" data-testid="profile-stats">
                {profile.stance} {profile.homeSpot ? `· ${profile.homeSpot}` : ""}
              </p>
            </div>
          </div>

          {/* Challenge */}
          {canChallenge ? (
            <ChallengeButton challengedId={profile.id} challengedHandle={handle} />
          ) : (
            <Button variant="secondary" disabled className="opacity-60">
              {user ? "Your Profile" : "Sign in to Challenge"}
            </Button>
          )}
        </div>

        {/* Bio */}
        {profile.bio && (
          <p className="mt-4 max-w-3xl text-neutral-200" data-testid="profile-bio">
            {profile.bio}
          </p>
        )}
      </section>

      {/* Stats */}
      <section className="mx-auto w-full max-w-6xl px-4 pt-8">
        <h2 className="mb-4 text-lg font-semibold uppercase tracking-wide text-orange-400">
          S.K.A.T.E. Record
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="bg-neutral-900 border-neutral-700 p-4 text-center">
            <p className="text-2xl font-bold text-green-400">{profile.wins ?? 0}</p>
            <p className="text-xs text-neutral-400 uppercase tracking-wide">Wins</p>
          </Card>
          <Card className="bg-neutral-900 border-neutral-700 p-4 text-center">
            <p className="text-2xl font-bold text-red-400">{profile.losses ?? 0}</p>
            <p className="text-xs text-neutral-400 uppercase tracking-wide">Losses</p>
          </Card>
          <Card className="bg-neutral-900 border-neutral-700 p-4 text-center">
            <p className="text-2xl font-bold text-yellow-300">
              {(profile.wins ?? 0) + (profile.losses ?? 0) > 0
                ? `${Math.round(((profile.wins ?? 0) / ((profile.wins ?? 0) + (profile.losses ?? 0))) * 100)}%`
                : "0%"}
            </p>
            <p className="text-xs text-neutral-400 uppercase tracking-wide">Win Rate</p>
          </Card>
          <Card className="bg-neutral-900 border-neutral-700 p-4 text-center">
            <p className="text-2xl font-bold text-orange-400">{(profile.xp ?? 0).toLocaleString()}</p>
            <p className="text-xs text-neutral-400 uppercase tracking-wide">XP</p>
          </Card>
        </div>
      </section>

      {/* Closet */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-24 pt-8">
        <h2 className="mb-4 text-lg font-semibold uppercase tracking-wide text-orange-400">
          Closet
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CLOSET_CATEGORIES.map(({ label, icon: Icon }) => (
            <Card
              key={label}
              className="bg-neutral-900 border-neutral-700 p-6 flex flex-col items-center gap-2 text-center"
            >
              <Icon className="w-8 h-8 text-neutral-600" />
              <p className="text-sm font-medium text-neutral-300">{label}</p>
              <p className="text-xs text-neutral-600">None yet</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Footer brand strip */}
      <footer className="border-t border-white/10 bg-black/30">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 text-sm text-neutral-300">
          <span>SkateHubba Own the Spot.</span>
          <span> Design Mainline LLC</span>
        </div>
      </footer>
    </div>
  );
}
