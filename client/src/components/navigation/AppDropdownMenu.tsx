import { Link, useLocation } from "wouter";
import { Menu } from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useNavItems } from "./navItems";

export default function AppDropdownMenu() {
  const [location] = useLocation();
  const navItems = useNavItems();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="text-gray-200 hover:bg-white/10 hover:text-white"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5 mr-2" aria-hidden="true" />
          <span className="uppercase tracking-wide text-sm">Menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-60 bg-neutral-900 border-neutral-700 text-white"
      >
        <DropdownMenuLabel className="text-gray-400">Navigation</DropdownMenuLabel>
        {navItems.map((item) => {
          const isActive = item.href ? location === item.href : false;

          if (item.disabled || !item.href) {
            return (
              <DropdownMenuItem
                key={item.label}
                disabled
                className="text-gray-500 cursor-not-allowed"
              >
                {item.label}
              </DropdownMenuItem>
            );
          }

          return (
            <DropdownMenuItem key={item.label} asChild>
              <Link
                href={item.href}
                className={`flex items-center w-full uppercase tracking-wide text-sm ${
                  isActive ? "bg-[#ff6a00]/10 text-[#ff6a00]" : ""
                }`}
              >
                {item.label}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
