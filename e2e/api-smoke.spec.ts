import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * API-only smoke tests.
 *
 * Uses Playwright's lightweight `request` fixture (no browser launched) for
 * fast validation of server endpoints against any environment via BASE_URL.
 *
 * CSRF note: The server enforces double-submit CSRF on all POST /api/* routes.
 * Requests with a Bearer Authorization header bypass CSRF (server/middleware/csrf.ts).
 * Tests that need to reach route-level logic (not CSRF) send a dummy Bearer
 * header to skip the CSRF gate.
 */

// =============================================================================
// Helpers
// =============================================================================

/**
 * POST to an /api/* route bypassing the CSRF double-submit gate.
 *
 * The server skips CSRF validation when it sees a Bearer Authorization header
 * (csrf.ts line 63). We send a dummy bearer so CSRF is bypassed but the
 * request carries no valid credentials — letting route-level auth/validation
 * middleware do its job.
 */
async function postBypassCsrf(
  request: APIRequestContext,
  path: string,
  data?: unknown,
) {
  return request.post(path, {
    data: data ?? {},
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer __e2e_csrf_bypass_not_a_real_token__",
    },
  });
}

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
// Public Endpoints (no auth required)
// =============================================================================

test.describe("Public Endpoints", () => {
  test("GET /api/stats returns expected shape", async ({ request }) => {
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
    expect(body).toHaveProperty("message");
  });

  test("GET /api/spots/discover rejects missing coordinates", async ({
    request,
  }) => {
    const res = await request.get("/api/spots/discover");
    expect(res.status()).toBe(400);
  });
});

// =============================================================================
// Auth Boundary — verify protected endpoints reject unauthenticated requests
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
        `GET ${path} returned ${res.status()}, expected 401 or 403`,
      ).toBe(true);
    }
  });

  test("protected POST endpoints return 401 or 403 without auth", async ({
    request,
  }) => {
    // postBypassCsrf sends a dummy Bearer so CSRF middleware doesn't mask
    // the route-level auth check. The dummy Bearer has no valid session, so
    // authenticateUser rejects with 401.
    const endpoints = [
      "/api/matchmaking/quick-match",
      "/api/spots/check-in",
      "/api/posts",
    ];

    for (const path of endpoints) {
      const res = await postBypassCsrf(request, path);
      expect(
        [401, 403].includes(res.status()),
        `POST ${path} returned ${res.status()}, expected 401 or 403`,
      ).toBe(true);
    }
  });

  test("admin endpoint returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/admin/system-status");
    expect([401, 403]).toContain(res.status());
  });
});

// =============================================================================
// Cron Endpoint Security
// =============================================================================

test.describe("Cron Endpoint Security", () => {
  const cronPaths = [
    "/api/cron/forfeit-expired-games",
    "/api/cron/deadline-warnings",
    "/api/cron/cleanup-sessions",
  ];

  for (const path of cronPaths) {
    test(`POST ${path} rejects without valid CRON_SECRET`, async ({
      request,
    }) => {
      // postBypassCsrf sends Authorization: "Bearer __smoke_test__" which
      // bypasses CSRF but fails the timing-safe cron secret comparison.
      const res = await postBypassCsrf(request, path);
      expect(res.status()).toBe(401);
    });
  }
});

// =============================================================================
// Input Validation
// =============================================================================

test.describe("Input Validation", () => {
  test("POST /api/beta-signup rejects empty body", async ({ request }) => {
    // Bypass CSRF so the request reaches the validateBody middleware.
    const res = await postBypassCsrf(request, "/api/beta-signup");
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/beta-signup rejects invalid email", async ({ request }) => {
    const res = await postBypassCsrf(request, "/api/beta-signup", {
      email: "not-an-email",
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/auth/login rejects missing token", async ({ request }) => {
    const res = await postBypassCsrf(request, "/api/auth/login");
    // 400 (bad request) or 401 (no valid token) — not 500
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});

// =============================================================================
// Webhook Routes
// =============================================================================

test.describe("Webhook Routes", () => {
  test("POST /webhooks/stripe is reachable (not 404)", async ({ request }) => {
    // Stripe webhook is outside /api — no CSRF middleware applies.
    // Without a valid Stripe-Signature the route rejects, but must NOT 404.
    const res = await request.post("/webhooks/stripe", {
      data: "{}",
      headers: { "Content-Type": "application/json" },
    });
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
