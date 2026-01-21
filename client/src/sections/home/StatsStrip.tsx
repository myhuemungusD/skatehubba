interface Stat {
  label: string;
  value: string | number;
}

interface StatsStripProps {
  stats: Stat[];
}

export function StatsStrip({ stats }: StatsStripProps) {
  return (
    <section className="py-12 px-6 bg-black/40 backdrop-blur-md border-y border-zinc-800">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-3 gap-8 text-center">
          {stats.map((stat, i) => (
            <div key={i}>
              <div className="text-3xl md:text-4xl font-bold text-orange-500 mb-2">
                {stat.value}
              </div>
              <div className="text-sm text-gray-400 uppercase tracking-wide">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
