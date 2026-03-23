import http from "http";
import { createApp } from "./app";
import logger from "./logger";
import { env } from "./config/env";

const app = createApp();
const server = http.createServer(app);
const PORT = parseInt(env.PORT, 10);

server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`, { env: env.NODE_ENV });
});

// Graceful shutdown
const shutdown = () => {
  logger.info("Shutting down...");
  server.close(() => {
    logger.info("Server closed.");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Catch unhandled rejections to prevent silent crashes
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});
