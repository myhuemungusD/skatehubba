import { useState, useEffect } from 'react';
import { useSearch, useLocation } from 'wouter';
import { Swords, Clock, Trophy, Upload, Check, X, AlertCircle, ArrowLeft } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useGameState, useSubmitTurn, useJudgeTurn } from '@/hooks/useSkateGameApi';
import { LettersDisplay, TurnHistory } from '@/components/game';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LoadingScreen } from '@/components/LoadingScreen';
import { cn } from '@/lib/utils';

export default function SkateGamePage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const gameId = new URLSearchParams(search).get('gameId');

  const [trickDescription, setTrickDescription] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  const {
    game,
    turns,
    isLoading,
    error,
    isMyTurn,
    needsToJudge,
    pendingTurnId,
    myLetters,
    oppLetters,
    opponentName,
    isGameOver,
    iWon,
  } = useGameState(gameId, user?.uid);

  const submitTurn = useSubmitTurn();
  const judgeTurn = useJudgeTurn();

  const handleSubmitTurn = () => {
    if (!gameId || !trickDescription.trim() || !videoUrl.trim()) return;

    submitTurn.mutate(
      { gameId, trickDescription: trickDescription.trim(), videoUrl: videoUrl.trim() },
      {
        onSuccess: () => {
          setTrickDescription('');
          setVideoUrl('');
        },
      }
    );
  };

  const handleJudge = (result: 'landed' | 'missed') => {
    if (!gameId || !pendingTurnId) return;
    judgeTurn.mutate({ turnId: pendingTurnId, result, gameId });
  };

  const handleBackToLobby = () => {
    setLocation('/play?tab=lobby');
  };

  if (!gameId) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">No Game Selected</h2>
        <p className="text-sm text-neutral-400 mb-4">
          Select a game from the lobby to start playing
        </p>
        <Button onClick={handleBackToLobby}>Go to Lobby</Button>
      </div>
    );
  }

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (error || !game || !user) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Failed to Load Game</h2>
        <p className="text-sm text-neutral-400 mb-4">{error || 'Game not found'}</p>
        <Button onClick={handleBackToLobby}>Back to Lobby</Button>
      </div>
    );
  }

  const isPending = game.status === 'pending';
  const isActive = game.status === 'active';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={handleBackToLobby} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Lobby
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center">
          <Swords className="w-6 h-6 text-orange-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">S.K.A.T.E. Game</h1>
          <p className="text-sm text-neutral-400">
            {isPending && 'Waiting for opponent to accept'}
            {isActive && isMyTurn && 'Your turn'}
            {isActive && !isMyTurn && "Opponent's turn"}
            {isGameOver && (iWon ? 'You won! 🏆' : 'You lost')}
          </p>
        </div>
      </div>

      {game.deadlineAt && isActive && !isGameOver && (
        <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center gap-3">
          <Clock className="w-5 h-5 text-yellow-400" />
          <div>
            <div className="text-sm font-medium text-yellow-400">Turn Deadline</div>
            <div className="text-xs text-yellow-300">
              {formatDistanceToNow(new Date(game.deadlineAt), { addSuffix: true })}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <LettersDisplay
          letters={myLetters}
          playerName="You"
          isCurrentPlayer={isMyTurn}
          className="p-6 rounded-lg bg-neutral-800/50 border border-neutral-700"
        />
        <LettersDisplay
          letters={oppLetters}
          playerName={opponentName}
          isCurrentPlayer={!isMyTurn && isActive}
          className="p-6 rounded-lg bg-neutral-800/50 border border-neutral-700"
        />
      </div>

      {isGameOver && (
        <div
          className={cn(
            'p-6 rounded-lg border-2 text-center',
            iWon
              ? 'bg-green-500/10 border-green-500 text-green-400'
              : 'bg-red-500/10 border-red-500 text-red-400'
          )}
        >
          <Trophy className="w-12 h-12 mx-auto mb-3" />
          <h2 className="text-2xl font-bold mb-2">
            {iWon ? 'Victory! 🏆' : 'Game Over'}
          </h2>
          <p className="text-sm opacity-80">
            {iWon
              ? `${opponentName} has S.K.A.T.E.! You win!`
              : `You have S.K.A.T.E. ${opponentName} wins!`}
          </p>
        </div>
      )}

      {isActive && !isGameOver && isMyTurn && !needsToJudge && (
        <div className="p-6 rounded-lg bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30">
          <div className="flex items-center gap-2 mb-4">
            <Upload className="w-5 h-5 text-yellow-400" />
            <h2 className="text-lg font-semibold text-white">Submit Your Trick</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Trick Description
              </label>
              <Input
                placeholder="e.g., Kickflip, Heelflip, 360 Flip..."
                value={trickDescription}
                onChange={(e) => setTrickDescription(e.target.value)}
                className="bg-neutral-900 border-neutral-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Video URL
              </label>
              <Input
                placeholder="https://..."
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                className="bg-neutral-900 border-neutral-700"
              />
              <p className="text-xs text-neutral-500 mt-1">
                Upload your video to a platform and paste the URL here
              </p>
            </div>

            <Button
              onClick={handleSubmitTurn}
              disabled={!trickDescription.trim() || !videoUrl.trim() || submitTurn.isPending}
              className="w-full bg-yellow-500 hover:bg-yellow-600"
            >
              {submitTurn.isPending ? 'Submitting...' : 'Submit Trick'}
            </Button>
          </div>
        </div>
      )}

      {isActive && !isGameOver && needsToJudge && (
        <div className="p-6 rounded-lg bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30">
          <div className="flex items-center gap-2 mb-4">
            <Swords className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Judge {opponentName}'s Trick</h2>
          </div>

          {game.lastTrickDescription && (
            <div className="mb-4 p-4 rounded-lg bg-neutral-900 border border-neutral-700">
              <div className="text-sm text-neutral-400 mb-1">Trick:</div>
              <div className="text-white font-medium">{game.lastTrickDescription}</div>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={() => handleJudge('landed')}
              disabled={judgeTurn.isPending}
              className="flex-1 bg-green-500 hover:bg-green-600 gap-2"
            >
              <Check className="w-4 h-4" />
              Landed
            </Button>
            <Button
              onClick={() => handleJudge('missed')}
              disabled={judgeTurn.isPending}
              className="flex-1 bg-red-500 hover:bg-red-600 gap-2"
            >
              <X className="w-4 h-4" />
              Missed
            </Button>
          </div>
        </div>
      )}

      {isPending && (
        <div className="p-6 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-center">
          <Clock className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-white mb-2">Waiting for Opponent</h3>
          <p className="text-sm text-neutral-400">
            {opponentName} needs to accept your challenge
          </p>
        </div>
      )}

      <div>
        <h2 className="text-xl font-semibold text-white mb-4">Turn History</h2>
        <TurnHistory
          turns={turns || []}
          currentUserId={user.uid}
          onVideoClick={setSelectedVideo}
        />
      </div>

      {selectedVideo && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedVideo(null)}
        >
          <div
            className="bg-neutral-900 rounded-lg p-6 max-w-2xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Video Player</h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedVideo(null)}>
                Close
              </Button>
            </div>
            <div className="aspect-video bg-black rounded-lg flex items-center justify-center">
              <iframe
                src={selectedVideo}
                className="w-full h-full rounded-lg"
                allowFullScreen
                title="Trick video"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
