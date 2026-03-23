const SKATE = ["S", "K", "A", "T", "E"];

interface GamePlayer {
  id: string;
  name: string;
  letters: string;
  isEliminated: boolean;
}

interface Props {
  players: GamePlayer[];
  currentTurn?: string | null;
}

export function LettersDisplay({ players, currentTurn }: Props) {
  return (
    <div className="space-y-2 mb-4">
      {players.map((player) => (
        <div
          key={player.id}
          className={`flex items-center gap-3 p-2 rounded-lg ${
            player.id === currentTurn ? "bg-brand-500/10 border border-brand-500/30" : "bg-gray-800"
          } ${player.isEliminated ? "opacity-50" : ""}`}
        >
          <span className="text-sm font-medium w-24 truncate">{player.name}</span>
          <div className="flex gap-1">
            {SKATE.map((letter, i) => {
              const hasLetter = i < player.letters.length;
              return (
                <span
                  key={letter}
                  className={`w-7 h-7 flex items-center justify-center rounded text-xs font-bold ${
                    hasLetter
                      ? "bg-red-600 text-white"
                      : "bg-gray-700 text-gray-500"
                  }`}
                >
                  {letter}
                </span>
              );
            })}
          </div>
          {player.isEliminated && (
            <span className="text-xs text-red-400 ml-auto">OUT</span>
          )}
          {player.id === currentTurn && !player.isEliminated && (
            <span className="text-xs text-brand-500 ml-auto">Playing</span>
          )}
        </div>
      ))}
    </div>
  );
}
