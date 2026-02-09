describe("Auth Flow", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  describe("Sign-In Screen", () => {
    it("renders the sign-in form", async () => {
      await expect(element(by.id("auth-sign-in"))).toBeVisible();
      await expect(element(by.id("auth-email"))).toBeVisible();
      await expect(element(by.id("auth-password"))).toBeVisible();
      await expect(element(by.id("auth-submit"))).toBeVisible();
    });

    it("shows error for empty credentials", async () => {
      await element(by.id("auth-submit")).tap();
      // Alert should appear for missing fields
      await expect(element(by.text("Error"))).toBeVisible();
      await element(by.text("OK")).tap();
    });

    it("accepts email input", async () => {
      await element(by.id("auth-email")).typeText("test@skatehubba.com");
      await expect(element(by.id("auth-email"))).toHaveText("test@skatehubba.com");
    });

    it("accepts password input", async () => {
      await element(by.id("auth-password")).typeText("testpassword123");
      // Password field should contain text (masked)
      await expect(element(by.id("auth-password"))).toHaveText("testpassword123");
    });

    it("shows error for invalid credentials", async () => {
      await element(by.id("auth-email")).typeText("bad@example.com");
      await element(by.id("auth-password")).typeText("wrongpassword");
      await element(by.id("auth-submit")).tap();

      // Should show sign-in failure alert
      await waitFor(element(by.text("Sign In Failed")))
        .toBeVisible()
        .withTimeout(10000);
      await element(by.text("OK")).tap();

      // Should remain on the sign-in screen
      await expect(element(by.id("auth-sign-in"))).toBeVisible();
    });
  });
});
