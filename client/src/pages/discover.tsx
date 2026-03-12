import { useCallback, useMemo } from "react";
import { Link } from "wouter";
import { Trophy, Clock, Sparkles, Swords, Zap, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserSearch } from "@/components/UserSearch";
import { useDiscoverUsers, type DiscoverUser } from "@/hooks/useDiscoverUsers";
import { useCreateGame } from "@/hooks/useSkateGameApi";
import { apiRequest } from "@/lib/api/client";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

/** Remove users from `list` that already appear in `seen`, then add them to `seen`. */
function deduplicateSection(list: DiscoverUser[], seen: Set<string>): DiscoverUser[] {
  const unique = list.filter((u) => !seen.has(u.id));
  for (const u of unique) seen.add(u.id);
  return unique;
}

export default function DiscoverPage() {
  const { data, isLoading, error, refetch } = useDiscoverUsers();
  const createGame = useCreateGame();
  const { toast } = useToast();
  const [isQuickMatching, setIsQuickMatching] = useState(false);

  // Deduplicate across sections so a user only appears once (top > recent > new priority)
  const sections = useMemo(() => {
    if (!data) return null;
    const seen = new Set<string>();
    return {
      topSkaters: deduplicateSection(data.topSkaters, seen),
      recentlyActive: deduplicateSection(data.recentlyActive, seen),
      newSkaters: deduplicateSection(data.newSkaters, seen),
    };
  }, [data]);

  const isBusy = isQuickMatching || createGame.isPending;

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
        toast({
          title: `Matched with ${result.match.opponentName}`,
          description: "Sending challenge...",
        });
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
          <Swords className="w-4 h-4 text-orange-400" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
            Search &amp; Challenge
          </h2>
        </div>
        <UserSearch onChallenge={handleChallenge} isPending={isBusy} />
      </div>

      {/* Quick Match */}
      <Button
        onClick={handleQuickMatch}
        disabled={isBusy}
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
        <div className="space-y-6" aria-busy="true" aria-label="Loading skaters">
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
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-neutral-300">Could not load skaters</p>
            <p className="text-xs text-neutral-500 truncate">{String(error)}</p>
          </div>
          <Button
            onClick={() => refetch()}
            variant="ghost"
            size="sm"
            className="text-orange-400 hover:text-orange-300 shrink-0"
          >
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Retry
          </Button>
        </div>
      )}

      {/* Discovery sections */}
      {sections && (
        <>
          {sections.topSkaters.length > 0 && (
            <SkaterSection
              icon={<Trophy className="w-4 h-4 text-yellow-400" />}
              title="Top Skaters"
              users={sections.topSkaters}
              onChallenge={handleChallenge}
              isChallengePending={isBusy}
            />
          )}

          {sections.recentlyActive.length > 0 && (
            <SkaterSection
              icon={<Clock className="w-4 h-4 text-green-400" />}
              title="Recently Active"
              users={sections.recentlyActive}
              onChallenge={handleChallenge}
              isChallengePending={isBusy}
            />
          )}

          {sections.newSkaters.length > 0 && (
            <SkaterSection
              icon={<Sparkles className="w-4 h-4 text-blue-400" />}
              title="New Skaters"
              users={sections.newSkaters}
              onChallenge={handleChallenge}
              isChallengePending={isBusy}
            />
          )}

          {sections.topSkaters.length === 0 &&
            sections.recentlyActive.length === 0 &&
            sections.newSkaters.length === 0 && (
              <div className="text-center py-16">
                <Swords className="w-10 h-10 text-neutral-600 mx-auto mb-3" aria-hidden="true" />
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
  const headingId = `discover-${title.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <section aria-labelledby={headingId}>
      <div className="flex items-center gap-2 mb-3">
        <span aria-hidden="true">{icon}</span>
        <h2 id={headingId} className="text-sm font-semibold text-white uppercase tracking-wide">
          {title}
        </h2>
        <span className="ml-auto text-xs text-neutral-500" aria-label={`${users.length} skaters`}>
          {users.length}
        </span>
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
        aria-label={`Challenge ${user.displayName}`}
        className="shrink-0 bg-orange-500 hover:bg-orange-600 text-black font-semibold h-9 px-3 text-xs min-w-[44px] min-h-[44px]"
      >
        <Swords className="h-3 w-3 mr-1.5" aria-hidden="true" />
        Challenge
      </Button>
    </div>
  );
}
