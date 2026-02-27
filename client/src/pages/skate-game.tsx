/**
 * S.K.A.T.E. Game Page
 *
 * Async, turn-based game view. No retries. No safety nets. Final.
 *
 * Shows the current game state and the appropriate action panel based on turn phase:
 * - set_trick: Offensive player records a trick video
 * - respond_trick: Defensive player watches + records response
 * - judge: Defensive player judges LAND or BAIL
 * - game over: Locked permanently
 */

import { useState, useCallback, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import { Swords, Clock, AlertCircle, ArrowLeft, Flag, AlertTriangle } from "lucide-react";
import { extractThumbnail } from "@/lib/video/thumbnailExtractor";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import {
  useGameState,
  useSubmitTurn,
  useJudgeTurn,
  useFileDispute,
  useResolveDispute,
  useForfeitGame,
} from "@/hooks/useSkateGameApi";
import {
  LettersDisplay,
  TurnHistory,
  GameMetaTags,
  VideoPlayerModal,
  GameOverScreen,
  SetTrickPanel,
  RespondTrickPanel,
  JudgePanel,
} from "@/components/game";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { FirebaseStorage } from "firebase/storage";

// Lazy-loaded Firebase Storage
let storageInstance: FirebaseStorage | null = null;
async function getFirebaseStorage() {
  if (!storageInstance) {
    const { getStorage } = await import("firebase/storage");
    const { app } = await import("@/lib/firebase");
    storageInstance = getStorage(app);
  }
  return storageInstance;
}

async function uploadVideoBlob(path: string, blob: Blob): Promise<string> {
  const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
  const storage = await getFirebaseStorage();
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

export default function SkateGamePage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const gameId = new URLSearchParams(search).get("gameId");

  const { toast } = useToast();
  const [trickDescription, setTrickDescription] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const trickDescriptionRef = useRef(trickDescription);
  trickDescriptionRef.current = trickDescription;

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

  const handleRecordingComplete = useCallback(
    async (blob: Blob, durationMs: number) => {
      const description = trickDescriptionRef.current.trim();
      if (!gameId || !user?.uid || !description) return;

      setIsUploading(true);
      try {
        const timestamp = Date.now();
        const videoPath = `games/${gameId}/turns/${user.uid}_${timestamp}.webm`;

        const [thumbnailBlob, videoUrl] = await Promise.all([
          extractThumbnail(blob).catch(() => null),
          uploadVideoBlob(videoPath, blob),
        ]);

        let thumbnailUrl: string | undefined;
        if (thumbnailBlob) {
          const thumbPath = `games/${gameId}/turns/${user.uid}_${timestamp}_thumb.jpg`;
          thumbnailUrl = await uploadVideoBlob(thumbPath, thumbnailBlob);
        }

        await submitTurn.mutateAsync({
          gameId,
          trickDescription: description,
          videoUrl,
          videoDurationMs: durationMs,
          thumbnailUrl,
        });

        setTrickDescription("");
      } catch (err) {
        toast({
          title: "Upload failed",
          description: err instanceof Error ? err.message : "Try again.",
          variant: "destructive",
        });
      } finally {
        setIsUploading(false);
      }
    },
    [gameId, user?.uid, submitTurn, toast]
  );

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

  const handleForfeit = useCallback(() => {
    if (!gameId) return;
    forfeitGame.mutate(gameId);
  }, [gameId, forfeitGame]);

  const handleBackToLobby = useCallback(() => {
    setLocation("/play?tab=lobby");
  }, [setLocation]);

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

  const phaseLabels: Record<string, string> = {
    set_trick: isOffensive ? "Set your trick." : `${opponentName} is setting a trick.`,
    respond_trick: isDefensive ? "Your turn to respond." : `${opponentName} is responding.`,
    judge: isDefensive ? "Judge the trick." : `${opponentName} is judging.`,
  };

  return (
    <>
      <GameMetaTags
        gameId={gameId ?? undefined}
        playerOne={user?.displayName || "You"}
        playerTwo={opponentName}
        gameStatus={game.status}
        currentTurn={turns?.length || 0}
      />
      <div className="space-y-6">
        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={handleBackToLobby} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          {isActive && !isGameOver && (
            <Button
              variant="ghost"
              onClick={handleForfeit}
              disabled={forfeitGame.isPending}
              className="gap-2 text-red-400 hover:text-red-300"
            >
              <Flag className="w-4 h-4" />
              Forfeit
            </Button>
          )}
        </div>

        {/* Game Header */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center">
            <Swords className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">S.K.A.T.E.</h1>
            <p className="text-sm text-neutral-400" aria-live="polite">
              {isPending && "Waiting for opponent."}
              {isActive && !isGameOver && turnPhase && phaseLabels[turnPhase]}
              {isGameOver && (iWon ? "You won." : "You lost.")}
            </p>
          </div>
        </div>

        {/* Deadline */}
        {game.deadlineAt && isActive && !isGameOver && (
          <div
            className={cn(
              "p-3 rounded-lg flex items-center gap-3",
              isMyTurn
                ? "bg-red-500/10 border border-red-500/30"
                : "bg-neutral-800/50 border border-neutral-700"
            )}
          >
            <Clock className={cn("w-4 h-4", isMyTurn ? "text-red-400" : "text-neutral-400")} />
            <div className="text-sm">
              <span className={cn(isMyTurn ? "text-red-400" : "text-neutral-400")}>
                {formatDistanceToNow(new Date(game.deadlineAt), { addSuffix: true })}
              </span>
              {isMyTurn && <span className="text-red-400/60 ml-2">— your move</span>}
            </div>
          </div>
        )}

        {/* Letter Display */}
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

        {/* Game Over */}
        {isGameOver && (
          <GameOverScreen
            iWon={iWon}
            opponentName={opponentName}
            myLetters={myLetters}
            oppLetters={oppLetters}
            isForfeited={game.status === "forfeited"}
            gameId={gameId}
            playerDisplayName={user?.displayName || "You"}
          />
        )}

        {/* Set Trick Phase */}
        {isActive && !isGameOver && turnPhase === "set_trick" && isOffensive && isMyTurn && (
          <SetTrickPanel
            trickDescription={trickDescription}
            onTrickDescriptionChange={setTrickDescription}
            onRecordingComplete={handleRecordingComplete}
            isUploading={isUploading}
            isSubmitting={submitTurn.isPending}
          />
        )}

        {/* Respond Trick Phase */}
        {isActive && !isGameOver && turnPhase === "respond_trick" && isDefensive && isMyTurn && (
          <RespondTrickPanel
            lastTrickDescription={game.lastTrickDescription}
            turns={turns}
            trickDescription={trickDescription}
            onTrickDescriptionChange={setTrickDescription}
            onRecordingComplete={handleRecordingComplete}
            onVideoClick={setSelectedVideo}
            isUploading={isUploading}
            isSubmitting={submitTurn.isPending}
          />
        )}

        {/* Judge Phase */}
        {isActive && !isGameOver && needsToJudge && (
          <JudgePanel
            opponentName={opponentName}
            lastTrickDescription={game.lastTrickDescription}
            onJudge={handleJudge}
            isPending={judgeTurn.isPending}
          />
        )}

        {/* Waiting for Opponent */}
        {isActive && !isGameOver && !isMyTurn && (
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

        {/* Pending Challenge */}
        {isPending && (
          <div className="p-6 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-center">
            <Clock className="w-8 h-8 text-yellow-400 mx-auto mb-3" />
            <p className="text-sm text-neutral-400">Waiting for {opponentName} to accept.</p>
          </div>
        )}

        {/* Disputes */}
        {pendingDisputesAgainstMe.length > 0 && (
          <div className="space-y-3">
            {pendingDisputesAgainstMe.map((dispute) => (
              <div
                key={dispute.id}
                className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30"
              >
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-semibold text-amber-400">
                    Dispute Against Your Call
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mb-3">
                  Your opponent is disputing your BAIL call. One of you will receive a permanent
                  reputation penalty.
                </p>
                <div className="flex gap-3">
                  <Button
                    onClick={() => handleResolveDispute(dispute.id, "landed")}
                    disabled={resolveDispute.isPending}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-sm"
                  >
                    Overturn to LAND
                  </Button>
                  <Button
                    onClick={() => handleResolveDispute(dispute.id, "missed")}
                    disabled={resolveDispute.isPending}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-sm"
                  >
                    Uphold BAIL
                  </Button>
                </div>
                <p className="text-xs text-neutral-500 mt-2 text-center">
                  Loser of dispute gets a permanent reputation penalty. Final.
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Disputeable turns */}
        {disputeableTurns.length > 0 && !isGameOver && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-neutral-400">Dispute Available</h3>
            {disputeableTurns.map((turn) => (
              <div
                key={turn.id}
                className="p-3 rounded-lg bg-neutral-800/50 border border-neutral-700 flex items-center justify-between"
              >
                <div>
                  <span className="text-sm text-white">
                    Turn {turn.turnNumber}: {turn.trickDescription}
                  </span>
                  <span className="text-xs text-red-400 ml-2">BAIL</span>
                </div>
                <Button
                  onClick={() => handleDispute(turn.id)}
                  disabled={fileDispute.isPending}
                  variant="outline"
                  size="sm"
                  className="text-amber-400 border-amber-400/30 hover:bg-amber-500/10"
                >
                  Dispute
                </Button>
              </div>
            ))}
            <p className="text-xs text-neutral-500">
              1 dispute per game. Loser gets permanent reputation penalty.
            </p>
          </div>
        )}

        {/* Turn History */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">History</h2>
          <TurnHistory
            turns={turns || []}
            currentUserId={user.uid}
            onVideoClick={setSelectedVideo}
          />
        </div>

        {/* Video Player Modal */}
        {selectedVideo && (
          <VideoPlayerModal videoUrl={selectedVideo} onClose={() => setSelectedVideo(null)} />
        )}
      </div>
    </>
  );
}
