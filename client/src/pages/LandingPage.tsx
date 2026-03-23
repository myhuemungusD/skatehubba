import { Link } from "wouter";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="p-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-brand-500">SkateHubba</h1>
        <Link href="/auth" className="px-4 py-2 bg-brand-500 rounded-lg text-sm font-medium hover:bg-brand-600 transition-colors">
          Sign In
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-2xl">
          <h2 className="text-5xl md:text-6xl font-bold mb-6">
            Find spots. Play S.K.A.T.E.
            <br />
            <span className="text-brand-500">Compete.</span>
          </h2>
          <p className="text-xl text-gray-400 mb-8">
            The spot map and async S.K.A.T.E. game for skaters.
            Challenge up to 4 friends. One take. No retries. Final.
          </p>
          <Link
            href="/auth"
            className="inline-block px-8 py-3 bg-brand-500 rounded-lg text-lg font-semibold hover:bg-brand-600 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </main>
    </div>
  );
}
