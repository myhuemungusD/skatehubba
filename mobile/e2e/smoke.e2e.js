describe("Smoke", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

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

  it("does not show a React Native RedBox or LogBox", async () => {
    // Native RedBox (bundle syntax errors, Metro down) exposes
    // accessibilityIdentifier "redbox-error" in RCTRedBox.mm
    await expect(element(by.id("redbox-error"))).not.toBeVisible();

    // JS LogBox shows this text for unhandled runtime exceptions
    await waitFor(element(by.text("Unhandled JS Exception")))
      .not.toBeVisible()
      .withTimeout(3000);
  });

  it("can reach the API health endpoint", async () => {
    // Verify the mobile app can connect to the backend.
    // /api/health/live is the liveness probe — always { status: "ok" }.
    const baseUrl = process.env.API_URL ?? "http://localhost:3000";
    const response = await fetch(`${baseUrl}/api/health/live`);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("status", "ok");
  });
});
