import { useCallback } from "react";
import { Link } from "wouter";
import { Trophy, Clock, Sparkles, Swords, Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserSearch } from "@/components/UserSearch";
import { useDiscoverUsers, type DiscoverUser } from "@/hooks/useDiscoverUsers";
import { useCreateGame } from "@/hooks/useSkateGameApi";
import { apiRequest } from "@/lib/api/client";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export default function DiscoverPage() {
  const { data, isLoading, error } = useDiscoverUsers();
  const createGame = useCreateGame();
  const { toast } = useToast();
  const [isQuickMatching, setIsQuickMatching] = useState(false);

  const handleChallenge = useCallback(
    (opponentId: string) => {
      createGame.mutate(opponentId);
    },
    [createGame]
  );

  const handleQuickMatch = useCallback(async () => {
    setIsQuickMatching(true);
    try {
      const result = await apiRequest<{
        success: boolean;
        match: { opponentId: string; opponentName: string };
      }>({
        method: "POST",
        path: "/api/matchmaking/quick-match",
        body: {},
      });
      if (result.success) {
        createGame.mutate(result.match.opponentId);
      }
    } catch {
      toast({
        title: "No opponents available",
        description: "Try again later.",
        variant: "destructive",
      });
    } finally {
      setIsQuickMatching(false);
    }
  }, [createGame, toast]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Find Skaters</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Search, discover, and challenge other skaters
        </p>
      </div>

      {/* Search */}
      <div className="rounded-xl border border-orange-500/20 bg-gradient-to-br from-orange-500/5 via-transparent to-amber-500/5 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Swords className="w-4 h-4 text-orange-400" />
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
            Search &amp; Challenge
          </h2>
        </div>
        <UserSearch onChallenge={handleChallenge} isPending={createGame.isPending} />
      </div>

      {/* Quick Match */}
      <Button
        onClick={handleQuickMatch}
        disabled={isQuickMatching || createGame.isPending}
        className="w-full h-12 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold text-sm"
      >
        {isQuickMatching ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Zap className="h-4 w-4 mr-2" />
        )}
        {isQuickMatching ? "Finding opponent..." : "Quick Match — Random Opponent"}
      </Button>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <div className="h-4 bg-neutral-700/50 rounded w-32 mb-3" />
              <div className="space-y-2">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="h-16 bg-neutral-800/30 rounded-lg animate-pulse" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="text-center py-8">
          <p className="text-sm text-neutral-400">Could not load skaters. Try refreshing.</p>
        </div>
      )}

      {/* Discovery sections */}
      {data && (
        <>
          {data.topSkaters.length > 0 && (
            <SkaterSection
              icon={<Trophy className="w-4 h-4 text-yellow-400" />}
              title="Top Skaters"
              users={data.topSkaters}
              onChallenge={handleChallenge}
              isChallengePending={createGame.isPending}
            />
          )}

          {data.recentlyActive.length > 0 && (
            <SkaterSection
              icon={<Clock className="w-4 h-4 text-green-400" />}
              title="Recently Active"
              users={data.recentlyActive}
              onChallenge={handleChallenge}
              isChallengePending={createGame.isPending}
            />
          )}

          {data.newSkaters.length > 0 && (
            <SkaterSection
              icon={<Sparkles className="w-4 h-4 text-blue-400" />}
              title="New Skaters"
              users={data.newSkaters}
              onChallenge={handleChallenge}
              isChallengePending={createGame.isPending}
            />
          )}

          {data.topSkaters.length === 0 &&
            data.recentlyActive.length === 0 &&
            data.newSkaters.length === 0 && (
              <div className="text-center py-16">
                <Swords className="w-10 h-10 text-neutral-600 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-white mb-1">No skaters yet</h3>
                <p className="text-sm text-neutral-500">Be the first to invite your crew.</p>
              </div>
            )}
        </>
      )}
    </div>
  );
}

const AVATAR_COLORS = [
  "from-orange-500 to-amber-500",
  "from-blue-500 to-cyan-500",
  "from-green-500 to-emerald-500",
  "from-purple-500 to-pink-500",
  "from-red-500 to-rose-500",
];

function SkaterSection({
  icon,
  title,
  users,
  onChallenge,
  isChallengePending,
}: {
  icon: React.ReactNode;
  title: string;
  users: DiscoverUser[];
  onChallenge: (userId: string) => void;
  isChallengePending: boolean;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="text-sm font-semibold text-white uppercase tracking-wide">{title}</h2>
        <span className="ml-auto text-xs text-neutral-500">{users.length}</span>
      </div>
      <div className="space-y-2">
        {users.map((user) => (
          <SkaterCard
            key={user.id}
            user={user}
            onChallenge={onChallenge}
            isChallengePending={isChallengePending}
          />
        ))}
      </div>
    </section>
  );
}

function SkaterCard({
  user,
  onChallenge,
  isChallengePending,
}: {
  user: DiscoverUser;
  onChallenge: (userId: string) => void;
  isChallengePending: boolean;
}) {
  const colorIdx = user.id.charCodeAt(0) % AVATAR_COLORS.length;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-neutral-800/50 border border-neutral-700/50 hover:border-neutral-600 transition-colors">
      {/* Avatar */}
      <div
        className={`w-10 h-10 rounded-full bg-gradient-to-br ${AVATAR_COLORS[colorIdx]} flex items-center justify-center text-sm font-bold text-white shrink-0`}
      >
        {user.displayName.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <Link
          href={`/skater/${user.handle}`}
          className="text-sm font-medium text-white hover:text-yellow-400 transition-colors truncate block"
        >
          {user.displayName}
        </Link>
        <p className="text-xs text-neutral-500 truncate">
          @{user.handle}
          {user.stance && ` · ${user.stance}`}
          {user.wins + user.losses > 0 ? ` · ${user.wins}W-${user.losses}L` : " · New"}
        </p>
      </div>

      {/* Challenge button */}
      <Button
        size="sm"
        onClick={() => onChallenge(user.id)}
        disabled={isChallengePending}
        className="shrink-0 bg-orange-500 hover:bg-orange-600 text-black font-semibold h-9 px-3 text-xs min-w-[44px] min-h-[44px]"
      >
        <Swords className="h-3 w-3 mr-1.5" />
        Challenge
      </Button>
    </div>
  );
}
