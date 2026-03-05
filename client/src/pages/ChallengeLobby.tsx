import { useCallback } from "react";
import { useLocation } from "wouter";
import { Swords, Send, Clock, TrendingUp, AlertCircle, Trophy, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMyGames, useRespondToGame, useCreateGame, useMyStats } from "@/hooks/useSkateGameApi";
import { GameCard, PlayerStats } from "@/components/game";
import { Button } from "@/components/ui/button";
import { UserSearch } from "@/components/UserSearch";
import { InviteButton } from "@/components/InviteButton";

export default function ChallengeLobby() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: myGames, isLoading, error: gamesError, refetch } = useMyGames();
  const { data: myStats } = useMyStats();
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
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Swords className="w-5 h-5 text-black" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">S.K.A.T.E. Lobby</h1>
            <p className="text-xs text-neutral-500">Challenge skaters. Accept battles.</p>
          </div>
        </div>
        <InviteButton size="sm" label="Invite" className="shrink-0" />
      </div>

      {/* Send Challenge — always visible regardless of API state */}
      <div className="rounded-xl border border-orange-500/20 bg-gradient-to-br from-orange-500/5 via-transparent to-amber-500/5 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Swords className="w-4 h-4 text-orange-400" />
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
            Send Challenge
          </h2>
        </div>
        <UserSearch onChallenge={handleCreateChallenge} isPending={createGame.isPending} />
      </div>

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

          {/* Stats */}
          {myStats && myStats.totalGames > 0 && (
            <section>
              <SectionHeader
                icon={<TrendingUp className="w-4 h-4 text-neutral-400" />}
                title="Your Stats"
              />
              <PlayerStats stats={myStats} />
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
