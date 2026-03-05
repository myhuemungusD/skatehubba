import { Link } from "wouter";
import type { LucideIcon } from "lucide-react";

interface QuickAction {
  icon: LucideIcon;
  label: string;
  href: string;
  description: string;
  color: string;
  featured?: boolean;
}

interface MemberHubHeroProps {
  badge?: {
    text: string;
    variant: "success" | "info";
  };
  quickActions: QuickAction[];
}

export function MemberHubHero({ badge, quickActions }: MemberHubHeroProps) {
  return (
    <section className="pt-8 pb-12 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Badge */}
        {badge && (
          <div
            className={`inline-flex items-center gap-2 ${
              badge.variant === "success"
                ? "bg-green-500/10 border-green-500/30 text-green-400"
                : "bg-blue-500/10 border-blue-500/30 text-blue-400"
            } border rounded-full px-4 py-2 text-sm mb-6`}
          >
            <div
              className={`w-2 h-2 ${
                badge.variant === "success" ? "bg-green-500" : "bg-blue-500"
              } rounded-full animate-pulse`}
            />
            <span>{badge.text}</span>
          </div>
        )}

        {/* Quick Actions Grid - Skateboard themed cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {quickActions.map((action, i) => (
            <Link
              key={i}
              href={action.href}
              className={action.featured ? "skate-card-featured" : "skate-card"}
            >
              <action.icon
                className={action.featured ? "skate-card-featured-icon" : "skate-card-icon"}
              />
              <h3 className={action.featured ? "skate-card-featured-title" : "skate-card-title"}>
                {action.label}
              </h3>
              <p
                className={
                  action.featured ? "skate-card-featured-description" : "skate-card-description"
                }
              >
                {action.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
