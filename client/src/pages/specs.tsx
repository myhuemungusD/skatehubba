import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import { ArrowLeft, Github, Mail, CheckCircle2, XCircle, Server, Database, Smartphone, Globe, FileCode, Shield, Zap } from "lucide-react";

export default function SpecsPage() {
  const [isClient, setIsClient] = useState(false);
  const [apiStatus, setApiStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;
    fetch("/api/health")
      .then((res) => {
        if (res.ok) setApiStatus("ok");
        else setApiStatus("error");
      })
      .catch(() => setApiStatus("error"));
  }, [isClient]);

  if (!isClient) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-[#181818] text-white">
        <h1 className="text-2xl font-bold">SkateHubba</h1>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link href="/">
          <Button variant="ghost" className="mb-8 text-gray-400 hover:text-white" data-testid="link-back-home">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>

        <div className="text-center mb-12">
          <Badge variant="outline" className="mb-4 border-orange-500 text-orange-400">
            v0.2 - Phase 2
          </Badge>
          <h1 className="text-5xl font-bold mb-4 tracking-tight">
            SkateHubba<span className="text-orange-500">™</span> Specs
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            API, auth, monorepo, and real-world feature foundation is live.
          </p>
        </div>

        <div className="flex justify-center gap-4 mb-12">
          <a
            href="https://github.com/jayham710/skatehubba-platform"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button className="bg-zinc-800 hover:bg-zinc-700 text-white" data-testid="button-github">
              <Github className="w-4 h-4 mr-2" />
              GitHub Repo
            </Button>
          </a>
          <a href="mailto:jason@skatehubba.com">
            <Button variant="outline" className="border-orange-500 text-orange-400 hover:bg-orange-500/10" data-testid="button-contact">
              <Mail className="w-4 h-4 mr-2" />
              Contact
            </Button>
          </a>
        </div>

        <Card className="bg-zinc-900 border-zinc-800 mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Server className="w-5 h-5 text-orange-400" />
              API Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3" data-testid="status-api">
              {apiStatus === "loading" && (
                <span className="text-gray-400">Checking...</span>
              )}
              {apiStatus === "ok" && (
                <>
                  <CheckCircle2 className="w-5 h-5 text-success" />
                  <span className="text-success font-medium">API: OK</span>
                </>
              )}
              {apiStatus === "error" && (
                <>
                  <XCircle className="w-5 h-5 text-red-500" />
                  <span className="text-red-500 font-medium">API: Offline</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white text-lg">
                <Database className="w-5 h-5 text-orange-400" />
                Backend Stack
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-gray-300">
              <p>Express.js + TypeScript (ESM)</p>
              <p>Drizzle ORM + PostgreSQL (Neon)</p>
              <p>Firebase Admin SDK</p>
              <p>Zod validation</p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white text-lg">
                <Globe className="w-5 h-5 text-orange-400" />
                Frontend Stack
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-gray-300">
              <p>React 18 + Vite</p>
              <p>TanStack Query + Zustand</p>
              <p>Tailwind CSS + shadcn/ui</p>
              <p>Wouter routing</p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white text-lg">
                <Smartphone className="w-5 h-5 text-orange-400" />
                Mobile Stack
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-gray-300">
              <p>React Native + Expo SDK 51</p>
              <p>expo-router navigation</p>
              <p>expo-camera + expo-location</p>
              <p>react-native-maps</p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white text-lg">
                <Shield className="w-5 h-5 text-orange-400" />
                Auth & Security
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-gray-300">
              <p>Firebase Authentication</p>
              <p>JWT tokens + session cookies</p>
              <p>Helmet.js security headers</p>
              <p>Rate limiting</p>
            </CardContent>
          </Card>
        </div>

        <Separator className="bg-zinc-800 mb-12" />

        <h2 className="text-2xl font-bold mb-6 text-orange-400 flex items-center gap-2">
          <FileCode className="w-6 h-6" />
          Phase 2 Endpoints
        </h2>

        <div className="space-y-4 mb-12">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <Badge className="bg-green-600 text-white mb-2">POST</Badge>
                  <p className="font-mono text-sm text-gray-300">/api/checkins</p>
                </div>
                <Badge variant="outline" className="border-orange-500 text-orange-400">Auth Required</Badge>
              </div>
              <p className="text-gray-400 text-sm mt-2">
                Submit trick check-in with geo-verification. Returns XP points based on trick difficulty and spot tier.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <Badge className="bg-blue-600 text-white mb-2">GET</Badge>
                  <p className="font-mono text-sm text-gray-300">/api/health</p>
                </div>
                <Badge variant="outline" className="border-gray-500 text-gray-400">Public</Badge>
              </div>
              <p className="text-gray-400 text-sm mt-2">
                Health check endpoint for monitoring and status verification.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <Badge className="bg-blue-600 text-white mb-2">GET</Badge>
                  <p className="font-mono text-sm text-gray-300">/api/spots</p>
                </div>
                <Badge variant="outline" className="border-gray-500 text-gray-400">Public</Badge>
              </div>
              <p className="text-gray-400 text-sm mt-2">
                Retrieve skate spots with geo data, ratings, and tier classification.
              </p>
            </CardContent>
          </Card>
        </div>

        <Separator className="bg-zinc-800 mb-12" />

        <h2 className="text-2xl font-bold mb-6 text-orange-400 flex items-center gap-2">
          <Zap className="w-6 h-6" />
          Monorepo Structure
        </h2>

        <Card className="bg-zinc-900 border-zinc-800 mb-12">
          <CardContent className="p-6 font-mono text-sm text-gray-300">
            <pre className="whitespace-pre-wrap">{`├── apps/
│   ├── web/       → React web app
│   ├── server/    → Express.js API
│   └── mobile/    → React Native app
├── packages/
│   ├── types/     → Shared Zod schemas
│   ├── api-sdk/   → API client wrappers
│   ├── db/        → Drizzle schema exports
│   └── firebase/  → Firebase config
├── specs/
│   ├── checkin-endpoint.md
│   ├── user-profile.md
│   └── auth-flow.md
└── shared/        → Legacy shared code`}</pre>
          </CardContent>
        </Card>

        <footer className="text-center text-gray-500 border-t border-zinc-800 pt-8">
          <p className="mb-2">
            <a href="mailto:jason@skatehubba.com" className="hover:text-orange-400 transition-colors">
              jason@skatehubba.com
            </a>
          </p>
          <Badge variant="outline" className="border-zinc-700 text-zinc-500">
            v0.2 - Phase 2 Complete
          </Badge>
          <p className="mt-4 text-sm">
            &copy; 2025 <span className="text-orange-400">SkateHubba™</span> — Built by Jason Hamilton
          </p>
        </footer>
      </div>
    </div>
  );
}
