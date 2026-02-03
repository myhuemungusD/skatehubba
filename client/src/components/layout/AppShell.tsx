import type { ReactNode } from "react";
import AppDropdownMenu from "../navigation/AppDropdownMenu";
import { EmailVerificationBanner } from "../EmailVerificationBanner";

interface AppShellProps {
  children: ReactNode;
  hideNav?: boolean;
}

const BACKDROP_IMAGE = "/attached_assets/screenshots/hero-480.webp";

export default function AppShell({ children, hideNav = false }: AppShellProps) {
  return (
    <div
      className="relative min-h-screen text-white"
      style={{
        backgroundImage: `url("${BACKDROP_IMAGE}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" />

      <div className="relative z-10 flex min-h-screen flex-col">
        {!hideNav && (
          <header className="sticky top-0 z-30 border-b border-white/10 bg-black/40 backdrop-blur">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2 text-lg font-bold">
                <span className="tracking-wide">SkateHubba</span>
              </div>
              <AppDropdownMenu />
            </div>
          </header>
        )}

        <EmailVerificationBanner />

        <main className="flex-1 px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
