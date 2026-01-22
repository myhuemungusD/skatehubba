import { useCallback, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "./ui/button";
import {
  Home,
  ShoppingCart,
  LogIn,
  User,
  Package,
  Map,
  Trophy,
  Search,
  Gamepad2,
  Menu,
} from "lucide-react";
import { useAuth } from "../context/AuthProvider";
import CartDrawer from "./cart/CartDrawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { ProfileSearch } from "./search/ProfileSearch";
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
  const [isSearchOpen, setIsSearchOpen] = useState(false);

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

  const navItems = [
    { path: "/", label: "Home", icon: Home },
    { path: "/shop", label: "Shop", icon: ShoppingCart },
    { path: "/map", label: "Map", icon: Map },
    { path: "/skate-game", label: "Play SKATE", icon: Gamepad2 },
    { path: "/leaderboard", label: "Leaderboard", icon: Trophy },
    { path: "/closet", label: "Closet", icon: Package },
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
                    const isActive = location === item.path;
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

              <Button
                variant="ghost"
                className="text-gray-300 hover:bg-neutral-800 hover:text-white"
                onClick={() => setIsSearchOpen(true)}
                data-testid="button-nav-search"
                aria-label="Search for skaters"
              >
                <Search className="w-4 h-4 md:mr-2" aria-hidden="true" />
                <span className="hidden md:inline">Find Skaters</span>
              </Button>

              <CartDrawer />

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

      {/* Search Modal */}
      <Dialog open={isSearchOpen} onOpenChange={setIsSearchOpen}>
        <DialogContent className="bg-[#232323] border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-orange-500">Find Skaters</DialogTitle>
            <DialogDescription className="text-gray-400">
              Search for skaters by their username to view their profile, stats, and send challenges
            </DialogDescription>
          </DialogHeader>
          <div className="pt-4">
            <ProfileSearch />
          </div>
        </DialogContent>
      </Dialog>

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
