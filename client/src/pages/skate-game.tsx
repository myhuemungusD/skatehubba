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
import {
  Swords,
  Clock,
  Trophy,
  AlertCircle,
  ArrowLeft,
  Video,
  Flag,
  AlertTriangle,
  Play,
  Skull,
} from "lucide-react";
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
  VideoRecorder,
  GameMetaTags,
  SocialShare,
} from "@/components/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

        // Extract thumbnail and upload video in parallel
        const [thumbnailBlob, videoUrl] = await Promise.all([
          extractThumbnail(blob).catch(() => null),
          uploadVideoBlob(videoPath, blob),
        ]);

        // Upload thumbnail if extracted
        let thumbnailUrl: string | undefined;
        if (thumbnailBlob) {
          const thumbPath = `games/${gameId}/turns/${user.uid}_${timestamp}_thumb.jpg`;
          thumbnailUrl = await uploadVideoBlob(thumbPath, thumbnailBlob);
        }

        // Submit turn — auto-send, no preview, no confirmation
        await submitTurn.mutateAsync({
          gameId,
          trickDescription: description,
          videoUrl,
          videoDurationMs: durationMs,
          thumbnailUrl,
        });

        setTrickDescription("");
      } catch (err) {
        // Mutation errors handled by useSubmitTurn toast.
        // Upload errors (Firebase Storage) need explicit handling.
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

  const handleJudge = (result: "landed" | "missed") => {
    if (!gameId || !pendingTurnId) return;
    judgeTurn.mutate({ turnId: pendingTurnId, result, gameId });
  };

  const handleDispute = (turnId: number) => {
    if (!gameId) return;
    fileDispute.mutate({ gameId, turnId });
  };

  const handleResolveDispute = (disputeId: number, finalResult: "landed" | "missed") => {
    if (!gameId) return;
    resolveDispute.mutate({ disputeId, finalResult, gameId });
  };

  const handleForfeit = () => {
    if (!gameId) return;
    forfeitGame.mutate(gameId);
  };

  const handleBackToLobby = () => {
    setLocation("/play?tab=lobby");
  };

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

  // Find most recent BAIL'd turns that can be disputed
  const disputeableTurns =
    turns?.filter(
      (t) =>
        t.result === "missed" &&
        t.playerId === user.uid &&
        t.turnType === "set" &&
        canDispute &&
        !disputes?.some((d) => d.turnId === t.id)
    ) ?? [];

  // Find unresolved disputes against the current user
  const pendingDisputesAgainstMe =
    disputes?.filter((d) => d.againstPlayerId === user.uid && !d.finalResult) ?? [];

  // Turn phase display
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
            <p className="text-sm text-neutral-400">
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

        {/* ====== GAME OVER SCREEN ====== */}
        {isGameOver && (
          <div
            className={cn(
              "p-8 rounded-lg border-2 text-center",
              iWon ? "bg-green-500/10 border-green-500" : "bg-red-500/10 border-red-500"
            )}
          >
            {iWon ? (
              <Trophy className="w-14 h-14 text-green-400 mx-auto mb-3" />
            ) : (
              <Skull className="w-14 h-14 text-red-400 mx-auto mb-3" />
            )}
            <h2 className="text-3xl font-black mb-2 text-white">
              {iWon ? "VICTORY" : "GAME OVER"}
            </h2>
            <div className="space-y-1 text-sm">
              <p className={iWon ? "text-green-400" : "text-red-400"}>
                {iWon ? `${opponentName} has S.K.A.T.E.` : `You have S.K.A.T.E.`}
              </p>
              <p className="text-neutral-500">
                You: {myLetters || "Clean"} | {opponentName}: {oppLetters || "Clean"}
              </p>
              {game.status === "forfeited" && (
                <p className="text-neutral-500 mt-2">
                  {iWon ? "Opponent forfeited." : "You forfeited."}
                </p>
              )}
            </div>
            <div className="mt-6 flex justify-center">
              <SocialShare
                gameId={gameId}
                playerOne={user?.displayName || "You"}
                playerTwo={opponentName}
                result={iWon ? `${user?.displayName || "You"} won` : `${opponentName} won`}
              />
            </div>
          </div>
        )}

        {/* ====== SET TRICK PHASE ====== */}
        {isActive && !isGameOver && turnPhase === "set_trick" && isOffensive && isMyTurn && (
          <div className="p-6 rounded-lg bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border border-orange-500/30">
            <div className="flex items-center gap-2 mb-4">
              <Video className="w-5 h-5 text-orange-400" />
              <h2 className="text-lg font-semibold text-white">Set Your Trick</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Trick Name
                </label>
                <Input
                  placeholder="Kickflip, Heelflip, Tre Flip..."
                  value={trickDescription}
                  onChange={(e) => setTrickDescription(e.target.value)}
                  className="bg-neutral-900 border-neutral-700"
                  maxLength={500}
                  disabled={isUploading}
                />
              </div>

              {trickDescription.trim() ? (
                <VideoRecorder
                  onRecordingComplete={handleRecordingComplete}
                  disabled={isUploading || submitTurn.isPending}
                />
              ) : (
                <p className="text-xs text-neutral-500 text-center py-4">
                  Enter trick name to enable recording.
                </p>
              )}

              {isUploading && (
                <div className="text-center text-sm text-neutral-400 font-mono">Uploading...</div>
              )}
            </div>
          </div>
        )}

        {/* ====== RESPOND TRICK PHASE ====== */}
        {isActive && !isGameOver && turnPhase === "respond_trick" && isDefensive && isMyTurn && (
          <div className="p-6 rounded-lg bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 space-y-4">
            <div className="flex items-center gap-2">
              <Swords className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-white">Your Turn to Respond</h2>
            </div>

            {/* Show the trick they need to match */}
            {game.lastTrickDescription && (
              <div className="p-4 rounded-lg bg-neutral-900 border border-neutral-700">
                <div className="text-xs text-neutral-500 mb-1">Trick to match:</div>
                <div className="text-white font-bold">{game.lastTrickDescription}</div>
              </div>
            )}

            {/* Show the set video */}
            {turns &&
              turns.length > 0 &&
              (() => {
                const lastSetTurn = [...turns].reverse().find((t) => t.turnType === "set");
                if (lastSetTurn?.videoUrl) {
                  return (
                    <button
                      onClick={() => setSelectedVideo(lastSetTurn.videoUrl)}
                      className="flex items-center gap-2 text-sm text-yellow-400 hover:text-yellow-300 transition-colors"
                      type="button"
                    >
                      <Play className="w-4 h-4" />
                      Watch their attempt
                    </button>
                  );
                }
                return null;
              })()}

            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Your Response
              </label>
              <Input
                placeholder="Describe your attempt..."
                value={trickDescription}
                onChange={(e) => setTrickDescription(e.target.value)}
                className="bg-neutral-900 border-neutral-700"
                maxLength={500}
                disabled={isUploading}
              />
            </div>

            {trickDescription.trim() ? (
              <VideoRecorder
                onRecordingComplete={handleRecordingComplete}
                disabled={isUploading || submitTurn.isPending}
              />
            ) : (
              <p className="text-xs text-neutral-500 text-center py-4">
                Describe your attempt to enable recording.
              </p>
            )}

            {isUploading && (
              <div className="text-center text-sm text-neutral-400 font-mono">Uploading...</div>
            )}
          </div>
        )}

        {/* ====== JUDGE PHASE ====== */}
        {isActive && !isGameOver && needsToJudge && (
          <div className="p-6 rounded-lg bg-gradient-to-r from-yellow-500/10 to-red-500/10 border border-yellow-500/30 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              <h2 className="text-lg font-semibold text-white">Judge the Trick</h2>
            </div>

            <p className="text-sm text-neutral-400">Did you land {opponentName}'s trick?</p>

            {game.lastTrickDescription && (
              <div className="p-4 rounded-lg bg-neutral-900 border border-neutral-700">
                <div className="text-xs text-neutral-500 mb-1">Trick:</div>
                <div className="text-white font-bold">{game.lastTrickDescription}</div>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={() => handleJudge("landed")}
                disabled={judgeTurn.isPending}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3"
              >
                LAND
              </Button>
              <Button
                onClick={() => handleJudge("missed")}
                disabled={judgeTurn.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3"
              >
                BAIL
              </Button>
            </div>

            <p className="text-xs text-neutral-500 text-center">
              BAIL = you get a letter. LAND = roles swap. No take-backs.
            </p>
          </div>
        )}

        {/* ====== WAITING FOR OPPONENT ====== */}
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

        {/* ====== PENDING CHALLENGE ====== */}
        {isPending && (
          <div className="p-6 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-center">
            <Clock className="w-8 h-8 text-yellow-400 mx-auto mb-3" />
            <p className="text-sm text-neutral-400">Waiting for {opponentName} to accept.</p>
          </div>
        )}

        {/* ====== DISPUTES ====== */}
        {/* Pending disputes against you */}
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

        {/* Disputeable turns (your BAIL'd tricks you can dispute) */}
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

        {/* ====== TURN HISTORY ====== */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">History</h2>
          <TurnHistory
            turns={turns || []}
            currentUserId={user.uid}
            onVideoClick={setSelectedVideo}
          />
        </div>

        {/* ====== VIDEO PLAYER MODAL ====== */}
        {selectedVideo && (
          <div
            className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedVideo(null)}
          >
            <div
              className="bg-neutral-900 rounded-lg p-4 max-w-lg w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-medium text-neutral-400">Video</h3>
                <Button variant="ghost" size="sm" onClick={() => setSelectedVideo(null)}>
                  Close
                </Button>
              </div>
              <div className="aspect-[9/16] bg-black rounded-lg overflow-hidden">
                <video
                  src={selectedVideo}
                  className="w-full h-full object-contain"
                  controls
                  autoPlay
                  playsInline
                  controlsList="nodownload noplaybackrate"
                  disablePictureInPicture
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
