import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { BarChart3, Users, TrendingUp, Clock, UserCheck, Activity } from "lucide-react";

interface KpiData {
  total_users: number;
  weekly_active_users: number;
  total_battles: number;
  completed_battles: number;
  total_spots: number;
  total_check_ins: number;
  avg_battles_per_user: number;
  battle_completion_rate: number;
}

interface WabAuData {
  wab: number;
  au: number;
  wab_per_au: number;
}

interface TrendRow {
  week: string;
  wab: number;
  au: number;
  wab_per_au: number;
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = "text-neutral-400",
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  color?: string;
}) {
  return (
    <Card className="bg-neutral-900/50 border-neutral-800">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-neutral-400">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-white">{value}</div>
        {subtitle && <p className="text-xs text-neutral-500 mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function MetricSkeleton() {
  return (
    <Card className="bg-neutral-900/50 border-neutral-800">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <Skeleton className="h-4 w-28 bg-neutral-800" />
        <Skeleton className="h-4 w-4 bg-neutral-800" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20 bg-neutral-800" />
        <Skeleton className="h-3 w-32 bg-neutral-800 mt-2" />
      </CardContent>
    </Card>
  );
}

function TrendBar({ value, max, label }: { value: number; max: number; label: string }) {
  const width = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-neutral-500 w-20 shrink-0 text-right">{label}</span>
      <div className="flex-1 bg-neutral-800 rounded-full h-3 overflow-hidden">
        <div
          className="bg-orange-500 h-full rounded-full transition-all duration-300"
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-xs text-neutral-400 w-10 shrink-0">{value}</span>
    </div>
  );
}

export default function AdminMetrics() {
  const {
    data: kpi,
    isLoading: kpiLoading,
    error: kpiError,
  } = useQuery<KpiData>({
    queryKey: ["admin", "metrics", "kpi"],
    queryFn: () => apiRequest<KpiData>({ method: "GET", path: "/api/metrics/kpi" }),
    refetchInterval: 60000,
  });

  const { data: wabAu, isLoading: wabLoading } = useQuery<WabAuData>({
    queryKey: ["admin", "metrics", "wab-au"],
    queryFn: () => apiRequest<WabAuData>({ method: "GET", path: "/api/metrics/wab-au" }),
    refetchInterval: 60000,
  });

  const { data: trend, isLoading: trendLoading } = useQuery<TrendRow[]>({
    queryKey: ["admin", "metrics", "wab-au-trend"],
    queryFn: () => apiRequest<TrendRow[]>({ method: "GET", path: "/api/metrics/wab-au/trend" }),
    refetchInterval: 300000,
  });

  const maxWab = Math.max(...(trend || []).map((t) => Number(t.wab) || 0), 1);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Metrics</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Platform KPIs, engagement, and growth metrics
        </p>
      </div>

      {kpiError && (
        <div className="mb-6 rounded-md border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">Failed to load metrics data.</p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {kpiLoading ? (
          <>
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
          </>
        ) : kpi ? (
          <>
            <MetricCard
              title="Total Users"
              value={kpi.total_users}
              icon={Users}
              color="text-blue-400"
            />
            <MetricCard
              title="Weekly Active"
              value={kpi.weekly_active_users}
              subtitle={`${kpi.total_users > 0 ? ((kpi.weekly_active_users / kpi.total_users) * 100).toFixed(1) : 0}% of total`}
              icon={Activity}
              color="text-green-400"
            />
            <MetricCard
              title="Total Battles"
              value={kpi.total_battles}
              subtitle={`${kpi.completed_battles} completed`}
              icon={BarChart3}
              color="text-orange-400"
            />
            <MetricCard
              title="Completion Rate"
              value={`${(Number(kpi.battle_completion_rate) || 0).toFixed(1)}%`}
              subtitle={`${kpi.avg_battles_per_user?.toFixed(1) || 0} battles/user`}
              icon={TrendingUp}
              color="text-purple-400"
            />
          </>
        ) : null}
      </div>

      {/* WAB / AU */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card className="bg-neutral-900/50 border-neutral-800">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-orange-400" />
              WAB / AU Snapshot
            </CardTitle>
          </CardHeader>
          <CardContent>
            {wabLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-32 bg-neutral-800" />
                <Skeleton className="h-6 w-32 bg-neutral-800" />
                <Skeleton className="h-6 w-32 bg-neutral-800" />
              </div>
            ) : wabAu ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-400">Weekly Active Battles</span>
                  <span className="text-lg font-bold text-white">{wabAu.wab}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-400">Active Users (7d)</span>
                  <span className="text-lg font-bold text-white">{wabAu.au}</span>
                </div>
                <div className="border-t border-neutral-800 pt-3 flex items-center justify-between">
                  <span className="text-sm text-neutral-400">WAB per AU</span>
                  <span className="text-lg font-bold text-orange-400">
                    {Number(wabAu.wab_per_au).toFixed(2)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-neutral-500 text-sm">No data available</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-neutral-900/50 border-neutral-800">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-400" />
              Spots & Check-ins
            </CardTitle>
          </CardHeader>
          <CardContent>
            {kpiLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-32 bg-neutral-800" />
                <Skeleton className="h-6 w-32 bg-neutral-800" />
              </div>
            ) : kpi ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-400">Total Spots</span>
                  <span className="text-lg font-bold text-white">{kpi.total_spots}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-400">Total Check-ins</span>
                  <span className="text-lg font-bold text-white">{kpi.total_check_ins}</span>
                </div>
                <div className="border-t border-neutral-800 pt-3 flex items-center justify-between">
                  <span className="text-sm text-neutral-400">Check-ins per Spot</span>
                  <span className="text-lg font-bold text-orange-400">
                    {kpi.total_spots > 0 ? (kpi.total_check_ins / kpi.total_spots).toFixed(1) : "0"}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-neutral-500 text-sm">No data available</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* WAB Trend (12 weeks) */}
      <Card className="bg-neutral-900/50 border-neutral-800">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-white">
            Weekly Active Battles — 12-Week Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full bg-neutral-800" />
              ))}
            </div>
          ) : trend && trend.length > 0 ? (
            <div className="space-y-2">
              {trend.map((row) => (
                <TrendBar
                  key={row.week}
                  value={Number(row.wab)}
                  max={maxWab}
                  label={new Date(row.week).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                />
              ))}
            </div>
          ) : (
            <p className="text-neutral-500 text-sm text-center py-8">
              No trend data available yet. Data populates once battles are played.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
