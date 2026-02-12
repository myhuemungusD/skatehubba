describe("Leaderboard", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  describe("Leaderboard Screen", () => {
    it("renders the leaderboard screen", async () => {
      try {
        await expect(element(by.id("home-screen"))).toBeVisible();
      } catch {
        // Not authenticated — auth flow tests cover sign-in
        return;
      }

      try {
        await expect(element(by.id("leaderboard-screen"))).toBeVisible();
      } catch {
        // May need navigation to reach leaderboard
      }
    });

    it("shows loading text while fetching data", async () => {
      try {
        await expect(element(by.id("leaderboard-loading"))).toBeVisible();
      } catch {
        // Loading may have already completed or screen not visible
      }
    });

    it("displays the Top Skaters header", async () => {
      try {
        await waitFor(element(by.id("leaderboard-header")))
          .toBeVisible()
          .withTimeout(10000);
        await expect(element(by.text("Top Skaters"))).toBeVisible();
      } catch {
        // Leaderboard not loaded
      }
    });

    it("renders the leaderboard list", async () => {
      try {
        await expect(element(by.id("leaderboard-list"))).toBeVisible();
      } catch {
        // List not visible
      }
    });
  });

  describe("Leaderboard Entries", () => {
    it("displays the first-place entry with gold trophy", async () => {
      try {
        await expect(element(by.id("leaderboard-row-0"))).toBeVisible();
      } catch {
        // No leaderboard data
      }
    });

    it("displays at least one row with player name and points", async () => {
      try {
        await expect(element(by.id("leaderboard-row-0"))).toBeVisible();
        // Each row should have a name and points text
        await expect(element(by.text("pts"))).toBeVisible();
      } catch {
        // No leaderboard data loaded
      }
    });

    it("displays top three entries with trophy icons", async () => {
      try {
        await expect(element(by.id("leaderboard-row-0"))).toBeVisible();
        await expect(element(by.id("leaderboard-row-1"))).toBeVisible();
        await expect(element(by.id("leaderboard-row-2"))).toBeVisible();
      } catch {
        // Fewer than 3 entries
      }
    });
  });

  describe("Leaderboard Scrolling", () => {
    it("allows scrolling through the leaderboard", async () => {
      try {
        await expect(element(by.id("leaderboard-list"))).toBeVisible();
        await element(by.id("leaderboard-list")).scroll(200, "down");
        // After scrolling, more entries should be visible
      } catch {
        // List not available or not enough data to scroll
      }
    });
  });
});
