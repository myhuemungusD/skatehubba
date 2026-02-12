import { useState } from 'react';
import { useLocation } from 'wouter';
import { Swords, Plus, Users, Clock, TrendingUp } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useMyGames, useRespondToGame, useCreateGame } from '@/hooks/useSkateGameApi';
import { GameCard } from '@/components/game';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingScreen } from '@/components/LoadingScreen';

export default function ChallengeLobby() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [challengeUserId, setChallengeUserId] = useState('');

  const { data: myGames, isLoading } = useMyGames();
  const respondToGame = useRespondToGame();
  const createGame = useCreateGame();

  const handleAcceptChallenge = (gameId: string) => {
    respondToGame.mutate({ gameId, accept: true });
  };

  const handleDeclineChallenge = (gameId: string) => {
    respondToGame.mutate({ gameId, accept: false });
  };

  const handleCreateChallenge = () => {
    if (!challengeUserId.trim()) return;
    createGame.mutate(challengeUserId.trim(), {
      onSuccess: () => {
        setChallengeUserId('');
      },
    });
  };

  const handleViewGame = (gameId: string) => {
    setLocation(`/play?tab=active&gameId=${gameId}`);
  };

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!myGames || !user) {
    return (
      <div className="text-center py-12">
        <p className="text-neutral-400">Failed to load games</p>
      </div>
    );
  }

  const totalGames =
    myGames.pendingChallenges.length + myGames.sentChallenges.length + myGames.activeGames.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center">
          <Swords className="w-6 h-6 text-orange-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">S.K.A.T.E. Lobby</h1>
          <p className="text-sm text-neutral-400">Challenge skaters or accept incoming battles</p>
        </div>
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

      <div className="p-6 rounded-lg bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border border-orange-500/30">
        <div className="flex items-start gap-3 mb-4">
          <Plus className="w-5 h-5 text-orange-400 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">Create New Challenge</h2>
            <p className="text-sm text-neutral-400">
              Enter a player's user ID to challenge them to a game
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Player User ID"
            value={challengeUserId}
            onChange={(e) => setChallengeUserId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreateChallenge();
              }
            }}
            className="flex-1 bg-neutral-900 border-neutral-700"
          />
          <Button
            onClick={handleCreateChallenge}
            disabled={!challengeUserId.trim() || createGame.isPending}
            className="bg-orange-500 hover:bg-orange-600"
          >
            {createGame.isPending ? 'Sending...' : 'Challenge'}
          </Button>
        </div>
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
              <div key={game.id} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
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
          <p className="text-sm text-neutral-400">
            Create your first challenge to start playing S.K.A.T.E.!
          </p>
        </div>
      )}
    </div>
  );
}
