import { test, expect, type Page } from "@playwright/test";

// =============================================================================
// Helpers
// =============================================================================

/** Assert the React error boundary is NOT showing on the current page. */
async function expectNoErrorBoundary(page: Page) {
  await expect(page.locator('text="Oops! Something went wrong"')).not.toBeVisible();
  await expect(page.locator('text="Configuration Required"')).not.toBeVisible();
}

/** Filter out known harmless console errors (React DevTools promotions). */
function filterConsoleNoise(errors: string[]): string[] {
  return errors.filter(
    (e) => !e.includes("React DevTools") && !e.includes("Download the React DevTools")
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

    const clientElement = page.locator('[data-testid="app-shell"], nav, [role="navigation"]');
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
        !r.includes("/sw.js") &&
        !r.includes("analytics") &&
        !r.includes("sentry")
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
      'input[type="email"], input[type="password"], [data-testid="auth-email"], [data-testid="google-signin"], button:has-text("Sign")'
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
    "/remote-skate",
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
  // Navigate to /landing — the canonical page crawlers and users see.
  // The "/" route is a redirect trampoline (RootRedirect → /landing or /hub).
  // Every navigation in this suite MUST use waitForLoadState("networkidle")
  // because Vercel preview deployments have cold starts and the JS bundle
  // (Firebase alone is ~570 KB) can delay the "load" event past the 30 s
  // test timeout. Without "networkidle", page.goto() may timeout.

  test("viewport meta tag is present", async ({ page }) => {
    await page.goto("/landing");
    await page.waitForLoadState("networkidle");
    const content = await page.evaluate(() =>
      document.querySelector('meta[name="viewport"]')?.getAttribute("content")
    );
    expect(content, "viewport meta tag must exist with width directive").toContain("width=");
  });

  test("meta description is present and well-formed", async ({ page }) => {
    await page.goto("/landing");
    await page.waitForLoadState("networkidle");
    const content = await page.evaluate(() =>
      document.querySelector('meta[name="description"]')?.getAttribute("content")
    );
    expect(content, "meta description tag must exist in <head>").toBeTruthy();
    expect(content!.length, "meta description must be meaningful (>10 chars)").toBeGreaterThan(10);
    expect(
      content!.length,
      "meta description should fit in SERP snippet (≤160 chars)"
    ).toBeLessThanOrEqual(160);
  });

  test("charset is declared", async ({ page }) => {
    await page.goto("/landing");
    await page.waitForLoadState("networkidle");
    const hasCharset = await page.evaluate(
      () =>
        !!(
          document.querySelector("meta[charset]") ||
          document.querySelector('meta[http-equiv="Content-Type"]')
        )
    );
    expect(hasCharset, "charset declaration must exist").toBe(true);
  });

  test("structured data (JSON-LD) is valid schema.org", async ({ page }) => {
    await page.goto("/landing");
    // Wait for networkidle to ensure both the static JSON-LD from index.html
    // and the React-injected JSON-LD (StructuredData.tsx via createPortal)
    // are present in the DOM.
    await page.waitForLoadState("networkidle");
    const jsonLdContents = await page.evaluate(() =>
      Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(
        (el) => el.textContent
      )
    );
    expect(jsonLdContents.length, "at least one JSON-LD block must exist").toBeGreaterThan(0);

    // Validate every JSON-LD block is parseable and uses schema.org
    for (const raw of jsonLdContents) {
      expect(raw, "JSON-LD script must have content").toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed["@context"], "JSON-LD must reference schema.org").toBe("https://schema.org");
      expect(parsed["@type"], "JSON-LD must declare a @type").toBeTruthy();
    }
  });
});
