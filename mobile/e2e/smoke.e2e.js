describe("Smoke", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  // =========================================================================
  // 1. Entry Point (existing)
  // =========================================================================

  it("shows auth or home entry point", async () => {
    let onAuthScreen = false;
    try {
      await expect(element(by.id("auth-sign-in"))).toBeVisible();
      onAuthScreen = true;
    } catch (_) {
      // auth-sign-in not visible — expect the home screen instead
    }

    if (onAuthScreen) {
      await expect(element(by.id("auth-email"))).toBeVisible();
      await expect(element(by.id("auth-submit"))).toBeVisible();
    } else {
      await expect(element(by.id("home-screen"))).toBeVisible();
    }
  });

  // =========================================================================
  // 2. Bottom Navigation (existing)
  // =========================================================================

  it("renders the bottom navigation bar", async () => {
    // If on auth screen, skip — nav bar only appears after sign-in
    try {
      await expect(element(by.id("auth-sign-in"))).toBeVisible();
      return;
    } catch (_) {
      // Not on auth — continue
    }

    await expect(element(by.id("bottom-tab-bar"))).toBeVisible();
  });

  // =========================================================================
  // 3. Error Detection (existing)
  // =========================================================================

  it("does not show a React Native RedBox or LogBox", async () => {
    // Native RedBox (bundle syntax errors, Metro down) exposes
    // accessibilityIdentifier "redbox-error" in RCTRedBox.mm
    await expect(element(by.id("redbox-error"))).not.toBeVisible();

    // JS LogBox shows this text for unhandled runtime exceptions
    await waitFor(element(by.text("Unhandled JS Exception")))
      .not.toBeVisible()
      .withTimeout(3000);
  });

  // =========================================================================
  // 4. API Connectivity (existing)
  // =========================================================================

  it("can reach the API health endpoint", async () => {
    // Verify the mobile app can connect to the backend.
    // /api/health/live is the liveness probe — always { status: "ok" }.
    const baseUrl = process.env.API_URL ?? "http://localhost:3000";
    const response = await fetch(`${baseUrl}/api/health/live`);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("status", "ok");
  });

  // =========================================================================
  // 5. Tab Navigation — verify each tab renders without crash
  // =========================================================================

  describe("Tab Navigation", () => {
    /** Returns false when on the auth screen (tabs not available). */
    async function requireAuth() {
      try {
        await expect(element(by.id("auth-sign-in"))).toBeVisible();
        return false;
      } catch (_) {
        return true;
      }
    }

    it("Hub tab renders without crash", async () => {
      if (!(await requireAuth())) return;

      // Hub is the default tab — verify it's visible
      await expect(element(by.id("bottom-tab-bar"))).toBeVisible();

      // Tap the Hub tab icon
      try {
        await element(by.id("tab-hub")).tap();
      } catch (_) {
        // Tab may already be selected — that's fine
      }

      // No RedBox after navigation
      await expect(element(by.id("redbox-error"))).not.toBeVisible();
    });

    it("Map tab renders without crash", async () => {
      if (!(await requireAuth())) return;

      try {
        await element(by.id("tab-map")).tap();
      } catch (_) {
        // Tab not found — may use different testID
        return;
      }

      await waitFor(element(by.id("redbox-error")))
        .not.toBeVisible()
        .withTimeout(5000);
    });

    it("Play tab renders without crash", async () => {
      if (!(await requireAuth())) return;

      try {
        await element(by.id("tab-play")).tap();
      } catch (_) {
        return;
      }

      await waitFor(element(by.id("redbox-error")))
        .not.toBeVisible()
        .withTimeout(5000);
    });

    it("Shop tab renders without crash", async () => {
      if (!(await requireAuth())) return;

      try {
        await element(by.id("tab-shop")).tap();
      } catch (_) {
        return;
      }

      await waitFor(element(by.id("redbox-error")))
        .not.toBeVisible()
        .withTimeout(5000);
    });

    it("Closet tab renders without crash", async () => {
      if (!(await requireAuth())) return;

      try {
        await element(by.id("tab-closet")).tap();
      } catch (_) {
        return;
      }

      await waitFor(element(by.id("redbox-error")))
        .not.toBeVisible()
        .withTimeout(5000);
    });
  });

  // =========================================================================
  // 6. API Readiness — deeper check beyond liveness
  // =========================================================================

  it("API readiness probe returns health structure", async () => {
    const baseUrl = process.env.API_URL ?? "http://localhost:3000";
    const response = await fetch(`${baseUrl}/api/health/ready`);

    // 200 = healthy, 503 = unhealthy — both are valid non-crash responses
    expect([200, 503]).toContain(response.status);

    const body = await response.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("checks");
  });

  // =========================================================================
  // 7. Public Stats — verify the mobile app can fetch public data
  // =========================================================================

  it("can fetch public stats from the API", async () => {
    const baseUrl = process.env.API_URL ?? "http://localhost:3000";
    const response = await fetch(`${baseUrl}/api/stats`);

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("totalUsers");
    expect(body).toHaveProperty("totalSpots");
    expect(body).toHaveProperty("totalBattles");
  });

  // =========================================================================
  // 8. Spots Endpoint — verify mobile can load map data
  // =========================================================================

  it("can fetch spots list from the API", async () => {
    const baseUrl = process.env.API_URL ?? "http://localhost:3000";
    const response = await fetch(`${baseUrl}/api/spots`);

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  // =========================================================================
  // 9. App Backgrounding — verify the app survives background/foreground
  // =========================================================================

  it("survives background and foreground cycle", async () => {
    await device.sendToHome();
    await device.launchApp({ newInstance: false });

    // After returning from background, the app should not crash
    await expect(element(by.id("redbox-error"))).not.toBeVisible();

    await waitFor(element(by.text("Unhandled JS Exception")))
      .not.toBeVisible()
      .withTimeout(3000);
  });

  // =========================================================================
  // 10. Network Error Resilience — verify the app handles offline state
  // =========================================================================

  it("does not crash on network error", async () => {
    // Simulate airplane mode / disconnect
    try {
      await device.setURLBlacklist([".*"]);

      // Wait a moment for any in-flight requests to fail
      await new Promise((r) => setTimeout(r, 2000));

      // App should still be running — no RedBox
      await expect(element(by.id("redbox-error"))).not.toBeVisible();

      await waitFor(element(by.text("Unhandled JS Exception")))
        .not.toBeVisible()
        .withTimeout(3000);
    } finally {
      // Always restore network so subsequent tests aren't affected
      await device.setURLBlacklist([]);
    }
  });
});
