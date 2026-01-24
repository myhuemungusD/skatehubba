describe("Smoke", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  it("shows auth or home entry point", async () => {
    try {
      await expect(element(by.id("auth-sign-in"))).toBeVisible();
      await expect(element(by.id("auth-email"))).toBeVisible();
      await expect(element(by.id("auth-submit"))).toBeVisible();
    } catch (error) {
      await expect(element(by.id("home-screen"))).toBeVisible();
    }
  });
});
