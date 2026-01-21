import type { LucideIcon } from "lucide-react";

interface Feature {
  icon: string | LucideIcon;
  title: string;
  description: string;
  iconColor?: string;
}

interface FeatureGridProps {
  features: Feature[];
  columns?: 2 | 3 | 4;
}

export function FeatureGrid({ features, columns = 3 }: FeatureGridProps) {
  const gridCols = {
    2: "md:grid-cols-2",
    3: "md:grid-cols-3",
    4: "md:grid-cols-4",
  };

  return (
    <section className="relative py-32 px-6">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-black via-zinc-950 to-black" />

      <div className="relative z-10 max-w-7xl mx-auto">
        <div className="text-center mb-16 space-y-4">
          <h2 className="text-4xl md:text-5xl font-bold">
            <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
              Built for Progression
            </span>
          </h2>
          <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
            Professional-grade tools designed to elevate your skateboarding journey
          </p>
        </div>

        <div className={`grid gap-8 ${gridCols[columns]}`}>
          {features.map((feature, i) => {
            const IconComponent = typeof feature.icon === "function" ? feature.icon : null;

            return (
              <div key={i} className="group relative">
                {/* Hover glow effect */}
                <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl opacity-0 group-hover:opacity-20 blur transition-opacity duration-500" />

                <div className="relative h-full bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-8 transition-all duration-300 group-hover:scale-[1.02]">
                  {/* Icon */}
                  <div className="mb-6">
                    {typeof feature.icon === "string" ? (
                      <span className="text-5xl">{feature.icon}</span>
                    ) : IconComponent ? (
                      <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-zinc-800/50 backdrop-blur-sm border border-zinc-700">
                        <IconComponent
                          className={`w-7 h-7 ${feature.iconColor || "text-orange-500"}`}
                        />
                      </div>
                    ) : null}
                  </div>

                  {/* Content */}
                  <h3 className="text-xl font-bold text-white mb-3 group-hover:text-orange-400 transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-zinc-400 leading-relaxed">{feature.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
