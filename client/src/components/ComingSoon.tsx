import { Construction, ArrowLeft } from "lucide-react";
import { Button } from "./ui/button";
import { Link } from "wouter";

interface ComingSoonProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

/**
 * Generic "Coming Soon" placeholder for features not yet implemented.
 * Used for MVP to show investors the roadmap without shipping broken features.
 */
export function ComingSoon({ title, description, icon }: ComingSoonProps) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex justify-center">
          {icon || (
            <div className="w-20 h-20 rounded-full bg-orange-500/10 flex items-center justify-center">
              <Construction className="w-10 h-10 text-orange-500" />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <p className="text-gray-400">
            {description || "This feature is coming soon. We're working hard to bring you an amazing experience."}
          </p>
        </div>

        <div className="pt-4">
          <span className="inline-block px-4 py-2 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 text-sm font-medium">
            Coming Soon
          </span>
        </div>

        <div className="pt-4">
          <Link href="/home">
            <Button
              variant="outline"
              className="border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
