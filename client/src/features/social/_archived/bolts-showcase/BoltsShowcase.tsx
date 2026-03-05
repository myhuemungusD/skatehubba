import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "../../../components/ui/card";
import { Loader2, ShieldCheck, Zap } from "lucide-react";
import { Badge } from "../../../components/ui/badge";

interface BoltsSkater {
  userId: string;
  handle: string;
  displayName: string | null;
  photoURL: string | null;
  boltsCount: number;
  lastActive: string | null;
}

export default function BoltsShowcase() {
  const { data: skaters, isLoading } = useQuery<BoltsSkater[]>({
    queryKey: ["/api/social/bolts-showcase"],
  });

  return (
    <div className="min-h-screen flex flex-col selection:bg-[#ff6a00]/30">
      <main className="flex-1 container mx-auto px-4 py-8 max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
        <header className="text-center mb-10">
          <h1
            className="text-5xl font-black text-white tracking-tighter uppercase mb-2"
            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          >
            Bolts Showcase
          </h1>
          <p className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest">
            Skaters holding it down / Consistency, not clout
          </p>
        </header>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Loader2 className="w-10 h-10 animate-spin text-[#ff6a00] mb-4" />
            <p
              className="text-xl font-medium tracking-tight"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              Gathering the crew...
            </p>
          </div>
        ) : !skaters || skaters.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-neutral-900 rounded-3xl">
            <p
              className="text-neutral-700 font-black uppercase tracking-tighter text-2xl"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              No bolts logged yet
            </p>
            <p className="text-[10px] text-neutral-800 font-bold uppercase tracking-widest mt-2">
              The streets are waiting
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {skaters.map((skater) => (
              <Link key={skater.userId} href={`/p/${skater.handle}`}>
                <Card className="bg-neutral-900/40 border-neutral-800/50 hover:border-[#ff6a00]/50 transition-all duration-300 cursor-pointer group active:scale-95 overflow-hidden">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className="w-12 h-12 rounded-full bg-neutral-900 border-2 border-neutral-800 flex items-center justify-center overflow-hidden">
                          {skater.photoURL ? (
                            <img
                              src={skater.photoURL}
                              alt={skater.handle}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span
                              className="text-neutral-700 font-black"
                              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                            >
                              {skater.handle.substring(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="absolute -bottom-1 -right-1 bg-success rounded-full p-0.5 border-2 border-neutral-950">
                          <ShieldCheck className="w-3 h-3 text-black" />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h3
                            className="text-white font-black text-lg tracking-tight leading-none"
                            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                          >
                            @{skater.handle}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant="outline"
                            className="bg-neutral-950 border-neutral-800 text-[8px] font-bold uppercase tracking-widest py-0 px-1.5 opacity-60"
                          >
                            Verified Skater
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end">
                      <div className="flex items-center gap-1.5 bg-success/10 border border-success/20 px-3 py-1 rounded-lg">
                        <Zap className="w-3.5 h-3.5 text-success fill-success" />
                        <span
                          className="text-success font-black text-xl leading-none"
                          style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                        >
                          {skater.boltsCount.toString().padStart(2, "0")}
                        </span>
                      </div>
                      <span className="text-[8px] text-neutral-600 font-bold uppercase tracking-tighter mt-1">
                        Bolts Earned
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}

            <footer className="text-center pt-8">
              <p className="text-[10px] text-neutral-600 font-bold uppercase tracking-widest">
                Top 20 consistent skaters
              </p>
            </footer>
          </div>
        )}
      </main>
    </div>
  );
}
