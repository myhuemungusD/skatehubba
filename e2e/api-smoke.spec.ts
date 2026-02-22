import { test, expect } from "@playwright/test";

/**
 * API-only smoke tests.
 *
 * These verify server endpoints independently from the browser UI. They use
 * Playwright's lightweight `request` fixture (no browser launched) so they're
 * fast and safe to run against any environment via BASE_URL.
 */

// =============================================================================
// Health & Monitoring
// =============================================================================

test.describe("Health & Monitoring", () => {
  test("GET /api/health/live returns liveness OK", async ({ request }) => {
    const res = await request.get("/api/health/live");
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("GET /api/health/ready returns readiness structure", async ({
    request,
  }) => {
    const res = await request.get("/api/health/ready");
    expect([200, 503]).toContain(res.status());

    const body = await res.json();
    expect(body).toHaveProperty("status");
    expect(["healthy", "degraded", "unhealthy"]).toContain(body.status);
    expect(body).toHaveProperty("uptime");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("checks");
  });

  test("GET /api/health deep check returns component detail", async ({
    request,
  }) => {
    const res = await request.get("/api/health");
    expect([200, 503]).toContain(res.status());

    const body = await res.json();
    for (const component of ["database", "redis", "ffmpeg"]) {
      expect(body.checks).toHaveProperty(component);
      expect(["up", "down", "unconfigured"]).toContain(
        body.checks[component].status,
      );
    }
  });

  test("GET /api/health/env returns environment diagnostics", async ({
    request,
  }) => {
    const res = await request.get("/api/health/env");
    expect([200, 503]).toContain(res.status());

    const body = await res.json();
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("serverRequired");
    expect(body).toHaveProperty("firebaseAdmin");
    expect(body).toHaveProperty("database");
    expect(Array.isArray(body.serverRequired)).toBe(true);
  });
});

// =============================================================================
// Public Endpoints
// =============================================================================

test.describe("Public Endpoints", () => {
  test("GET /api/stats returns totalUsers/totalSpots/totalBattles", async ({
    request,
  }) => {
    const res = await request.get("/api/stats");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(typeof body.totalUsers).toBe("number");
    expect(typeof body.totalSpots).toBe("number");
    expect(typeof body.totalBattles).toBe("number");
  });

  test("GET /api/spots returns an array", async ({ request }) => {
    const res = await request.get("/api/spots");
    expect(res.status()).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test("GET /api/spots/:id with invalid ID returns 400", async ({
    request,
  }) => {
    const res = await request.get("/api/spots/not-a-number");
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body).toHaveProperty("message");
  });

  test("GET /api/spots/:id with non-existent ID returns 404", async ({
    request,
  }) => {
    const res = await request.get("/api/spots/999999999");
    expect(res.status()).toBe(404);
  });

  test("GET /api/spots/discover rejects invalid coordinates", async ({
    request,
  }) => {
    const res = await request.get("/api/spots/discover?lat=999&lng=999");
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.message).toContain("lat");
  });

  test("GET /api/spots/discover rejects missing coordinates", async ({
    request,
  }) => {
    const res = await request.get("/api/spots/discover");
    expect(res.status()).toBe(400);
  });
});

// =============================================================================
// Authentication Boundary
// =============================================================================

test.describe("Auth Boundary", () => {
  test("protected GET endpoints return 401 without auth", async ({
    request,
  }) => {
    const endpoints = [
      "/api/profile/me",
      "/api/users",
      "/api/users/search?q=test",
    ];

    for (const path of endpoints) {
      const res = await request.get(path);
      expect(
        [401, 403].includes(res.status()),
        `GET ${path} → ${res.status()}, expected 401|403`,
      ).toBe(true);
    }
  });

  test("protected POST endpoints return 401 without auth", async ({
    request,
  }) => {
    const endpoints = [
      "/api/matchmaking/quick-match",
      "/api/spots/check-in",
      "/api/posts",
    ];

    for (const path of endpoints) {
      const res = await request.post(path, {
        data: {},
        headers: { "Content-Type": "application/json" },
      });
      expect(
        [401, 403].includes(res.status()),
        `POST ${path} → ${res.status()}, expected 401|403`,
      ).toBe(true);
    }
  });

  test("admin endpoints return 401 without auth", async ({ request }) => {
    const res = await request.get("/api/admin/system-status");
    expect([401, 403]).toContain(res.status());
  });
});

// =============================================================================
// Cron Security
// =============================================================================

test.describe("Cron Endpoint Security", () => {
  const cronPaths = [
    "/api/cron/forfeit-expired-games",
    "/api/cron/deadline-warnings",
    "/api/cron/cleanup-sessions",
  ];

  for (const path of cronPaths) {
    test(`POST ${path} rejects without CRON_SECRET`, async ({ request }) => {
      const res = await request.post(path);
      expect(res.status()).toBe(401);
    });

    test(`POST ${path} rejects invalid CRON_SECRET`, async ({ request }) => {
      const res = await request.post(path, {
        headers: { Authorization: "Bearer obviously-wrong-secret" },
      });
      expect(res.status()).toBe(401);
    });
  }
});

// =============================================================================
// Input Validation
// =============================================================================

test.describe("Input Validation", () => {
  test("POST /api/beta-signup rejects empty body", async ({ request }) => {
    const res = await request.post("/api/beta-signup", {
      data: {},
      headers: { "Content-Type": "application/json" },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("POST /api/beta-signup rejects invalid email", async ({ request }) => {
    const res = await request.post("/api/beta-signup", {
      data: { email: "not-an-email" },
      headers: { "Content-Type": "application/json" },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("POST /api/auth/login rejects missing token", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: {},
      headers: { "Content-Type": "application/json" },
    });
    // Should be 400 or 401 — not 500
    expect(res.status()).toBeLessThan(500);
  });
});

// =============================================================================
// Webhook Routes
// =============================================================================

test.describe("Webhook Routes", () => {
  test("POST /webhooks/stripe is reachable (not 404)", async ({ request }) => {
    const res = await request.post("/webhooks/stripe", {
      data: "{}",
      headers: { "Content-Type": "application/json" },
    });
    // Without a valid Stripe-Signature header, the route should reject the
    // request — but it should NOT be 404 (route missing).
    expect(res.status()).not.toBe(404);
  });
});

// =============================================================================
// 404 Handling
// =============================================================================

test.describe("404 Handling", () => {
  test("unknown API path returns JSON 404", async ({ request }) => {
    const res = await request.get("/api/nonexistent-route-abc123");
    expect(res.status()).toBe(404);

    const contentType = res.headers()["content-type"] || "";
    expect(contentType).toContain("json");
  });
});

// =============================================================================
// Security Headers
// =============================================================================

test.describe("Security Headers", () => {
  test("X-Content-Type-Options: nosniff is set", async ({ request }) => {
    const res = await request.get("/api/health/live");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("X-Frame-Options is set", async ({ request }) => {
    const res = await request.get("/api/health/live");
    expect(res.headers()["x-frame-options"]).toBeTruthy();
  });

  test("API responses use application/json content-type", async ({
    request,
  }) => {
    const res = await request.get("/api/health/live");
    expect(res.headers()["content-type"]).toContain("application/json");
  });
});
