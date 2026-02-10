/* eslint-disable react-hooks/rules-of-hooks */
import { test } from "@playwright/test";
import { MapPage } from "./MapPage";
import { ApiMocker } from "./ApiMocker";

/**
 * Extended test fixture with page objects and mocking
 */
export interface MapTestFixtures {
  mapPage: MapPage;
  api: ApiMocker;
}

export const mapTest = test.extend<MapTestFixtures>({
  mapPage: async ({ page }, use) => {
    await page.addInitScript(() => {
      if (location.hostname === "localhost") {
        sessionStorage.setItem("e2eAuthBypass", "true");
      }
    });
    const mapPage = new MapPage(page);
    await use(mapPage);
  },
  api: async ({ page }, use) => {
    const api = new ApiMocker(page);
    await use(api);
  },
});
