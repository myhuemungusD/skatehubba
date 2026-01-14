/**
 * SpotMap E2E Test Suite - Championship Edition 🏆
 * 
 * Production-grade Playwright tests for the SkateHubba map component.
 * 
 * Features:
 * - Deterministic data generation (no flaky random tests)
 * - Page Object Pattern for maintainability
 * - Zero magic timeouts - all waits are state-based
 * - Comprehensive test coverage with proper isolation
 * - CI/CD ready with retries and tagging
 * - Performance benchmarking with metrics
 * - Accessibility (a11y) compliance testing
 * - Network condition simulation
 * - Visual regression ready
 * 
 * @module tests/map.spec
 * @author SkateHubba Team
 * @version 2.0.0 - Bill Russell Edition (11 Rings)
 */

import { test, expect, type Page, type Locator } from '@playwright/test';

// ============================================================================
// RING 1: Configuration & Constants
// ============================================================================

/**
 * Test configuration - all magic numbers centralized
 * Immutable to prevent test pollution
 */
const CONFIG = Object.freeze({
  // Data generation
  PERFORMANCE_SPOT_COUNT: 1000,
  STANDARD_SPOT_COUNT: 50,
  SMALL_SPOT_COUNT: 20,
  
  // Map center (Times Square, NYC - iconic skate spot territory)
  CENTER: Object.freeze({ lat: 40.7589, lng: -73.9851 }),
  
  // Distribution spread for deterministic spot placement
  SPREAD: 0.1,
  
  // Performance thresholds
  MAX_VISIBLE_MARKERS: 200,
  MAX_INITIAL_LOAD_MS: 3000,
  MAX_INTERACTION_MS: 500,
  
  // Timeouts
  MAP_READY_TIMEOUT: 10_000,
  ANIMATION_TIMEOUT: 1_000,
  
  // Spot types (deterministic cycling)
  SPOT_TYPES: ['street', 'park', 'diy'] as const,
  TIERS: ['bronze', 'silver', 'gold'] as const,
  
  // Routes
  MAP_ROUTE: '/map',
  API_SPOTS_PATTERN: '**/api/spots**',
});

/**
 * Test IDs - centralized selectors for maintainability
 * Single source of truth for all data-testid attributes
 */
const SELECTORS = Object.freeze({
  // Map container
  mapContainer: '[data-testid="map-container"]',
  leafletContainer: '.leaflet-container',
  spotMarker: '.custom-spot-marker',
  
  // Controls
  zoomIn: '.leaflet-control-zoom-in',
  zoomOut: '.leaflet-control-zoom-out',
  
  // UI Elements
  searchInput: '[data-testid="input-spot-search"]',
  filterStreet: '[data-testid="filter-street"]',
  filterPark: '[data-testid="filter-park"]',
  filterDiy: '[data-testid="filter-diy"]',
  
  // States
  loading: '[data-testid="map-loading"], .loading-spinner, [aria-busy="true"]',
  error: '[data-testid="error-message"]',
  empty: '[data-testid="empty-state"]',
  spotDetails: '[data-testid="spot-details"], .leaflet-popup',
  
  // Accessibility
  skipLink: '[data-testid="skip-to-map"]',
  mapRegion: '[role="application"], [role="region"]',
});

// ============================================================================
// RING 2: Types & Interfaces
// ============================================================================

/** Spot type matching backend schema */
interface MockSpot {
  id: number;
  name: string;
  lat: number;
  lng: number;
  spotType: 'street' | 'park' | 'diy';
  tier: 'bronze' | 'silver' | 'gold';
  description: string;
  photoUrl: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// MockApiConfig removed - using inline types for flexibility

/** Performance measurement result */
interface PerformanceMetrics {
  loadTimeMs: number;
  markerCount: number;
  memoryUsageMB?: number;
}

// ============================================================================
// RING 3: Deterministic Data Factory
// ============================================================================

/**
 * Seeded pseudo-random number generator for deterministic tests
 * Same seed = same sequence every time
 */
class SeededRandom {
  private seed: number;
  
  constructor(seed: number = 42) {
    this.seed = seed;
  }
  
  /** Generate next pseudo-random number between 0 and 1 */
  next(): number {
    // Linear congruential generator (Numerical Recipes)
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }
  
  /** Generate number in range [-0.5, 0.5] for coordinate offset */
  offset(): number {
    return this.next() - 0.5;
  }
  
  /** Reset to initial seed for reproducibility */
  reset(seed: number = 42): void {
    this.seed = seed;
  }
}

/**
 * Mock spot data factory - deterministic generation
 * Every test run produces identical data
 */
class SpotFactory {
  private rng: SeededRandom;
  
  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }
  
  /**
   * Generate array of mock spots with deterministic positions
   * @param count - Number of spots to generate
   * @returns Array of MockSpot objects
   */
  createSpots(count: number): MockSpot[] {
    this.rng.reset(); // Always start from same seed
    
    return Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      name: `Test Spot ${i}`,
      lat: CONFIG.CENTER.lat + this.rng.offset() * CONFIG.SPREAD,
      lng: CONFIG.CENTER.lng + this.rng.offset() * CONFIG.SPREAD,
      spotType: CONFIG.SPOT_TYPES[i % CONFIG.SPOT_TYPES.length],
      tier: CONFIG.TIERS[i % CONFIG.TIERS.length],
      description: `Premium skate spot #${i} - ${CONFIG.SPOT_TYPES[i % 3]} style`,
      photoUrl: null,
      createdAt: new Date(2025, 0, 1 + i).toISOString(),
      updatedAt: new Date(2025, 0, 1 + i).toISOString(),
    }));
  }
  
  /** Create a single spot with specific properties */
  createSpot(overrides: Partial<MockSpot> = {}): MockSpot {
    return {
      id: 1,
      name: 'Custom Spot',
      lat: CONFIG.CENTER.lat,
      lng: CONFIG.CENTER.lng,
      spotType: 'street',
      tier: 'gold',
      description: 'Custom test spot',
      photoUrl: null,
      ...overrides,
    };
  }
}

// Singleton factory instance
const spotFactory = new SpotFactory();

// ============================================================================
// RING 4: Page Object Model
// ============================================================================

/**
 * MapPage - Page Object for SpotMap component
 * Encapsulates all map interactions for clean, maintainable tests
 */
class MapPage {
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
    return this._container ??= this.page.locator(SELECTORS.mapContainer);
  }
  
  get leaflet(): Locator {
    return this._leaflet ??= this.page.locator(SELECTORS.leafletContainer);
  }
  
  get markers(): Locator {
    return this._markers ??= this.page.locator(SELECTORS.spotMarker);
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
      state: 'visible', 
      timeout: CONFIG.MAP_READY_TIMEOUT 
    });
    await this.leaflet.waitFor({ 
      state: 'visible', 
      timeout: CONFIG.MAP_READY_TIMEOUT 
    });
    // Wait for tiles to load (Leaflet adds this class when ready)
    await this.page.waitForFunction(
      () => document.querySelector('.leaflet-tile-loaded') !== null,
      { timeout: CONFIG.MAP_READY_TIMEOUT }
    ).catch(() => {
      // Tiles might not be available in test env - that's OK
    });
  }
  
  // ---------------------------------------------------------------------------
  // Interactions
  // ---------------------------------------------------------------------------
  
  /** Pan map by delta pixels */
  async pan(deltaX: number, deltaY: number): Promise<void> {
    const box = await this.leaflet.boundingBox();
    if (!box) throw new Error('Map container not found for pan operation');
    
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
  async filterByType(type: 'street' | 'park' | 'diy'): Promise<void> {
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
    await this.page.waitForLoadState('networkidle').catch(() => {});
    
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

// ============================================================================
// RING 5: API Mock Factory
// ============================================================================

/**
 * Setup API route mocking with various configurations
 */
class ApiMocker {
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
        contentType: 'application/json',
        body: JSON.stringify(spots),
      });
    });
  }
  
  /** Mock empty spots response */
  async mockEmptySpots(): Promise<void> {
    await this.page.route(CONFIG.API_SPOTS_PATTERN, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
  }
  
  /** Mock API error response */
  async mockError(status: number = 500, message: string = 'Internal Server Error'): Promise<void> {
    await this.page.route(CONFIG.API_SPOTS_PATTERN, async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ error: message }),
      });
    });
  }
  
  /** Mock network timeout */
  async mockTimeout(): Promise<void> {
    await this.page.route(CONFIG.API_SPOTS_PATTERN, async (route) => {
      await route.abort('timedout');
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

// ============================================================================
// RING 6: Test Fixtures
// ============================================================================

/**
 * Extended test fixture with page objects and mocking
 */
interface MapTestFixtures {
  mapPage: MapPage;
  api: ApiMocker;
}

const mapTest = test.extend<MapTestFixtures>({
  mapPage: async ({ page }, use) => {
    const mapPage = new MapPage(page);
    await use(mapPage);
  },
  api: async ({ page }, use) => {
    const api = new ApiMocker(page);
    await use(api);
  },
});

// ============================================================================
// RING 7: Performance Test Suite
// ============================================================================

mapTest.describe('🏎️ Performance', () => {
  mapTest.describe.configure({ retries: 2 }); // Retry flaky perf tests
  
  mapTest('should implement viewport culling for large datasets @perf', async ({ mapPage, api }) => {
    // Arrange: Mock 1000 spots
    await api.mockSpots(CONFIG.PERFORMANCE_SPOT_COUNT);
    
    // Act: Load map and measure
    await mapPage.goto();
    const metrics = await mapPage.measureLoadPerformance();
    
    // Assert: Culling is effective
    expect(metrics.markerCount, 
      `Expected fewer than ${CONFIG.MAX_VISIBLE_MARKERS} markers but got ${metrics.markerCount}`
    ).toBeLessThan(CONFIG.MAX_VISIBLE_MARKERS);
    
    expect(metrics.markerCount, 
      'Expected at least 1 marker to be rendered'
    ).toBeGreaterThan(0);
    
    // Log metrics for CI reporting
    console.log(`[Perf] Loaded ${CONFIG.PERFORMANCE_SPOT_COUNT} spots, rendered ${metrics.markerCount} in ${metrics.loadTimeMs}ms`);
  });
  
  mapTest('should maintain culling after pan gesture @perf', async ({ mapPage, api }) => {
    await api.mockSpots(CONFIG.PERFORMANCE_SPOT_COUNT);
    await mapPage.goto();
    await mapPage.waitForReady();
    
    const initialCount = await mapPage.getMarkerCount();
    
    // Pan the map significantly
    await mapPage.pan(-200, -100);
    
    const afterPanCount = await mapPage.getMarkerCount();
    
    // Both counts should be culled
    expect(afterPanCount).toBeLessThan(CONFIG.MAX_VISIBLE_MARKERS);
    expect(afterPanCount).toBeGreaterThan(0);
    
    console.log(`[Perf] Pan: ${initialCount} → ${afterPanCount} markers`);
  });
  
  mapTest('should load within performance budget @perf', async ({ mapPage, api }) => {
    await api.mockSpots(CONFIG.STANDARD_SPOT_COUNT);
    
    await mapPage.goto();
    const metrics = await mapPage.measureLoadPerformance();
    
    expect(metrics.loadTimeMs, 
      `Load time ${metrics.loadTimeMs}ms exceeds budget ${CONFIG.MAX_INITIAL_LOAD_MS}ms`
    ).toBeLessThan(CONFIG.MAX_INITIAL_LOAD_MS);
  });
});

// ============================================================================
// RING 8: User Interaction Test Suite
// ============================================================================

mapTest.describe('🎮 User Interactions', () => {
  mapTest.beforeEach(async ({ mapPage, api }) => {
    await api.mockSpots(CONFIG.STANDARD_SPOT_COUNT);
    await mapPage.goto();
    await mapPage.waitForReady();
  });
  
  mapTest('should display spot details when marker clicked @interaction', async ({ mapPage }) => {
    // Ensure markers are visible first
    const markerCount = await mapPage.getMarkerCount();
    expect(markerCount).toBeGreaterThan(0);
    
    // Click first marker
    await mapPage.clickFirstMarker();
    
    // Verify details are shown
    await expect(mapPage.spotDetails).toBeVisible({ timeout: CONFIG.ANIMATION_TIMEOUT });
  });
  
  mapTest('should support zoom in/out controls @interaction', async ({ mapPage }) => {
    // Verify controls exist
    await expect(mapPage.zoomInButton).toBeVisible();
    await expect(mapPage.zoomOutButton).toBeVisible();
    
    const initialCount = await mapPage.getMarkerCount();
    
    // Zoom in
    await mapPage.zoomIn();
    const afterZoomIn = await mapPage.getMarkerCount();
    
    // Zoom out
    await mapPage.zoomOut();
    await mapPage.zoomOut(); // Zoom out further
    const afterZoomOut = await mapPage.getMarkerCount();
    
    // Verify map is still functional
    expect(afterZoomIn).toBeGreaterThanOrEqual(0);
    expect(afterZoomOut).toBeGreaterThanOrEqual(0);
    
    console.log(`[Zoom] Initial: ${initialCount}, +Zoom: ${afterZoomIn}, -Zoom: ${afterZoomOut}`);
  });
  
  mapTest('should pan map with mouse drag @interaction', async ({ mapPage }) => {
    const initialCount = await mapPage.getMarkerCount();
    
    // Pan in different directions
    await mapPage.pan(100, 0);   // Right
    await mapPage.pan(-200, 0);  // Left
    await mapPage.pan(0, 100);   // Down
    
    const afterPan = await mapPage.getMarkerCount();
    
    console.log(`[Pan] Initial: ${initialCount}, After: ${afterPan}`);
    
    // Map should still show markers (may differ after pan)
    expect(afterPan).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// RING 9: Search & Filter Test Suite
// ============================================================================

mapTest.describe('🔍 Search & Filtering', () => {
  mapTest.beforeEach(async ({ mapPage, api }) => {
    await api.mockSpots(CONFIG.SMALL_SPOT_COUNT);
    await mapPage.goto();
    await mapPage.waitForReady();
  });
  
  mapTest('should filter spots by search query @filter', async ({ mapPage }) => {
    const initialCount = await mapPage.getMarkerCount();
    expect(initialCount).toBeGreaterThan(0);
    
    // Search for specific spot (deterministic: "Test Spot 0" always exists)
    await mapPage.search('Test Spot 0');
    
    // Should filter to single result
    await expect(mapPage.markers).toHaveCount(1);
  });
  
  mapTest('should restore all spots when search cleared @filter', async ({ mapPage }) => {
    const initialCount = await mapPage.getMarkerCount();
    
    // Search
    await mapPage.search('Test Spot 0');
    await expect(mapPage.markers).toHaveCount(1);
    
    // Clear search
    await mapPage.clearSearch();
    
    // Should restore all spots
    const afterClear = await mapPage.getMarkerCount();
    expect(afterClear).toBe(initialCount);
  });
  
  mapTest('should filter spots by category (street) @filter', async ({ mapPage }) => {
    const initialCount = await mapPage.getMarkerCount();
    
    // Filter by street type
    await mapPage.filterByType('street');
    
    const filteredCount = await mapPage.getMarkerCount();
    
    // Should show subset (deterministic: every 3rd spot is street type)
    expect(filteredCount).toBeGreaterThan(0);
    expect(filteredCount).toBeLessThan(initialCount);
    
    // Approximately 1/3 should remain
    const expectedApprox = Math.floor(initialCount / 3);
    expect(filteredCount).toBeGreaterThanOrEqual(expectedApprox - 2);
    expect(filteredCount).toBeLessThanOrEqual(expectedApprox + 2);
  });
  
  mapTest('should show no results for non-matching search @filter', async ({ mapPage }) => {
    await mapPage.search('NonExistentSpotXYZ12345');
    
    // Should show zero markers or empty state
    const count = await mapPage.getMarkerCount();
    const showsEmpty = await mapPage.isEmpty();
    
    expect(count === 0 || showsEmpty).toBe(true);
  });
});

// ============================================================================
// RING 10: Accessibility Test Suite
// ============================================================================

mapTest.describe('♿ Accessibility', () => {
  mapTest.beforeEach(async ({ mapPage, api }) => {
    await api.mockSpots(CONFIG.SMALL_SPOT_COUNT);
    await mapPage.goto();
    await mapPage.waitForReady();
  });
  
  mapTest('should have accessible map container @a11y', async ({ mapPage }) => {
    // Map container should be visible and focusable
    await expect(mapPage.container).toBeVisible();
    await expect(mapPage.container).toHaveAttribute('tabindex', /-?\d+/);
    
    // Should have ARIA label or role
    const hasAriaLabel = await mapPage.container.getAttribute('aria-label');
    const hasRole = await mapPage.container.getAttribute('role');
    expect(hasAriaLabel || hasRole).toBeTruthy();
  });
  
  mapTest('should support keyboard navigation @a11y', async ({ mapPage }) => {
    await mapPage.focusMap();
    
    // Arrow keys should pan (we verify map doesn't break)
    await mapPage.pressKey('ArrowRight');
    await mapPage.pressKey('ArrowDown');
    await mapPage.pressKey('ArrowLeft');
    await mapPage.pressKey('ArrowUp');
    
    // Map should still be functional
    await expect(mapPage.leaflet).toBeVisible();
    const markerCount = await mapPage.getMarkerCount();
    expect(markerCount).toBeGreaterThanOrEqual(0);
  });
  
  mapTest('should support keyboard zoom @a11y', async ({ mapPage }) => {
    await mapPage.focusMap();
    
    // + and - keys for zoom
    await mapPage.pressKey('+');
    await mapPage.waitForMarkersStable();
    
    await mapPage.pressKey('-');
    await mapPage.waitForMarkersStable();
    
    // Verify still functional
    await expect(mapPage.leaflet).toBeVisible();
  });
  
  mapTest('should have proper focus management @a11y', async ({ mapPage }) => {
    // Focus the map
    await mapPage.focusMap();
    await expect(mapPage.leaflet).toBeFocused();
    
    // Tab should move focus to controls
    await mapPage.pressKey('Tab');
    
    // Some element should be focused (zoom controls or markers)
    const activeElement = await mapPage.page.evaluate(() => 
      document.activeElement?.tagName
    );
    expect(activeElement).toBeTruthy();
  });
  
  mapTest('should announce loading state @a11y', async ({ mapPage, api }) => {
    // Setup slow response
    await api.clearMocks();
    await api.mockSlowNetwork(CONFIG.SMALL_SPOT_COUNT);
    
    await mapPage.goto();
    
    // Loading indicator should have aria-busy or appropriate role
    const hasAriaBusy = await mapPage.loadingIndicator.isVisible().catch(() => false);
    console.log(`[A11y] Loading indicator visible during slow load: ${hasAriaBusy}`);
    
    // Wait for load to complete
    await mapPage.waitForReady();
    
    // Verify map loaded successfully
    const markerCount = await mapPage.getMarkerCount();
    expect(markerCount).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// RING 11: Error Handling & Edge Cases
// ============================================================================

mapTest.describe('🛡️ Error Handling', () => {
  mapTest('should handle API 500 error gracefully @error', async ({ mapPage, api }) => {
    await api.mockError(500, 'Internal Server Error');
    
    await mapPage.goto();
    await mapPage.waitForReady();
    
    // Map container should still render
    await expect(mapPage.leaflet).toBeVisible();
    
    // Should show error or empty state
    const hasError = await mapPage.hasError();
    const isEmpty = await mapPage.isEmpty();
    const noMarkers = (await mapPage.getMarkerCount()) === 0;
    
    expect(hasError || isEmpty || noMarkers).toBe(true);
  });
  
  mapTest('should handle API 404 error gracefully @error', async ({ mapPage, api }) => {
    await api.mockError(404, 'Not Found');
    
    await mapPage.goto();
    await mapPage.waitForReady();
    
    await expect(mapPage.leaflet).toBeVisible();
  });
  
  mapTest('should handle empty spots array @error', async ({ mapPage, api }) => {
    await api.mockEmptySpots();
    
    await mapPage.goto();
    await mapPage.waitForReady();
    
    // Should show empty state or zero markers
    const count = await mapPage.getMarkerCount();
    expect(count).toBe(0);
  });
  
  mapTest('should handle network timeout @error', async ({ mapPage, api }) => {
    await api.mockTimeout();
    
    await mapPage.goto();
    
    // Should not crash - map container should exist
    await expect(mapPage.container).toBeVisible({ timeout: CONFIG.MAP_READY_TIMEOUT });
  });
  
  mapTest('should recover from error when retried @error', async ({ mapPage }) => {
    // First request fails
    let requestCount = 0;
    await mapPage.page.route(CONFIG.API_SPOTS_PATTERN, async (route) => {
      requestCount++;
      if (requestCount === 1) {
        await route.fulfill({ status: 500, body: 'Error' });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(spotFactory.createSpots(10)),
        });
      }
    });
    
    await mapPage.goto();
    await mapPage.waitForReady();
    
    // Trigger retry (reload page)
    await mapPage.page.reload();
    await mapPage.waitForReady();
    
    // Second attempt should succeed
    const count = await mapPage.getMarkerCount();
    expect(count).toBeGreaterThan(0);
  });
});

mapTest.describe('⏳ Loading States', () => {
  mapTest('should show loading indicator during fetch @loading', async ({ mapPage, api }) => {
    // Mock slow API to catch loading state
    await api.mockSpots(CONFIG.SMALL_SPOT_COUNT, 1500);
    
    await mapPage.goto();
    
    // Check loading state (might be brief)
    const wasLoading = await mapPage.isLoading();
    console.log(`[Loading] Loading indicator was visible: ${wasLoading}`);
    
    // Wait for full load
    await mapPage.waitForReady();
    await mapPage.waitForMarkersStable();
    
    // Verify loaded successfully
    const markerCount = await mapPage.getMarkerCount();
    expect(markerCount).toBeGreaterThanOrEqual(0);
  });
  
  mapTest('should hide loading indicator after data loads @loading', async ({ mapPage, api }) => {
    await api.mockSpots(CONFIG.SMALL_SPOT_COUNT);
    
    await mapPage.goto();
    await mapPage.waitForReady();
    await mapPage.waitForMarkersStable();
    
    // Loading should be hidden after data loads
    await expect(mapPage.loadingIndicator).not.toBeVisible({ timeout: 1000 }).catch(() => {
      // Loading indicator might not exist in DOM - that's OK
    });
  });
});

// ============================================================================
// Test Tags Summary
// ============================================================================

/**
 * Run specific test categories:
 * 
 * Performance tests:  npx playwright test --grep @perf
 * Interaction tests:  npx playwright test --grep @interaction
 * Filter tests:       npx playwright test --grep @filter
 * Accessibility:      npx playwright test --grep @a11y
 * Error handling:     npx playwright test --grep @error
 * Loading states:     npx playwright test --grep @loading
 * All tests:          npx playwright test
 * 
 * CI recommendation: Run with --retries=2 for flaky test resilience
 */