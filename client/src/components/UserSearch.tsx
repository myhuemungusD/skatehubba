import { useState, useRef, useEffect, useCallback } from "react";
import { Search, Swords } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api/client";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const data = await apiRequest<SearchResult[]>({
        method: "GET",
        path: `/api/users/search?q=${encodeURIComponent(q)}`,
      });
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setResults([]);
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

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
        <Input
          placeholder="Search skaters by name..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          className="pl-10 bg-neutral-900 border-neutral-700"
        />
      </div>

      {showResults && (query.length >= 2) && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl max-h-64 overflow-y-auto">
          {isSearching && (
            <div className="px-4 py-3 text-sm text-neutral-400">Searching...</div>
          )}

          {!isSearching && results.length === 0 && query.length >= 2 && (
            <div className="px-4 py-3 text-sm text-neutral-400">
              No skaters found. Invite them to join!
            </div>
          )}

          {results.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-800 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{user.displayName}</p>
                <p className="text-xs text-neutral-400">
                  {user.wins}W / {user.losses}L
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  onChallenge(user.id);
                  setShowResults(false);
                  setQuery("");
                }}
                disabled={isPending}
                className="shrink-0 bg-orange-500 hover:bg-orange-600"
              >
                <Swords className="h-3.5 w-3.5 mr-1" />
                {isPending ? "Sending..." : "Challenge"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
