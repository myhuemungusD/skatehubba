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
