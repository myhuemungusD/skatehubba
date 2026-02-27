import type { Spot } from "@/types";

export function getTierColor(tier: Spot["tier"]): string {
  switch (tier) {
    case "bronze":
      return "#cd7f32";
    case "silver":
      return "#c0c0c0";
    case "gold":
      return "#ffd700";
    case "legendary":
      return "#ff6600";
    default:
      return "#cd7f32";
  }
}
