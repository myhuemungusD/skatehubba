import { Instagram, Github } from "lucide-react";

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
          href="https://www.instagram.com/skatehubba_app/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-semibold tracking-wide text-zinc-400 hover:text-orange-500 transition-colors"
          aria-label="Follow @skatehubba_app on Instagram (opens in new tab)"
        >
          <Instagram className="w-4 h-4" />
          <span>@skatehubba_app</span>
        </a>
        <a
          href="https://github.com/myhuemungusD/skatehubba"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-semibold tracking-wide text-zinc-400 hover:text-white transition-colors"
          aria-label="SkateHubba on GitHub (opens in new tab)"
        >
          <Github className="w-4 h-4" />
          <span>GitHub</span>
        </a>
      </div>

      <a
        href="https://skatehubba.store/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block mb-4 text-sm font-semibold tracking-widest uppercase text-[#ff6a00] hover:text-[#ff6a00]/80 transition-colors"
        aria-label="Shop SkateHubba merch (opens in new tab)"
      >
        Shop Merch
      </a>
      <p className="text-gray-500 text-sm tracking-widest uppercase">
        &copy; {new Date().getFullYear()} SkateHubba
      </p>
    </footer>
  );
}
