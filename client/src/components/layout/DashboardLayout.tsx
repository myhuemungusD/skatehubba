import { Link, useLocation } from "wouter";
import { useAuth } from "../../hooks/useAuth";

const navItems = [
  { href: "/hub", label: "Home" },
  { href: "/play", label: "Play" },
  { href: "/map", label: "Map" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top bar */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/hub" className="text-lg font-bold text-brand-500">
            SkateHubba
          </Link>

          <nav className="hidden md:flex gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  location === item.href
                    ? "bg-brand-500/20 text-brand-500"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {profile && (
              <span className="text-sm text-gray-400">@{profile.handle}</span>
            )}
            <button
              onClick={() => signOut()}
              className="text-xs text-gray-500 hover:text-white transition-colors min-h-[44px] flex items-center px-2"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-800">
        <div className="flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 py-4 text-center text-xs font-medium transition-colors ${
                location === item.href
                  ? "text-brand-500"
                  : "text-gray-500"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 pb-24 md:pb-6">
        {children}
      </main>
    </div>
  );
}
