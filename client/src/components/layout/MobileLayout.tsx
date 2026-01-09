import type { ReactNode } from "react";

interface MobileLayoutProps {
  children: ReactNode;
  className?: string;
}

export default function MobileLayout({ children, className }: MobileLayoutProps) {
  return (
    <div className={`min-h-screen bg-neutral-950 ${className ?? ""}`.trim()}>
      <main className="mx-auto w-full max-w-md">{children}</main>
    </div>
  );
}
