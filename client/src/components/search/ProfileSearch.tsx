import { useState } from "react";
import { useLocation } from "wouter";
import { Search } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

export function ProfileSearch() {
  const [searchTerm, setSearchTerm] = useState("");
  const [, setLocation] = useLocation();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      // Remove @ symbol if user includes it
      const cleanHandle = searchTerm.trim().replace("@", "");
      setLocation(`/skater/${cleanHandle}`);
      setSearchTerm("");
    }
  };

  return (
    <form
      onSubmit={handleSearch}
      className="flex gap-2 w-full max-w-md"
      role="search"
      aria-label="Search skater profiles"
    >
      <div className="relative flex-1">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder="Search skater by handle..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 bg-neutral-900 border-neutral-700 text-white placeholder:text-gray-500"
          aria-label="Search skater by handle"
          data-testid="input-profile-search"
        />
      </div>
      <Button
        type="submit"
        className="bg-[#ff6a00] hover:bg-[#ff6a00]/90 text-black font-semibold"
        data-testid="button-search-profile"
      >
        Search
      </Button>
    </form>
  );
}
