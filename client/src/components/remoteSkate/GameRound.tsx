/**
 * GameRound - Active game round view
 *
 * Shows game status, round status, video playback, upload controls,
 * and resolve buttons based on the current game state.
 */

import { Loader2, Shield, Swords, Clock } from "lucide-react";
import { useRemoteSkateGame } from "@/hooks/useRemoteSkateGame";
import { useAuth } from "@/hooks/useAuth";
import { VideoUploader } from "./VideoUploader";
import { VideoPlayer } from "./VideoPlayer";
import { LetterDisplay } from "./LetterDisplay";
import { GameComplete } from "./GameComplete";

interface GameRoundProps {
  gameId: string;
  onBackToLobby: () => void;
}

export function GameRound({ gameId, onBackToLobby }: GameRoundProps) {
  const { user } = useAuth();
  const uid = user?.uid;

  const {
    game,
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
    loserUid,
    uploadSetVideo,
    uploadReplyVideo,
    resolveRound,
  } = useRemoteSkateGame(gameId);

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
        <span className="text-sm text-red-400">You don't have access to this game.</span>
        <button type="button" onClick={onBackToLobby} className="text-sm text-yellow-400 underline">
          Back to Lobby
        </button>
      </div>
    );
  }

  // Game complete
  if (isGameOver) {
    return (
      <GameComplete
        game={game}
        winnerUid={winnerUid}
        loserUid={loserUid}
        onNewGame={onBackToLobby}
      />
    );
  }

  // Waiting for opponent
  if (game.status === "waiting") {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2 py-8">
          <Clock className="h-10 w-10 text-yellow-400 mx-auto animate-pulse" />
          <h3 className="text-lg font-semibold text-white">Waiting for Opponent</h3>
          <p className="text-sm text-neutral-400">
            Share your Game ID with a friend to start playing.
          </p>
          <code className="block text-xs text-yellow-400 font-mono bg-neutral-900 rounded px-3 py-2 mt-2 break-all">
            {gameId}
          </code>
        </div>
      </div>
    );
  }

  // Active game
  const roundStatus = currentRound?.status || "awaiting_set";
  const showSetUpload = myRole === "offense" && roundStatus === "awaiting_set" && isMyTurn;
  const showReplyUpload = myRole === "defense" && roundStatus === "awaiting_reply" && isMyTurn;
  const showResolveButtons =
    myRole === "offense" &&
    roundStatus === "awaiting_reply" &&
    isMyTurn &&
    replyVideo?.status === "ready";

  // Status message
  let statusMessage = "";
  if (!isMyTurn) {
    if (roundStatus === "awaiting_set") {
      statusMessage = "Waiting for opponent to set a trick...";
    } else if (roundStatus === "awaiting_reply") {
      if (myRole === "offense") {
        statusMessage = "Waiting for opponent to reply with their attempt...";
      } else {
        statusMessage = "Waiting for your turn...";
      }
    }
  } else {
    if (showSetUpload) {
      statusMessage = "Your turn! Upload your set trick video.";
    } else if (showReplyUpload) {
      statusMessage = "Your turn! Watch the set trick and upload your reply.";
    } else if (showResolveButtons) {
      statusMessage = "Review the reply and decide: Did they land it?";
    }
  }

  return (
    <div className="space-y-6">
      {/* Letters display */}
      <div className="flex items-center justify-between gap-4">
        <LetterDisplay letters={myLetters} label="You" isCurrentUser />
        <div className="text-xs text-neutral-500 font-medium">VS</div>
        <LetterDisplay letters={opponentLetters} label={opponentUid ? `Opponent` : "---"} />
      </div>

      {/* Round info */}
      <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-500">Round {currentRound ? 1 : 0}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
            {myRole === "offense" ? (
              <span className="flex items-center gap-1">
                <Swords className="h-3 w-3" /> Offense
              </span>
            ) : myRole === "defense" ? (
              <span className="flex items-center gap-1">
                <Shield className="h-3 w-3" /> Defense
              </span>
            ) : (
              "Spectating"
            )}
          </span>
        </div>

        {/* Status */}
        <p className="text-sm text-neutral-300">{statusMessage}</p>

        {/* Not your turn indicator */}
        {!isMyTurn && game.status === "active" && (
          <div className="flex items-center gap-2 text-xs text-yellow-400/70 bg-yellow-400/5 rounded-md px-3 py-2">
            <Clock className="h-3 w-3" />
            <span>Not your turn. Waiting for opponent.</span>
          </div>
        )}
      </div>

      {/* Videos */}
      <div className="grid grid-cols-1 gap-4">
        <VideoPlayer video={setVideo} label="Set Trick" />
        {(roundStatus === "awaiting_reply" || replyVideo) && (
          <VideoPlayer video={replyVideo} label="Reply" />
        )}
      </div>

      {/* Upload controls */}
      {showSetUpload && (
        <VideoUploader
          onFileSelected={uploadSetVideo}
          uploadProgress={uploadProgress}
          isUploading={isUploading}
          label="Upload Set Trick"
        />
      )}

      {showReplyUpload && (
        <VideoUploader
          onFileSelected={uploadReplyVideo}
          uploadProgress={uploadProgress}
          isUploading={isUploading}
          label="Upload Reply Video"
        />
      )}

      {/* Resolve buttons */}
      {showResolveButtons && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-300 text-center font-medium">
            Did the opponent land the trick?
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => resolveRound("landed")}
              disabled={isResolving}
              className="py-3 px-4 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 font-medium text-sm hover:bg-green-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isResolving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Landed"}
            </button>
            <button
              type="button"
              onClick={() => resolveRound("missed")}
              disabled={isResolving}
              className="py-3 px-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 font-medium text-sm hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isResolving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Missed"}
            </button>
          </div>
        </div>
      )}

      {/* Back button */}
      <div className="pt-2">
        <button
          type="button"
          onClick={onBackToLobby}
          className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          Back to Lobby
        </button>
      </div>
    </div>
  );
}
