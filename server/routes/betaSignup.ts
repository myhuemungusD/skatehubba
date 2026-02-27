import { Router } from "express";
import crypto from "node:crypto";
import { betaSignups } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { env } from "../config/env";
import { validateBody } from "../middleware/validation";
import { BetaSignupInput } from "@shared/validation/betaSignup";
import { getClientIp, hashIp } from "../utils/ip";

const router = Router();

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

// POST /api/beta-signup — sign up for the beta waitlist
router.post(
  "/",
  validateBody(BetaSignupInput, { errorCode: "VALIDATION_ERROR" }),
  async (req, res) => {
    const { email, platform } = req.body as BetaSignupInput;
    const ip = getClientIp(req);
    const salt = env.IP_HASH_SALT || "";
    const ipHash = ip && salt ? hashIp(ip, salt) : undefined;

    try {
      const db = getDb();
      const docId = crypto.createHash("sha256").update(email).digest("hex").slice(0, 32);
      const now = new Date();

      const [existing] = await db
        .select()
        .from(betaSignups)
        .where(eq(betaSignups.id, docId))
        .limit(1);

      if (existing) {
        const lastMs = existing.lastSubmittedAt.getTime();
        if (now.getTime() - lastMs < RATE_LIMIT_WINDOW_MS) {
          return res.status(429).json({ ok: false, error: "RATE_LIMITED" });
        }

        await db
          .update(betaSignups)
          .set({
            platform: platform ?? existing.platform,
            ...(ipHash ? { ipHash } : {}),
            lastSubmittedAt: now,
            submitCount: sql`${betaSignups.submitCount} + 1`,
            source: "skatehubba.com",
          })
          .where(eq(betaSignups.id, docId));
      } else {
        await db.insert(betaSignups).values({
          id: docId,
          email,
          platform: platform ?? null,
          ...(ipHash ? { ipHash } : {}),
          source: "skatehubba.com",
          submitCount: 1,
          lastSubmittedAt: now,
          createdAt: now,
        });
      }

      return res.status(200).json({ ok: true });
    } catch {
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  }
);

export const betaSignupRouter = router;
