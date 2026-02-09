import { expect, type Page, type Locator } from "@playwright/test";
import { CONFIG, SELECTORS } from "./config";
import type { PerformanceMetrics } from "./types";

/**
 * MapPage - Page Object for SpotMap component
 * Encapsulates all map interactions for clean, maintainable tests
 */
export class MapPage {
  readonly page: Page;

  // Lazy-loaded locators
  private _container?: Locator;
  private _leaflet?: Locator;
  private _markers?: Locator;

  constructor(page: Page) {
    this.page = page;
  }

  // ---------------------------------------------------------------------------
  // Locators (cached for performance)
  // ---------------------------------------------------------------------------

  get container(): Locator {
    return (this._container ??= this.page.locator(SELECTORS.mapContainer));
  }

  get leaflet(): Locator {
    return (this._leaflet ??= this.page.locator(SELECTORS.leafletContainer));
  }

  get markers(): Locator {
    return (this._markers ??= this.page.locator(SELECTORS.spotMarker));
  }

  get zoomInButton(): Locator {
    return this.page.locator(SELECTORS.zoomIn);
  }

  get zoomOutButton(): Locator {
    return this.page.locator(SELECTORS.zoomOut);
  }

  get searchInput(): Locator {
    return this.page.locator(SELECTORS.searchInput);
  }

  get loadingIndicator(): Locator {
    return this.page.locator(SELECTORS.loading);
  }

  get errorMessage(): Locator {
    return this.page.locator(SELECTORS.error);
  }

  get emptyState(): Locator {
    return this.page.locator(SELECTORS.empty);
  }

  get spotDetails(): Locator {
    return this.page.locator(SELECTORS.spotDetails);
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  /** Navigate to map page */
  async goto(): Promise<void> {
    await this.page.goto(CONFIG.MAP_ROUTE);
  }

  /** Wait for map to be fully interactive */
  async waitForReady(): Promise<void> {
    await this.container.waitFor({
      state: "visible",
      timeout: CONFIG.MAP_READY_TIMEOUT,
    });
    await this.leaflet.waitFor({
      state: "visible",
      timeout: CONFIG.MAP_READY_TIMEOUT,
    });
    // Wait for tiles to load (Leaflet adds this class when ready)
    await this.page
      .waitForFunction(() => document.querySelector(".leaflet-tile-loaded") !== null, {
        timeout: CONFIG.MAP_READY_TIMEOUT,
      })
      .catch(() => {
        // Tiles might not be available in test env - that's OK
      });
  }

  // ---------------------------------------------------------------------------
  // Interactions
  // ---------------------------------------------------------------------------

  /** Pan map by delta pixels */
  async pan(deltaX: number, deltaY: number): Promise<void> {
    const box = await this.leaflet.boundingBox();
    if (!box) throw new Error("Map container not found for pan operation");

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    await this.page.mouse.move(centerX, centerY);
    await this.page.mouse.down();
    await this.page.mouse.move(centerX + deltaX, centerY + deltaY, { steps: 10 });
    await this.page.mouse.up();

    // Wait for markers to update (state-based, not timeout)
    await this.waitForMarkersStable();
  }

  /** Zoom in using control button */
  async zoomIn(): Promise<void> {
    await this.zoomInButton.click();
    await this.waitForMarkersStable();
  }

  /** Zoom out using control button */
  async zoomOut(): Promise<void> {
    await this.zoomOutButton.click();
    await this.waitForMarkersStable();
  }

  /** Click on first visible marker */
  async clickFirstMarker(): Promise<void> {
    const marker = this.markers.first();
    await expect(marker).toBeVisible({ timeout: CONFIG.ANIMATION_TIMEOUT });
    await marker.click();
  }

  /** Click on marker by index */
  async clickMarker(index: number): Promise<void> {
    const marker = this.markers.nth(index);
    await expect(marker).toBeVisible({ timeout: CONFIG.ANIMATION_TIMEOUT });
    await marker.click();
  }

  /** Search for spots by name */
  async search(query: string): Promise<void> {
    await expect(this.searchInput).toBeVisible();
    await this.searchInput.fill(query);
    await this.waitForMarkersStable();
  }

  /** Clear search input */
  async clearSearch(): Promise<void> {
    await this.searchInput.clear();
    await this.waitForMarkersStable();
  }

  /** Click filter button by spot type */
  async filterByType(type: "street" | "park" | "diy"): Promise<void> {
    const filterSelector = {
      street: SELECTORS.filterStreet,
      park: SELECTORS.filterPark,
      diy: SELECTORS.filterDiy,
    }[type];

    const filter = this.page.locator(filterSelector);
    await expect(filter).toBeVisible();
    await filter.click();
    await this.waitForMarkersStable();
  }

  /** Focus map container for keyboard navigation */
  async focusMap(): Promise<void> {
    await this.leaflet.focus();
    await expect(this.leaflet).toBeFocused();
  }

  /** Press keyboard key while map focused */
  async pressKey(key: string): Promise<void> {
    await this.page.keyboard.press(key);
  }

  // ---------------------------------------------------------------------------
  // Assertions & Queries
  // ---------------------------------------------------------------------------

  /** Get count of visible markers */
  async getMarkerCount(): Promise<number> {
    return this.markers.count();
  }

  /** Wait for marker count to stabilize (no more changes) */
  async waitForMarkersStable(): Promise<void> {
    // Wait for any pending animations/renders
    await this.page.waitForLoadState("networkidle").catch(() => {});

    // Poll until marker count stops changing
    let lastCount = -1;
    let stableChecks = 0;
    const maxAttempts = 10;

    for (let i = 0; i < maxAttempts; i++) {
      const currentCount = await this.getMarkerCount();
      if (currentCount === lastCount) {
        stableChecks++;
        if (stableChecks >= 2) return; // Stable for 2 consecutive checks
      } else {
        stableChecks = 0;
        lastCount = currentCount;
      }
      await this.page.waitForTimeout(100); // Small poll interval
    }
  }

  /** Check if map is in error state */
  async hasError(): Promise<boolean> {
    return this.errorMessage.isVisible();
  }

  /** Check if map shows empty state */
  async isEmpty(): Promise<boolean> {
    return this.emptyState.isVisible();
  }

  /** Check if spot details panel/popup is visible */
  async isSpotDetailsVisible(): Promise<boolean> {
    return this.spotDetails.isVisible();
  }

  /** Check if loading indicator is visible */
  async isLoading(): Promise<boolean> {
    return this.loadingIndicator.isVisible();
  }

  /** Measure initial load performance */
  async measureLoadPerformance(): Promise<PerformanceMetrics> {
    const startTime = Date.now();
    await this.waitForReady();
    await this.waitForMarkersStable();
    const loadTimeMs = Date.now() - startTime;

    const markerCount = await this.getMarkerCount();

    return { loadTimeMs, markerCount };
  }
}
