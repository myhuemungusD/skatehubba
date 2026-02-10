import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { homeContent } from "../content/home";
import { MemberHubHero } from "../sections/home/MemberHubHero";
import { StatsStrip } from "../sections/home/StatsStrip";
import { FeatureGrid } from "../sections/landing/FeatureGrid";

export default function Home() {
  const auth = useAuth();
  const isAuthenticated = auth?.isAuthenticated ?? false;
  const displayStats = [
    { label: "Active Skaters", value: "Growing" },
    { label: "Skate Spots Mapped", value: "50+" },
    { label: "SKATE Battles", value: "Active" },
  ];

  return (
    <div className="text-white">
      <MemberHubHero
        badge={homeContent.hero.badge}
        title={homeContent.hero.title}
        quickActions={homeContent.hero.quickActions}
      />

      <StatsStrip stats={displayStats} />

      <section className="py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <FeatureGrid features={homeContent.features} columns={4} />
        </div>
      </section>

      <section className="py-12 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
          {homeContent.trustIndicators.map((item, index) => (
            <div
              key={index}
              className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-sm font-semibold uppercase tracking-wide text-zinc-200 backdrop-blur"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </div>
              {item.text}
            </div>
          ))}
        </div>
      </section>

      {!isAuthenticated && (
        <section className="py-8 px-6">
          <div className="max-w-6xl mx-auto flex justify-center">
            <Link href="/auth">
              <a className="group inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-4 text-base font-bold uppercase tracking-wide text-black shadow-[0_18px_60px_rgba(255,122,0,0.35)] transition hover:translate-y-[-1px]">
                Sign In / Sign Up
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </a>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
