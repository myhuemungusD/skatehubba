/**
 * Async S.K.A.T.E. Game Routes
 *
 * Turn-based, asynchronous game inspired by domino/chess-by-mail mechanics.
 * No live play, no retries, no previews. Ruthless, simple, final.
 *
 * Core loop:
 *   1. Offensive player sets a trick (records video, auto-sends)
 *   2. Defensive player watches, records response (one take, auto-sends)
 *   3. Defensive player judges offensive trick: LAND or BAIL
 *   4. If BAIL → defender gets next letter; roles stay
 *   5. If LAND → roles swap
 *   6. First to spell S.K.A.T.E. loses
 */

import { Router } from "express";
import { gamesChallengesRouter } from "./games-challenges";
import { gamesTurnsRouter } from "./games-turns";
import { gamesDisputesRouter } from "./games-disputes";
import { gamesManagementRouter } from "./games-management";
import { gameWriteLimiter } from "../middleware/security";

const router = Router();

// Rate limit all game write operations (POST/PUT/PATCH/DELETE)
router.use((req, res, next) => {
  if (req.method === "GET") return next();
  return gameWriteLimiter(req, res, next);
});

// Mount subrouters
router.use("/", gamesChallengesRouter);
router.use("/", gamesTurnsRouter);
router.use("/", gamesDisputesRouter);
router.use("/", gamesManagementRouter);

// Export the main router
export { router as gamesRouter };

// Export cron functions
export { forfeitExpiredGames, notifyDeadlineWarnings, forfeitStalledGames } from "./games-cron";
