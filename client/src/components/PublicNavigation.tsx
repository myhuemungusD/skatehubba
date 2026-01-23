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
import { LogIn } from "lucide-react";

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
          <Link href="/">
            <span
              className="text-2xl font-bold text-[#ff6a00] cursor-pointer"
              style={{ fontFamily: "'Permanent Marker', cursive" }}
            >
              SkateHubba
            </span>
          </Link>

          {/* Sign In CTA */}
          <Link href="/auth">
            <Button
              className="bg-[#ff6a00] text-white hover:bg-[#ff6a00]/90 font-semibold"
              data-testid="button-public-nav-signin"
            >
              <LogIn className="w-4 h-4 mr-2" aria-hidden="true" />
              Sign In / Sign Up
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}
