import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api/client";
import { useAuthStore } from "../store/authStore";

const stances = ["regular", "goofy"] as const;

export function ProfileSetupPage() {
  const { hasProfile } = useAuth();
  const fetchProfile = useAuthStore((s) => s.fetchProfile);
  const [, navigate] = useLocation();

  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [stance, setStance] = useState<string>("regular");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (hasProfile) {
    navigate("/hub");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await api.post("/profile", { handle, displayName: displayName || handle, stance });
      await fetchProfile();
      navigate("/hub");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-2">Set up your profile</h1>
        <p className="text-gray-400 text-sm mb-6">Pick a handle and stance to get started.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="handle" className="block text-sm text-gray-400 mb-1">Handle</label>
            <input
              id="handle"
              type="text"
              required
              minLength={3}
              maxLength={50}
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="yourhandle"
            />
          </div>

          <div>
            <label htmlFor="displayName" className="block text-sm text-gray-400 mb-1">
              Display Name (optional)
            </label>
            <input
              id="displayName"
              type="text"
              maxLength={100}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Your name"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Stance</label>
            <div className="flex gap-2">
              {stances.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStance(s)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    stance === s
                      ? "bg-brand-500 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={saving || handle.length < 3}
            className="w-full py-2.5 bg-brand-500 rounded-lg font-medium hover:bg-brand-600 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Let's go"}
          </button>
        </form>
      </div>
    </div>
  );
}
