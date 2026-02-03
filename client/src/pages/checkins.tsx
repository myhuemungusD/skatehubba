import { useEffect, useMemo, useState } from "react";
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
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import type { CheckInResult } from "../../../packages/shared/checkin-types";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Footer } from "../components/Footer";
import { buildApiUrl } from "../lib/api/client";

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

export default function CheckinsPage() {
  const auth = useAuth();
  const user = auth?.user ?? null;
  const userId = user?.uid ?? null;
  const isAuthenticated = auth?.isAuthenticated ?? false;
  const authLoading = auth?.loading ?? false;

  const [state, setState] = useState<LoadState>("idle");
  const [checkins, setCheckins] = useState<CheckInResult[]>([]);
  const [error, setError] = useState<string | null>(null);

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
          <Link href="/">
            <Button
              variant="ghost"
              className="mb-8 text-gray-400 hover:text-white"
              data-testid="link-back-home"
            >
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
              Back to Home
            </Button>
          </Link>

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
                <Link href="/login">
                  <Button className="bg-orange-500 hover:bg-orange-600 px-8 py-6 text-lg font-bold">
                    Sign In / Create Account
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : state === "error" ? (
            <Card className="bg-red-900/20 backdrop-blur-md border-red-900/50 text-center py-16">
              <CardContent>
                <AlertTriangle className="mx-auto mb-6 h-12 w-12 text-red-400" aria-hidden />
                <h2 className="text-2xl font-bold mb-4 text-red-400">Error Loading Data</h2>
                <p className="text-gray-400 mb-8">{error ?? "Failed to load check-ins."}</p>
                <Button
                  variant="outline"
                  className="border-red-900/50 hover:bg-red-900/20"
                  onClick={() => window.location.reload()}
                >
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : totalCount === 0 ? (
            <Card className="bg-black/60 backdrop-blur-md border-zinc-800 border-dashed text-center py-20">
              <CardContent>
                <Sparkles className="mx-auto mb-6 h-12 w-12 text-orange-400" aria-hidden />
                <h2 className="text-2xl font-bold text-white mb-4">No check-ins yet</h2>
                <p className="text-gray-400 mb-8 text-lg">
                  Go land something and make it official.
                </p>
                <Link href="/">
                  <Button className="bg-orange-500 hover:bg-orange-600 px-10 py-6 text-lg font-bold">
                    Find a Spot
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <section aria-label="Check-in history" className="space-y-6">
              {checkins.map((checkin) => {
                const d = safeDate(checkin.createdAt);
                const dateLabel = d ? format(d, "MMM d, yyyy") : "Unknown date";
                const spotLabel = normalizeSpotLabel(checkin.spotId);

                return (
                  <Card
                    key={checkin.id}
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
                );
              })}
            </section>
          )}

          <div className="mt-24">
            <Footer />
          </div>
        </div>
      </div>
    </div>
  );
}
