import { Play, Instagram } from "lucide-react";

interface Reel {
  /** Thumbnail image src */
  thumb: string;
  /** Link to the reel (IG or internal) */
  href: string;
  /** Short caption */
  caption: string;
  /** "ig" for Instagram embed link, "battle" for raw battle footage */
  type: "ig" | "battle";
}

const PLACEHOLDER_REELS: Reel[] = [
  {
    thumb: "/images/hero/hero-480.webp",
    href: "https://www.instagram.com/skatehubba_app/",
    caption: "Kickflip front board — Hubba Hideout",
    type: "ig",
  },
  {
    thumb: "/images/backgrounds/hubbagraffwall.png",
    href: "https://www.instagram.com/skatehubba_app/",
    caption: "Tre flip down the 6 — verified on SkateHubba",
    type: "ig",
  },
  {
    thumb: "/images/hero/hero-768.webp",
    href: "https://www.instagram.com/skatehubba_app/",
    caption: "First to 5 — raw SKATE battle footage",
    type: "battle",
  },
  {
    thumb: "/images/hero/hero-1200.webp",
    href: "https://www.instagram.com/skatehubba_app/",
    caption: "Nollie heel — spot check session",
    type: "battle",
  },
];

interface ReelsFeedProps {
  reels?: Reel[];
}

export function ReelsFeed({ reels = PLACEHOLDER_REELS }: ReelsFeedProps) {
  return (
    <section className="relative py-16 px-6" aria-labelledby="reels-heading">
      <div className="max-w-6xl mx-auto">
        {/* Section header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2
              id="reels-heading"
              className="text-3xl md:text-4xl font-black uppercase tracking-tight text-white"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              From the Streets
            </h2>
            <p className="text-zinc-400 text-sm mt-1 tracking-wide">
              Raw clips &amp; battle footage — straight from the community
            </p>
          </div>
          <a
            href="https://www.instagram.com/skatehubba_app/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-2 text-sm font-semibold text-orange-500 hover:text-orange-400 transition-colors"
            aria-label="Follow @skatehubba_app on Instagram (opens in new tab)"
          >
            <Instagram className="w-4 h-4" />
            @skatehubba_app
          </a>
        </div>

        {/* Reel grid — 9:16 aspect ratio cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {reels.map((reel, i) => (
            <a
              key={i}
              href={reel.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative aspect-[9/16] rounded-2xl overflow-hidden bg-zinc-900 border border-white/5 hover:border-orange-500/40 transition-all hover:scale-[1.02]"
              aria-label={`${reel.caption} (opens in new tab)`}
            >
              {/* Thumbnail */}
              <img
                src={reel.thumb}
                alt=""
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
              />

              {/* Dark gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />

              {/* Play icon */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm border border-white/20 flex items-center justify-center opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all">
                  <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
                </div>
              </div>

              {/* Badge */}
              <div className="absolute top-3 left-3">
                {reel.type === "ig" ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-purple-600 to-pink-500 text-white px-2 py-0.5 rounded-full">
                    <Instagram className="w-2.5 h-2.5" />
                    Reel
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-red-600/90 text-white px-2 py-0.5 rounded-full">
                    Battle
                  </span>
                )}
              </div>

              {/* Caption */}
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p className="text-xs text-white/90 font-medium leading-snug line-clamp-2">
                  {reel.caption}
                </p>
              </div>

              {/* Grain overlay on hover for that abrasive feel */}
              <div className="reel-grain absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          ))}
        </div>

        {/* Mobile IG link */}
        <div className="sm:hidden mt-6 text-center">
          <a
            href="https://www.instagram.com/skatehubba_app/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-orange-500 hover:text-orange-400 transition-colors"
            aria-label="Follow @skatehubba_app on Instagram (opens in new tab)"
          >
            <Instagram className="w-4 h-4" />
            Follow @skatehubba_app
          </a>
        </div>
      </div>

      <style>{`
        .reel-grain {
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E");
          background-size: 100px 100px;
          mix-blend-mode: overlay;
        }
      `}</style>
    </section>
  );
}
