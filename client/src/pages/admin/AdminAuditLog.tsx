import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api/client";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { ChevronLeft, ChevronRight, CheckCircle, XCircle } from "lucide-react";

interface AuditLogEntry {
  id: number;
  eventType: string;
  userId: string | null;
  email: string | null;
  ipAddress: string;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  success: boolean;
  errorMessage: string | null;
  createdAt: string;
}

interface AuditLogResponse {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

const EVENT_CATEGORIES: Record<string, string[]> = {
  Authentication: [
    "AUTH_LOGIN_SUCCESS",
    "AUTH_LOGIN_FAILURE",
    "AUTH_LOGOUT",
    "AUTH_SESSION_CREATED",
    "AUTH_SESSION_EXPIRED",
    "AUTH_SESSION_INVALIDATED",
  ],
  Account: ["ACCOUNT_CREATED", "ACCOUNT_LOCKED", "ACCOUNT_UNLOCKED", "ACCOUNT_DEACTIVATED"],
  Password: ["PASSWORD_CHANGED", "PASSWORD_RESET_REQUESTED", "PASSWORD_RESET_COMPLETED"],
  MFA: ["MFA_ENABLED", "MFA_DISABLED", "MFA_CHALLENGE_SUCCESS", "MFA_CHALLENGE_FAILURE"],
  Security: [
    "SECURITY_SUSPICIOUS_ACTIVITY",
    "SECURITY_RATE_LIMIT",
    "SECURITY_CSRF_VIOLATION",
    "SECURITY_INVALID_TOKEN",
  ],
};

function eventCategory(eventType: string): string {
  for (const [cat, events] of Object.entries(EVENT_CATEGORIES)) {
    if (events.includes(eventType)) return cat;
  }
  return "Other";
}

function EventBadge({ eventType }: { eventType: string }) {
  const category = eventCategory(eventType);
  const colorMap: Record<string, string> = {
    Authentication: "text-blue-400 border-blue-500/30",
    Account: "text-purple-400 border-purple-500/30",
    Password: "text-orange-400 border-orange-500/30",
    MFA: "text-cyan-400 border-cyan-500/30",
    Security: "text-red-400 border-red-500/30",
    Other: "text-neutral-400 border-neutral-600",
  };

  return (
    <Badge variant="outline" className={colorMap[category] || colorMap.Other}>
      {category}
    </Badge>
  );
}

function LogRowSkeleton() {
  return (
    <div className="flex items-start gap-4 p-3 border-b border-neutral-800">
      <Skeleton className="h-4 w-4 bg-neutral-800 mt-0.5" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-48 bg-neutral-800" />
        <Skeleton className="h-3 w-32 bg-neutral-800" />
      </div>
      <Skeleton className="h-5 w-20 bg-neutral-800" />
    </div>
  );
}

export default function AdminAuditLog() {
  const [page, setPage] = useState(1);
  const [eventFilter, setEventFilter] = useState("all");
  const [successFilter, setSuccessFilter] = useState("all");

  const { data, isLoading } = useQuery<AuditLogResponse>({
    queryKey: ["admin", "audit-logs", page, eventFilter, successFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (eventFilter !== "all") params.set("eventType", eventFilter);
      if (successFilter !== "all") params.set("success", successFilter);
      return apiRequest({
        method: "GET",
        path: `/api/admin/audit-logs?${params}`,
      });
    },
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  // Flatten all event types for the filter dropdown
  const allEventTypes = Object.values(EVENT_CATEGORIES).flat();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Audit Log</h1>
        <p className="text-sm text-neutral-400 mt-1">Security events and authentication activity</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <Select
          value={eventFilter}
          onValueChange={(v) => {
            setEventFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-52 bg-neutral-900 border-neutral-700 text-white text-sm">
            <SelectValue placeholder="Event type" />
          </SelectTrigger>
          <SelectContent className="bg-neutral-900 border-neutral-700 max-h-64">
            <SelectItem value="all">All events</SelectItem>
            {allEventTypes.map((et) => (
              <SelectItem key={et} value={et} className="text-xs">
                {et}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={successFilter}
          onValueChange={(v) => {
            setSuccessFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-32 bg-neutral-900 border-neutral-700 text-white text-sm">
            <SelectValue placeholder="Outcome" />
          </SelectTrigger>
          <SelectContent className="bg-neutral-900 border-neutral-700">
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="true">Success</SelectItem>
            <SelectItem value="false">Failure</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Log Entries */}
      <Card className="bg-neutral-900/50 border-neutral-800">
        {isLoading ? (
          <div>
            {Array.from({ length: 10 }).map((_, i) => (
              <LogRowSkeleton key={i} />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <CardContent className="p-8 text-center">
            <p className="text-neutral-400">No audit log entries found.</p>
          </CardContent>
        ) : (
          <div>
            {logs.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 p-3 border-b border-neutral-800 last:border-b-0 hover:bg-neutral-900/80 transition-colors"
              >
                {/* Success/Failure indicator */}
                <div className="mt-0.5">
                  {entry.success ? (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                  )}
                </div>

                {/* Event Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-mono text-white">{entry.eventType}</span>
                    <EventBadge eventType={entry.eventType} />
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-neutral-500">
                    {entry.email && <span>{entry.email}</span>}
                    {entry.userId && <span>UID: {entry.userId.slice(0, 12)}...</span>}
                    <span>IP: {entry.ipAddress}</span>
                    <span>
                      {new Date(entry.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </div>
                  {entry.errorMessage && (
                    <p className="text-[11px] text-red-400 mt-0.5 truncate">{entry.errorMessage}</p>
                  )}
                  {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                    <details className="mt-1">
                      <summary className="text-[10px] text-neutral-600 cursor-pointer hover:text-neutral-400">
                        metadata
                      </summary>
                      <pre className="text-[10px] text-neutral-500 mt-1 p-2 rounded bg-neutral-950 overflow-x-auto">
                        {JSON.stringify(entry.metadata, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-neutral-500">
            Page {page} of {totalPages} ({total} entries)
          </p>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-neutral-700 text-neutral-400"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-neutral-700 text-neutral-400"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
