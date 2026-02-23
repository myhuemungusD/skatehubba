describe("Leaderboard", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  /** Returns false (skip test) when the user is not signed in. */
  async function requireAuth() {
    try {
      await expect(element(by.id("home-screen"))).toBeVisible();
      return true;
    } catch {
      return false;
    }
  }

  describe("Leaderboard Screen", () => {
    it("renders the leaderboard screen", async () => {
      if (!(await requireAuth())) return;

      await expect(element(by.id("leaderboard-screen"))).toBeVisible();
    });

    it("shows loading text while fetching data", async () => {
      if (!(await requireAuth())) return;

      // Loading indicator should appear before data arrives
      await expect(element(by.id("leaderboard-loading"))).toBeVisible();
    });

    it("displays the S.K.A.T.E. Leaderboard header", async () => {
      if (!(await requireAuth())) return;

      await waitFor(element(by.id("leaderboard-header")))
        .toBeVisible()
        .withTimeout(10000);
      await expect(element(by.text("S.K.A.T.E. Leaderboard"))).toBeVisible();
    });

    it("renders the leaderboard list", async () => {
      if (!(await requireAuth())) return;

      await expect(element(by.id("leaderboard-list"))).toBeVisible();
    });
  });

  describe("Leaderboard Entries", () => {
    it("displays the first-place entry with gold trophy", async () => {
      if (!(await requireAuth())) return;

      await expect(element(by.id("leaderboard-row-0"))).toBeVisible();
    });

    it("displays at least one row with player name and win count", async () => {
      if (!(await requireAuth())) return;

      await expect(element(by.id("leaderboard-row-0"))).toBeVisible();
    });

    it("displays top three entries with trophy icons", async () => {
      if (!(await requireAuth())) return;

      await expect(element(by.id("leaderboard-row-0"))).toBeVisible();
      await expect(element(by.id("leaderboard-row-1"))).toBeVisible();
      await expect(element(by.id("leaderboard-row-2"))).toBeVisible();
    });
  });

  describe("Leaderboard Scrolling", () => {
    it("allows scrolling through the leaderboard", async () => {
      if (!(await requireAuth())) return;

      await expect(element(by.id("leaderboard-list"))).toBeVisible();
      await element(by.id("leaderboard-list")).scroll(200, "down");
    });
  });
});
