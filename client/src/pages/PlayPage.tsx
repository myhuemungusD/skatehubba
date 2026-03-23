import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateGame, useMyGames } from "../hooks/useSkateGame";
import { Link } from "wouter";

export function PlayPage() {
  const [opponentInput, setOpponentInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const createGame = useCreateGame();
  const { data } = useMyGames();
  const [, navigate] = useLocation();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const ids = opponentInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (ids.length === 0 || ids.length > 4) {
      setError("Enter 1-4 opponent IDs (comma-separated).");
      return;
    }

    try {
      const result = await createGame.mutateAsync(ids);
      navigate(`/game/${result.game.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create game");
    }
  };

  const recentGames = data?.games.slice(0, 10) ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Play S.K.A.T.E.</h1>

      <div className="bg-gray-800 rounded-xl p-5 mb-8">
        <h2 className="text-lg font-semibold mb-3">New Game</h2>
        <p className="text-sm text-gray-400 mb-4">
          Challenge 1-4 opponents. Async, turn-based. One take, no retries.
        </p>

        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label htmlFor="opponents" className="block text-sm text-gray-400 mb-1">
              Opponent IDs (comma-separated)
            </label>
            <input
              id="opponents"
              type="text"
              value={opponentInput}
              onChange={(e) => setOpponentInput(e.target.value)}
              placeholder="user-id-1, user-id-2"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-xs text-gray-500 mt-1">2-5 players total (you + 1-4 opponents)</p>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={createGame.isPending}
            className="px-6 py-2 bg-brand-500 rounded-lg font-medium hover:bg-brand-600 transition-colors disabled:opacity-50"
          >
            {createGame.isPending ? "Creating..." : "Challenge"}
          </button>
        </form>
      </div>

      {/* Recent games */}
      {recentGames.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Recent Games</h2>
          <div className="space-y-2">
            {recentGames.map((game) => (
              <Link
                key={game.id}
                href={`/game/${game.id}`}
                className="block p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <div className="flex justify-between">
                  <span className="text-sm">{game.players.map((p) => p.name).join(" vs ")}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      game.status === "active"
                        ? "bg-green-900/30 text-green-400"
                        : game.status === "completed"
                          ? "bg-gray-700 text-gray-400"
                          : "bg-yellow-900/30 text-yellow-400"
                    }`}
                  >
                    {game.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Coming soon */}
      <div className="mt-8 p-4 bg-gray-800/50 rounded-xl border border-dashed border-gray-700 text-center">
        <p className="text-gray-500 text-sm">Quick Match & Matchmaking — Coming Soon</p>
      </div>
    </div>
  );
}
