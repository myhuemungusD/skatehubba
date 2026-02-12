import { useCallback, useState } from "react";
import { useLocation } from "wouter";
import {
  LogOut,
  Bell,
  Mail,
  Smartphone,
  Gamepad2,
  Trophy,
  Zap,
  Newspaper,
  HelpCircle,
  MessageSquare,
  Trash2,
  Construction,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { type NotificationPrefs, DEFAULT_NOTIFICATION_PREFS } from "@shared/schema";

function ToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-neutral-800 last:border-0">
      <div className="flex items-center gap-3">
        <div className="text-neutral-400">{icon}</div>
        <div>
          <p className="text-sm font-medium text-white">{label}</p>
          {description && <p className="text-xs text-neutral-500 mt-0.5">{description}</p>}
        </div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? "bg-orange-500" : "bg-neutral-700"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function ComingSoonBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs font-medium">
      <Construction className="h-3 w-3" />
      Coming Soon
    </span>
  );
}

function SettingsLink({
  icon,
  label,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between py-3 border-b border-neutral-800 last:border-0 text-left"
    >
      <div className="flex items-center gap-3">
        <div className="text-neutral-400">{icon}</div>
        <div>
          <p className="text-sm font-medium text-white">{label}</p>
          {description && <p className="text-xs text-neutral-500 mt-0.5">{description}</p>}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-neutral-600" />
    </button>
  );
}

export default function SettingsPage() {
  const auth = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [comingSoonMessage, setComingSoonMessage] = useState<string | null>(null);

  // Auto-dismiss coming soon toast after 3 seconds
  const showComingSoon = useCallback((message: string) => {
    setComingSoonMessage(message);
    setTimeout(() => setComingSoonMessage(null), 3000);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await auth?.signOut?.();
    } catch {
      // Best-effort logout
    } finally {
      setLocation("/");
    }
  }, [auth, setLocation]);

  // Fetch notification preferences
  const { data: prefs, isLoading } = useQuery<NotificationPrefs>({
    queryKey: ["/api/notifications/preferences"],
    enabled: auth.isAuthenticated,
  });

  // Update preferences mutation
  const updatePrefsMutation = useMutation({
    mutationFn: async (updates: Partial<NotificationPrefs>) => {
      await apiRequest("PUT", "/api/notifications/preferences", updates);
    },
    onMutate: async (updates) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ["/api/notifications/preferences"] });
      const previous = queryClient.getQueryData<NotificationPrefs>([
        "/api/notifications/preferences",
      ]);
      if (previous) {
        queryClient.setQueryData<NotificationPrefs>(["/api/notifications/preferences"], {
          ...previous,
          ...updates,
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/notifications/preferences"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/preferences"] });
    },
  });

  const togglePref = (key: keyof NotificationPrefs, value: boolean) => {
    updatePrefsMutation.mutate({ [key]: value });
  };

  const p = prefs ?? DEFAULT_NOTIFICATION_PREFS;

  return (
    <section className="py-8 text-white">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Settings</h1>
          <p className="text-neutral-400 text-sm">
            Manage your account and notification preferences.
          </p>
        </div>

        {/* Notification Channels */}
        <div>
          <h2 className="text-lg font-semibold mb-3 text-white">Notification Channels</h2>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-4">
            <ToggleRow
              icon={<Smartphone className="h-4 w-4" />}
              label="Push Notifications"
              description="Get notified on your phone"
              checked={p.pushEnabled}
              onChange={(v) => togglePref("pushEnabled", v)}
              disabled={isLoading}
            />
            <ToggleRow
              icon={<Mail className="h-4 w-4" />}
              label="Email Notifications"
              description="Receive emails for important events"
              checked={p.emailEnabled}
              onChange={(v) => togglePref("emailEnabled", v)}
              disabled={isLoading}
            />
            <ToggleRow
              icon={<Bell className="h-4 w-4" />}
              label="In-App Notifications"
              description="Show notifications in the app"
              checked={p.inAppEnabled}
              onChange={(v) => togglePref("inAppEnabled", v)}
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Game Notifications */}
        <div>
          <h2 className="text-lg font-semibold mb-3 text-white">Game Notifications</h2>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-4">
            <ToggleRow
              icon={<Gamepad2 className="h-4 w-4" />}
              label="Game Activity"
              description="All S.K.A.T.E. game notifications"
              checked={p.gameNotifications}
              onChange={(v) => togglePref("gameNotifications", v)}
              disabled={isLoading}
            />
            <ToggleRow
              icon={<Zap className="h-4 w-4" />}
              label="Challenges"
              description="When someone challenges you"
              checked={p.challengeNotifications}
              onChange={(v) => togglePref("challengeNotifications", v)}
              disabled={isLoading || !p.gameNotifications}
            />
            <ToggleRow
              icon={<Gamepad2 className="h-4 w-4" />}
              label="Turn Reminders"
              description="When it's your turn and deadline warnings"
              checked={p.turnNotifications}
              onChange={(v) => togglePref("turnNotifications", v)}
              disabled={isLoading || !p.gameNotifications}
            />
            <ToggleRow
              icon={<Trophy className="h-4 w-4" />}
              label="Game Results"
              description="When a game ends"
              checked={p.resultNotifications}
              onChange={(v) => togglePref("resultNotifications", v)}
              disabled={isLoading || !p.gameNotifications}
            />
          </div>
        </div>

        {/* Email Preferences */}
        <div>
          <h2 className="text-lg font-semibold mb-3 text-white">Email Preferences</h2>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-4">
            <ToggleRow
              icon={<Newspaper className="h-4 w-4" />}
              label="Weekly Digest"
              description="Weekly summary of your activity and stats"
              checked={p.weeklyDigest}
              onChange={(v) => togglePref("weeklyDigest", v)}
              disabled={isLoading || !p.emailEnabled}
            />
            <ToggleRow
              icon={<Mail className="h-4 w-4" />}
              label="Product Updates"
              description="New features and announcements"
              checked={p.marketingEmails}
              onChange={(v) => togglePref("marketingEmails", v)}
              disabled={isLoading || !p.emailEnabled}
            />
          </div>
        </div>

        {/* Support */}
        <div>
          <h2 className="text-lg font-semibold mb-3 text-white">Support</h2>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-4">
            <SettingsLink
              icon={<HelpCircle className="h-4 w-4" />}
              label="Help & FAQ"
              description="Get answers to common questions"
              onClick={() => showComingSoon("Help & FAQ section is coming soon.")}
            />
            <SettingsLink
              icon={<MessageSquare className="h-4 w-4" />}
              label="Contact Us"
              description="Reach out for support"
              onClick={() => showComingSoon("Contact form is coming soon.")}
            />
          </div>
        </div>

        {/* Account */}
        <div className="border-t border-neutral-800 pt-8">
          <h2 className="text-lg font-semibold mb-3 text-white">Account</h2>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleLogout}
              className="border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white"
            >
              <LogOut className="w-4 h-4 mr-2" aria-hidden="true" />
              Sign Out
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="border-red-900/50 text-red-400 hover:bg-red-950 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4 mr-2" aria-hidden="true" />
                  Delete Account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-neutral-900 border-neutral-700">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-white">Delete Account</AlertDialogTitle>
                  <AlertDialogDescription className="text-neutral-400">
                    This action cannot be undone. All your data, game history, and profile
                    information will be permanently deleted.
                  </AlertDialogDescription>
                  <div className="pt-2">
                    <ComingSoonBadge />
                  </div>
                  <p className="text-xs text-neutral-500 pt-1">
                    Account deletion is not yet available. This feature requires a backend endpoint
                    and confirmation flow that are currently in development.
                  </p>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    disabled
                    className="bg-red-600 text-white opacity-50 cursor-not-allowed hover:bg-red-600"
                  >
                    Delete Account
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Coming Soon Toast */}
        {comingSoonMessage && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-neutral-800 border border-neutral-700 shadow-lg">
              <Construction className="h-4 w-4 text-orange-400 flex-shrink-0" />
              <p className="text-sm text-neutral-200">{comingSoonMessage}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
