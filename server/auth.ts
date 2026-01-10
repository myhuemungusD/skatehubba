import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { storage, type StoredUser } from "./storage";
import { authLimiter } from "./middleware/security";
import { requireCsrfToken } from "./middleware/csrf";

// 1. EXTEND EXPRESS TYPE DEFINITIONS
// This tells TypeScript that req.user matches our Schema User
declare global {
  namespace Express {
    interface User extends StoredUser {}
  }
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "skatehubba_secret_key",
    resave: false,
    saveUninitialized: false,
    store: new session.MemoryStore(),
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // 2. PASSPORT STRATEGY
  passport.use(
    new LocalStrategy(async (username, _password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) return done(null, false);
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    const user = await storage.getUser(id);
    done(null, user);
  });

  // 3. AUTH ROUTES
  app.post("/api/login", authLimiter, requireCsrfToken, passport.authenticate("local"), (req, res) => {
    res.status(200).json(req.user);
  });

  app.post("/api/register", authLimiter, requireCsrfToken, async (req, res, next) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).send("Username already exists");
      }

      const user = await storage.createUser({
        ...req.body,
        // In prod, hash the password here before sending to storage
      });

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/logout", requireCsrfToken, (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });
}
