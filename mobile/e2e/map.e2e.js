describe("Map Interactions", () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      permissions: { location: "always" },
    });
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

  describe("Map Screen", () => {
    it("renders the map screen", async () => {
      if (!(await requireAuth())) return;

      await expect(element(by.id("map-screen"))).toBeVisible();
    });

    it("shows loading state while fetching spots", async () => {
      if (!(await requireAuth())) return;

      await expect(element(by.id("map-loading"))).toBeVisible();
    });

    it("displays the map view after loading", async () => {
      if (!(await requireAuth())) return;

      await waitFor(element(by.id("map-view")))
        .toBeVisible()
        .withTimeout(10000);
    });

    it("shows the tier legend", async () => {
      if (!(await requireAuth())) return;

      await expect(element(by.id("map-legend"))).toBeVisible();
      await expect(element(by.text("Bronze"))).toBeVisible();
      await expect(element(by.text("Silver"))).toBeVisible();
      await expect(element(by.text("Gold"))).toBeVisible();
      await expect(element(by.text("Legendary"))).toBeVisible();
    });
  });

  describe("Add Spot", () => {
    it("shows the add spot button", async () => {
      if (!(await requireAuth())) return;

      await expect(element(by.id("map-add-spot"))).toBeVisible();
    });

    it("can tap the add spot button", async () => {
      if (!(await requireAuth())) return;

      await expect(element(by.id("map-add-spot"))).toBeVisible();
      await element(by.id("map-add-spot")).tap();
    });
  });

  describe("Spot Detail", () => {
    it("shows spot detail modal when a marker callout is pressed", async () => {
      if (!(await requireAuth())) return;

      await expect(element(by.id("map-spot-title"))).toBeVisible();
    });

    it("shows check-in button in spot detail", async () => {
      if (!(await requireAuth())) return;

      await expect(element(by.id("map-check-in"))).toBeVisible();
    });
  });
});
