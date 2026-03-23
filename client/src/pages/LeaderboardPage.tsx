import { useLeaderboard } from "../hooks/useSkateGame";

export function LeaderboardPage() {
  const { data, isLoading } = useLeaderboard();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Leaderboard</h1>

      {isLoading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="space-y-1">
          {data?.leaderboard.map((player, i) => (
            <div
              key={player.id}
              className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg"
            >
              <span
                className={`w-8 text-center font-bold ${
                  i === 0
                    ? "text-yellow-400"
                    : i === 1
                      ? "text-gray-300"
                      : i === 2
                        ? "text-orange-400"
                        : "text-gray-500"
                }`}
              >
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {player.displayName || player.handle}
                </p>
                <p className="text-xs text-gray-500">@{player.handle}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-brand-500">{player.wins}W</p>
                <p className="text-xs text-gray-500">{player.losses}L</p>
              </div>
            </div>
          ))}

          {data?.leaderboard.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-8">
              No games played yet. Be the first!
            </p>
          )}
        </div>
      )}
    </div>
  );
}
