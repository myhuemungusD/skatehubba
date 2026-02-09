import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Flag, Users, ScrollText, ArrowLeft } from "lucide-react";

interface AdminLayoutProps {
  children: ReactNode;
}

const adminNav = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Reports", href: "/admin/reports", icon: Flag },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Audit Log", href: "/admin/audit-log", icon: ScrollText },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-56 border-r border-neutral-800 bg-neutral-900/50 backdrop-blur-sm z-40 flex flex-col">
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
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-56">
        <div className="min-h-screen">
          <div className="mx-auto max-w-6xl px-6 py-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
