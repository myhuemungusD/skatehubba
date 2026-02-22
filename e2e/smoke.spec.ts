import { test, expect } from "@playwright/test";

// =============================================================================
// 1. Core App Smoke Tests (existing)
// =============================================================================

test.describe("Production Smoke Test", () => {
  test("should load without error boundary", async ({ page }) => {
    // Capture console errors
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    // Navigate to app
    await page.goto("/");

    // Wait for app to hydrate
    await page.waitForLoadState("networkidle");

    // Check error boundary is NOT visible
    const errorBoundary = page.locator('text="Oops! Something went wrong"');
    await expect(errorBoundary).not.toBeVisible();

    // Check configuration error is NOT visible
    const configError = page.locator('text="Configuration Required"');
    await expect(configError).not.toBeVisible();

    // Verify no unexpected console errors (filter known noise)
    const unexpectedErrors = errors.filter(
      (e) =>
        !e.includes("React DevTools") &&
        !e.includes("Download the React DevTools"),
    );
    expect(unexpectedErrors).toHaveLength(0);

    // Verify app rendered something meaningful
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("should have valid version.txt", async ({ page }) => {
    const response = await page.goto("/version.txt");
    expect(response?.status()).toBe(200);

    const content = await response?.text();
    const version = JSON.parse(content || "{}");

    expect(version).toHaveProperty("build");
    expect(version).toHaveProperty("ts");
  });

  test("should return correct page title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/SkateHubba/);
  });

  test("should contain client-rendered content", async ({ page }) => {
    // A broken Vite build could still serve an HTML shell that passes the
    // other smoke checks. Verify the page contains a Vite-injected root
    // and at least one React-rendered element to prove the client bundle
    // actually loaded and executed.
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Vite apps mount into #root
    const root = page.locator("#root");
    await expect(root).toBeAttached();

    // The root must have child content rendered by React (not an empty div)
    await expect(root).not.toBeEmpty();

    // Verify a known client-side element exists (the app shell / nav)
    const clientElement = page.locator(
      '[data-testid="app-shell"], nav, [role="navigation"]',
    );
    await expect(clientElement.first()).toBeVisible();
  });

  test("should serve assets with 200 status", async ({ page }) => {
    const failedRequests: string[] = [];

    page.on("response", (response) => {
      if (response.status() >= 400) {
        failedRequests.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Filter out expected failures (e.g. optional service worker, analytics)
    const criticalFailures = failedRequests.filter(
      (r) =>
        !r.includes("service-worker") &&
        !r.includes("analytics") &&
        !r.includes("sentry"),
    );

    expect(criticalFailures).toHaveLength(0);
  });
});

// =============================================================================
// 2. Public Route Smoke Tests
// =============================================================================

test.describe("Public Route Smoke Tests", () => {
  test("auth page renders sign-in form", async ({ page }) => {
    await page.goto("/auth");
    await page.waitForLoadState("networkidle");

    // Auth page must render without crashing (no error boundary)
    const errorBoundary = page.locator('text="Oops! Something went wrong"');
    await expect(errorBoundary).not.toBeVisible();

    // The page should contain an interactive form — email input, password
    // input, or a Google sign-in button prove the auth bundle loaded.
    const authContent = page.locator(
      'input[type="email"], input[type="password"], [data-testid="auth-email"], [data-testid="google-signin"], button:has-text("Sign")',
    );
    await expect(authContent.first()).toBeVisible();
  });

  test("landing page loads without error", async ({ page }) => {
    await page.goto("/landing");
    await page.waitForLoadState("networkidle");

    const errorBoundary = page.locator('text="Oops! Something went wrong"');
    await expect(errorBoundary).not.toBeVisible();

    // Landing page should render visible marketing content
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page.locator("#root")).not.toBeEmpty();
  });

  test("privacy page loads without error", async ({ page }) => {
    await page.goto("/privacy");
    await page.waitForLoadState("networkidle");

    const errorBoundary = page.locator('text="Oops! Something went wrong"');
    await expect(errorBoundary).not.toBeVisible();

    await expect(page.locator("#root")).not.toBeEmpty();
  });

  test("terms page loads without error", async ({ page }) => {
    await page.goto("/terms");
    await page.waitForLoadState("networkidle");

    const errorBoundary = page.locator('text="Oops! Something went wrong"');
    await expect(errorBoundary).not.toBeVisible();

    await expect(page.locator("#root")).not.toBeEmpty();
  });

  test("specs page loads without error", async ({ page }) => {
    await page.goto("/specs");
    await page.waitForLoadState("networkidle");

    const errorBoundary = page.locator('text="Oops! Something went wrong"');
    await expect(errorBoundary).not.toBeVisible();

    await expect(page.locator("#root")).not.toBeEmpty();
  });

  test("demo page loads without error", async ({ page }) => {
    await page.goto("/demo");
    await page.waitForLoadState("networkidle");

    const errorBoundary = page.locator('text="Oops! Something went wrong"');
    await expect(errorBoundary).not.toBeVisible();

    await expect(page.locator("#root")).not.toBeEmpty();
  });
});

// =============================================================================
// 3. Legacy Route Redirect Smoke Tests
// =============================================================================

test.describe("Legacy Route Redirects", () => {
  // Unauthenticated users hitting protected legacy routes get redirected to
  // /auth (via ProtectedRoute). The key assertion is that the app doesn't
  // crash and the user ends up on a working page, not a blank screen.

  const legacyRoutes = [
    { from: "/home", label: "home" },
    { from: "/feed", label: "feed" },
    { from: "/dashboard", label: "dashboard" },
    { from: "/game", label: "game" },
    { from: "/skate-game", label: "skate-game" },
    { from: "/closet", label: "closet" },
    { from: "/settings", label: "settings" },
    { from: "/showcase", label: "showcase" },
  ];

  for (const { from, label } of legacyRoutes) {
    test(`${label} (${from}) does not crash`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });

      await page.goto(from);
      await page.waitForLoadState("networkidle");

      // Should not show error boundary
      const errorBoundary = page.locator('text="Oops! Something went wrong"');
      await expect(errorBoundary).not.toBeVisible();

      // Page should render content (either auth form or the hub)
      await expect(page.locator("#root")).not.toBeEmpty();

      const unexpectedErrors = errors.filter(
        (e) =>
          !e.includes("React DevTools") &&
          !e.includes("Download the React DevTools"),
      );
      expect(unexpectedErrors).toHaveLength(0);
    });
  }
});

// =============================================================================
// 4. SEO & Meta Smoke Tests
// =============================================================================

test.describe("SEO & Meta Tags", () => {
  test("viewport meta tag is present", async ({ page }) => {
    await page.goto("/");
    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toBeAttached();
    const content = await viewport.getAttribute("content");
    expect(content).toContain("width=");
  });

  test("meta description is present", async ({ page }) => {
    await page.goto("/");
    const desc = page.locator('meta[name="description"]');
    await expect(desc).toBeAttached();
    const content = await desc.getAttribute("content");
    expect(content).toBeTruthy();
    expect(content!.length).toBeGreaterThan(10);
  });

  test("charset is declared", async ({ page }) => {
    await page.goto("/");
    const charset = page.locator('meta[charset], meta[http-equiv="Content-Type"]');
    await expect(charset.first()).toBeAttached();
  });

  test("structured data (JSON-LD) is present", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const jsonLd = page.locator('script[type="application/ld+json"]');
    const count = await jsonLd.count();
    expect(count).toBeGreaterThan(0);

    // Verify it's valid JSON
    const text = await jsonLd.first().textContent();
    expect(() => JSON.parse(text || "")).not.toThrow();
  });
});

// =============================================================================
// 5. API Endpoint Smoke Tests (via Playwright request context)
// =============================================================================

test.describe("API Smoke Tests", () => {
  test("liveness probe returns 200", async ({ request }) => {
    const response = await request.get("/api/health/live");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("status", "ok");
  });

  test("readiness probe returns health structure", async ({ request }) => {
    const response = await request.get("/api/health/ready");
    // 200 = healthy, 503 = unhealthy — both are valid responses
    expect([200, 503]).toContain(response.status());

    const body = await response.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("checks");
    expect(body).toHaveProperty("uptime");
    expect(body).toHaveProperty("timestamp");
  });

  test("deep health check returns component statuses", async ({ request }) => {
    const response = await request.get("/api/health");
    expect([200, 503]).toContain(response.status());

    const body = await response.json();
    expect(body.checks).toHaveProperty("database");
    expect(body.checks).toHaveProperty("redis");
    expect(body.checks).toHaveProperty("ffmpeg");

    // Each component should have a status field
    for (const key of ["database", "redis", "ffmpeg"]) {
      expect(body.checks[key]).toHaveProperty("status");
      expect(["up", "down", "unconfigured"]).toContain(body.checks[key].status);
    }
  });

  test("public stats endpoint returns expected shape", async ({ request }) => {
    const response = await request.get("/api/stats");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("totalUsers");
    expect(body).toHaveProperty("totalSpots");
    expect(body).toHaveProperty("totalBattles");

    // Values should be numbers (even if 0)
    expect(typeof body.totalUsers).toBe("number");
    expect(typeof body.totalSpots).toBe("number");
    expect(typeof body.totalBattles).toBe("number");
  });

  test("spots endpoint returns an array", async ({ request }) => {
    const response = await request.get("/api/spots");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("unauthenticated requests to protected endpoints return 401", async ({
    request,
  }) => {
    // These endpoints require authentication — verify they reject
    // unauthenticated requests with 401, not a 500 crash.
    const protectedEndpoints = [
      { method: "GET" as const, path: "/api/profile/me" },
      { method: "GET" as const, path: "/api/users" },
      { method: "POST" as const, path: "/api/matchmaking/quick-match" },
    ];

    for (const { method, path } of protectedEndpoints) {
      const response =
        method === "GET"
          ? await request.get(path)
          : await request.post(path);

      // Accept 401 (unauthorized) or 403 (forbidden). A 500 means the auth
      // middleware crashed which is exactly what this smoke test catches.
      expect(
        [401, 403].includes(response.status()),
        `${method} ${path} returned ${response.status()}, expected 401 or 403`,
      ).toBe(true);
    }
  });

  test("cron endpoints reject requests without CRON_SECRET", async ({
    request,
  }) => {
    const cronEndpoints = [
      "/api/cron/forfeit-expired-games",
      "/api/cron/deadline-warnings",
      "/api/cron/cleanup-sessions",
    ];

    for (const path of cronEndpoints) {
      const response = await request.post(path);
      expect(
        response.status(),
        `${path} should reject unauthenticated cron calls`,
      ).toBe(401);
    }
  });

  test("unknown API route returns JSON error, not HTML", async ({
    request,
  }) => {
    const response = await request.get("/api/this-route-does-not-exist");

    // Should be 404, not a 200 serving the SPA HTML shell
    expect(response.status()).toBe(404);

    const contentType = response.headers()["content-type"] || "";
    expect(contentType).toContain("json");
  });

  test("spot discovery validates coordinates", async ({ request }) => {
    // Invalid coordinates should return 400, not crash
    const response = await request.get("/api/spots/discover?lat=999&lng=999");
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body).toHaveProperty("message");
  });

  test("beta signup validates input", async ({ request }) => {
    // Missing email should fail validation, not crash
    const response = await request.post("/api/beta-signup", {
      data: {},
      headers: { "Content-Type": "application/json" },
    });

    // Expect 400 (validation) or 422 — not 500
    expect([400, 422]).toContain(response.status());
  });

  test("stripe webhook path is reachable", async ({ request }) => {
    // Verify the webhook route exists — an empty POST without a Stripe
    // signature should return 400 (bad request), not 404 (route missing).
    const response = await request.post("/webhooks/stripe", {
      data: "{}",
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status()).not.toBe(404);
  });
});

// =============================================================================
// 6. Security Header Smoke Tests
// =============================================================================

test.describe("Security Headers", () => {
  test("responses include essential security headers", async ({ request }) => {
    const response = await request.get("/api/health/live");
    const headers = response.headers();

    // Helmet sets these by default — verify they weren't stripped
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBeTruthy();
  });

  test("API responses set correct content-type", async ({ request }) => {
    const response = await request.get("/api/health/live");
    const contentType = response.headers()["content-type"] || "";
    expect(contentType).toContain("application/json");
  });
});
