import { Instagram, Github } from "lucide-react";
import { Link } from "wouter";
import { EXTERNAL_LINKS } from "@/config/externalLinks";

export function Footer() {
  return (
    <footer
      className="py-12 text-center border-t border-zinc-800"
      role="contentinfo"
      aria-label="Site footer"
    >
      {/* Social links */}
      <div className="flex items-center justify-center gap-6 mb-6">
        <a
          href={EXTERNAL_LINKS.INSTAGRAM}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-semibold tracking-wide text-zinc-400 hover:text-orange-500 transition-colors focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none rounded"
          aria-label="Follow @skatehubba_app on Instagram (opens in new tab)"
        >
          <Instagram className="w-4 h-4" />
          <span>@skatehubba_app</span>
        </a>
        <a
          href={EXTERNAL_LINKS.GITHUB}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-semibold tracking-wide text-zinc-400 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none rounded"
          aria-label="SkateHubba on GitHub (opens in new tab)"
        >
          <Github className="w-4 h-4" />
          <span>GitHub</span>
        </a>
      </div>

      <a
        href={EXTERNAL_LINKS.HUBBASHOP}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block mb-4 text-sm font-semibold tracking-widest uppercase text-brand hover:text-brand/80 transition-colors focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none rounded"
        aria-label="Shop SkateHubba merch (opens in new tab)"
      >
        Shop Merch
      </a>

      {/* Legal links */}
      <div className="flex items-center justify-center gap-4 mb-4 text-sm text-zinc-500">
        <Link
          href="/privacy"
          className="hover:text-zinc-300 transition-colors focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none rounded px-1"
        >
          Privacy Policy
        </Link>
        <span aria-hidden="true">·</span>
        <Link
          href="/terms"
          className="hover:text-zinc-300 transition-colors focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none rounded px-1"
        >
          Terms of Service
        </Link>
      </div>

      <p className="text-zinc-500 text-sm tracking-widest uppercase">
        &copy; {new Date().getFullYear()} SkateHubba
      </p>
    </footer>
  );
}
