import { Link } from "wouter";
import { useAuth } from "../hooks/useAuth";
import { useMyGames } from "../hooks/useSkateGame";

export function HubPage() {
  const { profile } = useAuth();
  const { data, isLoading } = useMyGames();

  const activeGames = data?.games.filter((g) => g.status === "active") ?? [];
  const pendingGames = data?.games.filter((g) => g.status === "pending") ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">
        Welcome back{profile?.displayName ? `, ${profile.displayName}` : ""}
      </h1>
      <p className="text-gray-400 text-sm mb-8">
        {profile?.wins ?? 0}W - {profile?.losses ?? 0}L
      </p>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <Link
          href="/play"
          className="p-4 bg-brand-500/10 border border-brand-500/30 rounded-xl text-center hover:bg-brand-500/20 transition-colors"
        >
          <div className="text-lg font-semibold text-brand-500">Play S.K.A.T.E.</div>
          <div className="text-xs text-gray-400 mt-1">Challenge 1-4 friends</div>
        </Link>
        <Link
          href="/map"
          className="p-4 bg-gray-800 border border-gray-700 rounded-xl text-center hover:bg-gray-700 transition-colors"
        >
          <div className="text-lg font-semibold">Spot Map</div>
          <div className="text-xs text-gray-400 mt-1">Find & add spots</div>
        </Link>
      </div>

      {/* Active games */}
      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading games...</p>
      ) : (
        <>
          {activeGames.length > 0 && (
            <section className="mb-6">
              <h2 className="text-lg font-semibold mb-3">Active Games</h2>
              <div className="space-y-2">
                {activeGames.map((game) => (
                  <Link
                    key={game.id}
                    href={`/game/${game.id}`}
                    className="block p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex justify-between items-center">
                      <div className="text-sm">
                        {game.players.map((p) => p.name).join(" vs ")}
                      </div>
                      <div className="text-xs text-gray-500">
                        {game.players.map((p) => p.letters || "-").join(" / ")}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {pendingGames.length > 0 && (
            <section className="mb-6">
              <h2 className="text-lg font-semibold mb-3">Pending Invites</h2>
              <div className="space-y-2">
                {pendingGames.map((game) => (
                  <Link
                    key={game.id}
                    href={`/game/${game.id}`}
                    className="block p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-lg hover:bg-yellow-900/30 transition-colors"
                  >
                    <div className="text-sm">
                      {game.players.map((p) => p.name).join(", ")} — waiting to start
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {activeGames.length === 0 && pendingGames.length === 0 && (
            <p className="text-gray-500 text-sm">
              No games yet.{" "}
              <Link href="/play" className="text-brand-500 hover:underline">
                Start one
              </Link>
              .
            </p>
          )}
        </>
      )}
    </div>
  );
}
