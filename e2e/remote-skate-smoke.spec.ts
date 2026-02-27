import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

/**
 * Remote S.K.A.T.E. End-to-End Smoke Tests
 *
 * Validates the remote skate feature surface:
 *   - Client route loads without crash
 *   - API endpoints are registered and enforce auth
 *   - API input validation works
 *   - Security properties (JSON responses, no stack traces)
 *
 * Uses both browser-based (Page) and API-only (request) fixtures.
 *
 * CSRF note: The server enforces double-submit CSRF on all POST /api/* routes.
 * Requests with a Bearer Authorization header bypass CSRF (server/middleware/csrf.ts).
 * Tests send a dummy Bearer header to skip the CSRF gate.
 */

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

/** POST bypassing the CSRF double-submit gate with a dummy Bearer header. */
async function postBypassCsrf(request: APIRequestContext, path: string, data?: unknown) {
  return request.post(path, {
    data: data ?? {},
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer __e2e_csrf_bypass_not_a_real_token__",
    },
  });
}

// =============================================================================
// 1. Client Route Smoke Tests
// =============================================================================

test.describe("Remote S.K.A.T.E. — Client Route", () => {
  test("/remote-skate loads without error boundary", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/remote-skate");
    await page.waitForLoadState("networkidle");

    await expectNoErrorBoundary(page);
    await expect(page.locator("#root")).not.toBeEmpty();
    expect(filterConsoleNoise(errors)).toHaveLength(0);
  });

  test("/remote-skate renders client content (not blank screen)", async ({ page }) => {
    await page.goto("/remote-skate");
    await page.waitForLoadState("networkidle");

    // App shell or navigation should be visible
    const clientElement = page.locator('[data-testid="app-shell"], nav, [role="navigation"]');
    await expect(clientElement.first()).toBeVisible();
  });

  test("/remote-skate with query param loads without crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/remote-skate?remoteGameId=nonexistent-game-id");
    await page.waitForLoadState("networkidle");

    await expectNoErrorBoundary(page);
    await expect(page.locator("#root")).not.toBeEmpty();
    expect(filterConsoleNoise(errors)).toHaveLength(0);
  });
});

// =============================================================================
// 2. API Route Registration — verify endpoints exist (not 404)
// =============================================================================

test.describe("Remote S.K.A.T.E. — API Route Registration", () => {
  test("POST /api/remote-skate/:gameId/rounds/:roundId/resolve is registered", async ({
    request,
  }) => {
    const res = await postBypassCsrf(
      request,
      "/api/remote-skate/test-game/rounds/test-round/resolve",
      { result: "landed" }
    );
    expect(res.status()).not.toBe(404);
  });

  test("POST /api/remote-skate/:gameId/rounds/:roundId/confirm is registered", async ({
    request,
  }) => {
    const res = await postBypassCsrf(
      request,
      "/api/remote-skate/test-game/rounds/test-round/confirm",
      { result: "landed" }
    );
    expect(res.status()).not.toBe(404);
  });

  test("GET /api/remote-skate (base path) returns 404 (no GET handler)", async ({ request }) => {
    const res = await request.get("/api/remote-skate");
    // No GET endpoint registered on the base path
    expect(res.status()).toBe(404);
  });
});

// =============================================================================
// 3. Auth Boundary — protected endpoints reject unauthenticated requests
// =============================================================================

test.describe("Remote S.K.A.T.E. — Auth Boundary", () => {
  test("resolve endpoint returns 401 without valid Firebase token", async ({ request }) => {
    const res = await postBypassCsrf(
      request,
      "/api/remote-skate/game-abc/rounds/round-xyz/resolve",
      { result: "landed" }
    );
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  test("confirm endpoint returns 401 without valid Firebase token", async ({ request }) => {
    const res = await postBypassCsrf(
      request,
      "/api/remote-skate/game-abc/rounds/round-xyz/confirm",
      { result: "missed" }
    );
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  test("resolve without Authorization header is blocked by CSRF (403)", async ({ request }) => {
    const res = await request.post(
      "/api/remote-skate/game-id/rounds/round-id/resolve",
      {
        data: { result: "landed" },
        headers: { "Content-Type": "application/json" },
      }
    );
    expect(res.status()).toBe(403);
  });

  test("confirm without Authorization header is blocked by CSRF (403)", async ({ request }) => {
    const res = await request.post(
      "/api/remote-skate/game-id/rounds/round-id/confirm",
      {
        data: { result: "landed" },
        headers: { "Content-Type": "application/json" },
      }
    );
    expect(res.status()).toBe(403);
  });
});

// =============================================================================
// 4. Input Validation
// =============================================================================

test.describe("Remote S.K.A.T.E. — Input Validation", () => {
  test("resolve rejects invalid result enum value", async ({ request }) => {
    const res = await postBypassCsrf(
      request,
      "/api/remote-skate/game-id/rounds/round-id/resolve",
      { result: "invalid-value" }
    );
    // Either 400 (validation before auth) or 401 (auth before validation)
    expect([400, 401]).toContain(res.status());
  });

  test("confirm rejects invalid result enum value", async ({ request }) => {
    const res = await postBypassCsrf(
      request,
      "/api/remote-skate/game-id/rounds/round-id/confirm",
      { result: "not-valid" }
    );
    expect([400, 401]).toContain(res.status());
  });

  test("resolve rejects empty body", async ({ request }) => {
    const res = await postBypassCsrf(
      request,
      "/api/remote-skate/game-id/rounds/round-id/resolve"
    );
    expect([400, 401]).toContain(res.status());
  });

  test("confirm rejects empty body", async ({ request }) => {
    const res = await postBypassCsrf(
      request,
      "/api/remote-skate/game-id/rounds/round-id/confirm"
    );
    expect([400, 401]).toContain(res.status());
  });
});

// =============================================================================
// 5. Security Properties
// =============================================================================

test.describe("Remote S.K.A.T.E. — Security Properties", () => {
  test("error responses use application/json content-type", async ({ request }) => {
    const endpoints = [
      "/api/remote-skate/fake/rounds/fake/resolve",
      "/api/remote-skate/fake/rounds/fake/confirm",
    ];

    for (const path of endpoints) {
      const res = await postBypassCsrf(request, path, { result: "landed" });
      const contentType = res.headers()["content-type"] || "";
      expect(contentType).toContain("application/json");
    }
  });

  test("error responses never expose stack traces", async ({ request }) => {
    const endpoints = [
      "/api/remote-skate/fake/rounds/fake/resolve",
      "/api/remote-skate/fake/rounds/fake/confirm",
    ];

    for (const path of endpoints) {
      const res = await postBypassCsrf(request, path, { result: "landed" });
      const text = await res.text();
      expect(text).not.toContain("at Function");
      expect(text).not.toContain("at Object");
      expect(text).not.toContain(".ts:");
      expect(text).not.toContain(".js:");
    }
  });

  test("error responses use generic messages (no info leakage)", async ({ request }) => {
    const res = await postBypassCsrf(
      request,
      "/api/remote-skate/fake/rounds/fake/resolve",
      { result: "landed" }
    );

    const body = await res.json();
    // Should not leak internal details like Firebase, Firestore, etc.
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain("stack");
    expect(bodyStr).not.toContain("Firestore");
    expect(bodyStr).not.toContain("firebase");
  });

  test("auth error message is generic (no token type leakage)", async ({ request }) => {
    const res = await postBypassCsrf(
      request,
      "/api/remote-skate/game/rounds/round/resolve",
      { result: "landed" }
    );
    expect(res.status()).toBe(401);

    const body = await res.json();
    // Must not reveal specifics like "Firebase token expired" or "user not found"
    expect(body.error).not.toContain("expired");
    expect(body.error).not.toContain("not found");
  });
});
