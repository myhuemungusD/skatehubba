import type { Page } from "@playwright/test";
import { CONFIG } from "./config";
import { spotFactory } from "./SpotFactory";

/**
 * Setup API route mocking with various configurations
 */
export class ApiMocker {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Mock successful spots API response */
  async mockSpots(spotCount: number, delay: number = 0): Promise<void> {
    const spots = spotFactory.createSpots(spotCount);

    await this.page.route(CONFIG.API_SPOTS_PATTERN, async (route) => {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(spots),
      });
    });
  }

  /** Mock empty spots response */
  async mockEmptySpots(): Promise<void> {
    await this.page.route(CONFIG.API_SPOTS_PATTERN, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });
  }

  /** Mock API error response */
  async mockError(status: number = 500, message: string = "Internal Server Error"): Promise<void> {
    await this.page.route(CONFIG.API_SPOTS_PATTERN, async (route) => {
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ error: message }),
      });
    });
  }

  /** Mock network timeout */
  async mockTimeout(): Promise<void> {
    await this.page.route(CONFIG.API_SPOTS_PATTERN, async (route) => {
      await route.abort("timedout");
    });
  }

  /** Mock slow network (3G simulation) */
  async mockSlowNetwork(spotCount: number): Promise<void> {
    await this.mockSpots(spotCount, 2000); // 2 second delay
  }

  /** Clear all route mocks */
  async clearMocks(): Promise<void> {
    await this.page.unroute(CONFIG.API_SPOTS_PATTERN);
  }
}
