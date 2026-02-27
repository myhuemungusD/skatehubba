import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Google Auth API Smoke Tests
 *
 * End-to-end tests for the full authentication surface:
 *   - POST /api/auth/login (Firebase ID token login)
 *   - GET  /api/auth/me    (current user)
 *   - POST /api/auth/logout
 *   - MFA endpoints
 *   - Password management (forgot, reset, change)
 *   - Email verification
 *   - Re-authentication
 *
 * Uses Playwright's lightweight `request` fixture (no browser launched).
 *
 * CSRF note: The server enforces double-submit CSRF on all POST /api/* routes.
 * Requests with a Bearer Authorization header bypass CSRF (server/middleware/csrf.ts).
 * Tests send a dummy Bearer header to skip the CSRF gate — letting route-level
 * auth/validation middleware do its job.
 */

// =============================================================================
// Helpers
// =============================================================================

/**
 * POST bypassing the CSRF double-submit gate.
 *
 * Sends a dummy Bearer header so CSRF is bypassed but the request carries no
 * valid credentials — letting route-level auth/validation do its job.
 */
async function postBypassCsrf(request: APIRequestContext, path: string, data?: unknown) {
  return request.post(path, {
    data: data ?? {},
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer __e2e_csrf_bypass_not_a_real_token__",
    },
  });
}

/**
 * POST with a specific Authorization header, bypassing CSRF implicitly
 * since any Bearer header skips the CSRF gate.
 */
async function postWithAuth(
  request: APIRequestContext,
  path: string,
  authHeader: string,
  data?: unknown
) {
  return request.post(path, {
    data: data ?? {},
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
  });
}

// =============================================================================
// 1. Login Endpoint — POST /api/auth/login
// =============================================================================

test.describe("Login Endpoint (POST /api/auth/login)", () => {
  test("rejects request with invalid Firebase token", async ({ request }) => {
    const res = await postWithAuth(
      request,
      "/api/auth/login",
      "Bearer totally-invalid-firebase-token-abc123"
    );
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toBe("Authentication failed");
  });

  test("rejects request with empty Bearer token", async ({ request }) => {
    const res = await postWithAuth(request, "/api/auth/login", "Bearer ");
    // Empty token after trim fails Firebase verification → 401
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Authentication failed");
  });

  test("rejects request without Authorization header (CSRF gate)", async ({ request }) => {
    // No Bearer header → CSRF middleware blocks with 403
    const res = await request.post("/api/auth/login", {
      data: {},
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(403);
  });

  test("returns generic error message (no info leakage)", async ({ request }) => {
    const res = await postWithAuth(
      request,
      "/api/auth/login",
      "Bearer some-fake-token-that-does-not-exist"
    );

    const body = await res.json();
    // Must use a generic message — not "user not found", "token expired", etc.
    expect(body.error).toBe("Authentication failed");
    // Must NOT leak internal details
    expect(JSON.stringify(body)).not.toContain("stack");
    expect(JSON.stringify(body)).not.toContain("Firebase");
  });

  test("error response has consistent JSON shape", async ({ request }) => {
    const res = await postWithAuth(request, "/api/auth/login", "Bearer invalid");

    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(typeof body.error).toBe("string");
    // Token must never appear in response body
    expect(body).not.toHaveProperty("token");
    expect(body).not.toHaveProperty("sessionToken");
  });
});

// =============================================================================
// 2. Current User — GET /api/auth/me
// =============================================================================

test.describe("Current User (GET /api/auth/me)", () => {
  test("returns 401 without authentication", async ({ request }) => {
    const res = await request.get("/api/auth/me");
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  test("returns 401 with invalid session cookie", async ({ request }) => {
    const res = await request.get("/api/auth/me", {
      headers: {
        Cookie: "sessionToken=invalid-jwt-token-12345",
      },
    });
    expect(res.status()).toBe(401);
  });

  test("returns 401 with dummy Bearer token", async ({ request }) => {
    const res = await request.get("/api/auth/me", {
      headers: {
        Authorization: "Bearer __e2e_csrf_bypass_not_a_real_token__",
      },
    });
    expect(res.status()).toBe(401);
  });
});

// =============================================================================
// 3. Logout — POST /api/auth/logout
// =============================================================================

test.describe("Logout (POST /api/auth/logout)", () => {
  test("returns 401 without authentication", async ({ request }) => {
    const res = await postBypassCsrf(request, "/api/auth/logout");
    expect(res.status()).toBe(401);
  });
});

// =============================================================================
// 4. MFA Endpoints — all require authentication
// =============================================================================

test.describe("MFA Endpoints", () => {
  const mfaEndpoints = [
    { method: "GET" as const, path: "/api/auth/mfa/status" },
    { method: "POST" as const, path: "/api/auth/mfa/setup" },
    { method: "POST" as const, path: "/api/auth/mfa/verify-setup" },
    { method: "POST" as const, path: "/api/auth/mfa/verify" },
    { method: "POST" as const, path: "/api/auth/mfa/disable" },
    { method: "POST" as const, path: "/api/auth/mfa/backup-codes" },
  ];

  for (const { method, path } of mfaEndpoints) {
    test(`${method} ${path} returns 401 without auth`, async ({ request }) => {
      const res = method === "GET" ? await request.get(path) : await postBypassCsrf(request, path);
      expect(res.status()).toBe(401);

      const body = await res.json();
      expect(body).toHaveProperty("error");
    });
  }
});

// =============================================================================
// 5. Password Management
// =============================================================================

test.describe("Password Management", () => {
  test("POST /api/auth/forgot-password rejects empty body", async ({ request }) => {
    const res = await postBypassCsrf(request, "/api/auth/forgot-password");
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  test("POST /api/auth/forgot-password returns 200 even for unknown email (no enumeration)", async ({
    request,
  }) => {
    const res = await postBypassCsrf(request, "/api/auth/forgot-password", {
      email: "definitely-does-not-exist@example.com",
    });
    // Always returns 200 to prevent email enumeration
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    // Message should not reveal whether the email exists
    expect(body.message).toContain("If an account");
  });

  test("POST /api/auth/reset-password rejects missing token", async ({ request }) => {
    const res = await postBypassCsrf(request, "/api/auth/reset-password");
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  test("POST /api/auth/reset-password rejects weak password", async ({ request }) => {
    const res = await postBypassCsrf(request, "/api/auth/reset-password", {
      token: "a".repeat(64),
      newPassword: "short",
    });
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.code).toBe("INVALID_PASSWORD");
  });

  test("POST /api/auth/reset-password rejects password without complexity", async ({ request }) => {
    const res = await postBypassCsrf(request, "/api/auth/reset-password", {
      token: "a".repeat(64),
      newPassword: "alllowercasenodigits",
    });
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.code).toBe("WEAK_PASSWORD");
  });

  test("POST /api/auth/change-password returns 401 without auth", async ({ request }) => {
    const res = await postBypassCsrf(request, "/api/auth/change-password", {
      currentPassword: "old",
      newPassword: "NewPass123",
    });
    expect(res.status()).toBe(401);
  });
});

// =============================================================================
// 6. Email Verification
// =============================================================================

test.describe("Email Verification", () => {
  test("POST /api/auth/verify-email rejects missing token", async ({ request }) => {
    const res = await postBypassCsrf(request, "/api/auth/verify-email");
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  test("POST /api/auth/verify-email rejects malformed token format", async ({ request }) => {
    const res = await postBypassCsrf(request, "/api/auth/verify-email", {
      token: "not-hex-and-too-long-!@#$%",
    });
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.code).toBe("INVALID_TOKEN");
  });

  test("POST /api/auth/verify-email rejects invalid/expired token", async ({ request }) => {
    // Valid hex format but doesn't match any real token
    const res = await postBypassCsrf(request, "/api/auth/verify-email", {
      token: "a".repeat(64),
    });
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.code).toBe("INVALID_TOKEN");
  });

  test("POST /api/auth/resend-verification returns 401 without auth", async ({ request }) => {
    const res = await postBypassCsrf(request, "/api/auth/resend-verification");
    expect(res.status()).toBe(401);
  });
});

// =============================================================================
// 7. Re-authentication
// =============================================================================

test.describe("Re-authentication", () => {
  test("POST /api/auth/verify-identity returns 401 without auth", async ({ request }) => {
    const res = await postBypassCsrf(request, "/api/auth/verify-identity", {
      password: "test",
    });
    expect(res.status()).toBe(401);
  });
});

// =============================================================================
// 8. Auth Security Properties
// =============================================================================

test.describe("Auth Security Properties", () => {
  test("all auth error responses use application/json", async ({ request }) => {
    const endpoints = [
      () => request.get("/api/auth/me"),
      () => postBypassCsrf(request, "/api/auth/logout"),
      () => postWithAuth(request, "/api/auth/login", "Bearer fake-token"),
    ];

    for (const call of endpoints) {
      const res = await call();
      const contentType = res.headers()["content-type"] || "";
      expect(contentType).toContain("application/json");
    }
  });

  test("auth errors never expose stack traces", async ({ request }) => {
    const res = await postWithAuth(request, "/api/auth/login", "Bearer garbage");
    const text = await res.text();
    expect(text).not.toContain("at Function");
    expect(text).not.toContain("at Object");
    expect(text).not.toContain(".ts:");
    expect(text).not.toContain(".js:");
  });

  test("POST /api/auth/login is not a 404 (route is registered)", async ({ request }) => {
    const res = await postBypassCsrf(request, "/api/auth/login");
    expect(res.status()).not.toBe(404);
  });

  test("GET /api/auth/me is not a 404 (route is registered)", async ({ request }) => {
    const res = await request.get("/api/auth/me");
    expect(res.status()).not.toBe(404);
  });

  test("POST /api/auth/logout is not a 404 (route is registered)", async ({ request }) => {
    const res = await postBypassCsrf(request, "/api/auth/logout");
    expect(res.status()).not.toBe(404);
  });
});
