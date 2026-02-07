import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { createChildLogger } from "../logger.ts";

const REQUEST_ID_HEADER = "X-Request-ID";

/**
 * Generates a request ID at the edge and propagates it through the request
 * lifecycle. If an upstream proxy/load balancer already set X-Request-ID,
 * that value is preserved. Otherwise a new UUIDv4 is generated.
 *
 * Attaches:
 *  - req.requestId  — the trace ID string
 *  - req.log        — a child logger with { requestId } pre-bound
 *
 * Sets the X-Request-ID response header so callers can correlate.
 */
export function requestTracing(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers[REQUEST_ID_HEADER.toLowerCase()];
  const requestId =
    typeof incoming === "string" && incoming.trim() ? incoming.trim() : randomUUID();

  req.requestId = requestId;
  req.log = createChildLogger({ requestId });

  res.setHeader(REQUEST_ID_HEADER, requestId);

  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    req.log.info("request completed", {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
    });
  });

  next();
}
