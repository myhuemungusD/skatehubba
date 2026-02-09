import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Textarea } from "../../components/ui/textarea";
import { useToast } from "../../hooks/use-toast";
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowUpCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";

interface ModerationReport {
  id: string;
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: string;
  notes: string | null;
  status: string;
  createdAt: string;
}

interface ReportsResponse {
  reports: ModerationReport[];
  total: number;
  page: number;
  limit: number;
}

type ReportStatus = "queued" | "reviewing" | "resolved" | "dismissed" | "escalated";

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  queued: {
    label: "Queued",
    color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    icon: Clock,
  },
  reviewing: {
    label: "Reviewing",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    icon: Clock,
  },
  resolved: {
    label: "Resolved",
    color: "bg-green-500/20 text-green-400 border-green-500/30",
    icon: CheckCircle,
  },
  dismissed: {
    label: "Dismissed",
    color: "bg-neutral-500/20 text-neutral-400 border-neutral-600",
    icon: XCircle,
  },
  escalated: {
    label: "Escalated",
    color: "bg-red-500/20 text-red-400 border-red-500/30",
    icon: AlertTriangle,
  },
};

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.queued;
  return (
    <Badge variant="outline" className={config.color}>
      {config.label}
    </Badge>
  );
}

function ReportSkeleton() {
  return (
    <Card className="bg-neutral-900/50 border-neutral-800">
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-32 bg-neutral-800" />
            <Skeleton className="h-3 w-48 bg-neutral-800" />
            <Skeleton className="h-3 w-64 bg-neutral-800" />
          </div>
          <Skeleton className="h-6 w-16 bg-neutral-800" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminReports() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [modActionDialog, setModActionDialog] = useState<{
    report: ModerationReport;
    actionType: string;
  } | null>(null);
  const [modNotes, setModNotes] = useState("");
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<ReportsResponse>({
    queryKey: ["admin", "reports", statusFilter, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      return apiRequest({
        method: "GET",
        path: `/api/admin/reports?${params}`,
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ reportId, status }: { reportId: string; status: ReportStatus }) =>
      apiRequest({
        method: "PATCH",
        path: `/api/admin/reports/${reportId}/status`,
        body: { status },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "reports"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
      setPendingStatusUpdate(null);
      toast({ title: "Report updated" });
    },
    onError: () => {
      setPendingStatusUpdate(null);
      toast({ title: "Failed to update report", variant: "destructive" });
    },
  });

  const modActionMutation = useMutation({
    mutationFn: (input: {
      targetUserId: string;
      actionType: string;
      reasonCode: string;
      notes: string;
      relatedReportId: string;
    }) =>
      apiRequest({
        method: "POST",
        path: "/api/admin/mod-action",
        body: { ...input, reversible: true },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      setModActionDialog(null);
      setModNotes("");
      toast({ title: "Moderation action applied" });
    },
    onError: () => {
      toast({ title: "Failed to apply action", variant: "destructive" });
    },
  });

  const handleStatusUpdate = (reportId: string, status: ReportStatus) => {
    setPendingStatusUpdate(`${reportId}:${status}`);
    updateStatusMutation.mutate({ reportId, status });
  };

  const isButtonPending = (reportId: string, status: string) =>
    pendingStatusUpdate === `${reportId}:${status}`;

  const handleModAction = () => {
    if (!modActionDialog) return;
    const { report, actionType } = modActionDialog;
    modActionMutation.mutate({
      targetUserId: report.targetType === "user" ? report.targetId : report.targetId,
      actionType,
      reasonCode: report.reason,
      notes: modNotes || `Action from report: ${report.reason}`,
      relatedReportId: report.id,
    });
  };

  const reports = data?.reports ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <p className="text-sm text-neutral-400 mt-1">Review and act on user-submitted reports</p>
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36 bg-neutral-900 border-neutral-700 text-white">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent className="bg-neutral-900 border-neutral-700">
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="reviewing">Reviewing</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
            <SelectItem value="escalated">Escalated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <>
            <ReportSkeleton />
            <ReportSkeleton />
            <ReportSkeleton />
          </>
        ) : reports.length === 0 ? (
          <Card className="bg-neutral-900/50 border-neutral-800">
            <CardContent className="p-8 text-center">
              <p className="text-neutral-400">No reports found.</p>
            </CardContent>
          </Card>
        ) : (
          reports.map((report) => (
            <Card key={report.id} className="bg-neutral-900/50 border-neutral-800">
              <CardContent className="p-4">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <StatusBadge status={report.status} />
                      <Badge variant="outline" className="text-neutral-400 border-neutral-600">
                        {report.targetType}
                      </Badge>
                    </div>
                    <p className="text-sm text-white font-medium mb-1">{report.reason}</p>
                    {report.notes && (
                      <p className="text-xs text-neutral-400 mb-2 line-clamp-2">{report.notes}</p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                      <span>Target: {report.targetId.slice(0, 12)}...</span>
                      <span>Reporter: {report.reporterId.slice(0, 12)}...</span>
                      <span>
                        {new Date(report.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>

                  {(report.status === "queued" || report.status === "reviewing") && (
                    <div className="flex gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20"
                        onClick={() => handleStatusUpdate(report.id, "resolved")}
                        disabled={updateStatusMutation.isPending}
                      >
                        {isButtonPending(report.id, "resolved") ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <CheckCircle className="h-3 w-3 mr-1" />
                        )}
                        Resolve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs bg-neutral-800 text-neutral-300 border-neutral-600 hover:bg-neutral-700"
                        onClick={() => handleStatusUpdate(report.id, "dismissed")}
                        disabled={updateStatusMutation.isPending}
                      >
                        {isButtonPending(report.id, "dismissed") ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <XCircle className="h-3 w-3 mr-1" />
                        )}
                        Dismiss
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20"
                        onClick={() => handleStatusUpdate(report.id, "escalated")}
                        disabled={updateStatusMutation.isPending}
                      >
                        {isButtonPending(report.id, "escalated") ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <ArrowUpCircle className="h-3 w-3 mr-1" />
                        )}
                        Escalate
                      </Button>
                    </div>
                  )}
                </div>

                {/* Mod action buttons for actionable reports */}
                {report.status === "escalated" && (
                  <div className="mt-3 pt-3 border-t border-neutral-800 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                      onClick={() => setModActionDialog({ report, actionType: "warn" })}
                    >
                      Warn User
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                      onClick={() => setModActionDialog({ report, actionType: "temp_ban" })}
                    >
                      Temp Ban
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                      onClick={() => setModActionDialog({ report, actionType: "perm_ban" })}
                    >
                      Perm Ban
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-neutral-600 text-neutral-400 hover:bg-neutral-800"
                      onClick={() => setModActionDialog({ report, actionType: "remove_content" })}
                    >
                      Remove Content
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-neutral-500">
            Page {page} of {totalPages} ({total} reports)
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

      {/* Mod Action Dialog */}
      <Dialog
        open={modActionDialog !== null}
        onOpenChange={() => {
          setModActionDialog(null);
          setModNotes("");
        }}
      >
        <DialogContent className="bg-neutral-900 border-neutral-700 text-white">
          <DialogHeader>
            <DialogTitle>
              Apply Moderation Action: {modActionDialog?.actionType.replace("_", " ")}
            </DialogTitle>
            <DialogDescription className="text-neutral-400">
              This action will be logged and applied to the target user.
              {modActionDialog?.actionType === "perm_ban" && (
                <span className="block mt-1 text-red-400 font-medium">
                  Permanent bans cannot be automatically reversed.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-neutral-400 block mb-1">Notes</label>
              <Textarea
                value={modNotes}
                onChange={(e) => setModNotes(e.target.value)}
                placeholder="Reason for this action..."
                className="bg-neutral-800 border-neutral-700 text-white"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-neutral-600 text-neutral-300"
              onClick={() => {
                setModActionDialog(null);
                setModNotes("");
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleModAction}
              disabled={modActionMutation.isPending}
            >
              {modActionMutation.isPending ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                  Applying...
                </>
              ) : (
                "Apply Action"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
