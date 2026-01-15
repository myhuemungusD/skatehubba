import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Home, MapPin, Scan, ShoppingBag, User } from "lucide-react";

interface DashboardLayoutProps {
  children: ReactNode;
}

const navItems = [
  { label: "Hub", href: "/feed", icon: Home },
  { label: "Spots", href: "/map", icon: MapPin },
  { label: "AR", href: "/trickmint", icon: Scan },
  { label: "Shop", href: "/shop", icon: ShoppingBag },
  { label: "Me", href: "/checkins", icon: User },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location] = useLocation();

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
