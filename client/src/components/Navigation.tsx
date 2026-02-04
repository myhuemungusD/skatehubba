import { useCallback } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "./ui/button";
import {
  Home,
  LogIn,
  User,
  Map,
  Trophy,
  Gamepad2,
  Menu,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export default function Navigation() {
  const [location, setLocation] = useLocation();
  const auth = useAuth();
  const isAuthenticated = auth?.isAuthenticated ?? false;
  const user = auth?.user ?? null;
  const profile = auth?.profile ?? null;
  const signOut = auth?.signOut;

  const handleLogout = useCallback(async () => {
    try {
      await signOut?.();
    } catch {
      // Best-effort logout: swallow errors to ensure UI still resets state
    } finally {
      setLocation("/");
    }
  }, [signOut, setLocation]);

  const profileLabel = profile?.username ?? user?.email ?? "Profile";

  // MVP navigation items - 5 items maximum
  const navItems = [
    { path: "/hub", label: "Home", icon: Home },
    { path: "/map", label: "Map", icon: Map },
    { path: "/play", label: "Play SKATE", icon: Gamepad2 },
    { path: "/leaderboard", label: "Leaderboard", icon: Trophy },
    { path: "/me", label: "Profile", icon: User },
  ];

  return (
    <>
      <nav
        className="bg-neutral-900 border-b border-neutral-700 sticky top-[28px] z-50 pt-safe"
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-2">
              <Link href="/">
                <span
                  className="text-2xl font-bold text-[#ff6a00] cursor-pointer"
                  style={{ fontFamily: "'Permanent Marker', cursive" }}
                >
                  SkateHubba
                </span>
              </Link>
            </div>

            <div className="flex items-center space-x-2">
              {/* Main Navigation Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="text-gray-300 hover:bg-neutral-800 hover:text-white"
                    data-testid="button-nav-menu-desktop"
                    aria-label="Navigation menu"
                  >
                    <Menu className="w-5 h-5 mr-2" aria-hidden="true" />
                    <span className="hidden md:inline">Menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-56 bg-neutral-900 border-neutral-700 text-white z-[100]"
                >
                  <DropdownMenuLabel className="text-gray-400">Navigation</DropdownMenuLabel>
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.split("?")[0] === item.path;
                    return (
                      <DropdownMenuItem key={item.path} asChild>
                        <Link
                          href={item.path}
                          className={`flex items-center w-full ${
                            isActive ? "bg-[#ff6a00]/10 text-[#ff6a00]" : ""
                          }`}
                        >
                          <Icon className="w-4 h-4 mr-2" />
                          {item.label}
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex items-center space-x-2">
                {!isAuthenticated ? (
                  <Link href="/auth">
                    <Button
                      className="bg-success text-black hover:bg-success-hover"
                      data-testid="button-nav-login"
                    >
                      <LogIn className="w-4 h-4 mr-2" />
                      Login
                    </Button>
                  </Link>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      className="text-gray-300 hover:bg-neutral-800 hover:text-white"
                      data-testid="button-nav-profile"
                    >
                      <User className="w-4 h-4 mr-2" />
                      {profileLabel}
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-gray-300 hover:bg-neutral-800 hover:text-white"
                      data-testid="button-nav-logout"
                      onClick={() => {
                        void handleLogout();
                      }}
                    >
                      Logout
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Subtitle Banner */}
      <div className="bg-black/40 border-b border-neutral-800 py-3 sticky top-[92px] z-30">
        <p
          className="text-center text-sm md:text-base text-gray-200 px-4"
          style={{ fontFamily: "'Permanent Marker', cursive" }}
        >
          The ultimate mobile skateboarding platform where your skills become collectibles and every
          spot tells a story.
        </p>
      </div>
    </>
  );
}
