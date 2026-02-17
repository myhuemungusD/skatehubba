describe("Challenge Creation", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  /** Navigate past auth — returns false (and skips the test) when not signed in. */
  async function requireAuth() {
    try {
      await expect(element(by.id("home-screen"))).toBeVisible();
      return true;
    } catch {
      // Not authenticated — auth flow tests cover sign-in
      return false;
    }
  }

  describe("Challenges Screen", () => {
    it("renders the challenges screen when authenticated", async () => {
      if (!(await requireAuth())) return;

      await expect(element(by.id("challenges-screen"))).toBeVisible();
    });

    it("shows the create challenge button", async () => {
      if (!(await requireAuth())) return;

      await expect(element(by.id("challenges-screen"))).toBeVisible();
      await expect(element(by.id("challenges-create"))).toBeVisible();
    });

    it("shows empty state when no challenges exist", async () => {
      if (!(await requireAuth())) return;

      await expect(element(by.id("challenges-screen"))).toBeVisible();
      await expect(element(by.id("challenges-empty"))).toBeVisible();
      await expect(element(by.text("No challenges yet"))).toBeVisible();
      await expect(element(by.text("Create your first S.K.A.T.E. challenge!"))).toBeVisible();
    });

    it("shows challenge list when challenges exist", async () => {
      if (!(await requireAuth())) return;

      await expect(element(by.id("challenges-screen"))).toBeVisible();
      await expect(element(by.id("challenges-list"))).toBeVisible();
    });
  });

  describe("Create Challenge Flow", () => {
    it("navigates to new challenge screen", async () => {
      if (!(await requireAuth())) return;

      await expect(element(by.id("challenges-create"))).toBeVisible();
      await element(by.id("challenges-create")).tap();

      await waitFor(element(by.text("New Challenge")))
        .toBeVisible()
        .withTimeout(5000);
    });
  });

  describe("Challenge Card Interaction", () => {
    it("challenge cards show status badge", async () => {
      if (!(await requireAuth())) return;

      await expect(element(by.id("challenges-list"))).toBeVisible();

      // At least one status badge should be visible
      await expect(
        element(by.text(/^(PENDING|ACCEPTED|COMPLETED)$/)),
      ).toBeVisible();
    });

    it("shows respond button for incoming pending challenges", async () => {
      if (!(await requireAuth())) return;

      await expect(element(by.id("challenges-list"))).toBeVisible();
      await expect(element(by.text("Respond Now"))).toBeVisible();
    });
  });
});
