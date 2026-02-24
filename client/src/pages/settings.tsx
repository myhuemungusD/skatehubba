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
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { deleteUser } from "firebase/auth";
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
import { useToast } from "../hooks/use-toast";

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

const FAQ_ITEMS = [
  {
    q: "What is SkateHubba?",
    a: "SkateHubba is a platform for skaters to discover spots, challenge friends to S.K.A.T.E. games, and build their skate crew.",
  },
  {
    q: "How do I add a skate spot?",
    a: "Tap the map and long-press any location to drop a pin. Fill in the spot name, type, and difficulty, then save it as a draft — it'll be submitted once you're online.",
  },
  {
    q: "How do S.K.A.T.E. challenges work?",
    a: "Challenge any skater on their profile. Each player takes turns filming a trick. If the other player lands it, you get a letter. Spell S.K.A.T.E. and you lose.",
  },
  {
    q: "How is my XP calculated?",
    a: "You earn XP for winning games, completing challenges, and contributing spots. Your XP and win rate appear on your public profile.",
  },
  {
    q: "Is SkateHubba free to use?",
    a: "Yes — the core features are free. Some collectible items and cosmetics may be available through the closet in a future update.",
  },
] as const;

export default function SettingsPage() {
  const { user, isAuthenticated, signOut } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [faqOpen, setFaqOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleLogout = useCallback(async () => {
    try {
      await signOut?.();
    } catch {
      // Best-effort logout
    } finally {
      setLocation("/");
    }
  }, [signOut, setLocation]);

  const handleDeleteAccount = useCallback(async () => {
    if (!user) return;

    setIsDeleting(true);
    try {
      // Delete Firebase Auth account first — if this fails (e.g. requires-recent-login)
      // nothing is deleted and the user can retry after re-authenticating.
      await deleteUser(user);
      // Firebase account is gone; now remove the DB record best-effort.
      await apiRequest("DELETE", "/api/profile");
      setLocation("/");
    } catch (err) {
      const code = (err as { code?: string }).code;
      const description =
        code === "auth/requires-recent-login"
          ? "Please sign out and sign back in, then try again."
          : err instanceof Error
            ? err.message
            : "Could not delete your account. Please try again.";
      toast({ title: "Deletion failed", description, variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  }, [user, setLocation, toast]);

  // Fetch notification preferences
  const { data: prefs, isLoading } = useQuery<NotificationPrefs>({
    queryKey: ["/api/notifications/preferences"],
    enabled: isAuthenticated,
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
            {/* Help & FAQ */}
            <div className="border-b border-neutral-800">
              <button
                type="button"
                onClick={() => setFaqOpen((o) => !o)}
                className="flex w-full items-center justify-between py-3 text-left"
                aria-expanded={faqOpen}
              >
                <div className="flex items-center gap-3">
                  <div className="text-neutral-400">
                    <HelpCircle className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Help & FAQ</p>
                    <p className="text-xs text-neutral-500 mt-0.5">Get answers to common questions</p>
                  </div>
                </div>
                {faqOpen ? (
                  <ChevronDown className="h-4 w-4 text-neutral-400 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0" />
                )}
              </button>

              {faqOpen && (
                <div className="pb-4 space-y-4">
                  {FAQ_ITEMS.map((item) => (
                    <div key={item.q}>
                      <p className="text-sm font-medium text-white">{item.q}</p>
                      <p className="text-xs text-neutral-400 mt-1">{item.a}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Contact Us */}
            <a
              href="mailto:support@skatehubba.com"
              className="flex items-center justify-between py-3 hover:opacity-80 transition-opacity"
            >
              <div className="flex items-center gap-3">
                <div className="text-neutral-400">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Contact Us</p>
                  <p className="text-xs text-neutral-500 mt-0.5">Reach out for support</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0" />
            </a>
          </div>
        </div>

        {/* Account */}
        <div className="border-t border-neutral-800 pt-8">
          <h2 className="text-lg font-semibold mb-3 text-white">Account</h2>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
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
                  disabled={isDeleting}
                >
                  <Trash2 className="w-4 h-4 mr-2" aria-hidden="true" />
                  Delete Account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-neutral-900 border-neutral-700">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-white">Delete Account</AlertDialogTitle>
                  <AlertDialogDescription className="text-neutral-400">
                    This will permanently delete your account, game history, spots, and all profile
                    data. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAccount}
                    className="bg-red-700 hover:bg-red-800 text-white"
                  >
                    {isDeleting ? "Deleting…" : "Delete My Account"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </section>
  );
}
