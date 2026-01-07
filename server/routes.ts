import type { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import Stripe from 'stripe';
import { storage } from './storage';
import {
  insertUserProgressSchema,
  updateUserProgressSchema,
  NewSubscriberInput
} from '../shared/schema.ts';
import crypto from 'crypto';
import validator from 'validator';
import { apiLimiter } from './middleware/security.ts';
import { env } from './config/env';
import { sendSubscriberNotification } from './email';
import { setupAuthRoutes } from './auth/routes.ts';
import OpenAI from 'openai';
import { generateHTMLDocs, apiDocumentation } from './api-docs.ts';
import { SITEMAP_ENTRIES } from '../shared/sitemap-config.ts';

// Stripe and OpenAI will be initialized inside registerRoutes to allow test env overrides
let stripe: Stripe | null = null;
let openai: OpenAI | null = null;

// Security validation functions
const sanitizeString = (str: string): string => {
  // Remove potential XSS vectors
  const sanitized = validator.escape(str.trim());
  // Remove SQL injection patterns
  return sanitized.replace(/['\\';|*%<>{}[\]()]/g, '');
};

const validateId = (id: string): boolean => {
  return validator.isInt(id, { min: 1 }) && validator.isLength(id, { max: 20 });
};



// Admin API key middleware with timing attack protection
const requireApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

  if (!env.ADMIN_API_KEY) {
    return res.status(500).json({ error: "Admin API key not configured" });
  }

  if (!apiKey || apiKey.length !== env.ADMIN_API_KEY.length) {
    return res.status(401).json({ error: "Invalid or missing API key" });
  }

  const providedKey = Buffer.from(Array.isArray(apiKey) ? apiKey[0] : apiKey, 'utf8');
  const validKey = Buffer.from(env.ADMIN_API_KEY, 'utf8');

  if (!crypto.timingSafeEqual(providedKey, validKey)) {
    return res.status(401).json({ error: "Invalid or missing API key" });
  }

  next();
};

import { admin } from "./admin";
import { Timestamp } from "firebase-admin/firestore";

/**
 * Registers all API routes for the SkateHubba application
 *
 * This function sets up all REST API endpoints including:
 * - Authentication (Firebase-based)
 * - Tutorial steps and user progress
 * - Spot discovery and check-ins
 * - Product catalog and shopping
 * - Payment processing (Stripe)
 * - S.K.A.T.E. game functionality
 * - AI chat assistant
 * - Subscriber management
 * 
 * @param app - Express application instance
 * @returns Promise that resolves when all routes are registered
 * 
 * @example
 * const app = express();
 * await registerRoutes(app);
 */
export async function registerRoutes(app: Express): Promise<void> {
  // Initialize Stripe (done here to allow test env override)
  // Test framework may use TESTING_STRIPE_SECRET_KEY
  // Note: Key format validation happens in env.ts - app won't start with invalid key
  const stripeKey = env.TESTING_STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY;
  
  if (stripeKey) {
    stripe = new Stripe(stripeKey, {
      apiVersion: "2024-06-20",
    });
    console.log('✅ Stripe initialized');
  } else {
    console.warn('⚠️  Stripe not configured - payment features disabled');
  }
  
  // Initialize OpenAI if configured
  openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;
  if (openai) {
    console.log('✅ OpenAI initialized');
  }

  // Firebase Authentication Routes
  setupAuthRoutes(app as any);

  app.get('/api/health', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      env: env.NODE_ENV,
      time: new Date().toISOString()
    });
  });

  // API Documentation endpoint (with rate limiting to prevent abuse)
  app.get('/api/docs', apiLimiter, (req: Request, res: Response) => {
    const format = req.query.format as string;
    
    if (format === 'json') {
      // Return JSON format for programmatic access
      res.json({
        version: '1.0.0',
        title: 'SkateHubba™ API',
        description: 'REST API for the SkateHubba skateboarding platform',
        baseUrl: '/api',
        categories: apiDocumentation
      });
    } else {
      // Return HTML documentation by default
      res.setHeader('Content-Type', 'text/html');
      res.send(generateHTMLDocs());
    }
  });

  // Dynamic Sitemap.xml (environment-aware)
  app.get('/sitemap.xml', (req: Request, res: Response) => {
    try {
      const protocol = req.get('X-Forwarded-Proto') || (req.secure ? 'https' : 'http');
      const host = req.get('X-Forwarded-Host') || req.get('Host') || 'localhost:5000';
      const baseUrl = (env.PRODUCTION_URL || `${protocol}://${host}`).replace(/\/$/, '');

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${SITEMAP_ENTRIES.map(entry => `  <url>
    <loc>${baseUrl}${entry.path}</loc>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Cache-Control', 'public, max-age=900');
      res.send(xml);
    } catch (error) {
      console.error('Failed to generate sitemap:', error);
      res.status(500).send('Error generating sitemap');
    }
  });

  // Removed /api/auth/user - now using Firebase-only authentication

  // Tutorial Steps Routes
  app.get("/api/tutorial/steps", async (req: Request, res: Response) => {
    try {
      const steps = await storage.getAllTutorialSteps();
      res.json(steps);
    } catch (error) {
      console.error("Failed to get tutorial steps:", error);
      res.status(500).json({ error: "Failed to retrieve tutorial steps" });
    }
  });

  app.get("/api/tutorial/steps/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      if (!validateId(id)) {
        return res.status(400).json({ error: "Invalid step ID format" });
      }

      const stepId = parseInt(id);
      const step = await storage.getTutorialStep(stepId);
      if (!step) {
        return res.status(404).json({ error: "Tutorial step not found" });
      }

      res.json(step);
    } catch (error) {
      console.error("Failed to get tutorial step:", error);
      res.status(500).json({ error: "Failed to retrieve tutorial step" });
    }
  });

  // User Progress Routes
  app.get("/api/users/:userId/progress", async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const progress = await storage.getUserProgress(userId);
      res.json(progress);
    } catch (error) {
      console.error("Failed to get user progress:", error);
      res.status(500).json({ error: "Failed to retrieve user progress" });
    }
  });

  app.get("/api/users/:userId/progress/:stepId", async (req, res) => {
    try {
      const { userId } = req.params;
      const stepId = parseInt(req.params.stepId);

      if (isNaN(stepId)) {
        return res.status(400).json({ error: "Invalid step ID" });
      }

      const progress = await storage.getUserStepProgress(userId, stepId);
      if (!progress) {
        return res.status(404).json({ error: "Progress not found" });
      }

      res.json(progress);
    } catch (error) {
      console.error("Failed to get user step progress:", error);
      res.status(500).json({ error: "Failed to retrieve user step progress" });
    }
  });

  app.post("/api/users/:userId/progress", async (req, res) => {
    try {
      const { userId } = req.params;

      const progressData = insertUserProgressSchema.parse({
        ...req.body,
        userId
      });

      const progress = await storage.createUserProgress(progressData);
      res.status(201).json(progress);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid progress data", details: error.errors });
      }
      console.error("Failed to create user progress:", error);
      res.status(500).json({ error: "Failed to create user progress" });
    }
  });

  app.patch("/api/users/:userId/progress/:stepId", async (req, res) => {
    try {
      const { userId } = req.params;
      const stepId = parseInt(req.params.stepId);

      if (isNaN(stepId)) {
        return res.status(400).json({ error: "Invalid step ID" });
      }

      const updates = updateUserProgressSchema.parse(req.body);
      const progress = await storage.updateUserProgress(userId, stepId, updates);

      if (!progress) {
        return res.status(404).json({ error: "Progress not found" });
      }

      res.json(progress);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid update data", details: error.errors });
      }
      console.error("Failed to update user progress:", error);
      res.status(500).json({ error: "Failed to update user progress" });
    }
  });

  // User Routes
  app.get("/api/users", async (req: Request, res: Response) => {
    try {
      const users = await storage.getAllUsers();
      
      // Return only public user data (exclude sensitive fields)
      const publicUsers = users.map(user => {
        // Priority: userProfiles.displayName → firstName+lastName → 'Skater'
        let displayName = (user as any).profileDisplayName; // From userProfiles JOIN
        
        if (!displayName) {
          const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
          displayName = fullName || 'Skater';
        }
        
        return {
          uid: user.id,
          displayName,
          email: user.email,
          photoURL: user.profileImageUrl || null
        };
      });

      res.json(publicUsers);
    } catch (error) {
      console.error("Failed to get users:", error);
      res.status(500).json({ error: "Failed to retrieve users" });
    }
  });

  app.get("/api/social/bolts-showcase", async (req: Request, res: Response) => {
    /**
     * GOVERNANCE LOCK:
     * Phase 4 Read-Only Aggregation Endpoint (FROZEN).
     *
     * This endpoint is intentionally limited.
     * Do NOT:
     * - Add pagination
     * - Add filters
     * - Add ranking tiers
     * - Add time windows
     * - Extend response shape
     *
     * Any changes require Phase 5 approval.
     */
    try {
      const { db } = await import('./db');
      const { userProfiles, trickMastery } = await import('../shared/schema.ts');
      const { eq, desc, count, and } = await import('drizzle-orm');

      // Aggregate bolts per user
      const results = await db
        .select({
          userId: userProfiles.id,
          handle: userProfiles.handle,
          displayName: userProfiles.displayName,
          photoURL: userProfiles.photoURL,
          boltsCount: count(trickMastery.id),
          lastActive: userProfiles.updatedAt,
        })
        .from(userProfiles)
        .innerJoin(trickMastery, eq(userProfiles.id, trickMastery.userId))
        .where(eq(trickMastery.level, 'bolts'))
        .groupBy(userProfiles.id)
        .orderBy(desc(count(trickMastery.id)), desc(userProfiles.updatedAt))
        .limit(20);

      res.json(results);
    } catch (error) {
      console.error("Failed to fetch bolts showcase:", error);
      res.status(500).json({ error: "Failed to retrieve showcase data" });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(user);
    } catch (error) {
      console.error("Failed to get user:", error);
      res.status(500).json({ error: "Failed to retrieve user" });
    }
  });

  app.patch("/api/users/:id/onboarding", async (req, res) => {
    try {
      const { id } = req.params;

      const { completed, currentStep } = req.body;
      if (typeof completed !== "boolean") {
        return res.status(400).json({ error: "Invalid completed status" });
      }

      const user = await storage.updateUserOnboardingStatus(id, completed, currentStep);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(user);
    } catch (error) {
      console.error("Failed to update user onboarding:", error);
      res.status(500).json({ error: "Failed to update user onboarding" });
    }
  });

  // Stripe payment routes with enhanced security
  app.post("/api/create-payment-intent", async (req: Request, res: Response) => {
    try {
      const clientIP = req.ip || req.connection.remoteAddress;
      const rawUserAgent = req.get('User-Agent');
      const sanitizedUserAgent = rawUserAgent ? sanitizeString(rawUserAgent).slice(0, 200) : 'unknown';

      const { amount, currency = "usd", description = "SkateHubba Donation" } = req.body;

      // Enhanced amount validation
      if (!amount || typeof amount !== 'number' || amount < 0.50 || amount > 10000 || !Number.isFinite(amount)) {
        return res.status(400).json({ error: "Amount must be between $0.50 and $10,000" });
      }

      // Check for suspicious patterns
      if (amount === Math.floor(amount) && amount > 1000) {
        console.warn(`Large round number payment attempt: ${amount} from IP: ${clientIP}`);
      }

      // Validate currency
      const allowedCurrencies = ['usd', 'eur', 'gbp', 'cad', 'aud'];
      if (!allowedCurrencies.includes(currency.toLowerCase())) {
        return res.status(400).json({ error: "Unsupported currency" });
      }

      // Sanitize description
      const sanitizedDescription = sanitizeString(description);
      if (sanitizedDescription.length > 100) {
        return res.status(400).json({ error: "Description too long" });
      }

      // Generate idempotency key for payment safety
      const idempotencyKey = crypto.randomUUID();

      if (!stripe) {
        return res.status(503).json({ error: "Payment service is currently unavailable" });
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency.toLowerCase(),
        description: sanitizedDescription,
        automatic_payment_methods: {
          enabled: true,
        },
        payment_method_types: ['card', 'apple_pay', 'google_pay', 'link'],
        metadata: {
          source: 'skatehubba_website',
          timestamp: new Date().toISOString(),
          userAgent: sanitizedUserAgent,
        }
      }, {
        idempotencyKey
      });

      res.json({ 
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
      });
    } catch (error: any) {
      console.error("Payment intent creation failed:", error);
      res.status(500).json({ 
        error: "Failed to create payment intent"
      });
    }
  });

  // Get payment status
  app.get("/api/payment-intent/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!stripe) {
        return res.status(503).json({ error: "Payment service is currently unavailable" });
      }
      
      const paymentIntent = await stripe.paymentIntents.retrieve(id);

      res.json({
        status: paymentIntent.status,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        description: paymentIntent.description
      });
    } catch (error: any) {
      console.error("Failed to retrieve payment intent:", error);
      res.status(500).json({ 
        error: "Failed to retrieve payment intent",
        details: error.message 
      });
    }
  });

  // Record donation when payment succeeds
  app.post("/api/record-donation", async (req, res) => {
    try {
      const { paymentIntentId, firstName } = req.body;

      if (!paymentIntentId || !firstName) {
        return res.status(400).json({ error: "Payment intent ID and first name are required" });
      }

      if (!stripe) {
        return res.status(503).json({ error: "Payment service is currently unavailable" });
      }

      // Verify payment with Stripe
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (paymentIntent.status !== "succeeded") {
        return res.status(400).json({ error: "Payment not successful" });
      }

      // Record the donation
      const donation = await storage.createDonation({
        firstName: sanitizeString(firstName),
        amount: paymentIntent.amount,
        paymentIntentId,
        status: "succeeded"
      });

      res.json({ message: "Donation recorded successfully", donationId: donation.id });
    } catch (error) {
      console.error("Failed to record donation:", error);
      res.status(500).json({ error: "Failed to record donation" });
    }
  });

  // Get recent donors (first names only)
  app.get("/api/recent-donors", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      if (limit > 50) {
        return res.status(400).json({ error: "Limit cannot exceed 50" });
      }

      const donors = await storage.getRecentDonors(limit);
      res.json(donors);
    } catch (error) {
      console.error("Failed to get recent donors:", error);
      res.status(500).json({ error: "Failed to retrieve recent donors" });
    }
  });

  app.post("/api/subscribe", async (req, res) => {
    const parsed = NewSubscriberInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

    const { email, firstName } = parsed.data;

    try {
      const existing = await storage.getSubscriber(email);
      if (existing) {
        // idempotent response for existing
        return res.status(200).json({ 
          ok: true, 
          status: "exists", 
          msg: "You're already on the beta list! We'll notify you when it's ready." 
        });
      }

      const created = await storage.createSubscriber({
        email,
        firstName: firstName ?? null,
        isActive: true, // service-level default
      });

      await sendSubscriberNotification({ email, firstName: firstName || "" });

      return res.status(201).json({ 
        ok: true, 
        status: "created", 
        id: created.id,
        msg: "Welcome to the beta list! Check your email for confirmation." 
      });
    } catch (error) {
      console.error("Subscription error:", error);
      return res.status(500).json({ 
        ok: false, 
        error: "Failed to process subscription. Please try again." 
      });
    }
  });

  // Get all subscribers (admin only - requires API key)
  app.get("/api/subscribers", requireApiKey, async (req, res) => {
    try {
      const subscribers = await storage.getSubscribers();
      res.json(subscribers);
    } catch (error) {
      console.error("Failed to get subscribers:", error);
      res.status(500).json({ error: "Failed to retrieve subscribers" });
    }
  });

  // OpenAI Assistant route (legacy)
  app.post("/api/assistant", async (req, res) => {
    try {
      if (!openai) {
        return res.status(503).json({ ok: false, error: "AI service is currently unavailable" });
      }

      const { persona = "filmer", messages = [] } = req.body || {};

      const system =
        persona === "editor"
          ? "You are 'The Editor'—a blunt, no-nonsense skate mag lifer. Keep answers short, direct, and occasionally spicy, but helpful. Avoid profanity. Never claim affiliation with any real person or brand."
          : "You are 'The Filmer'—a hype filmer buddy. Encouraging, core skate slang, keeps it positive. Be concise and helpful. Never claim affiliation with any real person or brand.";

      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: system }, ...messages].slice(-12),
        temperature: 0.7,
        max_tokens: 300
      });

      const answer = resp.choices?.[0]?.message || { role: "assistant", content: "All good!" };
      res.json({ ok: true, reply: answer });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "Assistant error" });
    }
  });

  // Hesher AI Chat route
  app.post("/api/ai/chat", async (req, res) => {
    try {
      if (!openai) {
        return res.status(503).json({ 
          ok: false, 
          error: "AI chat is currently unavailable" 
        });
      }

      const { messages = [] } = req.body || {};

      const systemPrompt = `You are Hesher, an enthusiastic AI skate buddy for SkateHubba™. 
You're knowledgeable about skateboarding culture, tricks, spots, and the SkateHubba app features.
- Keep responses short, friendly, and use skate slang naturally
- Be encouraging and positive
- Help users with app features (check-ins, AR tricks, leaderboards, etc.)
- Share skateboarding tips and trick advice
- Never claim to be a real person or affiliated with real brands
- Use emojis occasionally to keep it fun 🛹
- Keep responses under 150 words`;

      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.slice(-12) // Last 12 messages for context
        ],
        temperature: 0.8,
        max_tokens: 200
      });

      const answer = resp.choices?.[0]?.message || { 
        role: "assistant", 
        content: "Hey! I'm here to help with all things skateboarding! 🛹" 
      };
      
      res.json({ ok: true, reply: answer });
    } catch (e) {
      console.error("AI Chat error:", e);
      res.status(500).json({ ok: false, error: "Chat error - try again in a moment!" });
    }
  });

  // Create demo user for testing (temporary)
  app.post("/api/demo-user", async (req, res) => {
    try {
      const demoUser = await storage.upsertUser({
        id: "demo_skater_" + Date.now(),
        firstName: "Demo",
        lastName: "User"
      });

      // Return user data
      const safeUser = demoUser;
      res.status(201).json(safeUser);
    } catch (error) {
      console.error("Failed to create demo user:", error);
      res.status(500).json({ error: "Failed to create demo user" });
    }
  });

  // Spots endpoints
  app.get("/api/spots", async (req: Request, res: Response) => {
    try {
      const spots = await storage.getAllSpots();
      res.json(spots);
    } catch (error) {
      console.error("Error fetching spots:", error);
      res.status(500).json({ error: "Failed to fetch spots" });
    }
  });

  app.get("/api/spots/:spotId", async (req: Request, res: Response) => {
    try {
      const spot = await storage.getSpot(req.params.spotId);
      if (!spot) {
        return res.status(404).json({ error: "Spot not found" });
      }
      res.json(spot);
    } catch (error) {
      console.error("Error fetching spot:", error);
      res.status(500).json({ error: "Failed to fetch spot" });
    }
  });

  // Spot Check-In with Geo-Verification and Mastery Update
  app.get("/api/checkins", async (req: Request, res: Response) => {
    try {
      const { uid } = req.query;
      if (!uid || typeof uid !== 'string') {
        return res.status(400).json({ status: "error", message: "User ID is required" });
      }

      const checkinsRef = admin.firestore().collection("checkins");
      const snapshot = await checkinsRef.where("userId", "==", uid).orderBy("createdAt", "desc").get();
      
      const checkins = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      res.json({ status: "ok", checkins });
    } catch (error) {
      console.error("Error fetching check-ins:", error);
      res.status(500).json({ status: "error", message: "Failed to fetch check-ins" });
    }
  });

  app.post("/api/checkins", async (req: Request, res: Response) => {
    try {
      const { userId, trick, spotId, videoUrl } = req.body;

      if (!userId || !trick || !spotId) {
        return res.status(400).json({ status: "error", message: "Missing required fields" });
      }

      // 1. Log Check-in to Firestore
      const checkinData = {
        userId,
        trick: sanitizeString(trick).slice(0, 100),
        spotId: sanitizeString(spotId),
        videoUrl: videoUrl ? sanitizeString(videoUrl) : null,
        createdAt: new Date().toISOString(),
        awardedPoints: 10
      };

      const docRef = await admin.firestore().collection("checkins").add(checkinData);

      // 2. Update Trick Mastery in Postgres
      try {
        const mastery = await storage.getTrickMastery(userId, trick);
        if (mastery) {
          const newLandedCount = mastery.landedCount + 1;
          const newStreak = (mastery.lastLandedAt && (Date.now() - mastery.lastLandedAt.getTime() < 86400000 * 2)) 
            ? mastery.streak + 1 
            : 1;
          
          let level = 'learning';
          if (newLandedCount >= 10 && newStreak >= 5) level = 'bolts';
          else if (newLandedCount >= 5) level = 'consistent';

          await storage.updateTrickMastery(mastery.id, {
            landedCount: newLandedCount,
            streak: newStreak,
            level,
            lastLandedAt: new Date()
          });
        } else {
          await storage.createTrickMastery({
            userId,
            trick,
            landedCount: 1,
            streak: 1,
            level: 'learning',
            lastLandedAt: new Date()
          });
        }
      } catch (masteryError) {
        console.error("Failed to update trick mastery:", masteryError);
      }

      res.status(201).json({ status: "ok", id: docRef.id });
    } catch (error) {
      console.error("Check-in failed:", error);
      res.status(500).json({ status: "error", message: "Bailed! Failed to log trick." });
    }
  });

  app.post("/api/spots/check-in", async (req, res) => {
    try {
      const { spotId, userId, latitude, longitude } = req.body;

      if (!spotId || !userId || latitude === undefined || longitude === undefined) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: spotId, userId, latitude, longitude"
        });
      }

      // Fetch spot from database
      const spot = await storage.getSpot(spotId);
      if (!spot) {
        return res.status(404).json({
          success: false,
          message: "Spot not found"
        });
      }

      // Get lat/lng from database (stored as double precision)
      const spotLat = spot.lat;
      const spotLng = spot.lng;

      // Calculate distance using Haversine formula
      const R = 6371e3; // Earth radius in meters
      const φ1 = (latitude * Math.PI) / 180;
      const φ2 = (spotLat * Math.PI) / 180;
      const Δφ = ((spotLat - latitude) * Math.PI) / 180;
      const Δλ = ((spotLng - longitude) * Math.PI) / 180;

      const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c; // Distance in meters

      const MAX_CHECKIN_DISTANCE = 30; // 30 meters as per roadmap

      if (distance > MAX_CHECKIN_DISTANCE) {
        return res.status(403).json({
          success: false,
          message: `You must be within ${MAX_CHECKIN_DISTANCE}m of ${spot.name} to check in. You are ${Math.round(distance)}m away.`,
          distance: Math.round(distance)
        });
      }

      // Grant 24-hour access
      const now = Date.now();
      const expiresAt = now + (24 * 60 * 60 * 1000); // 24 hours

      const access = {
        spotId,
        accessGrantedAt: now,
        expiresAt,
        trickId: `trick_${spotId}_${Date.now()}`,
        hologramUrl: `/tricks/holograms/${spotId}.glb`
      };

      res.json({
        success: true,
        message: `Successfully checked in at ${spot.name}!`,
        access,
        distance: Math.round(distance)
      });
    } catch (error) {
      console.error("Check-in error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during check-in"
      });
    }
  });

  // Product endpoints
  app.get("/api/products", async (req: Request, res: Response) => {
    try {
      const products = await storage.getAllProducts();
      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.get("/api/products/:productId", async (req: Request, res: Response) => {
    try {
      const product = await storage.getProduct(req.params.productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ error: "Failed to fetch product" });
    }
  });

  // Stripe payment endpoint for shopping cart checkout
  // SECURITY: Server-side price calculation to prevent client tampering
  app.post("/api/create-shop-payment-intent", async (req: Request, res: Response) => {
    try {
      if (!stripe) {
        return res.status(500).json({ message: "Stripe is not configured" });
      }

      const clientIP = req.ip || req.connection.remoteAddress;
      const { items, userId, userEmail } = req.body;

      // Validate items array
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Invalid cart items" });
      }

      // Fetch products from database for authoritative pricing
      const products = await storage.getAllProducts();
      const productPriceMap = new Map(products.map(p => [p.productId, p.price / 100])); // Convert cents to dollars

      // Calculate total server-side from database prices
      let totalAmount = 0;
      const validatedItems: Array<{ id: string; name: string; quantity: number; price: number }> = [];

      for (const item of items) {
        if (!item.id || !item.quantity || typeof item.quantity !== 'number') {
          return res.status(400).json({ message: "Invalid item format" });
        }

        const price = productPriceMap.get(item.id);
        if (price === undefined) {
          return res.status(400).json({ message: `Invalid product ID: ${item.id}` });
        }

        if (item.quantity < 1 || item.quantity > 99 || !Number.isInteger(item.quantity)) {
          return res.status(400).json({ message: "Invalid quantity" });
        }

        // Get product name from database
        const productInfo = products.find(p => p.productId === item.id);
        const itemTotal = price * item.quantity;
        totalAmount += itemTotal;
        
        validatedItems.push({ 
          id: item.id, 
          name: productInfo?.name || item.id,
          quantity: item.quantity, 
          price 
        });
      }

      // Validate total amount
      if (totalAmount < 0.50 || totalAmount > 10000) {
        return res.status(400).json({ message: "Amount must be between $0.50 and $10,000" });
      }

      // Log payment attempt for security monitoring
      console.log(`Shop payment attempt: $${totalAmount.toFixed(2)} from IP: ${clientIP}, items: ${validatedItems.length}`);

      if (!stripe) {
        return res.status(503).json({ message: "Payment service is currently unavailable" });
      }

      // Create a PaymentIntent with the server-calculated amount
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(totalAmount * 100), // Convert to cents
        currency: "usd",
        description: `SkateHubba Shop - ${validatedItems.length} items`,
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          items: JSON.stringify(validatedItems),
          userId: userId || "",
          userEmail: userEmail || "",
          ip: clientIP || "unknown",
        },
      });

      // Record order in database
      try {
        await storage.createOrder({
          userId: userId || undefined,
          userEmail: userEmail || undefined,
          items: validatedItems,
          total: Math.round(totalAmount * 100), // Store in cents
          status: "pending",
          paymentIntentId: paymentIntent.id,
        });
      } catch (orderError) {
        console.error("Failed to record order:", orderError);
        // Continue anyway - payment intent created
      }

      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error: any) {
      console.error("Stripe payment intent error:", error);
      res.status(500).json({ 
        message: "Error creating payment intent: " + (error.message || "Unknown error")
      });
    }
  });

  // ==========================================
  // S.K.A.T.E. GAME ENDPOINTS
  // ==========================================

  // Get all games for the current player
  app.get("/api/games", async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string;
      
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const games = await storage.getGamesByPlayer(userId);
      res.json(games);
    } catch (error) {
      console.error("Error fetching games:", error);
      res.status(500).json({ error: "Failed to fetch games" });
    }
  });

  // Create a new game
  app.post("/api/games/create", async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      // Get user info from Firebase or use userId as name fallback
      const playerName = userId.split('@')[0] || userId;

      const newGame = await storage.createGame({
        player1Id: userId,
        player1Name: playerName,
        status: 'waiting',
      });

      res.status(201).json(newGame);
    } catch (error) {
      console.error("Error creating game:", error);
      res.status(500).json({ error: "Failed to create game" });
    }
  });

  // Join an existing game
  app.post("/api/games/:gameId/join", async (req: Request, res: Response) => {
    try {
      const { gameId } = req.params;
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      // Check if game exists and is waiting
      const game = await storage.getGame(gameId);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      if (game.status !== 'waiting') {
        return res.status(400).json({ error: "Game is not available to join" });
      }

      if (game.player1Id === userId) {
        return res.status(400).json({ error: "Cannot join your own game" });
      }

      // Get player name
      const playerName = userId.split('@')[0] || userId;

      const updatedGame = await storage.joinGame(gameId, userId, playerName);
      
      if (!updatedGame) {
        return res.status(400).json({ error: "Failed to join game" });
      }

      res.json(updatedGame);
    } catch (error) {
      console.error("Error joining game:", error);
      res.status(500).json({ error: "Failed to join game" });
    }
  });

  // Submit a trick
  app.post("/api/games/:gameId/trick", async (req: Request, res: Response) => {
    try {
      const { gameId } = req.params;
      const { userId, trick } = req.body;

      if (!userId || !trick) {
        return res.status(400).json({ error: "userId and trick are required" });
      }

      // Validate trick description
      if (trick.trim().length === 0) {
        return res.status(400).json({ error: "Trick description cannot be empty" });
      }

      if (trick.length > 500) {
        return res.status(400).json({ error: "Trick description too long (max 500 characters)" });
      }

      // Get player name
      const playerName = userId.split('@')[0] || userId;

      const result = await storage.submitTrick(gameId, userId, playerName, trick.trim());

      res.json(result.game);
    } catch (error: any) {
      console.error("Error submitting trick:", error);
      
      if (error.message === 'Game not found') {
        return res.status(404).json({ error: "Game not found" });
      }
      if (error.message === 'Not your turn') {
        return res.status(403).json({ error: "It's not your turn" });
      }
      
      res.status(500).json({ error: "Failed to submit trick" });
    }
  });

  // Get game details including turn history
  app.get("/api/games/:gameId", async (req: Request, res: Response) => {
    try {
      const { gameId } = req.params;

      const game = await storage.getGame(gameId);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      const turns = await storage.getGameTurns(gameId);

      res.json({
        ...game,
        turns,
      });
    } catch (error) {
      console.error("Error fetching game details:", error);
      res.status(500).json({ error: "Failed to fetch game details" });
    }
  });

  // User profile endpoints
  app.get("/api/profiles/:handle", async (req: Request, res: Response) => {
    try {
      const { handle } = req.params;
      const profile = await storage.getUserProfileByHandle(handle);
      
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  app.get("/api/profiles/:handle/closet", async (req: Request, res: Response) => {
    try {
      const { handle } = req.params;
      const profile = await storage.getUserProfileByHandle(handle);
      
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      const closetItems = await storage.getUserClosetItems(profile.id);
      res.json(closetItems);
    } catch (error) {
      console.error("Error fetching closet items:", error);
      res.status(500).json({ error: "Failed to fetch closet items" });
    }
  });

  // Get current user's closet items
  app.get("/api/closet", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const closetItems = await storage.getUserClosetItems(userId);
      res.json(closetItems);
    } catch (error) {
      console.error("Error fetching closet items:", error);
      res.status(500).json({ error: "Failed to fetch closet items" });
    }
  });

  // Skate spots endpoints
  app.get("/api/spots", async (req: Request, res: Response) => {
    try {
      const spots = await storage.getAllSpots();
      res.json(spots);
    } catch (error) {
      console.error("Error fetching spots:", error);
      res.status(500).json({ error: "Failed to fetch spots" });
    }
  });

  app.post("/api/spots", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { name, lat, lng, description, tags, tier } = req.body;
      
      if (!name || !lat || !lng || !tier) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const spot = await storage.createSpot({
        name,
        lat,
        lng,
        description,
        tags,
        tier,
      });

      res.json(spot);
    } catch (error) {
      console.error("Error creating spot:", error);
      res.status(500).json({ error: "Failed to create spot" });
    }
  });

  // Challenge endpoints
  app.post("/api/challenges", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { challengedId } = req.body;
      if (!challengedId || challengedId === userId) {
        return res.status(400).json({ error: "Invalid challenge target" });
      }

      const challenge = await storage.createChallenge({
        challengerId: userId,
        challengedId,
        status: 'pending',
      });

      res.json(challenge);
    } catch (error) {
      console.error("Error creating challenge:", error);
      res.status(500).json({ error: "Failed to create challenge" });
    }
  });

  app.get("/api/challenges", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const challenges = await storage.getUserChallenges(userId);
      res.json(challenges);
    } catch (error) {
      console.error("Error fetching challenges:", error);
      res.status(500).json({ error: "Failed to fetch challenges" });
    }
  });

  // Trick Check-In Endpoint (Phase 2)
  const CheckInInputSchema = z.object({
    uid: z.string().min(1, "User ID is required"),
    spotId: z.string().min(1, "Spot ID is required"),
    trick: z.string().min(1, "Trick name is required"),
    videoUrl: z.string().url("Valid video URL is required"),
  });

  app.post("/api/checkins", async (req: Request, res: Response) => {
    try {
      const authUser = (req as any).user;
      if (!authUser || !authUser.uid) {
        return res.status(401).json({
          status: "fail",
          awardedPoints: 0,
          message: "Authentication required",
        });
      }

      const parsed = CheckInInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          status: "fail",
          awardedPoints: 0,
          message: parsed.error.errors[0]?.message || "Invalid input",
        });
      }

      const { uid, spotId, trick, videoUrl } = parsed.data;

      if (authUser.uid !== uid) {
        return res.status(403).json({
          status: "fail",
          awardedPoints: 0,
          message: "UID mismatch with authenticated user",
        });
      }

      const spot = await storage.getSpot(spotId);
      if (!spot) {
        return res.status(404).json({
          status: "fail",
          awardedPoints: 0,
          message: "Spot not found",
        });
      }

      const basePoints = 10;
      const trickDifficulty: Record<string, number> = {
        ollie: 5,
        kickflip: 20,
        heelflip: 20,
        treflip: 35,
        hardflip: 30,
        varial_kickflip: 25,
        "360_flip": 40,
        nollie: 10,
        switch_kickflip: 30,
        fakie_kickflip: 25,
      };

      const normalizedTrick = trick.toLowerCase().replace(/\s+/g, "_");
      const difficultyBonus = trickDifficulty[normalizedTrick] || 15;

      const spotTierBonus: Record<string, number> = {
        legendary: 50,
        pro: 30,
        local: 15,
        street: 10,
      };
      const tierBonus = spotTierBonus[(spot as any).tier?.toLowerCase()] || 10;

      let totalPoints = basePoints + difficultyBonus + tierBonus;

      const user = await storage.getUser(uid);
      if (user && (user as any).isPro) {
        totalPoints = Math.floor(totalPoints * 1.1);
      }

      const checkInRecord = {
        uid,
        spotId,
        trick,
        videoUrl,
        awardedPoints: totalPoints,
        createdAt: Timestamp.now(),
      };

      const docRef = await admin.firestore().collection("checkins").add(checkInRecord);
      const checkInId = docRef.id;

      if (env.NODE_ENV === "development") {
        console.log(`[Firestore] Check-in saved: ${checkInId}`);
      }

      res.json({
        status: "ok",
        awardedPoints: totalPoints,
        checkInId,
        createdAt: checkInRecord.createdAt.toDate().toISOString(),
        message: `${trick} landed at ${spot.name}! +${totalPoints} XP`,
      });
    } catch (error) {
      console.error("Check-in error:", error);
      res.status(500).json({
        status: "fail",
        awardedPoints: 0,
        message: "Failed to process check-in",
      });
    }
  });

  app.get("/api/checkins", async (req: Request, res: Response) => {
    try {
      const { uid } = req.query;
      if (!uid || typeof uid !== "string") {
        return res.status(400).json({
          status: "fail",
          message: "User ID is required",
        });
      }

      const snapshot = await admin
        .firestore()
        .collection("checkins")
        .where("uid", "==", uid)
        .orderBy("createdAt", "desc")
        .get();

      const checkins = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          uid: data.uid,
          spotId: data.spotId,
          trick: data.trick,
          videoUrl: data.videoUrl,
          awardedPoints: data.awardedPoints,
          createdAt: data.createdAt?.toDate().toISOString(),
        };
      });

      res.json({
        status: "ok",
        checkins,
      });
    } catch (error) {
      console.error("Error fetching check-ins:", error);
      res.status(500).json({
        status: "fail",
        message: "Failed to fetch check-ins",
      });
    }
  });
}