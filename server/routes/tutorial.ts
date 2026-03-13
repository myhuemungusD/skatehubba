import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { tutorialSteps, userProgress } from "@shared/schema";
import { getDb } from "../db";
import logger from "../logger";

const router = Router();

// GET /api/tutorial/steps — list all active tutorial steps (public)
router.get("/steps", async (_req, res) => {
  try {
    const database = getDb();
    const steps = await database
      .select()
      .from(tutorialSteps)
      .where(eq(tutorialSteps.isActive, true))
      .orderBy(tutorialSteps.order);

    res.json(steps);
  } catch (error) {
    logger.error("Failed to fetch tutorial steps", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Failed to fetch tutorial steps" });
  }
});

// GET /api/tutorial/steps/:id — get a single step
router.get("/steps/:id", async (req, res) => {
  try {
    const database = getDb();
    const stepId = parseInt(req.params.id, 10);
    if (isNaN(stepId)) {
      res.status(400).json({ error: "Invalid step ID" });
      return;
    }

    const [step] = await database
      .select()
      .from(tutorialSteps)
      .where(eq(tutorialSteps.id, stepId))
      .limit(1);

    if (!step) {
      res.status(404).json({ error: "Step not found" });
      return;
    }

    res.json(step);
  } catch (error) {
    logger.error("Failed to fetch tutorial step", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Failed to fetch tutorial step" });
  }
});

// GET /api/users/:userId/progress — get user's tutorial progress
router.get("/users/:userId/progress", async (req, res) => {
  try {
    const database = getDb();
    const { userId } = req.params;

    const progress = await database
      .select()
      .from(userProgress)
      .where(eq(userProgress.userId, userId));

    res.json(progress);
  } catch (error) {
    logger.error("Failed to fetch user progress", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Failed to fetch user progress" });
  }
});

// POST /api/users/:userId/progress — create progress entry for a step
router.post("/users/:userId/progress", async (req, res) => {
  try {
    const database = getDb();
    const { userId } = req.params;
    const { stepId, completed, timeSpent, interactionData } = req.body;

    if (!stepId) {
      res.status(400).json({ error: "stepId is required" });
      return;
    }

    // Check for existing progress (upsert-like behavior)
    const [existing] = await database
      .select()
      .from(userProgress)
      .where(and(eq(userProgress.userId, userId), eq(userProgress.stepId, stepId)))
      .limit(1);

    if (existing) {
      res.json(existing);
      return;
    }

    const [created] = await database
      .insert(userProgress)
      .values({
        userId,
        stepId,
        completed: completed ?? false,
        timeSpent: timeSpent ?? 0,
        interactionData: interactionData ?? null,
      })
      .returning();

    res.status(201).json(created);
  } catch (error) {
    logger.error("Failed to create user progress", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Failed to create user progress" });
  }
});

// PATCH /api/users/:userId/progress/:stepId — update progress for a step
router.patch("/users/:userId/progress/:stepId", async (req, res) => {
  try {
    const database = getDb();
    const { userId } = req.params;
    const stepId = parseInt(req.params.stepId, 10);

    if (isNaN(stepId)) {
      res.status(400).json({ error: "Invalid step ID" });
      return;
    }

    const { completed, timeSpent, interactionData } = req.body;

    const updates: Record<string, unknown> = {};
    if (completed !== undefined) updates.completed = completed;
    if (timeSpent !== undefined) updates.timeSpent = timeSpent;
    if (interactionData !== undefined) updates.interactionData = interactionData;
    if (completed === true) updates.completedAt = new Date();

    const [updated] = await database
      .update(userProgress)
      .set(updates)
      .where(and(eq(userProgress.userId, userId), eq(userProgress.stepId, stepId)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Progress entry not found" });
      return;
    }

    res.json(updated);
  } catch (error) {
    logger.error("Failed to update user progress", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Failed to update user progress" });
  }
});

// PATCH /api/users/:userId/onboarding — mark onboarding as complete
router.patch("/users/:userId/onboarding", async (req, res) => {
  try {
    // Onboarding completion is tracked by having all tutorial steps completed
    // This endpoint is a convenience wrapper
    const database = getDb();
    const { userId } = req.params;

    const allSteps = await database
      .select()
      .from(tutorialSteps)
      .where(eq(tutorialSteps.isActive, true));

    const progress = await database
      .select()
      .from(userProgress)
      .where(eq(userProgress.userId, userId));

    const completedCount = progress.filter((p) => p.completed).length;

    res.json({
      completed: completedCount >= allSteps.length,
      totalSteps: allSteps.length,
      completedSteps: completedCount,
    });
  } catch (error) {
    logger.error("Failed to check onboarding status", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Failed to check onboarding status" });
  }
});

export const tutorialRouter = router;
