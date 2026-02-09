import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/ui/skeleton";
import { Link } from "wouter";
import { Flag, Users, Shield, ShoppingCart, AlertTriangle, Activity } from "lucide-react";

interface AdminStats {
  totalUsers: number;
  queuedReports: number;
  totalReports: number;
  totalModActions: number;
  bannedUsers: number;
  totalOrders: number;
}

function StatCard({
  title,
  value,
  icon: Icon,
  href,
  variant = "default",
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  href?: string;
  variant?: "default" | "warning" | "danger";
}) {
  const variantStyles = {
    default: "border-neutral-800",
    warning: "border-yellow-500/30",
    danger: "border-red-500/30",
  };

  const iconStyles = {
    default: "text-neutral-400",
    warning: "text-yellow-400",
    danger: "text-red-400",
  };

  const content = (
    <Card
      className={`bg-neutral-900/50 ${variantStyles[variant]} hover:bg-neutral-900/80 transition-colors`}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-neutral-400">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${iconStyles[variant]}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-white">{value}</div>
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }

  return content;
}

function StatSkeleton() {
  return (
    <Card className="bg-neutral-900/50 border-neutral-800">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <Skeleton className="h-4 w-24 bg-neutral-800" />
        <Skeleton className="h-4 w-4 bg-neutral-800" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16 bg-neutral-800" />
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const {
    data: stats,
    isLoading,
    error,
  } = useQuery<AdminStats>({
    queryKey: ["admin", "stats"],
    queryFn: () => apiRequest<AdminStats>({ method: "GET", path: "/api/admin/stats" }),
    refetchInterval: 30000,
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-neutral-400 mt-1">Moderation overview and platform health</p>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">Failed to load dashboard stats.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {isLoading ? (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        ) : stats ? (
          <>
            <StatCard
              title="Queued Reports"
              value={stats.queuedReports}
              icon={Flag}
              href="/admin/reports"
              variant={stats.queuedReports > 0 ? "warning" : "default"}
            />
            <StatCard
              title="Total Users"
              value={stats.totalUsers}
              icon={Users}
              href="/admin/users"
            />
            <StatCard
              title="Banned Users"
              value={stats.bannedUsers}
              icon={AlertTriangle}
              variant={stats.bannedUsers > 0 ? "danger" : "default"}
            />
            <StatCard title="Mod Actions" value={stats.totalModActions} icon={Shield} />
            <StatCard title="Total Reports" value={stats.totalReports} icon={Activity} />
            <StatCard title="Orders" value={stats.totalOrders} icon={ShoppingCart} />
          </>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-neutral-900/50 border-neutral-800">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-white">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link
              href="/admin/reports"
              className="flex items-center justify-between rounded-md border border-neutral-800 px-4 py-3 text-sm hover:bg-neutral-800 transition-colors"
            >
              <span className="text-neutral-300">Review pending reports</span>
              {stats && stats.queuedReports > 0 && (
                <Badge
                  variant="destructive"
                  className="bg-orange-500/20 text-orange-400 border-orange-500/30"
                >
                  {stats.queuedReports}
                </Badge>
              )}
            </Link>
            <Link
              href="/admin/users"
              className="flex items-center justify-between rounded-md border border-neutral-800 px-4 py-3 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors"
            >
              <span>Manage users & trust levels</span>
            </Link>
            <Link
              href="/admin/audit-log"
              className="flex items-center justify-between rounded-md border border-neutral-800 px-4 py-3 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors"
            >
              <span>View security audit log</span>
            </Link>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900/50 border-neutral-800">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-white">Trust Level Guide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-neutral-400">
            <div className="flex items-start gap-3">
              <Badge
                variant="outline"
                className="text-neutral-400 border-neutral-600 mt-0.5 shrink-0"
              >
                TL0
              </Badge>
              <span>New users. 2 check-ins/day, 1 post/day, 3 reports/day.</span>
            </div>
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="text-blue-400 border-blue-500/30 mt-0.5 shrink-0">
                TL1
              </Badge>
              <span>Trusted. 5 check-ins/day, 3 posts/day, 5 reports/day.</span>
            </div>
            <div className="flex items-start gap-3">
              <Badge
                variant="outline"
                className="text-green-400 border-green-500/30 mt-0.5 shrink-0"
              >
                TL2
              </Badge>
              <span>Veteran. 10 check-ins/day, 5 posts/day, 10 reports/day.</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
