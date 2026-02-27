import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import {
  Award,
  Calendar,
  ExternalLink,
  Loader2,
  MapPin,
  CheckCircle2,
  ArrowLeft,
  Lock,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import type { CheckInResult } from "../../../packages/shared/checkin-types";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Footer } from "../components/Footer";
import { buildApiUrl } from "../lib/api/client";
import { useVirtualizer } from "@tanstack/react-virtual";

type LoadState = "idle" | "loading" | "success" | "error";

function normalizeSpotLabel(spotId: string): string {
  const label = spotId.trim();
  if (!label) return "Unknown spot";
  return label.includes("-") ? label.replace(/-/g, " ") : label;
}

function safeDate(input: unknown): Date | null {
  if (typeof input !== "string") return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

const CHECKIN_ROW_HEIGHT = 140;

function VirtualizedCheckinList({ checkins }: { checkins: CheckInResult[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: checkins.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CHECKIN_ROW_HEIGHT,
    overscan: 5,
  });

  return (
    <section aria-label="Check-in history">
      <div ref={parentRef} className="max-h-[70vh] overflow-y-auto">
        <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const checkin = checkins[virtualRow.index];
            const d = safeDate(checkin.createdAt);
            const dateLabel = d ? format(d, "MMM d, yyyy") : "Unknown date";
            const spotLabel = normalizeSpotLabel(checkin.spotId);

            return (
              <div
                key={checkin.id}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                className="absolute top-0 left-0 w-full"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <div className="pb-6">
                  <Card
                    className="bg-black/80 backdrop-blur-md border-zinc-800 hover:border-orange-500/50 transition-all duration-300 group"
                    data-testid={`card-checkin-${checkin.id}`}
                  >
                    <CardHeader className="flex flex-row items-center justify-between pb-3">
                      <CardTitle className="text-2xl font-bold text-white flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center">
                          <CheckCircle2 className="w-6 h-6 text-emerald-400" aria-hidden />
                        </div>
                        <span className="group-hover:text-orange-400 transition-colors">
                          {checkin.trick}
                        </span>
                      </CardTitle>

                      <Badge
                        variant="secondary"
                        className="bg-orange-500/10 text-orange-400 border-orange-500/20 px-3 py-1"
                        aria-label={`${checkin.awardedPoints} experience points awarded`}
                      >
                        <Award className="w-4 h-4 mr-1.5" aria-hidden />+{checkin.awardedPoints} XP
                      </Badge>
                    </CardHeader>

                    <CardContent>
                      <div className="flex flex-wrap items-center gap-y-3 gap-x-8 text-base text-gray-400">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-5 h-5 text-gray-500" aria-hidden />
                          <span>{dateLabel}</span>
                        </div>

                        <div className="flex items-center gap-2 capitalize">
                          <MapPin className="w-5 h-5 text-gray-500" aria-hidden />
                          <span>{spotLabel}</span>
                        </div>

                        {checkin.videoUrl ? (
                          <a
                            href={checkin.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-orange-400 hover:text-orange-300 transition-colors font-medium"
                          >
                            <ExternalLink className="w-5 h-5" aria-hidden />
                            Watch Clip
                          </a>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function CheckinsPage() {
  const auth = useAuth();
  const user = auth?.user ?? null;
  const userId = user?.uid ?? null;
  const isAuthenticated = auth?.isAuthenticated ?? false;
  const authLoading = auth?.loading ?? false;

  const [state, setState] = useState<LoadState>("idle");
  const [checkins, setCheckins] = useState<CheckInResult[]>([]);
  const [_error, setError] = useState<string | null>(null);

  const totalCount = checkins.length;

  useEffect(() => {
    const controller = new AbortController();

    async function run() {
      if (authLoading) return;

      if (!isAuthenticated || !userId || !user) {
        setState("idle");
        setCheckins([]);
        setError(null);
        return;
      }

      setState("loading");
      setError(null);

      try {
        const token = await user.getIdToken();
        const res = await fetch(buildApiUrl("/api/checkins/my"), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        if (!res.ok) {
          let message = "Failed to fetch check-ins.";
          try {
            const payload = await res.json();
            if (payload?.message) message = String(payload.message);
          } catch {
            // Ignore payload parse errors
          }
          throw new Error(message);
        }

        const data = await res.json();
        setCheckins(Array.isArray(data) ? data : []);
        setState("success");
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Failed to load check-ins.";
        setError(message);
        setState("error");
      }
    }

    void run();

    return () => {
      controller.abort();
    };
  }, [authLoading, isAuthenticated, user, userId]);

  const headerBadge = useMemo(() => {
    if (!isAuthenticated) return "Sign in required";
    return `${totalCount} Check-ins`;
  }, [isAuthenticated, totalCount]);

  const showLoading = authLoading || state === "loading";

  return (
    <div className="text-white">
      <div className="min-h-screen pt-8 pb-12">
        <div className="max-w-4xl mx-auto px-6">
          <Button
            asChild
            variant="ghost"
            className="mb-8 text-gray-400 hover:text-white"
            data-testid="link-back-home"
          >
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
              Back to Home
            </Link>
          </Button>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-12">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2">
                Trick <span className="text-orange-500">History</span>
              </h1>
              <p className="text-gray-400 text-lg">Your legacy on the streets, verified.</p>
            </div>

            <Badge
              variant="outline"
              className="w-fit border-orange-500 text-orange-400 px-4 py-1.5 text-base"
              aria-label="Check-in count"
            >
              {headerBadge}
            </Badge>
          </div>

          {showLoading ? (
            <div className="flex flex-col items-center justify-center py-20" aria-busy="true">
              <Loader2 className="w-10 h-10 text-orange-500 animate-spin mb-4" aria-hidden />
              <p className="text-gray-400">Loading your sessions...</p>
            </div>
          ) : !isAuthenticated ? (
            <Card className="bg-black/60 backdrop-blur-md border-zinc-800 border-dashed text-center py-16">
              <CardContent>
                <Lock className="mx-auto mb-6 h-12 w-12 text-orange-400" aria-hidden />
                <h2 className="text-2xl font-bold mb-4">Account Required</h2>
                <p className="text-gray-400 mb-8 max-w-sm mx-auto">
                  Sign in to view your trick history and track your progression.
                </p>
                <Button
                  asChild
                  className="bg-orange-500 hover:bg-orange-600 px-8 py-6 text-lg font-bold"
                >
                  <Link href="/login">Sign In / Create Account</Link>
                </Button>
              </CardContent>
            </Card>
          ) : state === "error" ? (
            <Card className="bg-black/60 backdrop-blur-md border-zinc-800 border-dashed text-center py-16">
              <CardContent>
                <RefreshCw className="mx-auto mb-6 h-12 w-12 text-gray-500" aria-hidden />
                <h2 className="text-2xl font-bold mb-4 text-white">Couldn&apos;t load check-ins</h2>
                <p className="text-gray-400 mb-8 max-w-sm mx-auto">
                  {_error || "Something went wrong. Your check-ins are still safe."}
                </p>
                <Button
                  onClick={() => window.location.reload()}
                  className="bg-orange-500 hover:bg-orange-600 px-10 py-6 text-lg font-bold"
                >
                  <RefreshCw className="w-5 h-5 mr-2" aria-hidden />
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : totalCount === 0 ? (
            <Card className="bg-black/60 backdrop-blur-md border-zinc-800 border-dashed text-center py-20">
              <CardContent>
                <Sparkles className="mx-auto mb-6 h-12 w-12 text-orange-400" aria-hidden />
                <h2 className="text-2xl font-bold text-white mb-4">Your story starts here</h2>
                <p className="text-gray-400 mb-8 text-lg max-w-sm mx-auto">
                  Hit the Map, find a spot, and land your first trick to start building your legacy.
                </p>
                <Button
                  asChild
                  className="bg-orange-500 hover:bg-orange-600 px-10 py-6 text-lg font-bold"
                >
                  <Link href="/map">
                    <MapPin className="w-5 h-5 mr-2" aria-hidden />
                    Open the Map
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <VirtualizedCheckinList checkins={checkins} />
          )}

          <div className="mt-24">
            <Footer />
          </div>
        </div>
      </div>
    </div>
  );
}
