/**
 * Public Navigation Component
 *
 * Minimal navigation for public pages (landing, auth pages)
 * Shows only: Logo + Sign In/Sign Up CTA
 *
 * Does NOT show the full app shell navbar with Map, Leaderboard, etc.
 */

import { Link } from "wouter";
import { Button } from "./ui/button";
import { UserPlus, ShoppingBag } from "lucide-react";
import { EXTERNAL_LINKS } from "@/config/externalLinks";

export default function PublicNavigation() {
  return (
    <nav
      className="absolute top-0 left-0 right-0 z-50 bg-transparent"
      role="navigation"
      aria-label="Public navigation"
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" aria-label="SkateHubba home">
            <span
              className="text-2xl font-bold text-brand cursor-pointer focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none rounded"
              style={{ fontFamily: "'Permanent Marker', cursive" }}
            >
              SkateHubba
            </span>
          </Link>

          <div className="flex items-center space-x-3">
            {/* Merch Link */}
            <a
              href={EXTERNAL_LINKS.HUBBASHOP}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-300 hover:text-white transition-colors font-semibold text-sm flex items-center min-h-[44px] px-2 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none rounded"
            >
              <ShoppingBag className="w-4 h-4 mr-1" aria-hidden="true" />
              Merch
            </a>

            {/* Join CTA */}
            <Button
              asChild
              className="bg-brand text-white hover:bg-brand/90 font-semibold"
              data-testid="button-public-nav-signin"
            >
              <Link href="/auth">
                <UserPlus className="w-4 h-4 mr-2" aria-hidden="true" />
                Sign Up / Log In
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
