import { useCallback } from "react";
import { useLocation } from "wouter";
import { LogOut, Bell, Mail, Smartphone, Gamepad2, Trophy, Zap, Newspaper } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";

interface NotificationPreferences {
  pushEnabled: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  gameNotifications: boolean;
  challengeNotifications: boolean;
  turnNotifications: boolean;
  resultNotifications: boolean;
  marketingEmails: boolean;
  weeklyDigest: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

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
          {description && (
            <p className="text-xs text-neutral-500 mt-0.5">{description}</p>
          )}
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

export default function SettingsPage() {
  const auth = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

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
  const { data: prefs, isLoading } = useQuery<NotificationPreferences>({
    queryKey: ["/api/notifications/preferences"],
    enabled: auth.isAuthenticated,
  });

  // Update preferences mutation
  const updatePrefsMutation = useMutation({
    mutationFn: async (updates: Partial<NotificationPreferences>) => {
      await apiRequest("PUT", "/api/notifications/preferences", updates);
    },
    onMutate: async (updates) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ["/api/notifications/preferences"] });
      const previous = queryClient.getQueryData<NotificationPreferences>([
        "/api/notifications/preferences",
      ]);
      if (previous) {
        queryClient.setQueryData<NotificationPreferences>(
          ["/api/notifications/preferences"],
          { ...previous, ...updates }
        );
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

  const togglePref = (key: keyof NotificationPreferences, value: boolean) => {
    updatePrefsMutation.mutate({ [key]: value });
  };

  const defaults: NotificationPreferences = {
    pushEnabled: true,
    emailEnabled: true,
    inAppEnabled: true,
    gameNotifications: true,
    challengeNotifications: true,
    turnNotifications: true,
    resultNotifications: true,
    marketingEmails: true,
    weeklyDigest: true,
    quietHoursStart: null,
    quietHoursEnd: null,
  };

  const p = prefs ?? defaults;

  return (
    <section className="py-8 text-white">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Settings</h1>
          <p className="text-neutral-400 text-sm">Manage your account and notification preferences.</p>
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

        {/* Account */}
        <div className="border-t border-neutral-800 pt-8">
          <h2 className="text-lg font-semibold mb-3 text-white">Account</h2>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white"
          >
            <LogOut className="w-4 h-4 mr-2" aria-hidden="true" />
            Sign Out
          </Button>
        </div>
      </div>
    </section>
  );
}
