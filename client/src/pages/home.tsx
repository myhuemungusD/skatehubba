import { Link } from "wouter";
import { ArrowRight, Shield } from "lucide-react";
import { useAuth } from "../context/AuthProvider";

export default function Home() {
  const auth = useAuth();
  const isAuthenticated = auth?.isAuthenticated ?? false;

  return (
    <section className="relative -mx-4 -mt-6 min-h-dvh overflow-hidden px-6 pb-20 pt-10 text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0d0d10] via-[#1a0f0a] to-[#0a0f1a]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,120,0,0.18),_transparent_45%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(45,96,255,0.18),_transparent_45%)]" />
      <div className="absolute inset-0 bg-[url('/images/backgrounds/hubbagraffwall.png')] bg-cover bg-center opacity-10" />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
        <header className="flex items-center justify-between">
          <span
            className="text-2xl text-orange-400"
            style={{ fontFamily: "'Permanent Marker', cursive" }}
          >
            SkateHubba
          </span>
          {!isAuthenticated && (
            <Link href="/auth">
              <a className="group inline-flex items-center gap-3 rounded-xl border border-orange-500/40 bg-orange-500/10 px-5 py-2 text-sm font-semibold uppercase tracking-wide text-orange-200 transition hover:bg-orange-500/20">
                Sign In / Sign Up
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>
            </Link>
          )}
        </header>

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-5 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Now Available - Join the Beta
          </div>

          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-orange-400">
            The Future of Competitive Skateboarding
          </p>

          <h1 className="mt-6 text-5xl font-black tracking-tight md:text-7xl">
            <span className="bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              Own Your Tricks.
            </span>
          </h1>
          <h2 className="mt-3 text-4xl font-black tracking-tight text-orange-400 md:text-6xl">
            Play Skate Anywhere.
          </h2>

          <p className="mt-8 max-w-xl text-base leading-relaxed text-zinc-300 md:text-lg">
            The ultimate mobile skateboarding platform where every clip, spot, and session tells a
            story.
          </p>

          {!isAuthenticated && (
            <div className="mt-10 flex w-full max-w-sm flex-col gap-4">
              <Link href="/auth">
                <a className="group inline-flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-4 text-base font-bold uppercase tracking-wide text-black shadow-[0_18px_60px_rgba(255,122,0,0.35)] transition hover:translate-y-[-1px]">
                  Sign In / Sign Up
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </a>
              </Link>
            </div>
          )}
        </div>

        <div className="mt-12 flex items-center justify-center">
          <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-sm font-semibold uppercase tracking-wide text-zinc-200 backdrop-blur">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
              <Shield className="h-5 w-5 text-emerald-400" />
            </div>
            Enterprise-grade Security
          </div>
        </div>
      </div>
    </section>
  );
}
