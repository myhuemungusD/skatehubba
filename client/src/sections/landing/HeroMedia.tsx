import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { ArrowRight, Play, Volume2, VolumeX } from "lucide-react";

// ---------------------------------------------------------------------------
// A/B bucket: "stamp" variant shows the "Own Your Tricks" grain-punched hero
// ---------------------------------------------------------------------------
type HeroVariant = "default" | "stamp";

function getHeroVariant(): HeroVariant {
  try {
    const stored = localStorage.getItem("sh_hero_ab");
    if (stored === "default" || stored === "stamp") return stored;
    const pick: HeroVariant = Math.random() < 0.5 ? "default" : "stamp";
    localStorage.setItem("sh_hero_ab", pick);
    return pick;
  } catch {
    return "default";
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface HeroMediaProps {
  badge?: { text: string; variant: "success" | "info" };
  eyebrow?: string;
  title: string;
  subtitle?: string;
  description?: string;
  primaryCTA?: { text: string; href: string; testId?: string };
  secondaryCTA?: { text: string; href: string; testId?: string };
  /** mp4 / webm source — falls back to poster image when absent */
  videoSrc?: string;
  posterSrc?: string;
}

export function HeroMedia({
  badge,
  eyebrow,
  title,
  subtitle,
  description,
  primaryCTA,
  secondaryCTA,
  videoSrc,
  posterSrc = "/images/hero/hero-original.jpg",
}: HeroMediaProps) {
  const [variant] = useState<HeroVariant>(getHeroVariant);
  const [muted, setMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  // Auto-play the placeholder clip if provided
  useEffect(() => {
    if (videoSrc) setIsPlaying(true);
  }, [videoSrc]);

  const isStamp = variant === "stamp";

  return (
    <section
      className="hero-media relative w-full min-h-screen flex items-center justify-center overflow-hidden"
      aria-label="Hero"
      data-ab={variant}
    >
      {/* ---- Full-bleed background media ---- */}
      <div className="absolute inset-0 z-0" aria-hidden="true">
        {videoSrc && isPlaying ? (
          <video
            className="w-full h-full object-cover"
            src={videoSrc}
            poster={posterSrc}
            autoPlay
            loop
            muted={muted}
            playsInline
          >
            <track kind="captions" />
          </video>
        ) : (
          <picture>
            <source
              media="(min-width: 1024px)"
              srcSet="/images/hero/hero-1200.webp"
              type="image/webp"
            />
            <source
              media="(min-width: 640px)"
              srcSet="/images/hero/hero-768.webp"
              type="image/webp"
            />
            <source srcSet="/images/hero/hero-480.webp" type="image/webp" />
            <img
              src={posterSrc}
              alt=""
              className="w-full h-full object-cover"
              loading="eager"
              decoding="sync"
              fetchPriority="high"
            />
          </picture>
        )}
      </div>

      {/* ---- Dark vignette overlay ---- */}
      <div
        className="absolute inset-0 z-[1] bg-gradient-to-t from-black via-black/70 to-black/30"
        aria-hidden="true"
      />

      {/* ---- Film grain overlay (2005 abrasive punch) ---- */}
      <div className="hero-grain absolute inset-0 z-[2] pointer-events-none" aria-hidden="true" />

      {/* ---- Scanline overlay for that CRT / VHS feel ---- */}
      <div
        className="hero-scanlines absolute inset-0 z-[2] pointer-events-none opacity-[0.035]"
        aria-hidden="true"
      />

      {/* ---- "Own Your Tricks" stamp (A/B: stamp variant only) ---- */}
      {isStamp && (
        <div
          className="absolute top-8 right-6 md:top-12 md:right-12 z-[5] -rotate-12 select-none pointer-events-none"
          aria-hidden="true"
        >
          <div className="stamp-badge border-4 border-red-600 rounded-sm px-5 py-2 text-red-600 uppercase tracking-widest">
            <span
              className="block text-2xl md:text-4xl font-extrabold leading-none"
              style={{ fontFamily: "'Permanent Marker', cursive" }}
            >
              Own Your Tricks
            </span>
          </div>
        </div>
      )}

      {/* ---- Mute toggle (only when video is playing) ---- */}
      {videoSrc && isPlaying && (
        <button
          onClick={toggleMute}
          className="absolute bottom-6 right-6 z-[6] p-3 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 text-white hover:bg-black/70 transition-colors"
          aria-label={muted ? "Unmute video" : "Mute video"}
        >
          {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      )}

      {/* ---- Content ---- */}
      <div className="relative z-[4] max-w-5xl mx-auto px-6 text-center space-y-6">
        {/* Badge */}
        {badge && (
          <div className="flex justify-center hero-fade-in">
            <Link href="/auth?tab=signup" aria-label="Sign up for the SkateHubba beta">
              <div
                className={`inline-flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity ${
                  badge.variant === "success"
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : "bg-blue-500/10 border-blue-500/20 text-blue-400"
                } border backdrop-blur-sm rounded-full px-4 py-2 text-sm font-medium`}
              >
                <div
                  aria-hidden="true"
                  className={`w-1.5 h-1.5 ${
                    badge.variant === "success" ? "bg-emerald-400" : "bg-blue-400"
                  } rounded-full animate-pulse`}
                />
                <span>{badge.text}</span>
              </div>
            </Link>
          </div>
        )}

        {/* Eyebrow */}
        {eyebrow && (
          <p
            className="text-sm md:text-base font-semibold text-orange-500 tracking-[0.25em] uppercase hero-fade-in"
            style={{ animationDelay: "0.1s" }}
          >
            {eyebrow}
          </p>
        )}

        {/* Title */}
        <div className="space-y-2 hero-fade-in" style={{ animationDelay: "0.15s" }}>
          <h1
            className="text-6xl md:text-8xl lg:text-9xl font-black tracking-tighter leading-[0.85]"
            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          >
            <span className="text-white drop-shadow-[0_4px_32px_rgba(249,115,22,0.3)]">
              {title}
            </span>
          </h1>
          {subtitle && (
            <h2
              className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tighter"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              <span className="bg-gradient-to-r from-orange-500 to-amber-400 bg-clip-text text-transparent">
                {subtitle}
              </span>
            </h2>
          )}
        </div>

        {/* Description */}
        {description && (
          <p
            className="text-base md:text-lg text-zinc-300 max-w-2xl mx-auto leading-relaxed hero-fade-in"
            style={{ animationDelay: "0.25s" }}
          >
            {description}
          </p>
        )}

        {/* CTAs */}
        {(primaryCTA || secondaryCTA) && (
          <div
            className="flex flex-col sm:flex-row justify-center gap-4 pt-4 hero-fade-in"
            style={{ animationDelay: "0.35s" }}
          >
            {primaryCTA && (
              <Link
                href={primaryCTA.href}
                className="group relative inline-flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-black text-base font-bold uppercase tracking-wide px-8 py-4 rounded-xl shadow-[0_18px_60px_rgba(249,115,22,0.35)] transition-all hover:shadow-[0_24px_80px_rgba(249,115,22,0.5)] hover:scale-105"
                data-testid={primaryCTA.testId}
              >
                {primaryCTA.text}
                <ArrowRight
                  aria-hidden="true"
                  className="w-5 h-5 group-hover:translate-x-1 transition-transform"
                />
              </Link>
            )}
            {secondaryCTA && (
              <Link
                href={secondaryCTA.href}
                className="group inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 backdrop-blur-sm text-white text-base font-semibold px-8 py-4 rounded-xl border border-white/10 hover:border-white/20 transition-all"
                data-testid={secondaryCTA.testId}
              >
                <Play aria-hidden="true" className="w-5 h-5" />
                {secondaryCTA.text}
              </Link>
            )}
          </div>
        )}
      </div>

      {/* ---- Scoped styles ---- */}
      <style>{`
        /* Film grain — noisy SVG filter for that 2005 abrasive look */
        .hero-grain {
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='grain'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23grain)'/%3E%3C/svg%3E");
          background-repeat: repeat;
          background-size: 128px 128px;
          opacity: 0.12;
          mix-blend-mode: overlay;
        }

        /* CRT scanlines */
        .hero-scanlines {
          background: repeating-linear-gradient(
            0deg,
            rgba(0,0,0,0.15) 0px,
            rgba(0,0,0,0.15) 1px,
            transparent 1px,
            transparent 3px
          );
        }

        /* "Own Your Tricks" stamp — rough ink aesthetic */
        .stamp-badge {
          transform: rotate(-2deg);
          box-shadow:
            inset 0 0 0 2px rgba(220,38,38,0.3),
            3px 3px 0 rgba(0,0,0,0.4);
          background: rgba(0,0,0,0.25);
          backdrop-filter: blur(4px);
        }

        /* Fade-in cascade */
        .hero-fade-in {
          animation: heroFadeIn 0.9s ease-out forwards;
          opacity: 0;
        }
        @keyframes heroFadeIn {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-fade-in {
            animation: none;
            opacity: 1;
          }
          .hero-grain,
          .hero-scanlines {
            display: none;
          }
        }
      `}</style>
    </section>
  );
}
