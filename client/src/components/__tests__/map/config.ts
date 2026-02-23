/**
 * Test configuration - all magic numbers centralized
 * Immutable to prevent test pollution
 */
export const CONFIG = Object.freeze({
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
  SPOT_TYPES: ["street", "park", "diy"] as const,
  TIERS: ["bronze", "silver", "gold"] as const,

  // Routes
  MAP_ROUTE: "/map",
  API_SPOTS_PATTERN: "**/api/spots**",
});

/**
 * Test IDs - centralized selectors for maintainability
 * Single source of truth for all data-testid attributes
 */
export const SELECTORS = Object.freeze({
  // Map container
  mapContainer: '[data-testid="map-container"]',
  leafletContainer: ".leaflet-container",
  spotMarker: ".custom-spot-marker",

  // Controls
  zoomIn: ".leaflet-control-zoom-in",
  zoomOut: ".leaflet-control-zoom-out",

  // UI Elements (search and filters removed — map is simplified)
  addSpotButton: '[data-testid="button-add-spot-mode"]',

  // States
  loading: '[data-testid="map-loading"], .loading-spinner, [aria-busy="true"]',
  error: '[data-testid="error-message"]',
  empty: '[data-testid="empty-state"]',
  spotDetails: '[data-testid="spot-details"], .leaflet-popup',

  // Accessibility
  skipLink: '[data-testid="skip-to-map"]',
  mapRegion: '[role="application"], [role="region"]',
});
