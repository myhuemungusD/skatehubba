import { type ReactNode, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { Home, MapPin, Trophy, User, LogOut, Shield } from "lucide-react";
import { useIsMobile } from "../../hooks/use-mobile";
import { useAuth } from "../../hooks/useAuth";
import { EmailVerificationBanner } from "../EmailVerificationBanner";
import NotificationBell from "../NotificationBell";

interface DashboardLayoutProps {
  children: ReactNode;
}

const navItems = [
  { label: "Home", href: "/hub", icon: Home },
  { label: "Map", href: "/map", icon: MapPin },
  { label: "Ranks", href: "/leaderboard", icon: Trophy },
  { label: "Profile", href: "/me", icon: User },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const auth = useAuth();

  const handleLogout = useCallback(async () => {
    try {
      await auth?.signOut?.();
    } catch {
      // Best-effort logout
    } finally {
      setLocation("/");
    }
  }, [auth, setLocation]);

  // Desktop layout with sidebar
  if (!isMobile) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex">
        {/* Desktop Sidebar */}
        <aside className="fixed left-0 top-0 h-full w-64 border-r border-neutral-800 bg-neutral-900/50 backdrop-blur-sm z-40 flex flex-col">
          <div className="p-6 flex items-center justify-between">
            <Link href="/hub" className="flex items-center gap-2">
              <span className="text-2xl font-bold text-yellow-400">SkateHubba</span>
            </Link>
            <NotificationBell />
          </div>
          <nav className="px-4 py-2 flex-1" role="navigation" aria-label="Main navigation">
            <ul className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.split("?")[0] === item.href;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-yellow-400/10 text-yellow-400"
                          : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
                      }`}
                      aria-current={isActive ? "page" : undefined}
                      data-testid={`nav-${item.label.toLowerCase()}`}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Admin + Logout at bottom of sidebar */}
          <div className="px-4 py-4 border-t border-neutral-800 space-y-1">
            {auth.isAdmin && (
              <Link
                href="/admin"
                className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-orange-400 hover:bg-orange-500/10 transition-colors w-full"
                data-testid="nav-admin"
              >
                <Shield className="h-5 w-5" aria-hidden="true" />
                <span>Admin</span>
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors w-full"
              data-testid="nav-signout"
            >
              <LogOut className="h-5 w-5" aria-hidden="true" />
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        {/* Main content area */}
        <main className="flex-1 ml-64">
          <EmailVerificationBanner />
          <div className="min-h-screen">
            <div className="mx-auto max-w-4xl px-6 py-8">{children}</div>
          </div>
        </main>
      </div>
    );
  }

  // Mobile layout with bottom navigation
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <EmailVerificationBanner />
      {/* Mobile top bar with notification bell */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-neutral-800 bg-neutral-950/95 px-4 py-2 backdrop-blur-sm">
        <span className="text-lg font-bold text-yellow-400">SkateHubba</span>
        <NotificationBell />
      </div>
      <main className="flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom)+1rem)] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="mx-auto w-full max-w-md px-4 pt-4">{children}</div>
      </main>
      <nav
        className="fixed bottom-0 left-0 right-0 border-t border-neutral-800 bg-neutral-950/95 pb-[env(safe-area-inset-bottom)]"
        role="navigation"
        aria-label="Dashboard navigation"
      >
        <div className="mx-auto flex max-w-md items-center justify-between px-2 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.split("?")[0] === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-w-[64px] flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                  isActive ? "text-yellow-400" : "text-neutral-400 hover:text-white"
                }`}
                aria-current={isActive ? "page" : undefined}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
