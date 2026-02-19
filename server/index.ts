import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createApp } from "./app.ts";
import { setupVite, log } from "./vite-dev.ts";
import logger from "./logger.ts";
import { staticFileLimiter } from "./middleware/security.ts";
import { initializeSocketServer, shutdownSocketServer } from "./socket/index.ts";
import { initializeDatabase } from "./db.ts";
import { getRedisClient, shutdownRedis } from "./redis.ts";
import { SERVER_PORT } from "./config/server.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Express app with all middleware and API routes
const app = createApp();

const server = http.createServer(app);

// Initialize Redis (eagerly connect if REDIS_URL is set)
getRedisClient();

// Initialize database (seed default spots + tutorial steps if empty)
await initializeDatabase();

// Initialize WebSocket server
const io = initializeSocketServer(server);
logger.info("[Server] WebSocket server initialized");

// Setup Vite dev server or production static file serving
if (process.env.NODE_ENV === "development") {
  await setupVite(app, server);
} else {
  const clientDistCandidates = [
    path.resolve(__dirname, "../client/dist"),
    path.resolve(__dirname, "../../client/dist"),
  ];
  const publicCandidates = [
    path.resolve(__dirname, "../public"),
    path.resolve(__dirname, "../../public"),
  ];

  const staticDirs = [...clientDistCandidates, ...publicCandidates].filter((dir) =>
    fs.existsSync(dir)
  );

  // Serve built SPA assets first, fall back to shared public assets
  for (const dir of staticDirs) {
    app.use(express.static(dir));
  }

  const indexHtmlPath = (() => {
    for (const base of clientDistCandidates) {
      const candidate = path.join(base, "index.html");
      if (fs.existsSync(candidate)) return candidate;
    }

    for (const base of publicCandidates) {
      const candidate = path.join(base, "index.html");
      if (fs.existsSync(candidate)) return candidate;
    }

    return null;
  })();

  // Rate limit HTML serving to prevent file system abuse
  // CodeQL: Missing rate limiting - file system access now rate-limited
  app.get("*", staticFileLimiter, (_req, res) => {
    if (indexHtmlPath) {
      return res.sendFile(indexHtmlPath);
    }

    logger.error("No SPA index.html found in client/dist or public");
    return res.status(500).send("App build missing: index.html not found");
  });
}

// Start server
const port = SERVER_PORT;
server.listen(port, "0.0.0.0", () => {
  const mode = process.env.NODE_ENV || "development";
  if (mode === "development") {
    log(`Server running at http://0.0.0.0:${port}`, "server");
    log(`WebSocket server ready`, "socket");
  } else {
    logger.info(`SkateHubba production server running on port ${port}`);
    logger.info("WebSocket server ready for connections");
  }
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("[Server] SIGTERM received, shutting down gracefully...");
  await shutdownSocketServer(io);
  await shutdownRedis();
  server.close(() => {
    logger.info("[Server] HTTP server closed");
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  logger.info("[Server] SIGINT received, shutting down gracefully...");
  await shutdownSocketServer(io);
  await shutdownRedis();
  server.close(() => {
    logger.info("[Server] HTTP server closed");
    process.exit(0);
  });
});
