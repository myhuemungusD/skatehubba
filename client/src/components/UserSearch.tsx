import { useState, useRef, useEffect, useCallback } from "react";
import { Search, Swords, UserPlus, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api/client";
import { InviteButton } from "./InviteButton";

interface SearchResult {
  id: string;
  displayName: string;
  handle: string;
  wins: number;
  losses: number;
}

interface UserSearchProps {
  onChallenge: (userId: string) => void;
  isPending?: boolean;
}

export function UserSearch({ onChallenge, isPending }: UserSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setIsSearching(true);
    try {
      const data = await apiRequest<SearchResult[]>({
        method: "GET",
        path: `/api/users/search?q=${encodeURIComponent(q)}`,
      });
      setResults(data);
      setHasSearched(true);
    } catch {
      setResults([]);
      setHasSearched(true);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getInitial = (name: string) => name.charAt(0).toUpperCase();

  const avatarColors = [
    "from-orange-500 to-amber-500",
    "from-blue-500 to-cyan-500",
    "from-green-500 to-emerald-500",
    "from-purple-500 to-pink-500",
    "from-red-500 to-rose-500",
  ];

  const getAvatarColor = (id: string) => {
    const idx = id.charCodeAt(0) % avatarColors.length;
    return avatarColors[idx];
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500 pointer-events-none" />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500 animate-spin" />
        )}
        <Input
          ref={inputRef}
          placeholder="Search skaters by name..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          className="pl-10 pr-10 bg-neutral-900/80 border-neutral-700 h-11 text-sm placeholder:text-neutral-500 focus:border-orange-500/50 focus:ring-orange-500/20 transition-colors"
        />
      </div>

      {showResults && query.length >= 2 && (
        <div className="absolute z-30 mt-2 w-full rounded-xl border border-neutral-700/50 bg-neutral-900 shadow-2xl shadow-black/40 overflow-hidden">
          {!isSearching && hasSearched && results.length === 0 && (
            <div className="p-5 text-center">
              <UserPlus className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
              <p className="text-sm text-neutral-400 mb-3">
                No skaters found for &ldquo;{query}&rdquo;
              </p>
              <InviteButton size="sm" label="Invite them" variant="outline" />
            </div>
          )}

          {results.length > 0 && (
            <ul className="py-1 divide-y divide-neutral-800/50">
              {results.map((user) => (
                <li key={user.id}>
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-800/60 transition-colors">
                    <div
                      className={`w-9 h-9 rounded-full bg-gradient-to-br ${getAvatarColor(user.id)} flex items-center justify-center text-xs font-bold text-white shrink-0`}
                    >
                      {getInitial(user.displayName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {user.displayName}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {user.wins + user.losses > 0
                          ? `${user.wins}W · ${user.losses}L · ${
                              user.wins + user.losses > 0
                                ? Math.round((user.wins / (user.wins + user.losses)) * 100)
                                : 0
                            }%`
                          : "New skater"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        onChallenge(user.id);
                        setShowResults(false);
                        setQuery("");
                        setHasSearched(false);
                      }}
                      disabled={isPending}
                      className="shrink-0 bg-orange-500 hover:bg-orange-600 text-black font-semibold h-8 px-3 text-xs"
                    >
                      <Swords className="h-3 w-3 mr-1.5" />
                      {isPending ? "Sending..." : "Challenge"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
