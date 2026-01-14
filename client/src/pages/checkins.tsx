import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useAuth } from "../context/AuthProvider";
import { getUserCheckins } from "../lib/api-sdk/checkins";
import { type CheckInResult } from "../../../shared/checkin-types";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { ArrowLeft, Calendar, Award, ExternalLink, Loader2, MapPin } from "lucide-react";
import { format } from "date-fns";
import Navigation from "../components/Navigation";
import BackgroundCarousel from "../components/BackgroundCarousel";

export default function CheckinsPage() {
  const auth = useAuth();
  const user = auth?.user ?? null;
  const isAuthenticated = auth?.isAuthenticated ?? false;
  const [isClient, setIsClient] = useState(false);
  const [checkins, setCheckins] = useState<CheckInResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;

    async function fetchCheckins() {
      if (!user?.uid) {
        setLoading(false);
        return;
      }

      try {
        const data = await getUserCheckins(user.uid);
        setCheckins(data);
      } catch (err: any) {
        setError(err.message || "Failed to load check-ins");
      } finally {
        setLoading(false);
      }
    }

    if (isAuthenticated) {
      fetchCheckins();
    } else {
      setLoading(false);
    }
  }, [user?.uid, isAuthenticated, isClient]);

  if (!isClient) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-[#181818] text-white">
        <h1 className="text-2xl font-bold">SkateHubba</h1>
      </main>
    );
  }

  return (
    <BackgroundCarousel className="text-white">
      <Navigation />
      <div className="min-h-screen pt-24 pb-12">
        <div className="max-w-4xl mx-auto px-6">
          <Link href="/">
            <Button variant="ghost" className="mb-8 text-gray-400 hover:text-white" data-testid="link-back-home">
              <ArrowLeft className="w-4 h-4 mr-2" />
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
            <Badge variant="outline" className="w-fit border-orange-500 text-orange-400 px-4 py-1.5 text-base">
              {checkins.length} Check-ins
            </Badge>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-10 h-10 text-orange-500 animate-spin mb-4" />
              <p className="text-gray-400">Loading your sessions...</p>
            </div>
          ) : !isAuthenticated ? (
            <Card className="bg-black/60 backdrop-blur-md border-zinc-800 border-dashed text-center py-16">
              <CardContent>
                <div className="text-5xl mb-6">🔒</div>
                <h3 className="text-2xl font-bold mb-4">Account Required</h3>
                <p className="text-gray-400 mb-8 max-w-sm mx-auto">Sign in to view your trick history and track your progression.</p>
                <Link href="/auth">
                  <Button className="bg-orange-500 hover:bg-orange-600 px-8 py-6 text-lg font-bold">Sign In / Create Account</Button>
                </Link>
              </CardContent>
            </Card>
          ) : error ? (
            <Card className="bg-red-900/20 backdrop-blur-md border-red-900/50 text-center py-16">
              <CardContent>
                <div className="text-5xl mb-6">⚠️</div>
                <h3 className="text-2xl font-bold mb-4 text-red-400">Error Loading Data</h3>
                <p className="text-gray-400 mb-8">{error}</p>
                <Button variant="outline" className="border-red-900/50 hover:bg-red-900/20" onClick={() => window.location.reload()}>Retry Connection</Button>
              </CardContent>
            </Card>
          ) : checkins.length === 0 ? (
            <Card className="bg-black/60 backdrop-blur-md border-zinc-800 border-dashed text-center py-20">
              <CardContent>
                <div className="text-6xl mb-6">🛹</div>
                <h3 className="text-2xl font-bold text-white mb-4">No check-ins yet</h3>
                <p className="text-gray-400 mb-8 text-lg">Go land something and make it official.</p>
                <Link href="/">
                  <Button className="bg-orange-500 hover:bg-orange-600 px-10 py-6 text-lg font-bold">Find a Spot</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {checkins.map((checkin) => (
                <Card key={checkin.id} className="bg-black/80 backdrop-blur-md border-zinc-800 hover:border-orange-500/50 transition-all duration-300 group" data-testid={`card-checkin-${checkin.id}`}>
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <CardTitle className="text-2xl font-bold text-white flex items-center gap-3">
                      <div className="w-10 h-10 bg-success/20 rounded-full flex items-center justify-center">
                        <CheckCircle className="w-6 h-6 text-success" />
                      </div>
                      <span className="group-hover:text-orange-400 transition-colors">{checkin.trick}</span>
                    </CardTitle>
                    <Badge variant="secondary" className="bg-orange-500/10 text-orange-400 border-orange-500/20 px-3 py-1">
                      <Award className="w-4 h-4 mr-1.5" />
                      +{checkin.awardedPoints} XP
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap items-center gap-y-3 gap-x-8 text-base text-gray-400">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-gray-500" />
                        {format(new Date(checkin.createdAt), "MMM d, yyyy")}
                      </div>
                      <div className="flex items-center gap-2 capitalize">
                        <MapPin className="w-5 h-5 text-gray-500" />
                        {checkin.spotId.replace(/-/g, " ")}
                      </div>
                      {checkin.videoUrl && (
                        <a 
                          href={checkin.videoUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-orange-400 hover:text-orange-300 transition-colors font-medium"
                        >
                          <ExternalLink className="w-5 h-5" />
                          Watch Clip
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <footer className="mt-24 pb-8 text-center border-t border-zinc-800 pt-12">
            <p className="text-gray-500 text-sm tracking-widest uppercase">
              &copy; 2026 SkateHubba™ — Built by Jason Hamilton
            </p>
          </footer>
        </div>
      </div>
    </BackgroundCarousel>
  );
}

function CheckCircle(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
