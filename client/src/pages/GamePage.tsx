import { useAuth } from "../hooks/useAuth";
import {
  useGameDetails,
  useJoinGame,
  useSubmitTurn,
  useJudgeTurn,
  useSetterBail,
  useForfeitGame,
} from "../hooks/useSkateGame";
import { LettersDisplay } from "../components/game/LettersDisplay";
import { useState } from "react";

interface Props {
  gameId: string;
}

export function GamePage({ gameId }: Props) {
  const { backendUser } = useAuth();
  const { data, isLoading, error } = useGameDetails(gameId);
  const joinGame = useJoinGame();
  const submitTurn = useSubmitTurn();
  const judgeTurn = useJudgeTurn();
  const setterBail = useSetterBail();
  const forfeitGame = useForfeitGame();

  const [trickDesc, setTrickDesc] = useState("");
  const [videoUrl, setVideoUrl] = useState("");

  if (isLoading) return <p className="text-gray-500">Loading game...</p>;
  if (error || !data) return <p className="text-red-400">Failed to load game.</p>;

  const { game, turns } = data;
  const userId = backendUser?.id;
  const isMyTurn = game.currentTurn === userId;

  // Pending game — show accept/decline
  if (game.status === "pending" && userId && userId !== game.creatorId) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Game Invite</h1>
        <p className="text-gray-400 mb-4">
          {game.players.map((p) => p.name).join(", ")} — {game.maxPlayers} players
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => joinGame.mutate({ gameId, accept: true })}
            disabled={joinGame.isPending}
            className="px-6 py-2 bg-brand-500 rounded-lg font-medium hover:bg-brand-600 disabled:opacity-50"
          >
            Accept
          </button>
          <button
            onClick={() => joinGame.mutate({ gameId, accept: false })}
            disabled={joinGame.isPending}
            className="px-6 py-2 bg-gray-700 rounded-lg font-medium hover:bg-gray-600 disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      </div>
    );
  }

  // Completed game
  if (game.status === "completed" || game.status === "forfeited") {
    const winner = game.players.find((p) => p.id === game.winnerId);
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Game Over</h1>
        {winner && (
          <p className="text-lg mb-4">
            <span className="text-brand-500 font-semibold">{winner.name}</span> wins!
          </p>
        )}
        <LettersDisplay players={game.players} />
        <TurnHistory turns={turns} />
      </div>
    );
  }

  // Active game
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">S.K.A.T.E.</h1>

      {/* Player letters */}
      <LettersDisplay players={game.players} currentTurn={game.currentTurn} />

      {/* Status info */}
      <div className="bg-gray-800 rounded-lg p-4 mb-4">
        <p className="text-sm text-gray-400">
          Phase: <span className="text-white font-medium">{game.turnPhase?.replace("_", " ")}</span>
        </p>
        {game.lastTrickDescription && (
          <p className="text-sm text-gray-400 mt-1">
            Last trick: <span className="text-white">{game.lastTrickDescription}</span>
          </p>
        )}
        {game.deadlineAt && (
          <p className="text-xs text-gray-500 mt-1">
            Deadline: {new Date(game.deadlineAt).toLocaleString()}
          </p>
        )}
      </div>

      {/* Actions */}
      {isMyTurn && game.turnPhase === "set_trick" && game.setterId === userId && (
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <h3 className="font-semibold mb-2">Your turn — Set a trick</h3>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Trick name (e.g., kickflip)"
              value={trickDesc}
              onChange={(e) => setTrickDesc(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-brand-500"
            />
            <input
              type="url"
              placeholder="Video URL"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-brand-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  submitTurn.mutate({
                    gameId,
                    trickDescription: trickDesc,
                    videoUrl,
                    videoDurationMs: 10000,
                  });
                  setTrickDesc("");
                  setVideoUrl("");
                }}
                disabled={!trickDesc || !videoUrl || submitTurn.isPending}
                className="px-4 py-2 bg-brand-500 rounded-lg font-medium hover:bg-brand-600 disabled:opacity-50"
              >
                Set Trick
              </button>
              <button
                onClick={() => setterBail.mutate(gameId)}
                disabled={setterBail.isPending}
                className="px-4 py-2 bg-red-900/30 text-red-400 rounded-lg hover:bg-red-900/50 disabled:opacity-50"
              >
                Bail (take letter)
              </button>
            </div>
          </div>
        </div>
      )}

      {isMyTurn && game.turnPhase === "respond_trick" && (
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <h3 className="font-semibold mb-2">
            Your turn — Respond to: {game.lastTrickDescription}
          </h3>
          <div className="space-y-2">
            <input
              type="url"
              placeholder="Video URL of your attempt"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-brand-500"
            />
            <button
              onClick={() => {
                submitTurn.mutate({
                  gameId,
                  trickDescription: game.lastTrickDescription || "",
                  videoUrl,
                  videoDurationMs: 10000,
                });
                setVideoUrl("");
              }}
              disabled={!videoUrl || submitTurn.isPending}
              className="px-4 py-2 bg-brand-500 rounded-lg font-medium hover:bg-brand-600 disabled:opacity-50"
            >
              Submit Response
            </button>
          </div>
        </div>
      )}

      {isMyTurn && game.turnPhase === "judge" && (
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <h3 className="font-semibold mb-2">Judge the response</h3>
          {(() => {
            const pendingTurn = turns.filter((t) => t.result === "pending").at(-1);
            if (!pendingTurn) return <p className="text-gray-500">No turn to judge.</p>;
            return (
              <div>
                <p className="text-sm text-gray-400 mb-3">
                  {pendingTurn.playerName} attempted: {pendingTurn.trickDescription}
                </p>
                {pendingTurn.videoUrl && (
                  <a
                    href={pendingTurn.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-500 text-sm hover:underline mb-3 block"
                  >
                    Watch video
                  </a>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => judgeTurn.mutate({ turnId: pendingTurn.id, result: "landed" })}
                    disabled={judgeTurn.isPending}
                    className="px-4 py-2 bg-green-600 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    LAND
                  </button>
                  <button
                    onClick={() => judgeTurn.mutate({ turnId: pendingTurn.id, result: "missed" })}
                    disabled={judgeTurn.isPending}
                    className="px-4 py-2 bg-red-600 rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
                  >
                    BAIL
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {!isMyTurn && (
        <div className="bg-gray-800 rounded-lg p-4 mb-4 text-center">
          <p className="text-gray-400">Waiting for opponent...</p>
        </div>
      )}

      {/* Forfeit */}
      <button
        onClick={() => {
          if (confirm("Forfeit this game?")) forfeitGame.mutate(gameId);
        }}
        className="text-xs text-gray-600 hover:text-red-400 transition-colors"
      >
        Forfeit game
      </button>

      {/* Turn history */}
      <TurnHistory turns={turns} />
    </div>
  );
}

interface TurnHistoryProps {
  turns: Array<{
    id: number;
    playerName: string;
    turnType: string;
    trickDescription: string;
    result: string;
    createdAt: string;
  }>;
}

function TurnHistory({ turns }: TurnHistoryProps) {
  if (turns.length === 0) return null;

  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold text-gray-400 mb-2">Turn History</h3>
      <div className="space-y-1">
        {turns.map((t) => (
          <div key={t.id} className="flex items-center gap-2 text-xs text-gray-500">
            <span className={t.turnType === "set" ? "text-brand-500" : "text-gray-400"}>
              {t.turnType === "set" ? "SET" : "RSP"}
            </span>
            <span className="text-gray-300">{t.playerName}</span>
            <span>{t.trickDescription}</span>
            <span
              className={
                t.result === "landed"
                  ? "text-green-400"
                  : t.result === "missed"
                    ? "text-red-400"
                    : "text-yellow-400"
              }
            >
              {t.result}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
