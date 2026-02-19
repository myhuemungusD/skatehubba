import { useRoute, Link } from "wouter";
import { useUserLookup } from "./useUserLookup";
import { TrickBagAggregator } from "./components/TrickBagAggregator";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, UserX, User, ExternalLink, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { Helmet } from "react-helmet";
import { Button } from "@/components/ui/button";

const formatLastActive = (date: string | Date | null) => {
  if (!date) return "In the lab";
  return `Skated ${formatDistanceToNow(new Date(date), { addSuffix: true })}`;
};

export default function PublicProfileView() {
  const [, params] = useRoute("/p/:username");
  const username = params?.username;
  const { userId, profile, isLoading, error } = useUserLookup(username);

  const trickSummary = profile ? "Active skater logging progress" : "View skater profile";
  const ogTitle = `@${username || "Skater"} on SkateHubba`;

  return (
    <div className="min-h-screen flex flex-col selection:bg-[#ff6a00]/30">
      <Helmet>
        <title>{ogTitle}</title>
        <meta name="description" content={trickSummary} />
        <meta property="og:title" content={ogTitle} />
        <meta property="og:description" content={trickSummary} />
        <meta property="og:type" content="profile" />
        <meta name="twitter:card" content="summary" />
      </Helmet>
      <main className="flex-1 container mx-auto px-4 py-8 max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Loader2 className="w-10 h-10 animate-spin text-[#ff6a00] mb-4" />
            <p
              className="text-xl font-medium tracking-tight"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              Scouting the spot...
            </p>
          </div>
        ) : error === "notFound" || !profile ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <UserX className="w-16 h-16 text-neutral-800 mb-4" />
            <h2
              className="text-2xl font-black text-white mb-2"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              Spot Unknown
            </h2>
            <p className="text-neutral-500 mb-8 max-w-[200px] mx-auto text-sm">
              Wood not found. This skater hasn't dropped a pin in our system yet.
            </p>
            <Button
              asChild
              variant="outline"
              className="border-neutral-800 text-neutral-400 hover:text-white"
            >
              <Link href="/">Back to base</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Identity Header - Trading Card Style */}
            <Card className="bg-neutral-900/50 border-neutral-800/50 overflow-hidden shadow-2xl backdrop-blur-sm relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#ff6a00] to-transparent opacity-50" />
              <CardContent className="p-8">
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-6">
                    <div className="w-24 h-24 rounded-full bg-neutral-900 flex items-center justify-center border-4 border-neutral-800 ring-2 ring-[#ff6a00]/20">
                      {profile.photoURL ? (
                        <img
                          src={profile.photoURL}
                          alt={username}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <User className="w-12 h-12 text-neutral-700" />
                      )}
                    </div>
                    <div className="absolute -bottom-1 -right-1 bg-success rounded-full p-1 border-2 border-neutral-900">
                      <ShieldCheck className="w-4 h-4 text-black" />
                    </div>
                  </div>

                  <div>
                    <h1
                      className="text-4xl font-black text-white tracking-tighter"
                      style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                    >
                      @{username}
                    </h1>
                    <div className="flex items-center justify-center gap-2 mt-2">
                      <Badge
                        variant="outline"
                        className="bg-neutral-900/50 text-neutral-400 border-neutral-800 uppercase text-[10px] font-bold tracking-widest px-3"
                      >
                        {profile.stance || "Regular"}
                      </Badge>
                      <span className="text-neutral-700">/</span>
                      <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">
                        {formatLastActive(profile.updatedAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-8 border-t border-neutral-800/50">
                  {/* Trick Bag Hero */}
                  <TrickBagAggregator userId={userId!} />
                </div>
              </CardContent>
            </Card>

            {/* Brand Framing */}
            <div className="flex flex-col items-center py-4 text-center">
              <div className="bg-neutral-900/50 px-4 py-2 rounded-full border border-neutral-800/50 mb-4 inline-flex items-center gap-2 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_8px_rgba(0,255,65,0.5)]" />
                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">
                  Verified on SkateHubba
                </span>
              </div>
              <p className="text-[10px] text-neutral-600 max-w-[180px] mx-auto leading-relaxed uppercase font-bold tracking-tight">
                Trading-card-style public profile. Mastery is earned, not given.
              </p>
            </div>

            <div className="flex justify-center">
              <Link
                href="/"
                className="text-[10px] uppercase font-black tracking-widest text-neutral-500 hover:text-[#ff6a00] transition-all duration-300 flex items-center gap-2"
              >
                Find more skaters <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
