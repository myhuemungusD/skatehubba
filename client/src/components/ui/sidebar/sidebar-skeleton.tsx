import * as React from "react";

import { cn } from "../../../lib/utils";
import { Skeleton } from "../skeleton";

function getUnbiasedRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 0 || maxExclusive > 256) {
    throw new Error("maxExclusive must be between 1 and 256");
  }
  const buffer = new Uint8Array(1);

  // Rejection sampling: discard values >= maxExclusive to keep distribution uniform.
  while (true) {
    crypto.getRandomValues(buffer);
    const value = buffer[0];
    if (value < maxExclusive) {
      return value;
    }
  }
}

export const SidebarMenuSkeleton = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    showIcon?: boolean;
  }
>(({ className, showIcon = false, ...props }, ref) => {
  // Random width between 50 to 90%.
  const width = React.useMemo(() => {
    const randomOffset = getUnbiasedRandomInt(41); // 0 to 40 inclusive
    return `${randomOffset + 50}%`;
  }, []);

  return (
    <div
      ref={ref}
      data-sidebar="menu-skeleton"
      className={cn("flex h-8 items-center gap-2 rounded-md px-2", className)}
      {...props}
    >
      {showIcon && <Skeleton className="size-4 rounded-md" data-sidebar="menu-skeleton-icon" />}
      <Skeleton
        className="h-4 max-w-[--skeleton-width] flex-1"
        data-sidebar="menu-skeleton-text"
        style={
          {
            "--skeleton-width": width,
          } as React.CSSProperties
        }
      />
    </div>
  );
});
SidebarMenuSkeleton.displayName = "SidebarMenuSkeleton";
