import { useCallback } from "react";
import { Link, useLocation } from "wouter";
import { Swords, Send, Clock, AlertCircle, Trophy, RefreshCw, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMyGames, useRespondToGame, useCreateGame, useMyStats } from "@/hooks/useSkateGameApi";
import { GameCard, PlayerStats } from "@/components/game";
import { Button } from "@/components/ui/button";
import { UserSearch } from "@/components/UserSearch";
import { InviteButton } from "@/components/InviteButton";
import {
  useRealtimeLeaderboard,
  type LeaderboardEntry,
} from "@/features/leaderboard/useRealtimeLeaderboard";

export default function ChallengeLobby() {
  const { user, profile } = useAuth();
  const [, setLocation] = useLocation();

  const { data: myGames, isLoading, error: gamesError, refetch } = useMyGames();
  const { data: myStats, isLoading: isStatsLoading, error: statsError } = useMyStats();
  const respondToGame = useRespondToGame();
  const createGame = useCreateGame();

  const handleAcceptChallenge = useCallback(
    (gameId: string) => {
      respondToGame.mutate({ gameId, accept: true });
    },
    [respondToGame]
  );

  const handleDeclineChallenge = useCallback(
    (gameId: string) => {
      respondToGame.mutate({ gameId, accept: false });
    },
    [respondToGame]
  );

  const handleCreateChallenge = useCallback(
    (opponentId: string) => {
      createGame.mutate(opponentId);
    },
    [createGame]
  );

  const handleViewGame = useCallback(
    (gameId: string) => {
      setLocation(`/play?gameId=${gameId}`);
    },
    [setLocation]
  );

  return (
    <div className="space-y-8">
      {/* Search + Challenge */}
      <div className="rounded-xl border border-orange-500/20 bg-gradient-to-br from-orange-500/5 via-transparent to-amber-500/5 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Swords className="w-4 h-4 text-orange-400" />
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
            Send Challenge
          </h2>
        </div>
        <UserSearch onChallenge={handleCreateChallenge} isPending={createGame.isPending} />
      </div>

      {/* Profile + Win/Loss Record */}
      {user && (
        <section className="rounded-xl border border-neutral-700/30 bg-neutral-800/30 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-neutral-700 flex items-center justify-center overflow-hidden shrink-0">
              {profile?.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.username || "Profile"}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-6 h-6 text-neutral-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-white truncate">
                {user.displayName || profile?.username || "Skater"}
              </h2>
              {profile?.username && (
                <Link
                  href={`/skater/${profile.username}`}
                  className="text-sm text-yellow-400 hover:text-yellow-300 transition-colors"
                >
                  @{profile.username}
                </Link>
              )}
            </div>
            <InviteButton size="sm" label="Invite" className="shrink-0" />
          </div>
          {myStats && <PlayerStats stats={myStats} />}
          {!myStats && isStatsLoading && (
            <div className="py-3 animate-pulse">
              <div className="h-4 bg-neutral-700/50 rounded w-1/2 mx-auto" />
            </div>
          )}
          {!myStats && !isStatsLoading && statsError && (
            <p className="text-sm text-neutral-500 text-center py-2">
              Could not load your stats. Pull to refresh.
            </p>
          )}
          {!myStats && !isStatsLoading && !statsError && (
            <p className="text-sm text-neutral-500 text-center py-2">
              No games played yet. Challenge someone to get started!
            </p>
          )}
        </section>
      )}

      {/* Rankings */}
      <CompactLeaderboard
        currentUserId={user?.uid}
        onChallenge={handleCreateChallenge}
        isChallengePending={createGame.isPending}
      />

      {/* API error banner — non-blocking, shows inline with retry */}
      {gamesError && (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-orange-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-neutral-300">Could not load your games</p>
            <p className="text-xs text-neutral-500 truncate">{String(gamesError)}</p>
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

      {/* Loading skeleton for games list */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-neutral-700/30 bg-neutral-800/30 p-4 animate-pulse"
            >
              <div className="h-4 bg-neutral-700/50 rounded w-2/3 mb-2" />
              <div className="h-3 bg-neutral-700/30 rounded w-1/3" />
            </div>
          ))}
        </div>
      )}

      {/* Game sections — only render when data is available */}
      {myGames && user && (
        <>
          {/* Active Games — top priority */}
          {myGames.activeGames.length > 0 && (
            <section>
              <SectionHeader
                icon={<Swords className="w-4 h-4 text-green-400" />}
                title="Active Games"
                count={myGames.activeGames.length}
                accentColor="green"
              />
              <div className="space-y-2">
                {myGames.activeGames.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    currentUserId={user.uid}
                    onClick={() => handleViewGame(game.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Pending Challenges — need action */}
          {myGames.pendingChallenges.length > 0 && (
            <section>
              <SectionHeader
                icon={<Clock className="w-4 h-4 text-yellow-400" />}
                title="Incoming Challenges"
                count={myGames.pendingChallenges.length}
                accentColor="yellow"
              />
              <div className="space-y-2">
                {myGames.pendingChallenges.map((game) => (
                  <div
                    key={game.id}
                    className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3"
                  >
                    <GameCard
                      game={game}
                      currentUserId={user.uid}
                      onClick={() => handleViewGame(game.id)}
                    />
                    <div className="flex gap-2 mt-3 pt-3 border-t border-yellow-500/10">
                      <Button
                        onClick={() => handleAcceptChallenge(game.id)}
                        disabled={respondToGame.isPending}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold"
                        size="sm"
                      >
                        Accept
                      </Button>
                      <Button
                        onClick={() => handleDeclineChallenge(game.id)}
                        disabled={respondToGame.isPending}
                        variant="ghost"
                        size="sm"
                        className="flex-1 text-neutral-400 hover:text-white"
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Sent Challenges — waiting */}
          {myGames.sentChallenges.length > 0 && (
            <section>
              <SectionHeader
                icon={<Send className="w-4 h-4 text-blue-400" />}
                title="Sent Challenges"
                count={myGames.sentChallenges.length}
                accentColor="blue"
              />
              <div className="space-y-2">
                {myGames.sentChallenges.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    currentUserId={user.uid}
                    onClick={() => handleViewGame(game.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Recent Games */}
          {myGames.completedGames.length > 0 && (
            <section>
              <SectionHeader
                icon={<Trophy className="w-4 h-4 text-neutral-500" />}
                title="Recent Games"
              />
              <div className="space-y-2">
                {myGames.completedGames.slice(0, 5).map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    currentUserId={user.uid}
                    onClick={() => handleViewGame(game.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Empty state — only when data loaded successfully with no games */}
          {myGames.pendingChallenges.length +
            myGames.sentChallenges.length +
            myGames.activeGames.length ===
            0 &&
            !myStats?.totalGames && (
              <div className="text-center py-16">
                <div className="w-20 h-20 rounded-2xl bg-neutral-800/50 flex items-center justify-center mx-auto mb-5 border border-neutral-700/50">
                  <Swords className="w-9 h-9 text-neutral-600" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-1">No Games Yet</h3>
                <p className="text-sm text-neutral-500 mb-6 max-w-xs mx-auto">
                  Search for a skater above to send your first challenge, or invite your crew to
                  join.
                </p>
                <InviteButton
                  variant="default"
                  label="Invite Friends"
                  className="bg-gradient-to-r from-orange-500 to-amber-500 text-black font-bold hover:from-orange-600 hover:to-amber-600 shadow-lg shadow-orange-500/25"
                />
              </div>
            )}
        </>
      )}

      {/* No data and no error — first-time empty state */}
      {!myGames && !gamesError && !isLoading && (
        <div className="text-center py-16">
          <div className="w-20 h-20 rounded-2xl bg-neutral-800/50 flex items-center justify-center mx-auto mb-5 border border-neutral-700/50">
            <Swords className="w-9 h-9 text-neutral-600" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">Ready to Play</h3>
          <p className="text-sm text-neutral-500 mb-6 max-w-xs mx-auto">
            Search for a skater above to send your first S.K.A.T.E. challenge.
          </p>
          <InviteButton
            variant="default"
            label="Invite Friends"
            className="bg-gradient-to-r from-orange-500 to-amber-500 text-black font-bold hover:from-orange-600 hover:to-amber-600 shadow-lg shadow-orange-500/25"
          />
        </div>
      )}
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  count,
  accentColor,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  accentColor?: string;
}) {
  const badgeColors: Record<string, string> = {
    green: "bg-green-500/15 text-green-400",
    yellow: "bg-yellow-500/15 text-yellow-400",
    blue: "bg-blue-500/15 text-blue-400",
  };

  return (
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <h2 className="text-sm font-semibold text-white uppercase tracking-wide">{title}</h2>
      {count !== undefined && count > 0 && (
        <span
          className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${
            accentColor && badgeColors[accentColor]
              ? badgeColors[accentColor]
              : "bg-neutral-700 text-neutral-300"
          }`}
        >
          {count}
        </span>
      )}
    </div>
  );
}

function CompactLeaderboard({
  currentUserId,
  onChallenge,
  isChallengePending,
}: {
  currentUserId?: string;
  onChallenge: (userId: string) => void;
  isChallengePending?: boolean;
}) {
  const { entries, isLoading } = useRealtimeLeaderboard();

  if (isLoading) {
    return (
      <section>
        <SectionHeader icon={<Trophy className="w-4 h-4 text-yellow-400" />} title="Rankings" />
        <div className="text-sm text-neutral-500 py-4 text-center">Loading rankings...</div>
      </section>
    );
  }

  if (entries.length === 0) {
    return (
      <section>
        <SectionHeader icon={<Trophy className="w-4 h-4 text-yellow-400" />} title="Rankings" />
        <div className="text-sm text-neutral-500 py-4 text-center">
          No rankings yet. Challenge someone to start climbing.
        </div>
      </section>
    );
  }

  return (
    <section>
      <SectionHeader icon={<Trophy className="w-4 h-4 text-yellow-400" />} title="Rankings" />
      <div className="space-y-2">
        {entries.slice(0, 10).map((entry: LeaderboardEntry, idx: number) => {
          const isMe = currentUserId === entry.id;
          return (
            <div
              key={entry.id}
              className={`flex items-center justify-between p-3 rounded-lg bg-neutral-800/50 border ${isMe ? "border-orange-500/30" : "border-neutral-700"}`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="text-sm font-bold text-yellow-400 w-6 text-center shrink-0">
                  #{entry.rank ?? idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  {entry.username ? (
                    <Link
                      href={`/skater/${entry.username}`}
                      className="text-sm font-medium text-white hover:text-yellow-400 transition-colors truncate block"
                    >
                      {entry.displayName}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium text-white truncate block">
                      {entry.displayName}
                    </span>
                  )}
                  <span className="text-xs text-neutral-500">
                    {entry.wins}W - {entry.losses}L
                  </span>
                </div>
              </div>
              {currentUserId && !isMe && (
                <Button
                  size="sm"
                  onClick={() => onChallenge(entry.id)}
                  disabled={isChallengePending}
                  className="shrink-0 ml-2 bg-orange-500 hover:bg-orange-600 text-black font-semibold h-7 px-2.5 text-xs"
                >
                  <Swords className="h-3 w-3 mr-1" />
                  Challenge
                </Button>
              )}
              {isMe && (
                <span className="text-xs text-orange-400 font-medium shrink-0 ml-2">You</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
