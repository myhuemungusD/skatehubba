import { useQuery } from "@tanstack/react-query";
import { TrickMastery } from "@shared/schema";

interface TrickBagAggregatorProps {
  userId: string;
}

export function TrickBagAggregator({ userId }: TrickBagAggregatorProps) {
  const { data: tricks, isLoading, isError } = useQuery<TrickMastery[]>({
    queryKey: ["/api/tricks", userId],
  });

  if (isLoading) {
    return <div>Loading trick bag...</div>;
  }

  if (isError) {
    return <div>Failed to load trick bag data.</div>;
  }

  if (!tricks || tricks.length === 0) {
    return (
      <div className="trick-bag-aggregator py-12 text-center">
        <p className="text-xl font-black text-neutral-800 uppercase tracking-tighter mb-2" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
          Still in the lab
        </p>
        <p className="text-[10px] text-neutral-600 font-bold uppercase tracking-widest">
          Wood not found
        </p>
      </div>
    );
  }

  const stats = tricks.reduce(
    (acc, trick) => {
      acc.total++;
      if (trick.level === "bolts") acc.bolts++;
      else if (trick.level === "consistent") acc.consistent++;
      else if (trick.level === "learning") acc.learning++;
      return acc;
    },
    { total: 0, learning: 0, consistent: 0, bolts: 0 }
  );

  return (
    <div className="trick-bag-aggregator space-y-8">
      <div className="text-center py-4 border-b border-neutral-800/50">
        <p className="text-gray-500 uppercase tracking-widest text-[10px] font-bold mb-1">Total Tricks Logged</p>
        <div className="text-6xl font-black text-white" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
          {stats.total.toString().padStart(2, '0')}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col items-center p-3 rounded-lg bg-success/5 border border-success/20">
          <span className="text-success font-black text-2xl" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>{stats.bolts}</span>
          <span className="text-[10px] text-success/80 uppercase font-bold tracking-tighter">Bolts</span>
        </div>
        <div className="flex flex-col items-center p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
          <span className="text-orange-400 font-black text-2xl" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>{stats.consistent}</span>
          <span className="text-[10px] text-orange-400/80 uppercase font-bold tracking-tighter">Consistent</span>
        </div>
        <div className="flex flex-col items-center p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
          <span className="text-blue-400 font-black text-2xl" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>{stats.learning}</span>
          <span className="text-[10px] text-blue-400/80 uppercase font-bold tracking-tighter">Learning</span>
        </div>
      </div>
    </div>
  );
}
