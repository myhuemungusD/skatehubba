import { useState, useEffect, useCallback, useRef } from "react";
import { Bell, Check, CheckCheck, Gamepad2, Trophy, Zap, Info } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { useAuth } from "../hooks/useAuth";

interface NotificationItem {
  id: number;
  userId: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  channel: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

interface NotificationListResponse {
  notifications: NotificationItem[];
  total: number;
  limit: number;
  offset: number;
}

interface UnreadCountResponse {
  count: number;
}

function getNotificationIcon(type: string) {
  switch (type) {
    case "challenge_received":
    case "quick_match":
      return <Zap className="h-4 w-4 text-yellow-400" />;
    case "your_turn":
    case "deadline_warning":
      return <Gamepad2 className="h-4 w-4 text-orange-400" />;
    case "game_over":
    case "opponent_forfeited":
    case "game_forfeited_timeout":
      return <Trophy className="h-4 w-4 text-yellow-400" />;
    default:
      return <Info className="h-4 w-4 text-neutral-400" />;
  }
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(dateStr).toLocaleDateString();
}

export default function NotificationBell() {
  const { isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Fetch unread count (poll every 30s)
  const { data: unreadData } = useQuery<UnreadCountResponse>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: isAuthenticated,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  // Fetch notifications when dropdown is open
  const { data: notifData } = useQuery<NotificationListResponse>({
    queryKey: ["/api/notifications"],
    enabled: isAuthenticated && isOpen,
    staleTime: 5000,
  });

  const unreadCount = unreadData?.count ?? 0;
  const items = notifData?.notifications ?? [];

  // Mark single as read
  const markReadMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  // Mark all as read
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  // Close on outside click
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, handleClickOutside]);

  if (!isAuthenticated) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="absolute left-1/2 -translate-x-1/2 sm:left-auto sm:right-0 sm:translate-x-0 top-full mt-2 w-[calc(100vw-32px)] sm:w-80 max-h-[420px] rounded-lg border border-neutral-800 bg-neutral-900 shadow-xl z-50 flex flex-col overflow-hidden"
          role="menu"
          aria-label="Notifications"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <h3 className="text-sm font-semibold text-white">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllReadMutation.mutate()}
                className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 transition-colors"
                disabled={markAllReadMutation.isPending}
                aria-label="Mark all notifications as read"
              >
                <CheckCheck className="h-3 w-3" aria-hidden="true" />
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="flex-1 overflow-y-auto" role="list" aria-label="Notification list">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-neutral-500" role="status">
                No notifications yet
              </div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    if (!item.isRead) {
                      markReadMutation.mutate(item.id);
                    }
                  }}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-800/50 border-b border-neutral-800/50 last:border-0 ${
                    !item.isRead ? "bg-neutral-800/30" : ""
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">{getNotificationIcon(item.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-medium truncate ${
                          item.isRead ? "text-neutral-400" : "text-white"
                        }`}
                      >
                        {item.title}
                      </span>
                      {!item.isRead && (
                        <span
                          className="flex-shrink-0 h-2 w-2 rounded-full bg-orange-500"
                          aria-label="Unread"
                        />
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{item.body}</p>
                    <span className="text-[10px] text-neutral-600 mt-1 block">
                      {timeAgo(item.createdAt)}
                    </span>
                  </div>
                  {!item.isRead && (
                    <div className="flex-shrink-0 mt-1">
                      <Check className="h-3 w-3 text-neutral-600" />
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
