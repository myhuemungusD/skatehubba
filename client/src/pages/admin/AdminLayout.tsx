import { type ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Flag,
  Users,
  ScrollText,
  BarChart3,
  ArrowLeft,
  Menu,
  X,
} from "lucide-react";

interface AdminLayoutProps {
  children: ReactNode;
}

const adminNav = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Reports", href: "/admin/reports", icon: Flag },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Metrics", href: "/admin/metrics", icon: BarChart3 },
  { label: "Audit Log", href: "/admin/audit-log", icon: ScrollText },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebar = (
    <>
      <div className="p-4 border-b border-neutral-800">
        <Link
          href="/hub"
          className="flex items-center gap-2 text-neutral-400 hover:text-white text-sm transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to App
        </Link>
        <h1 className="text-lg font-bold text-orange-400">Admin</h1>
        <p className="text-xs text-neutral-500 mt-0.5">Moderation Dashboard</p>
      </div>

      <nav className="px-3 py-3 flex-1">
        <ul className="space-y-0.5">
          {adminNav.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/admin" ? location === "/admin" : location.startsWith(item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-orange-500/10 text-orange-400"
                      : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
                  }`}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex">
      {/* Mobile header */}
      <header className="fixed top-0 left-0 right-0 h-14 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur-sm z-50 flex items-center px-4 md:hidden">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <span className="ml-3 text-sm font-bold text-orange-400">Admin</span>
      </header>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — desktop: fixed; mobile: slide-in */}
      <aside
        className={`fixed left-0 top-0 h-full w-56 border-r border-neutral-800 bg-neutral-900/95 backdrop-blur-sm z-40 flex flex-col transition-transform duration-200 md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:z-40`}
      >
        {/* On mobile, offset for header */}
        <div className="md:hidden h-14" />
        {sidebar}
      </aside>

      {/* Main content */}
      <main className="flex-1 md:ml-56">
        <div className="min-h-screen pt-14 md:pt-0">
          <div className="mx-auto max-w-6xl px-4 py-4 md:px-6 md:py-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
