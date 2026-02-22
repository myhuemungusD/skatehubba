import { test, expect } from "@playwright/test";

/**
 * Google Auth Sign-Up Smoke Tests
 *
 * Verifies the Google sign-up UI is correctly rendered and accessible
 * across all entry points. These are UI-only smoke tests — they do not
 * complete the actual OAuth popup flow (which requires a live Google
 * account and cannot run headlessly).
 *
 * Coverage:
 *  - /auth  (primary unified auth page, sign-up tab)
 *  - /signup (standalone sign-up page)
 *  - Root redirect → /auth for unauthenticated users
 *  - Username validation gate before Google sign-up
 */

test.describe("Google Auth Sign-Up Smoke Tests", () => {
  test.describe("/auth page — sign-up tab (default)", () => {
    test("page loads and Google button is visible and enabled", async ({ page }) => {
      await page.goto("/auth");
      await page.waitForLoadState("networkidle");

      await expect(page).toHaveURL(/\/auth/);

      const googleBtn = page.getByTestId("button-google-signin");
      await expect(googleBtn).toBeVisible();
      await expect(googleBtn).toBeEnabled();
      await expect(googleBtn).toContainText("Continue with Google");
    });

    test("shows 'Or continue with' divider above Google button", async ({ page }) => {
      await page.goto("/auth");
      await page.waitForLoadState("networkidle");

      await expect(page.getByText("Or continue with")).toBeVisible();
    });

    test("sign-up form fields are present alongside Google button", async ({ page }) => {
      await page.goto("/auth");
      await page.waitForLoadState("networkidle");

      // Core form inputs (by label or placeholder)
      await expect(page.getByPlaceholder("Your name")).toBeVisible();
      await expect(page.getByPlaceholder(/you@example\.com/i)).toBeVisible();
      await expect(page.getByPlaceholder("skatelegend")).toBeVisible();

      // Google button also present
      await expect(page.getByTestId("button-google-signin")).toBeVisible();
    });

    test("clicking Google without username shows validation error", async ({ page }) => {
      await page.goto("/auth");
      await page.waitForLoadState("networkidle");

      // Ensure username is empty and click Google button
      const googleBtn = page.getByTestId("button-google-signin");
      await expect(googleBtn).toBeEnabled();
      await googleBtn.click();

      // Expect inline username validation error
      await expect(
        page.getByText("Pick a username before signing up"),
      ).toBeVisible();
    });

    test("Google button remains enabled after entering a valid username", async ({ page }) => {
      await page.goto("/auth");
      await page.waitForLoadState("networkidle");

      // Fill in a username
      await page.getByPlaceholder("skatelegend").fill("smoketestuser");

      const googleBtn = page.getByTestId("button-google-signin");
      await expect(googleBtn).toBeVisible();
      await expect(googleBtn).toBeEnabled();
    });

    test("tab switching preserves Google button visibility", async ({ page }) => {
      await page.goto("/auth");
      await page.waitForLoadState("networkidle");

      // Default: sign-up tab — Google button visible
      await expect(page.getByTestId("button-google-signin")).toBeVisible();

      // Switch to sign-in tab
      await page.getByRole("tab", { name: /sign.?in/i }).click();
      await expect(page.getByTestId("button-google-signin")).toBeVisible();

      // Switch back to sign-up tab
      await page.getByRole("tab", { name: /sign.?up/i }).click();
      await expect(page.getByTestId("button-google-signin")).toBeVisible();
    });
  });

  test.describe("/signup page — standalone sign-up page", () => {
    test("Google sign-up button is visible and enabled", async ({ page }) => {
      await page.goto("/signup");
      await page.waitForLoadState("networkidle");

      await expect(page).toHaveURL(/\/signup/);

      const googleBtn = page.getByTestId("button-signup-google");
      await expect(googleBtn).toBeVisible();
      await expect(googleBtn).toBeEnabled();
      await expect(googleBtn).toContainText("Sign up with Google");
    });

    test("full sign-up form is present alongside Google button", async ({ page }) => {
      await page.goto("/signup");
      await page.waitForLoadState("networkidle");

      await expect(page.getByTestId("input-signup-name")).toBeVisible();
      await expect(page.getByTestId("input-signup-email")).toBeVisible();
      await expect(page.getByTestId("input-signup-password")).toBeVisible();
      await expect(page.getByTestId("input-signup-username")).toBeVisible();
      await expect(page.getByTestId("input-signup-stance")).toBeVisible();
      await expect(page.getByTestId("button-signup-submit")).toBeVisible();
      await expect(page.getByTestId("button-signup-google")).toBeVisible();
    });

    test("clicking Google without username shows toast error", async ({ page }) => {
      await page.goto("/signup");
      await page.waitForLoadState("networkidle");

      // Click Google sign-up with no username entered
      await page.getByTestId("button-signup-google").click();

      // Toast should appear with "Username required" title
      await expect(page.getByText("Username required")).toBeVisible();
    });

    test("link to sign-in page is present", async ({ page }) => {
      await page.goto("/signup");
      await page.waitForLoadState("networkidle");

      const signinLink = page.getByTestId("link-to-signin");
      await expect(signinLink).toBeVisible();
      await expect(signinLink).toHaveAttribute("href", "/signin");
    });
  });

  test.describe("Unauthenticated root redirect", () => {
    test("root (/) redirects to /auth which has Google sign-up button", async ({ page }) => {
      await page.goto("/");
      await page.waitForURL(/\/auth/, { timeout: 10_000 });

      const googleBtn = page.getByTestId("button-google-signin");
      await expect(googleBtn).toBeVisible();
      await expect(googleBtn).toBeEnabled();
    });
  });
});
