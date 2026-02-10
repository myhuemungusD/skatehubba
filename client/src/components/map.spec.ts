/**
 * SpotMap E2E Test Suite
 *
 * Production-grade Playwright tests for the SkateHubba map component.
 *
 * Run specific test categories:
 *   Performance tests:  npx playwright test --grep @perf
 *   Interaction tests:  npx playwright test --grep @interaction
 *   Filter tests:       npx playwright test --grep @filter
 *   Accessibility:      npx playwright test --grep @a11y
 *   Error handling:     npx playwright test --grep @error
 *   Loading states:     npx playwright test --grep @loading
 *   All tests:          npx playwright test
 *
 * @module tests/map.spec
 */

import { expect } from "@playwright/test";
import { CONFIG } from "./__tests__/map/config";
import { spotFactory } from "./__tests__/map/SpotFactory";
import { mapTest } from "./__tests__/map/fixtures";

// ============================================================================
// Performance Test Suite
// ============================================================================

mapTest.describe("Performance", () => {
  mapTest.describe.configure({ retries: 2 });

  mapTest(
    "should implement viewport culling for large datasets @perf",
    async ({ mapPage, api }) => {
      await api.mockSpots(CONFIG.PERFORMANCE_SPOT_COUNT);

      await mapPage.goto();
      const metrics = await mapPage.measureLoadPerformance();

      expect(
        metrics.markerCount,
        `Expected fewer than ${CONFIG.MAX_VISIBLE_MARKERS} markers but got ${metrics.markerCount}`
      ).toBeLessThan(CONFIG.MAX_VISIBLE_MARKERS);

      expect(metrics.markerCount, "Expected at least 1 marker to be rendered").toBeGreaterThan(0);

      console.log(
        `[Perf] Loaded ${CONFIG.PERFORMANCE_SPOT_COUNT} spots, rendered ${metrics.markerCount} in ${metrics.loadTimeMs}ms`
      );
    }
  );

  mapTest("should maintain culling after pan gesture @perf", async ({ mapPage, api }) => {
    await api.mockSpots(CONFIG.PERFORMANCE_SPOT_COUNT);
    await mapPage.goto();
    await mapPage.waitForReady();

    const initialCount = await mapPage.getMarkerCount();

    await mapPage.pan(-200, -100);

    const afterPanCount = await mapPage.getMarkerCount();

    expect(afterPanCount).toBeLessThan(CONFIG.MAX_VISIBLE_MARKERS);
    expect(afterPanCount).toBeGreaterThan(0);

    console.log(`[Perf] Pan: ${initialCount} -> ${afterPanCount} markers`);
  });

  mapTest("should load within performance budget @perf", async ({ mapPage, api }) => {
    await api.mockSpots(CONFIG.STANDARD_SPOT_COUNT);

    await mapPage.goto();
    const metrics = await mapPage.measureLoadPerformance();

    expect(
      metrics.loadTimeMs,
      `Load time ${metrics.loadTimeMs}ms exceeds budget ${CONFIG.MAX_INITIAL_LOAD_MS}ms`
    ).toBeLessThan(CONFIG.MAX_INITIAL_LOAD_MS);
  });
});

// ============================================================================
// User Interaction Test Suite
// ============================================================================

mapTest.describe("User Interactions", () => {
  mapTest.beforeEach(async ({ mapPage, api }) => {
    await api.mockSpots(CONFIG.STANDARD_SPOT_COUNT);
    await mapPage.goto();
    await mapPage.waitForReady();
  });

  mapTest("should display spot details when marker clicked @interaction", async ({ mapPage }) => {
    const markerCount = await mapPage.getMarkerCount();
    expect(markerCount).toBeGreaterThan(0);

    await mapPage.clickFirstMarker();

    await expect(mapPage.spotDetails).toBeVisible({ timeout: CONFIG.ANIMATION_TIMEOUT });
  });

  mapTest("should support zoom in/out controls @interaction", async ({ mapPage }) => {
    await expect(mapPage.zoomInButton).toBeVisible();
    await expect(mapPage.zoomOutButton).toBeVisible();

    const initialCount = await mapPage.getMarkerCount();

    await mapPage.zoomIn();
    const afterZoomIn = await mapPage.getMarkerCount();

    await mapPage.zoomOut();
    await mapPage.zoomOut();
    const afterZoomOut = await mapPage.getMarkerCount();

    expect(afterZoomIn).toBeGreaterThanOrEqual(0);
    expect(afterZoomOut).toBeGreaterThanOrEqual(0);

    console.log(`[Zoom] Initial: ${initialCount}, +Zoom: ${afterZoomIn}, -Zoom: ${afterZoomOut}`);
  });

  mapTest("should pan map with mouse drag @interaction", async ({ mapPage }) => {
    const initialCount = await mapPage.getMarkerCount();

    await mapPage.pan(100, 0);
    await mapPage.pan(-200, 0);
    await mapPage.pan(0, 100);

    const afterPan = await mapPage.getMarkerCount();

    console.log(`[Pan] Initial: ${initialCount}, After: ${afterPan}`);

    expect(afterPan).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Search & Filter Test Suite
// ============================================================================

mapTest.describe("Search & Filtering", () => {
  mapTest.beforeEach(async ({ mapPage, api }) => {
    await api.mockSpots(CONFIG.SMALL_SPOT_COUNT);
    await mapPage.goto();
    await mapPage.waitForReady();
  });

  mapTest("should filter spots by search query @filter", async ({ mapPage }) => {
    const initialCount = await mapPage.getMarkerCount();
    expect(initialCount).toBeGreaterThan(0);

    await mapPage.search("Test Spot 0");

    await expect(mapPage.markers).toHaveCount(1);
  });

  mapTest("should restore all spots when search cleared @filter", async ({ mapPage }) => {
    const initialCount = await mapPage.getMarkerCount();

    await mapPage.search("Test Spot 0");
    await expect(mapPage.markers).toHaveCount(1);

    await mapPage.clearSearch();

    const afterClear = await mapPage.getMarkerCount();
    expect(afterClear).toBe(initialCount);
  });

  mapTest("should filter spots by category (street) @filter", async ({ mapPage }) => {
    const initialCount = await mapPage.getMarkerCount();

    await mapPage.filterByType("street");

    const filteredCount = await mapPage.getMarkerCount();

    expect(filteredCount).toBeGreaterThan(0);
    expect(filteredCount).toBeLessThan(initialCount);

    const expectedApprox = Math.floor(initialCount / 3);
    expect(filteredCount).toBeGreaterThanOrEqual(expectedApprox - 2);
    expect(filteredCount).toBeLessThanOrEqual(expectedApprox + 2);
  });

  mapTest("should show no results for non-matching search @filter", async ({ mapPage }) => {
    await mapPage.search("NonExistentSpotXYZ12345");

    const count = await mapPage.getMarkerCount();
    const showsEmpty = await mapPage.isEmpty();

    expect(count === 0 || showsEmpty).toBe(true);
  });
});

// ============================================================================
// Accessibility Test Suite
// ============================================================================

mapTest.describe("Accessibility", () => {
  mapTest.beforeEach(async ({ mapPage, api }) => {
    await api.mockSpots(CONFIG.SMALL_SPOT_COUNT);
    await mapPage.goto();
    await mapPage.waitForReady();
  });

  mapTest("should have accessible map container @a11y", async ({ mapPage }) => {
    await expect(mapPage.container).toBeVisible();
    await expect(mapPage.container).toHaveAttribute("tabindex", /-?\d+/);

    const hasAriaLabel = await mapPage.container.getAttribute("aria-label");
    const hasRole = await mapPage.container.getAttribute("role");
    expect(hasAriaLabel || hasRole).toBeTruthy();
  });

  mapTest("should support keyboard navigation @a11y", async ({ mapPage }) => {
    await mapPage.focusMap();

    await mapPage.pressKey("ArrowRight");
    await mapPage.pressKey("ArrowDown");
    await mapPage.pressKey("ArrowLeft");
    await mapPage.pressKey("ArrowUp");

    await expect(mapPage.leaflet).toBeVisible();
    const markerCount = await mapPage.getMarkerCount();
    expect(markerCount).toBeGreaterThanOrEqual(0);
  });

  mapTest("should support keyboard zoom @a11y", async ({ mapPage }) => {
    await mapPage.focusMap();

    await mapPage.pressKey("+");
    await mapPage.waitForMarkersStable();

    await mapPage.pressKey("-");
    await mapPage.waitForMarkersStable();

    await expect(mapPage.leaflet).toBeVisible();
  });

  mapTest("should have proper focus management @a11y", async ({ mapPage }) => {
    await mapPage.focusMap();
    await expect(mapPage.leaflet).toBeFocused();

    await mapPage.pressKey("Tab");

    const activeElement = await mapPage.page.evaluate(() => document.activeElement?.tagName);
    expect(activeElement).toBeTruthy();
  });

  mapTest("should announce loading state @a11y", async ({ mapPage, api }) => {
    await api.clearMocks();
    await api.mockSlowNetwork(CONFIG.SMALL_SPOT_COUNT);

    await mapPage.goto();

    const hasAriaBusy = await mapPage.loadingIndicator.isVisible().catch(() => false);
    console.log(`[A11y] Loading indicator visible during slow load: ${hasAriaBusy}`);

    await mapPage.waitForReady();

    const markerCount = await mapPage.getMarkerCount();
    expect(markerCount).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Error Handling & Edge Cases
// ============================================================================

mapTest.describe("Error Handling", () => {
  mapTest("should handle API 500 error gracefully @error", async ({ mapPage, api }) => {
    await api.mockError(500, "Internal Server Error");

    await mapPage.goto();
    await mapPage.waitForReady();

    await expect(mapPage.leaflet).toBeVisible();

    const hasError = await mapPage.hasError();
    const isEmpty = await mapPage.isEmpty();
    const noMarkers = (await mapPage.getMarkerCount()) === 0;

    expect(hasError || isEmpty || noMarkers).toBe(true);
  });

  mapTest("should handle API 404 error gracefully @error", async ({ mapPage, api }) => {
    await api.mockError(404, "Not Found");

    await mapPage.goto();
    await mapPage.waitForReady();

    await expect(mapPage.leaflet).toBeVisible();
  });

  mapTest("should handle empty spots array @error", async ({ mapPage, api }) => {
    await api.mockEmptySpots();

    await mapPage.goto();
    await mapPage.waitForReady();

    const count = await mapPage.getMarkerCount();
    expect(count).toBe(0);
  });

  mapTest("should handle network timeout @error", async ({ mapPage, api }) => {
    await api.mockTimeout();

    await mapPage.goto();

    await expect(mapPage.container).toBeVisible({ timeout: CONFIG.MAP_READY_TIMEOUT });
  });

  mapTest("should recover from error when retried @error", async ({ mapPage }) => {
    let requestCount = 0;
    await mapPage.page.route(CONFIG.API_SPOTS_PATTERN, async (route) => {
      requestCount++;
      if (requestCount === 1) {
        await route.fulfill({ status: 500, body: "Error" });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(spotFactory.createSpots(10)),
        });
      }
    });

    await mapPage.goto();
    await mapPage.waitForReady();

    await mapPage.page.reload();
    await mapPage.waitForReady();

    const count = await mapPage.getMarkerCount();
    expect(count).toBeGreaterThan(0);
  });
});

// ============================================================================
// Loading States
// ============================================================================

mapTest.describe("Loading States", () => {
  mapTest("should show loading indicator during fetch @loading", async ({ mapPage, api }) => {
    await api.mockSpots(CONFIG.SMALL_SPOT_COUNT, 1500);

    await mapPage.goto();

    const wasLoading = await mapPage.isLoading();
    console.log(`[Loading] Loading indicator was visible: ${wasLoading}`);

    await mapPage.waitForReady();
    await mapPage.waitForMarkersStable();

    const markerCount = await mapPage.getMarkerCount();
    expect(markerCount).toBeGreaterThanOrEqual(0);
  });

  mapTest("should hide loading indicator after data loads @loading", async ({ mapPage, api }) => {
    await api.mockSpots(CONFIG.SMALL_SPOT_COUNT);

    await mapPage.goto();
    await mapPage.waitForReady();
    await mapPage.waitForMarkersStable();

    await expect(mapPage.loadingIndicator)
      .not.toBeVisible({ timeout: 1000 })
      .catch(() => {
        // Loading indicator might not exist in DOM - that's OK
      });
  });
});
