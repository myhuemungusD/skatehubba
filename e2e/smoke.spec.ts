import { test, expect } from "@playwright/test";

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
