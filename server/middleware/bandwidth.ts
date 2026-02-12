/**
 * Bandwidth-Aware Middleware
 *
 * Detects client bandwidth constraints via standard HTTP headers and exposes
 * a preferred quality tier on the request object. Consumers (e.g. video feed
 * endpoints) use this to serve smaller renditions and reduce egress costs.
 *
 * Supported signals (cheapest to detect):
 *   - Save-Data: on           → force "low"
 *   - ECT: slow-2g | 2g      → "low"
 *   - ECT: 3g                 → "medium"
 *   - ECT: 4g (or missing)    → "medium" (default — NOT high, to save bandwidth)
 *   - ?quality=low|medium|high → explicit override from client
 */

import type { Request, Response, NextFunction } from "express";
import type { QualityTier } from "../services/videoTranscoder";

const VALID_TIERS = new Set<QualityTier>(["low", "medium", "high"]);

export function bandwidthDetection(req: Request, _res: Response, next: NextFunction): void {
  // 1. Explicit override via query param
  const explicit = req.query.quality as string | undefined;
  if (explicit && VALID_TIERS.has(explicit as QualityTier)) {
    req.preferredQuality = explicit as QualityTier;
    return next();
  }

  // 2. Save-Data header — user has explicitly opted into reduced data usage
  if (req.headers["save-data"] === "on") {
    req.preferredQuality = "low";
    return next();
  }

  // 3. Effective Connection Type (ECT) client hint
  const ect = req.headers["ect"] as string | undefined;
  switch (ect) {
    case "slow-2g":
    case "2g":
      req.preferredQuality = "low";
      break;
    case "3g":
      req.preferredQuality = "medium";
      break;
    case "4g":
    default:
      // Default to medium — saves ~50% bandwidth vs high with acceptable quality
      req.preferredQuality = "medium";
      break;
  }

  next();
}
