import { useCallback } from "react";
import { useLocation } from "wouter";
import { LogOut } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/ui/button";

export default function SettingsPage() {
  const auth = useAuth();
  const [, setLocation] = useLocation();

  const handleLogout = useCallback(async () => {
    try {
      await auth?.signOut?.();
    } catch {
      // Best-effort logout
    } finally {
      setLocation("/");
    }
  }, [auth, setLocation]);

  return (
    <section className="py-12 text-white">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-4xl font-bold mb-4">Settings</h1>
          <p className="text-gray-300">Account and app preferences coming soon.</p>
        </div>

        <div className="border-t border-neutral-800 pt-8">
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
