/**
 * S.K.A.T.E. Game Page
 *
 * Async, turn-based game view. No retries. No safety nets. Final.
 *
 * Orchestrates game phase components based on turn phase:
 * - set_trick: Offensive player records a trick video
 * - respond_trick: Defensive player watches + records response
 * - judge: Defensive player judges LAND or BAIL
 * - game over: Locked permanently
 */

import { useState, useCallback } from "react";
import { useSearch, useLocation } from "wouter";
import { AlertCircle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import {
  useGameState,
  useSubmitTurn,
  useJudgeTurn,
  useFileDispute,
  useResolveDispute,
  useForfeitGame,
  useSetterBail,
  useCreateGame,
} from "@/hooks/useSkateGameApi";
import {
  LettersDisplay,
  TurnHistory,
  GameStatusHeader,
  GameOverScreen,
  SetTrickPhase,
  RespondTrickPhase,
  JudgePhase,
  DisputesSection,
  VideoPlayerModal,
} from "@/components/game";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useGameVideoUpload } from "@/hooks/useGameVideoUpload";

export default function SkateGamePage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const gameId = new URLSearchParams(search).get("gameId");

  const [trickDescription, setTrickDescription] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  const {
    game,
    turns,
    disputes,
    isLoading,
    error,
    isMyTurn,
    needsToJudge,
    pendingTurnId,
    canDispute,
    myLetters,
    oppLetters,
    opponentName,
    isGameOver,
    iWon,
    turnPhase,
    isOffensive,
    isDefensive,
  } = useGameState(gameId, user?.uid);

  const submitTurn = useSubmitTurn();
  const judgeTurn = useJudgeTurn();
  const fileDispute = useFileDispute();
  const resolveDispute = useResolveDispute();
  const forfeitGame = useForfeitGame();
  const setterBailMutation = useSetterBail();
  const createGame = useCreateGame();

  const { handleRecordingComplete, isUploading } = useGameVideoUpload({
    gameId,
    userId: user?.uid,
    trickDescription,
    submitTurnAsync: submitTurn.mutateAsync,
    onSuccess: () => setTrickDescription(""),
  });

  const handleJudge = useCallback(
    (result: "landed" | "missed") => {
      if (!gameId || !pendingTurnId) return;
      judgeTurn.mutate({ turnId: pendingTurnId, result, gameId });
    },
    [gameId, pendingTurnId, judgeTurn]
  );

  const handleDispute = useCallback(
    (turnId: number) => {
      if (!gameId) return;
      fileDispute.mutate({ gameId, turnId });
    },
    [gameId, fileDispute]
  );

  const handleResolveDispute = useCallback(
    (disputeId: number, finalResult: "landed" | "missed") => {
      if (!gameId) return;
      resolveDispute.mutate({ disputeId, finalResult, gameId });
    },
    [gameId, resolveDispute]
  );

  const handleSetterBail = useCallback(() => {
    if (!gameId) return;
    setterBailMutation.mutate(gameId);
  }, [gameId, setterBailMutation]);

  const handleForfeit = useCallback(() => {
    if (!gameId) return;
    forfeitGame.mutate(gameId);
  }, [gameId, forfeitGame]);

  const handleRematch = useCallback(() => {
    if (!game) return;
    const opponentId = game.player1Id === user?.uid ? game.player2Id : game.player1Id;
    createGame.mutate(opponentId, {
      onSuccess: (data) => {
        setLocation(`/play?gameId=${data.game.id}`);
      },
    });
  }, [game, user?.uid, createGame, setLocation]);

  const handleBackToLobby = useCallback(() => setLocation("/play"), [setLocation]);

  if (!gameId) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">No Game Selected</h2>
        <p className="text-sm text-neutral-400 mb-4">Select a game from the lobby.</p>
        <Button onClick={handleBackToLobby}>Go to Lobby</Button>
      </div>
    );
  }

  if (isLoading) return <LoadingScreen />;

  if (error || !game || !user) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Failed to Load</h2>
        <p className="text-sm text-neutral-400 mb-4">{error ? String(error) : "Game not found"}</p>
        <Button onClick={handleBackToLobby}>Back to Lobby</Button>
      </div>
    );
  }

  const isPending = game.status === "pending";
  const isActive = game.status === "active";

  const disputeableTurns =
    turns?.filter(
      (t) =>
        t.result === "missed" &&
        t.playerId === user.uid &&
        t.turnType === "set" &&
        canDispute &&
        !disputes?.some((d) => d.turnId === t.id)
    ) ?? [];

  const pendingDisputesAgainstMe =
    disputes?.filter((d) => d.againstPlayerId === user.uid && !d.finalResult) ?? [];

  return (
    <div className="space-y-6">
      <GameStatusHeader
        isActive={isActive}
        isGameOver={isGameOver}
        isPending={isPending}
        opponentName={opponentName}
        turnPhase={turnPhase}
        isOffensive={isOffensive}
        onBack={handleBackToLobby}
        onForfeit={handleForfeit}
        forfeitPending={forfeitGame.isPending}
      />

      <div className="grid grid-cols-2 gap-4">
        <LettersDisplay
          letters={myLetters}
          playerName="You"
          isCurrentPlayer={isMyTurn}
          className="p-4 rounded-lg bg-neutral-800/50 border border-neutral-700"
        />
        <LettersDisplay
          letters={oppLetters}
          playerName={opponentName}
          isCurrentPlayer={!isMyTurn && isActive}
          className="p-4 rounded-lg bg-neutral-800/50 border border-neutral-700"
        />
      </div>

      {isGameOver && (
        <GameOverScreen
          iWon={iWon}
          myLetters={myLetters}
          oppLetters={oppLetters}
          opponentName={opponentName}
          gameStatus={game.status}
          gameId={gameId}
          playerDisplayName={user?.displayName || "You"}
          onRematch={handleRematch}
          rematchPending={createGame.isPending}
        />
      )}

      {isActive && !isGameOver && turnPhase === "set_trick" && isOffensive && isMyTurn && (
        <SetTrickPhase
          trickDescription={trickDescription}
          onTrickDescriptionChange={setTrickDescription}
          onRecordingComplete={handleRecordingComplete}
          isUploading={isUploading}
          submitPending={submitTurn.isPending}
          onSetterBail={handleSetterBail}
          setterBailPending={setterBailMutation.isPending}
        />
      )}

      {isActive && !isGameOver && turnPhase === "respond_trick" && isDefensive && isMyTurn && (
        <RespondTrickPhase
          trickDescription={trickDescription}
          onTrickDescriptionChange={setTrickDescription}
          onRecordingComplete={handleRecordingComplete}
          isUploading={isUploading}
          submitPending={submitTurn.isPending}
          lastTrickDescription={game.lastTrickDescription}
          turns={turns || []}
          onVideoClick={setSelectedVideo}
        />
      )}

      {isActive && !isGameOver && needsToJudge && (
        <JudgePhase
          opponentName={opponentName}
          lastTrickDescription={game.lastTrickDescription}
          onJudge={handleJudge}
          isPending={judgeTurn.isPending}
        />
      )}

      {isActive && !isGameOver && !isMyTurn && !needsToJudge && (
        <div className="p-6 rounded-lg bg-neutral-800/30 border border-neutral-700 text-center">
          <Clock className="w-8 h-8 text-neutral-500 mx-auto mb-3" />
          <p className="text-sm text-neutral-400">Waiting for {opponentName}.</p>
          {game.deadlineAt && (
            <p className="text-xs text-neutral-500 mt-1">
              Deadline: {formatDistanceToNow(new Date(game.deadlineAt), { addSuffix: true })}
            </p>
          )}
        </div>
      )}

      {isPending && (
        <div className="p-6 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-center">
          <Clock className="w-8 h-8 text-yellow-400 mx-auto mb-3" />
          <p className="text-sm text-neutral-400">Waiting for {opponentName} to accept.</p>
        </div>
      )}

      <DisputesSection
        pendingDisputesAgainstMe={pendingDisputesAgainstMe}
        disputeableTurns={disputeableTurns}
        isGameOver={isGameOver}
        onResolveDispute={handleResolveDispute}
        onDispute={handleDispute}
        resolveDisputePending={resolveDispute.isPending}
        fileDisputePending={fileDispute.isPending}
      />

      <TurnHistory turns={turns || []} currentUserId={user.uid} onVideoClick={setSelectedVideo} />

      {selectedVideo && (
        <VideoPlayerModal videoUrl={selectedVideo} onClose={() => setSelectedVideo(null)} />
      )}
    </div>
  );
}
