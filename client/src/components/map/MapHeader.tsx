import { memo, type ReactNode } from "react";
import { MapPin, Search } from "lucide-react";
import { SPOT_TYPES } from "@shared/schema";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";

interface MapHeaderProps {
  spotsCount: number;
  isSpotsLoading: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  activeTypeFilter: string | null;
  onTypeFilterChange: (type: string | null) => void;
  statusMessage: ReactNode;
}

export const MapHeader = memo(function MapHeader({
  spotsCount,
  isSpotsLoading,
  searchQuery,
  onSearchChange,
  activeTypeFilter,
  onTypeFilterChange,
  statusMessage,
}: MapHeaderProps) {
  return (
    <header className="absolute top-4 left-4 right-4 z-[1000] pointer-events-none">
      <Card className="bg-black/80 border-gray-600 backdrop-blur-md pointer-events-auto">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-2xl font-bold text-[#fafafa] flex items-center gap-2">
                <MapPin className="w-6 h-6 text-[#ff6a00]" aria-hidden="true" />
                Skate Spots
                {!isSpotsLoading && spotsCount > 0 && (
                  <span className="text-sm font-normal text-gray-500">({spotsCount})</span>
                )}
              </h1>
              {statusMessage}
            </div>
          </div>

          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search spots..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full h-10 pl-9 pr-4 rounded-lg bg-neutral-900/50 border border-gray-700 text-white placeholder:text-gray-500 focus:outline-none focus:border-[#ff6a00] focus:ring-1 focus:ring-[#ff6a00] transition-all text-sm"
                data-testid="input-spot-search"
                aria-label="Search skate spots"
              />
            </div>

            <div
              className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1"
              role="group"
              aria-label="Filter spots by type"
            >
              <Badge
                variant={activeTypeFilter === null ? "default" : "outline"}
                className={`cursor-pointer whitespace-nowrap ${activeTypeFilter === null ? "bg-[#ff6a00] text-white hover:bg-[#ff6a00]/90" : "text-gray-400 border-gray-700 hover:text-white hover:border-gray-500"}`}
                onClick={() => onTypeFilterChange(null)}
                role="button"
                aria-pressed={activeTypeFilter === null}
              >
                All
              </Badge>
              {SPOT_TYPES.map((type) => (
                <Badge
                  key={type}
                  variant={activeTypeFilter === type ? "default" : "outline"}
                  className={`cursor-pointer whitespace-nowrap capitalize ${activeTypeFilter === type ? "bg-[#ff6a00] text-white hover:bg-[#ff6a00]/90" : "text-gray-400 border-gray-700 hover:text-white hover:border-gray-500"}`}
                  onClick={() => onTypeFilterChange(type === activeTypeFilter ? null : type)}
                  data-testid={`filter-${type}`}
                  role="button"
                  aria-pressed={activeTypeFilter === type}
                >
                  {type.replace("-", " ")}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </header>
  );
});
