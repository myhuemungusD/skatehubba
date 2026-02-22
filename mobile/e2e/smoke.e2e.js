const API_BASE = process.env.API_URL ?? "http://localhost:3000";

describe("Smoke", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  // =========================================================================
  // Helpers
  // =========================================================================

  /** Returns true when authenticated (home screen visible), false on auth. */
  async function isAuthenticated() {
    try {
      await expect(element(by.id("auth-sign-in"))).toBeVisible();
      return false;
    } catch (_) {
      return true;
    }
  }

  /** Assert neither RedBox nor LogBox is showing. */
  async function expectNoCrash() {
    await expect(element(by.id("redbox-error"))).not.toBeVisible();
    await waitFor(element(by.text("Unhandled JS Exception")))
      .not.toBeVisible()
      .withTimeout(3000);
  }

  // =========================================================================
  // 1. Entry Point
  // =========================================================================

  it("shows auth or home entry point", async () => {
    if (await isAuthenticated()) {
      await expect(element(by.id("home-screen"))).toBeVisible();
    } else {
      await expect(element(by.id("auth-email"))).toBeVisible();
      await expect(element(by.id("auth-submit"))).toBeVisible();
    }
  });

  // =========================================================================
  // 2. Bottom Navigation
  // =========================================================================

  it("renders the bottom navigation bar", async () => {
    if (!(await isAuthenticated())) return;
    await expect(element(by.id("bottom-tab-bar"))).toBeVisible();
  });

  // =========================================================================
  // 3. Error Detection
  // =========================================================================

  it("does not show a React Native RedBox or LogBox", async () => {
    await expectNoCrash();
  });

  // =========================================================================
  // 4. API Connectivity
  // =========================================================================

  it("can reach the API liveness probe", async () => {
    const response = await fetch(`${API_BASE}/api/health/live`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("status", "ok");
  });

  // =========================================================================
  // 5. Tab Navigation — verify each tab renders without crash
  // =========================================================================

  describe("Tab Navigation", () => {
    const tabs = [
      { testID: "tab-hub", label: "Hub" },
      { testID: "tab-map", label: "Map" },
      { testID: "tab-play", label: "Play" },
      { testID: "tab-shop", label: "Shop" },
      { testID: "tab-closet", label: "Closet" },
    ];

    for (const { testID, label } of tabs) {
      it(`${label} tab renders without crash`, async () => {
        if (!(await isAuthenticated())) return;

        await element(by.id(testID)).tap();
        await expectNoCrash();
      });
    }
  });

  // =========================================================================
  // 6. API Readiness
  // =========================================================================

  it("API readiness probe returns health structure", async () => {
    const response = await fetch(`${API_BASE}/api/health/ready`);
    expect([200, 503]).toContain(response.status);

    const body = await response.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("checks");
  });

  // =========================================================================
  // 7. Public Stats
  // =========================================================================

  it("can fetch public stats from the API", async () => {
    const response = await fetch(`${API_BASE}/api/stats`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("totalUsers");
    expect(body).toHaveProperty("totalSpots");
    expect(body).toHaveProperty("totalBattles");
  });

  // =========================================================================
  // 8. Spots Endpoint
  // =========================================================================

  it("can fetch spots list from the API", async () => {
    const response = await fetch(`${API_BASE}/api/spots`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  // =========================================================================
  // 9. App Backgrounding
  // =========================================================================

  it("survives background and foreground cycle", async () => {
    await device.sendToHome();
    await device.launchApp({ newInstance: false });
    await expectNoCrash();
  });

  // =========================================================================
  // 10. Network Error Resilience
  // =========================================================================

  it("does not crash on network error", async () => {
    try {
      await device.setURLBlacklist([".*"]);
      await new Promise((r) => setTimeout(r, 2000));
      await expectNoCrash();
    } finally {
      await device.setURLBlacklist([]);
    }
  });
});
