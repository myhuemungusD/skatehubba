import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { Activity, Clock, MapPin, WifiOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRealtimeFeed } from "@/features/feed/useRealtimeFeed";

export default function FeedPage() {
  const { items, isLoading, error, isOffline } = useRealtimeFeed();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Activity className="h-6 w-6 text-yellow-400" />
          <h1 className="text-2xl font-semibold text-white">Live Check-ins</h1>
        </div>
        <p className="text-sm text-neutral-400">Real-time spot activity powered by Firestore.</p>
        {isOffline ? (
          <div className="flex items-center gap-2 text-xs text-yellow-300">
            <WifiOff className="h-4 w-4" />
            Offline mode: live updates will resume when you reconnect.
          </div>
        ) : null}
      </header>

      {isLoading ? (
        <Card className="bg-neutral-900/60 border-neutral-800">
          <CardContent className="py-8 text-center text-sm text-neutral-400">
            Loading the latest sessions...
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card className="bg-neutral-900/60 border-neutral-800">
          <CardContent className="py-8 text-center text-sm text-neutral-400">
            We couldn't load the live feed. Please try again in a moment.
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !error && items.length === 0 ? (
        <Card className="bg-neutral-900/60 border-neutral-800">
          <CardContent className="py-8 text-center text-sm text-neutral-400">
            No check-ins yet. Head to the map and be the first to log a spot.
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-4">
        {items.map((item) => (
          <Card key={item.id} className="bg-neutral-900/70 border-neutral-800">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-white">{item.displayName}</CardTitle>
                {item.points !== undefined ? (
                  <Badge className="bg-yellow-500/20 text-yellow-300">+{item.points} XP</Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-neutral-300">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-yellow-400" />
                <Link
                  href={`/spots/${item.spotId}`}
                  className="text-yellow-200 hover:text-yellow-100"
                >
                  {item.spotName}
                </Link>
              </div>
              {item.trick ? <p className="text-neutral-400">Landed: {item.trick}</p> : null}
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(item.checkedInAt, { addSuffix: true })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
