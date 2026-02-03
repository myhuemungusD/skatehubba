import { Link } from "wouter";
import type { LucideIcon } from "lucide-react";

interface QuickAction {
  icon: LucideIcon;
  label: string;
  href: string;
  description: string;
  color: string;
}

interface MemberHubHeroProps {
  badge?: {
    text: string;
    variant: "success" | "info";
  };
  title: string;
  quickActions: QuickAction[];
}

export function MemberHubHero({ badge, title, quickActions }: MemberHubHeroProps) {
  return (
    <section className="pt-24 pb-12 px-6">
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

        {/* Title */}
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-8">{title}</h1>

        {/* Quick Actions Grid - Skateboard themed cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {quickActions.map((action, i) => (
            <Link key={i} href={action.href}>
              <a className="skate-card">
                <action.icon className="skate-card-icon" />
                <h3 className="skate-card-title">{action.label}</h3>
                <p className="skate-card-description">{action.description}</p>
              </a>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
