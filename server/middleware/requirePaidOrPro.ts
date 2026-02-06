import type { Request, Response, NextFunction } from "express";

/**
 * Middleware that requires the user to have a paid (premium) or pro account tier.
 * Free-tier users get a 403 with upgrade instructions.
 *
 * Must be used AFTER authenticateUser middleware.
 */
export const requirePaidOrPro = (req: Request, res: Response, next: NextFunction) => {
  if (!req.currentUser) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const tier = req.currentUser.accountTier;

  if (tier === "pro" || tier === "premium") {
    return next();
  }

  return res.status(403).json({
    error: "Upgrade required",
    code: "UPGRADE_REQUIRED",
    message: "This feature requires a Pro or Premium account.",
    currentTier: "free",
    upgradeOptions: {
      premium: {
        price: 9.99,
        description: "One-time purchase. All features for life.",
      },
      pro: {
        description: "Get awarded Pro status by an existing Pro user.",
      },
    },
  });
};
