import { Badge } from "../../../components/ui/badge";
import { Skeleton } from "../../../components/ui/skeleton";

export function TrustBadge({ level }: { level: number }) {
  const config = {
    0: { label: "TL0", className: "text-neutral-400 border-neutral-600" },
    1: { label: "TL1", className: "text-blue-400 border-blue-500/30" },
    2: { label: "TL2", className: "text-green-400 border-green-500/30" },
  }[level] ?? { label: `TL${level}`, className: "text-neutral-400 border-neutral-600" };

  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}

export function TierBadge({ tier }: { tier: string }) {
  const config: Record<string, string> = {
    free: "text-neutral-400 border-neutral-600",
    pro: "text-orange-400 border-orange-500/30 bg-orange-500/10",
    premium: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  };

  return (
    <Badge variant="outline" className={config[tier] || config.free}>
      {tier}
    </Badge>
  );
}

export function UserRowSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 border-b border-neutral-800 last:border-b-0">
      <Skeleton className="h-8 w-8 rounded-full bg-neutral-800" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-36 bg-neutral-800" />
        <Skeleton className="h-3 w-48 bg-neutral-800" />
      </div>
      <Skeleton className="h-6 w-12 bg-neutral-800" />
      <Skeleton className="h-6 w-12 bg-neutral-800" />
    </div>
  );
}
