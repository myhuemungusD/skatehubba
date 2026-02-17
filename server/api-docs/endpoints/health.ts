import type { APICategory } from "../types";

export const healthEndpoints: APICategory = {
  name: "Health & Status",
  description: "System health and status endpoints",
  endpoints: [
    {
      method: "GET",
      path: "/api/health",
      description:
        "Deep health check — probes database, Redis, and ffmpeg. Returns 200 only when all dependencies are healthy. Use /api/health/ready for a lenient k8s-style readiness probe that tolerates degraded state.",
      responses: [
        {
          status: 200,
          description: "All dependencies healthy",
          example: {
            status: "healthy",
            uptime: 3600,
            timestamp: "2025-11-03T07:00:00.000Z",
            version: "1.0.0",
            checks: {
              database: { status: "up", latencyMs: 2 },
              redis: { status: "up", latencyMs: 1 },
              ffmpeg: { status: "up", latencyMs: 45 },
            },
          },
        },
        {
          status: 503,
          description:
            "One or more dependencies down — degraded (non-critical) or unhealthy (database)",
          example: {
            status: "degraded",
            uptime: 3600,
            timestamp: "2025-11-03T07:00:00.000Z",
            version: "1.0.0",
            checks: {
              database: { status: "up", latencyMs: 2 },
              redis: {
                status: "down",
                latencyMs: 5000,
                detail: "Connection refused",
              },
              ffmpeg: { status: "up", latencyMs: 40 },
            },
          },
        },
      ],
      notes: [
        "status is one of: healthy, degraded, unhealthy",
        "Returns 200 only for healthy; returns 503 for both degraded and unhealthy",
        "Use /api/health/ready if you need a lenient probe that tolerates degraded (returns 200)",
      ],
    },
    {
      method: "GET",
      path: "/api/health/live",
      description: "Liveness probe — returns 200 if the process is running. No dependency checks.",
      responses: [
        {
          status: 200,
          description: "Process is alive",
          example: {
            status: "ok",
          },
        },
      ],
    },
    {
      method: "GET",
      path: "/api/health/ready",
      description: "Readiness probe — same deep check as /api/health. Returns 503 when unhealthy.",
      responses: [
        {
          status: 200,
          description: "All dependencies ready",
          example: {
            status: "healthy",
            uptime: 3600,
            timestamp: "2025-11-03T07:00:00.000Z",
            version: "1.0.0",
            checks: {
              database: { status: "up", latencyMs: 2 },
              redis: { status: "up", latencyMs: 1 },
              ffmpeg: { status: "up", latencyMs: 45 },
            },
          },
        },
      ],
    },
  ],
};
