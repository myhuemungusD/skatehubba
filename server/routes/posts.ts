import { Router } from "express";
import { z } from "zod";
import { authenticateUser } from "../auth/middleware";
import { requirePaidOrPro } from "../middleware/requirePaidOrPro";
import { enforceTrustAction } from "../middleware/trustSafety";
import { createPost } from "../services/moderationStore";

const router = Router();

const postSchema = z.object({
  // M2: Restrict URL scheme to HTTPS only (prevent javascript:, data:, file: XSS)
  mediaUrl: z
    .string()
    .url()
    .max(2000)
    .refine((url) => /^https:\/\//i.test(url), "URL must use HTTPS"),
  caption: z.string().max(300).optional(),
  spotId: z.number().int().optional(),
});

// POST /api/posts — create a post
router.post(
  "/",
  authenticateUser,
  requirePaidOrPro,
  enforceTrustAction("post"),
  async (req, res) => {
    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request", issues: parsed.error.flatten() });
    }

    if (!req.currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const post = await createPost(req.currentUser.id, parsed.data);
    return res.status(201).json({ postId: post.id });
  }
);

export const postsRouter = router;
