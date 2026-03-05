import { useCallback } from "react";
import { useLocation } from "wouter";
import { Swords, Users, Clock, TrendingUp, AlertCircle, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMyGames, useRespondToGame, useCreateGame, useMyStats } from "@/hooks/useSkateGameApi";
import { GameCard, PlayerStats } from "@/components/game";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/LoadingScreen";
import { UserSearch } from "@/components/UserSearch";
import { InviteButton } from "@/components/InviteButton";

export default function ChallengeLobby() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: myGames, isLoading, error: gamesError } = useMyGames();
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

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (gamesError || !user) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Failed to Load</h2>
        <p className="text-sm text-neutral-400">
          {gamesError ? String(gamesError) : "Please sign in to view games"}
        </p>
      </div>
    );
  }

  if (!myGames) {
    return <LoadingScreen />;
  }

  const totalGames =
    myGames.pendingChallenges.length + myGames.sentChallenges.length + myGames.activeGames.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center">
            <Swords className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">S.K.A.T.E. Lobby</h1>
            <p className="text-sm text-neutral-400">Challenge skaters or accept incoming battles</p>
          </div>
        </div>
        <InviteButton label="Invite Skater" className="shrink-0" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-neutral-800/50 border border-neutral-700">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-neutral-400">Pending</span>
          </div>
          <div className="text-2xl font-bold text-white">{myGames.pendingChallenges.length}</div>
        </div>

        <div className="p-4 rounded-lg bg-neutral-800/50 border border-neutral-700">
          <div className="flex items-center gap-2 mb-2">
            <Swords className="w-4 h-4 text-green-400" />
            <span className="text-sm text-neutral-400">Active</span>
          </div>
          <div className="text-2xl font-bold text-white">{myGames.activeGames.length}</div>
        </div>

        <div className="p-4 rounded-lg bg-neutral-800/50 border border-neutral-700">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-neutral-400">Total</span>
          </div>
          <div className="text-2xl font-bold text-white">{totalGames}</div>
        </div>
      </div>

      {/* Player Stats — your game history IS your reputation */}
      {myStats && myStats.totalGames > 0 && <PlayerStats stats={myStats} />}

      <div className="p-6 rounded-lg bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border border-orange-500/30">
        <div className="flex items-start gap-3 mb-4">
          <Search className="w-5 h-5 text-orange-400 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">Send Challenge</h2>
            <p className="text-sm text-neutral-400">
              Search for a skater and challenge them to S.K.A.T.E.
            </p>
          </div>
        </div>

        <UserSearch onChallenge={handleCreateChallenge} isPending={createGame.isPending} />
      </div>

      {myGames.pendingChallenges.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-yellow-400" />
            <h2 className="text-xl font-semibold text-white">Pending Challenges</h2>
            <span className="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-medium">
              {myGames.pendingChallenges.length}
            </span>
          </div>

          <div className="space-y-3">
            {myGames.pendingChallenges.map((game) => (
              <div
                key={game.id}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
              >
                <GameCard
                  game={game}
                  currentUserId={user.uid}
                  onClick={() => handleViewGame(game.id)}
                  className="flex-1"
                />
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <Button
                    onClick={() => handleAcceptChallenge(game.id)}
                    disabled={respondToGame.isPending}
                    className="flex-1 sm:flex-none bg-green-500 hover:bg-green-600"
                    size="sm"
                  >
                    Accept
                  </Button>
                  <Button
                    onClick={() => handleDeclineChallenge(game.id)}
                    disabled={respondToGame.isPending}
                    variant="outline"
                    size="sm"
                    className="flex-1 sm:flex-none"
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {myGames.sentChallenges.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-semibold text-white">Sent Challenges</h2>
            <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-medium">
              {myGames.sentChallenges.length}
            </span>
          </div>

          <div className="space-y-3">
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

      {myGames.activeGames.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Swords className="w-5 h-5 text-green-400" />
            <h2 className="text-xl font-semibold text-white">Active Games</h2>
            <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
              {myGames.activeGames.length}
            </span>
          </div>

          <div className="space-y-3">
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

      {myGames.completedGames.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-neutral-400" />
            <h2 className="text-xl font-semibold text-white">Recent Games</h2>
          </div>

          <div className="space-y-3">
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

      {totalGames === 0 && (
        <div className="text-center py-12">
          <div className="w-20 h-20 rounded-full bg-neutral-800/50 flex items-center justify-center mx-auto mb-4">
            <Swords className="w-10 h-10 text-neutral-600" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No Games Yet</h3>
          <p className="text-sm text-neutral-400 mb-4">
            Search for a skater above or invite your friends to play S.K.A.T.E.
          </p>
          <InviteButton label="Invite Friends" className="bg-orange-500 hover:bg-orange-600 text-black font-bold" variant="default" />
        </div>
      )}
    </div>
  );
}
