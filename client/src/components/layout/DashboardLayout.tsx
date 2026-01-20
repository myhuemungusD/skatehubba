import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Home, MapPin, Scan, ShoppingBag, User } from "lucide-react";
import { useIsMobile } from "../../hooks/use-mobile";

interface DashboardLayoutProps {
  children: ReactNode;
}

const navItems = [
  { label: "Hub", href: "/feed", icon: Home },
  { label: "Spots", href: "/map", icon: MapPin },
  { label: "Play SKATE", href: "/game", icon: Scan },
  { label: "Shop", href: "/shop", icon: ShoppingBag },
  { label: "Me", href: "/checkins", icon: User },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location] = useLocation();
  const isMobile = useIsMobile();

  // Desktop layout with sidebar
  if (!isMobile) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex">
        {/* Desktop Sidebar */}
        <aside className="fixed left-0 top-0 h-full w-64 border-r border-neutral-800 bg-neutral-900/50 backdrop-blur-sm z-40">
          <div className="p-6">
            <Link href="/feed" className="flex items-center gap-2">
              <span className="text-2xl font-bold text-yellow-400">🛹 SkateHubba</span>
            </Link>
          </div>
          <nav className="px-4 py-2" role="navigation" aria-label="Main navigation">
            <ul className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href;

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
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        {/* Main content area */}
        <main className="flex-1 ml-64">
          <div className="min-h-screen">
            <div className="mx-auto max-w-4xl px-6 py-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Mobile layout with bottom navigation
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <main className="flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom)+1rem)] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="mx-auto w-full max-w-md px-4 pt-4">
          {children}
        </div>
      </main>
      <nav
        className="fixed bottom-0 left-0 right-0 border-t border-neutral-800 bg-neutral-950/95 pb-[env(safe-area-inset-bottom)]"
        role="navigation"
        aria-label="Dashboard navigation"
      >
        <div className="mx-auto flex max-w-md items-center justify-between px-2 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-w-[64px] flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                  isActive
                    ? "text-yellow-400"
                    : "text-neutral-400 hover:text-white"
                }`}
                aria-current={isActive ? "page" : undefined}
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
