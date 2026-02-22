import { test, expect, type Page } from "@playwright/test";

// =============================================================================
// Helpers
// =============================================================================

/** Assert the React error boundary is NOT showing on the current page. */
async function expectNoErrorBoundary(page: Page) {
  await expect(
    page.locator('text="Oops! Something went wrong"'),
  ).not.toBeVisible();
  await expect(
    page.locator('text="Configuration Required"'),
  ).not.toBeVisible();
}

/** Filter out known harmless console errors (React DevTools promotions). */
function filterConsoleNoise(errors: string[]): string[] {
  return errors.filter(
    (e) =>
      !e.includes("React DevTools") &&
      !e.includes("Download the React DevTools"),
  );
}

// =============================================================================
// 1. Core App Smoke Tests
// =============================================================================

test.describe("Production Smoke Test", () => {
  test("should load without error boundary", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expectNoErrorBoundary(page);
    expect(filterConsoleNoise(errors)).toHaveLength(0);
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
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("#root");
    await expect(root).toBeAttached();
    await expect(root).not.toBeEmpty();

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

    await expectNoErrorBoundary(page);

    // Proves the auth bundle loaded and rendered an interactive element.
    const authContent = page.locator(
      'input[type="email"], input[type="password"], [data-testid="auth-email"], [data-testid="google-signin"], button:has-text("Sign")',
    );
    await expect(authContent.first()).toBeVisible();
  });

  const publicPages = [
    { path: "/landing", label: "landing" },
    { path: "/privacy", label: "privacy" },
    { path: "/terms", label: "terms" },
    { path: "/specs", label: "specs" },
    { path: "/demo", label: "demo" },
  ];

  for (const { path, label } of publicPages) {
    test(`${label} page (${path}) loads without error`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");

      await expectNoErrorBoundary(page);
      await expect(page.locator("#root")).not.toBeEmpty();
    });
  }
});

// =============================================================================
// 3. Legacy Route Redirect Smoke Tests
// =============================================================================

test.describe("Legacy Route Redirects", () => {
  // Unauthenticated users hitting protected legacy routes get redirected to
  // /auth (via ProtectedRoute). The key assertion is that the app doesn't
  // crash and the user ends up on a working page, not a blank screen.

  const legacyRoutes = [
    "/home",
    "/feed",
    "/dashboard",
    "/game",
    "/skate-game",
    "/closet",
    "/settings",
    "/showcase",
  ];

  for (const route of legacyRoutes) {
    test(`${route} does not crash`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });

      await page.goto(route);
      await page.waitForLoadState("networkidle");

      await expectNoErrorBoundary(page);
      await expect(page.locator("#root")).not.toBeEmpty();
      expect(filterConsoleNoise(errors)).toHaveLength(0);
    });
  }
});

// =============================================================================
// 4. SEO & Meta Tags
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
    const charset = page.locator(
      'meta[charset], meta[http-equiv="Content-Type"]',
    );
    await expect(charset.first()).toBeAttached();
  });

  test("structured data (JSON-LD) is present", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const jsonLd = page.locator('script[type="application/ld+json"]');
    const count = await jsonLd.count();
    expect(count).toBeGreaterThan(0);

    const text = await jsonLd.first().textContent();
    expect(() => JSON.parse(text || "")).not.toThrow();
  });
});
