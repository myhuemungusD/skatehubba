import type { LucideIcon } from "lucide-react";

interface TrustIndicator {
  icon: LucideIcon;
  text: string;
  color: string;
}

interface TrustBarProps {
  indicators: TrustIndicator[];
}

export function TrustBar({ indicators }: TrustBarProps) {
  return (
    <div className="flex flex-wrap justify-center items-center gap-6 md:gap-8 py-8 text-sm text-gray-300">
      {indicators.map((indicator, i) => (
        <div key={i} className="flex items-center gap-2">
          <indicator.icon className={`h-4 w-4 ${indicator.color}`} />
          <span>{indicator.text}</span>
        </div>
      ))}
    </div>
  );
}
