/**
 * Firebase App Check Verification Middleware
 *
 * Verifies that incoming requests include a valid Firebase App Check token,
 * ensuring the request originates from a genuine app installation rather
 * than a script, bot, or modified client.
 *
 * Deployment strategy (gradual rollout):
 *
 * 1. MONITOR mode (default): Logs missing/invalid tokens but allows requests.
 *    Use this during initial rollout to measure adoption without breaking
 *    older app versions that don't send App Check tokens yet.
 *
 * 2. WARN mode: Returns a warning header but still allows the request.
 *    Clients can use this to prompt users to update.
 *
 * 3. ENFORCE mode: Rejects requests without valid App Check tokens.
 *    Enable once all supported app versions include App Check.
 *
 * Set APP_CHECK_MODE=monitor|warn|enforce in the environment.
 *
 * @see https://firebase.google.com/docs/app-check/custom-resource-backend
 */

import type { Request, Response, NextFunction } from "express";
import { admin } from "../admin.ts";
import logger from "../logger.ts";

type AppCheckMode = "monitor" | "warn" | "enforce";

const APP_CHECK_HEADER = "x-firebase-appcheck";

function getMode(): AppCheckMode {
  const mode = process.env.APP_CHECK_MODE?.toLowerCase();
  if (mode === "enforce" || mode === "warn" || mode === "monitor") {
    return mode;
  }
  return "monitor";
}

/**
 * Verify the Firebase App Check token from the request header.
 *
 * Returns the decoded token if valid, or null if missing/invalid.
 */
async function verifyAppCheckToken(token: string): Promise<{ appId: string } | null> {
  try {
    const appCheckClaims = await admin.appCheck().verifyToken(token);
    return {
      appId: appCheckClaims.appId,
    };
  } catch (error) {
    logger.warn("App Check token verification failed", {
      error: String(error),
    });
    return null;
  }
}

/**
 * App Check verification middleware.
 *
 * Behavior depends on APP_CHECK_MODE:
 * - monitor: Log and continue (default)
 * - warn: Log, add warning header, continue
 * - enforce: Reject with 401
 */
export const verifyAppCheck = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const mode = getMode();
    const appCheckToken = req.header(APP_CHECK_HEADER);

    // No token provided
    if (!appCheckToken) {
      const message = "Missing App Check token";

      switch (mode) {
        case "enforce":
          logger.warn(message, {
            ip: req.ip,
            path: req.path,
            mode,
          });
          res.status(401).json({
            error: "App verification required",
            code: "APP_CHECK_REQUIRED",
          });
          return;

        case "warn":
          res.setHeader("X-App-Check-Warning", "Token missing");
          logger.info(message, { ip: req.ip, path: req.path, mode });
          break;

        case "monitor":
        default:
          logger.debug(message, { path: req.path, mode });
          break;
      }

      next();
      return;
    }

    // Token provided — verify it
    const claims = await verifyAppCheckToken(appCheckToken);

    if (!claims) {
      const message = "Invalid App Check token";

      switch (mode) {
        case "enforce":
          logger.warn(message, {
            ip: req.ip,
            path: req.path,
            mode,
          });
          res.status(401).json({
            error: "App verification failed",
            code: "APP_CHECK_INVALID",
          });
          return;

        case "warn":
          res.setHeader("X-App-Check-Warning", "Token invalid");
          logger.warn(message, { ip: req.ip, path: req.path, mode });
          break;

        case "monitor":
        default:
          logger.warn(message, { path: req.path, mode });
          break;
      }

      next();
      return;
    }

    // Valid token — attach claims to request for downstream use
    (req as Request & { appCheckClaims?: typeof claims }).appCheckClaims = claims;

    logger.debug("App Check verified", {
      appId: claims.appId,
      path: req.path,
    });

    next();
  } catch (error) {
    logger.error("App Check middleware error", { error: String(error), path: req.path });
    next(error);
  }
};

/**
 * Strict App Check enforcement for sensitive endpoints.
 *
 * Unlike verifyAppCheck (which respects APP_CHECK_MODE), this middleware
 * ALWAYS rejects requests without a valid App Check token. Use it for
 * high-value endpoints like payment processing or account deletion
 * where you want to enforce App Check regardless of the global mode.
 */
export const requireAppCheck = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const appCheckToken = req.header(APP_CHECK_HEADER);

    if (!appCheckToken) {
      logger.warn("Missing App Check token on protected endpoint", {
        ip: req.ip,
        path: req.path,
      });
      res.status(401).json({
        error: "App verification required",
        code: "APP_CHECK_REQUIRED",
      });
      return;
    }

    const claims = await verifyAppCheckToken(appCheckToken);

    if (!claims) {
      logger.warn("Invalid App Check token on protected endpoint", {
        ip: req.ip,
        path: req.path,
      });
      res.status(401).json({
        error: "App verification failed",
        code: "APP_CHECK_INVALID",
      });
      return;
    }

    (req as Request & { appCheckClaims?: typeof claims }).appCheckClaims = claims;
    next();
  } catch (error) {
    logger.error("App Check middleware error", { error: String(error), path: req.path });
    next(error);
  }
};
