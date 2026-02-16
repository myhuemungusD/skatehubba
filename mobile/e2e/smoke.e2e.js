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
});
