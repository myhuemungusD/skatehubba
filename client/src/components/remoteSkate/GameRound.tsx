/**
 * GameRound - Active game round view
 *
 * Shows game status, round status, video playback, upload controls,
 * and resolve buttons based on the current game state.
 */

import { useState, useCallback } from "react";
import {
  Loader2,
  Shield,
  Swords,
  Clock,
  Copy,
  Check,
  Link,
  ArrowLeft,
  HelpCircle,
  Info,
} from "lucide-react";
import { useRemoteSkateGame } from "@/hooks/useRemoteSkateGame";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { VideoUploader } from "./VideoUploader";
import { VideoPlayer } from "./VideoPlayer";
import { LetterDisplay } from "./LetterDisplay";
import { GameComplete } from "./GameComplete";
import { cn } from "@/lib/utils";

interface GameRoundProps {
  gameId: string;
  onBackToLobby: () => void;
}

// Step progress labels for the round flow
const ROUND_STEPS = [
  { key: "awaiting_set", label: "Set Trick" },
  { key: "awaiting_reply", label: "Reply" },
  { key: "awaiting_confirmation", label: "Judge" },
  { key: "resolved", label: "Done" },
] as const;

function getStepIndex(status: string): number {
  const idx = ROUND_STEPS.findIndex((s) => s.key === status);
  if (status === "disputed") return 3;
  return idx >= 0 ? idx : 0;
}

export function GameRound({ gameId, onBackToLobby }: GameRoundProps) {
  const { user } = useAuth();
  const uid = user?.uid;
  const { toast } = useToast();

  const {
    game,
    rounds,
    currentRound,
    setVideo,
    replyVideo,
    isLoading,
    error,
    uploadProgress,
    isUploading,
    isResolving,
    isMyTurn,
    myRole,
    myLetters,
    opponentLetters,
    opponentUid,
    isGameOver,
    winnerUid,
    uploadSetVideo,
    uploadReplyVideo,
    resolveRound,
    confirmRound,
  } = useRemoteSkateGame(gameId);

  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyGameId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(gameId);
      setCopiedId(true);
      toast({ title: "Copied!", description: "Game ID copied to clipboard." });
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      toast({
        title: "Copy failed",
        description: "Please copy the ID manually.",
        variant: "destructive",
      });
    }
  }, [gameId, toast]);

  const handleCopyLink = useCallback(async () => {
    const url = `${window.location.origin}/remote-skate?remoteGameId=${gameId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      toast({ title: "Link copied!", description: "Share this link with your opponent." });
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast({
        title: "Copy failed",
        description: "Please copy the link manually.",
        variant: "destructive",
      });
    }
  }, [gameId, toast]);

  // Loading
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <Loader2 className="h-8 w-8 text-yellow-400 animate-spin" />
        <span className="text-sm text-neutral-400">Loading game...</span>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <Shield className="h-8 w-8 text-red-400" />
        <span className="text-sm text-red-400">{error}</span>
        <button type="button" onClick={onBackToLobby} className="text-sm text-yellow-400 underline">
          Back to Lobby
        </button>
      </div>
    );
  }

  // No game
  if (!game) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <span className="text-sm text-neutral-400">Game not found</span>
        <button type="button" onClick={onBackToLobby} className="text-sm text-yellow-400 underline">
          Back to Lobby
        </button>
      </div>
    );
  }

  // Permission check
  if (uid && game.playerAUid !== uid && game.playerBUid !== uid) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <Shield className="h-8 w-8 text-red-400" />
        <span className="text-sm text-red-400">You don&apos;t have access to this game.</span>
        <button type="button" onClick={onBackToLobby} className="text-sm text-yellow-400 underline">
          Back to Lobby
        </button>
      </div>
    );
  }

  // Game complete
  if (isGameOver) {
    return <GameComplete game={game} winnerUid={winnerUid} onNewGame={onBackToLobby} />;
  }

  // Waiting for opponent — improved with copy + share
  if (game.status === "waiting") {
    return (
      <div className="space-y-6">
        {/* Back button */}
        <button
          type="button"
          onClick={onBackToLobby}
          className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Lobby
        </button>

        <div className="text-center space-y-3 py-6">
          <Clock className="h-10 w-10 text-yellow-400 mx-auto animate-pulse" />
          <h3 className="text-lg font-semibold text-white">Waiting for Opponent</h3>
          <p className="text-sm text-neutral-400 max-w-xs mx-auto">
            Share your Game ID or link with a friend so they can join your game.
          </p>
        </div>

        {/* Game ID with copy */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-neutral-500 block">Game ID</span>
          <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-700 rounded-lg p-3">
            <code className="flex-1 text-sm text-yellow-400 font-mono break-all select-all">
              {gameId}
            </code>
            <button
              type="button"
              onClick={handleCopyGameId}
              className="shrink-0 p-2 rounded-md hover:bg-neutral-800 transition-colors"
              aria-label="Copy game ID"
            >
              {copiedId ? (
                <Check className="h-4 w-4 text-green-400" />
              ) : (
                <Copy className="h-4 w-4 text-neutral-400" />
              )}
            </button>
          </div>
        </div>

        {/* Share link */}
        <button
          type="button"
          onClick={handleCopyLink}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-neutral-700 text-neutral-300 text-sm hover:bg-neutral-800 transition-colors"
        >
          {copiedLink ? <Check className="h-4 w-4 text-green-400" /> : <Link className="h-4 w-4" />}
          {copiedLink ? "Link Copied!" : "Copy Invite Link"}
        </button>

        <div className="flex items-start gap-2 rounded-md bg-blue-500/5 border border-blue-500/20 p-3">
          <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
          <p className="text-xs text-neutral-400 leading-relaxed">
            Your opponent can paste the Game ID on the &ldquo;Join Game by ID&rdquo; screen, or
            simply open the invite link to jump straight in.
          </p>
        </div>
      </div>
    );
  }

  // Active game
  const roundStatus = currentRound?.status || "awaiting_set";
  const roundNumber = rounds.length;
  const stepIndex = getStepIndex(roundStatus);

  const showSetUpload = myRole === "offense" && roundStatus === "awaiting_set" && isMyTurn;
  const showReplyUpload = myRole === "defense" && roundStatus === "awaiting_reply" && isMyTurn;
  const showResolveButtons =
    myRole === "offense" &&
    roundStatus === "awaiting_reply" &&
    isMyTurn &&
    replyVideo?.status === "ready";
  const showConfirmButtons = myRole === "defense" && roundStatus === "awaiting_confirmation";

  // Improved status messages with contextual guidance
  let statusMessage = "";
  let statusHint = "";
  if (roundStatus === "awaiting_confirmation") {
    if (myRole === "offense") {
      statusMessage = "Waiting for your opponent to confirm your call...";
      statusHint = "You've submitted your judgment. Your opponent will either agree or dispute it.";
    } else if (myRole === "defense") {
      const claim = currentRound?.offenseClaim;
      statusMessage =
        claim === "landed"
          ? "Your opponent says you LANDED the trick."
          : "Your opponent says you MISSED the trick.";
      statusHint =
        "Watch both videos and decide if you agree. If you disagree, you can dispute it.";
    }
  } else if (roundStatus === "disputed") {
    statusMessage = "This round is disputed and under admin review.";
    statusHint =
      "You and your opponent disagreed on the result. An admin will review the videos and make a final decision.";
  } else if (!isMyTurn) {
    if (roundStatus === "awaiting_set") {
      statusMessage = "Waiting for your opponent to set a trick...";
      statusHint = "Your opponent is on offense. They'll upload a trick video for you to match.";
    } else if (roundStatus === "awaiting_reply") {
      if (myRole === "offense") {
        statusMessage = "Waiting for your opponent to reply...";
        statusHint = "Your opponent is watching your trick and recording their attempt.";
      } else {
        statusMessage = "Waiting for your turn...";
      }
    }
  } else {
    if (showSetUpload) {
      statusMessage = "You're on offense! Upload a trick for your opponent to match.";
      statusHint = "Record yourself landing a trick, then upload the video. Make it count!";
    } else if (showReplyUpload) {
      statusMessage = "You're on defense! Watch the set trick and upload your attempt.";
      statusHint =
        "Try to replicate the exact trick shown in the video above, then upload your attempt.";
    } else if (showResolveButtons) {
      statusMessage = "Time to judge! Did your opponent land the trick?";
      statusHint = "Watch both videos carefully. Be fair — your opponent can dispute your call.";
    }
  }

  return (
    <div className="space-y-5">
      {/* Back button */}
      <button
        type="button"
        onClick={onBackToLobby}
        className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to Lobby
      </button>

      {/* Letters display */}
      <div className="flex items-center justify-between gap-4">
        <LetterDisplay letters={myLetters} label="You" isCurrentUser />
        <div className="text-xs text-neutral-500 font-medium">VS</div>
        <LetterDisplay letters={opponentLetters} label={opponentUid ? "Opponent" : "---"} />
      </div>

      {/* Round info + step progress */}
      <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-500">Round {roundNumber}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
            {myRole === "offense" ? (
              <span
                className="flex items-center gap-1"
                title="You set a trick for your opponent to match"
              >
                <Swords className="h-3 w-3" /> Offense
              </span>
            ) : myRole === "defense" ? (
              <span
                className="flex items-center gap-1"
                title="You must match your opponent's trick"
              >
                <Shield className="h-3 w-3" /> Defense
              </span>
            ) : (
              "Spectating"
            )}
          </span>
        </div>

        {/* Step progress indicator */}
        <div className="flex items-center gap-1">
          {ROUND_STEPS.map((step, i) => (
            <div key={step.key} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={cn(
                  "w-full h-1.5 rounded-full transition-colors",
                  i <= stepIndex ? "bg-yellow-400" : "bg-neutral-700"
                )}
              />
              <span
                className={cn(
                  "text-[10px] leading-none",
                  i <= stepIndex ? "text-yellow-400" : "text-neutral-600"
                )}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* Role explanation (inline) */}
        {myRole && (
          <div className="flex items-start gap-2 rounded-md bg-neutral-800/50 px-3 py-2">
            <HelpCircle className="h-3 w-3 text-neutral-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              {myRole === "offense"
                ? "As offense, you set a trick. If your opponent lands it, roles swap. If they miss, they get a letter."
                : "As defense, you must replicate your opponent's trick. Land it to swap roles. Miss it and you earn a letter."}
            </p>
          </div>
        )}

        {/* Status message */}
        <p className="text-sm text-neutral-300 font-medium">{statusMessage}</p>
        {statusHint && <p className="text-xs text-neutral-500 leading-relaxed">{statusHint}</p>}

        {/* Not your turn indicator */}
        {!isMyTurn && game.status === "active" && roundStatus !== "disputed" && (
          <div className="flex items-center gap-2 text-xs text-yellow-400/70 bg-yellow-400/5 rounded-md px-3 py-2">
            <Clock className="h-3 w-3" />
            <span>
              It&apos;s your opponent&apos;s turn. You&apos;ll be notified when they&apos;re done.
            </span>
          </div>
        )}
      </div>

      {/* Videos */}
      <div className="grid grid-cols-1 gap-4">
        <VideoPlayer video={setVideo} label="Set Trick" />
        {(roundStatus === "awaiting_reply" ||
          roundStatus === "awaiting_confirmation" ||
          roundStatus === "disputed" ||
          replyVideo) && <VideoPlayer video={replyVideo} label="Reply Attempt" />}
      </div>

      {/* Upload controls */}
      {showSetUpload && (
        <VideoUploader
          onFileSelected={uploadSetVideo}
          uploadProgress={uploadProgress}
          isUploading={isUploading}
          label="Upload Your Set Trick"
        />
      )}

      {showReplyUpload && (
        <VideoUploader
          onFileSelected={uploadReplyVideo}
          uploadProgress={uploadProgress}
          isUploading={isUploading}
          label="Upload Your Reply Attempt"
        />
      )}

      {/* Resolve buttons (offense judges the defense's reply) */}
      {showResolveButtons && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-300 text-center font-medium">
            Did your opponent land the trick?
          </p>
          <p className="text-xs text-neutral-500 text-center">
            Watch both videos above, then make your call. Your opponent can dispute if they
            disagree.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => resolveRound("landed")}
              disabled={isResolving}
              className="py-3 px-4 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 font-medium text-sm hover:bg-green-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isResolving ? (
                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
              ) : (
                "They Landed It"
              )}
            </button>
            <button
              type="button"
              onClick={() => resolveRound("missed")}
              disabled={isResolving}
              className="py-3 px-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 font-medium text-sm hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isResolving ? (
                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
              ) : (
                "They Missed It"
              )}
            </button>
          </div>
        </div>
      )}

      {/* Confirm buttons (defense confirms or disputes offense's call) */}
      {showConfirmButtons && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-300 text-center font-medium">
            Your opponent called it:{" "}
            <strong
              className={cn(
                "font-bold",
                currentRound?.offenseClaim === "landed" ? "text-green-400" : "text-red-400"
              )}
            >
              {currentRound?.offenseClaim === "landed" ? "LANDED" : "MISSED"}
            </strong>
          </p>
          <p className="text-xs text-neutral-500 text-center">
            Review the videos and confirm if you agree with their call, or dispute it.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => confirmRound(currentRound?.offenseClaim as "landed" | "missed")}
              disabled={isResolving}
              className="py-3 px-4 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 font-medium text-sm hover:bg-green-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isResolving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "I Agree"}
            </button>
            <button
              type="button"
              onClick={() =>
                confirmRound(currentRound?.offenseClaim === "landed" ? "missed" : "landed")
              }
              disabled={isResolving}
              className="py-3 px-4 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400 font-medium text-sm hover:bg-orange-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isResolving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Dispute"}
            </button>
          </div>
        </div>
      )}

      {/* Disputed round indicator */}
      {roundStatus === "disputed" && (
        <div className="flex items-start gap-2 text-xs text-orange-400/80 bg-orange-400/5 border border-orange-400/20 rounded-md px-3 py-2.5">
          <Shield className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <span className="block font-medium">Round Disputed</span>
            <span className="block text-orange-400/60">
              You and your opponent disagreed on the result. An admin will review the videos and
              make a final call. You&apos;ll be notified when it&apos;s resolved.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
