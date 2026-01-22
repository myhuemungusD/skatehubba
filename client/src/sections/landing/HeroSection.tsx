import { Link } from "wouter";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Play } from "lucide-react";

interface HeroSectionProps {
  badge?: {
    text: string;
    variant: "success" | "info";
  };
  eyebrow?: string;
  title: string;
  subtitle?: string;
  description?: string;
  primaryCTA?: {
    text: string;
    href: string;
  };
  secondaryCTA?: {
    text: string;
    href: string;
  };
  trustIndicators?: Array<{
    icon: LucideIcon;
    text: string;
    color: string;
  }>;
}

export function HeroSection({
  badge,
  eyebrow,
  title,
  subtitle,
  description,
  primaryCTA,
  secondaryCTA,
  trustIndicators,
}: HeroSectionProps) {
  return (
    <section className="relative min-h-screen flex items-center justify-center px-6 py-20">
      {/* Modern gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black" />
      <div className="absolute inset-0 bg-[url('/graffiti-wall.jpg')] bg-cover bg-center opacity-10" />

      {/* Animated gradient orbs */}
      <div className="absolute top-1/4 -left-48 w-96 h-96 bg-orange-500/20 rounded-full blur-3xl animate-pulse" />
      <div
        className="absolute bottom-1/4 -right-48 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse"
        style={{ animationDelay: "1s" }}
      />

      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="text-center space-y-8">
          {/* Badge */}
          {badge && (
            <div className="flex justify-center animate-fade-in">
              <div
                className={`inline-flex items-center gap-2 ${
                  badge.variant === "success"
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : "bg-blue-500/10 border-blue-500/20 text-blue-400"
                } border backdrop-blur-sm rounded-full px-4 py-2 text-sm font-medium`}
              >
                <div
                  className={`w-1.5 h-1.5 ${
                    badge.variant === "success" ? "bg-emerald-400" : "bg-blue-400"
                  } rounded-full animate-pulse`}
                />
                <span>{badge.text}</span>
              </div>
            </div>
          )}

          {/* Eyebrow */}
          {eyebrow && (
            <p
              className="text-sm md:text-base font-semibold text-orange-500 tracking-wider uppercase animate-fade-in"
              style={{ animationDelay: "0.1s" }}
            >
              {eyebrow}
            </p>
          )}

          {/* Title */}
          <div className="space-y-2 animate-fade-in" style={{ animationDelay: "0.2s" }}>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                {title}
              </span>
            </h1>

            {/* Subtitle */}
            {subtitle && (
              <h2 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight">
                <span className="bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
                  {subtitle}
                </span>
              </h2>
            )}
          </div>

          {/* Description */}
          {description && (
            <p
              className="text-lg md:text-xl text-zinc-400 max-w-3xl mx-auto leading-relaxed animate-fade-in"
              style={{ animationDelay: "0.3s" }}
            >
              {description}
            </p>
          )}

          {/* CTAs */}
          {(primaryCTA || secondaryCTA) && (
            <div
              className="flex flex-col sm:flex-row justify-center gap-4 pt-8 animate-fade-in"
              style={{ animationDelay: "0.4s" }}
            >
              {primaryCTA && (
                <Link href={primaryCTA.href}>
                  <a className="group relative inline-flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-base font-semibold px-8 py-4 rounded-xl shadow-lg shadow-orange-500/25 transition-all hover:shadow-xl hover:shadow-orange-500/40 hover:scale-105">
                    {primaryCTA.text}
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </a>
                </Link>
              )}
              {secondaryCTA && (
                <Link href={secondaryCTA.href}>
                  <a className="group inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 backdrop-blur-sm text-white text-base font-semibold px-8 py-4 rounded-xl border border-white/10 hover:border-white/20 transition-all">
                    <Play className="w-5 h-5" />
                    {secondaryCTA.text}
                  </a>
                </Link>
              )}
            </div>
          )}

          {/* Trust Indicators */}
          {trustIndicators && trustIndicators.length > 0 && (
            <div
              className="flex flex-wrap justify-center gap-8 pt-12 animate-fade-in"
              style={{ animationDelay: "0.5s" }}
            >
              {trustIndicators.map((indicator, i) => (
                <div key={i} className="flex items-center gap-3 text-sm font-medium">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-800/50 backdrop-blur-sm">
                    <indicator.icon className={`w-4 h-4 ${indicator.color}`} />
                  </div>
                  <span className="text-zinc-300">{indicator.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.8s ease-out forwards;
          opacity: 0;
        }
      `}</style>
    </section>
  );
}
