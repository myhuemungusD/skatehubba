/**
 * Sitemap Configuration
 *
 * Defines URL entries for the sitemap.xml generation.
 * Used by the server to generate SEO-friendly sitemaps.
 *
 * @see https://www.sitemaps.org/protocol.html
 * @module shared/sitemap-config
 */

// ============================================================================
// Types
// ============================================================================

/** Valid change frequency values per sitemap protocol */
export type ChangeFrequency =
  | "always" // Updates on every access
  | "hourly" // Updates every hour
  | "daily" // Updates daily
  | "weekly" // Updates weekly
  | "monthly" // Updates monthly
  | "yearly" // Updates yearly (archives)
  | "never"; // Never changes (historical)

/** Priority range: 0.0 (lowest) to 1.0 (highest) */
export type Priority = number;

/** Configuration for a single sitemap URL entry */
export interface SitemapEntry {
  /** URL path relative to site root (e.g., '/about') */
  path: string;
  /** How frequently the page is likely to change */
  changefreq: ChangeFrequency;
  /** Priority relative to other URLs (0.0-1.0, default 0.5) */
  priority: Priority;
  /** Optional: Last modification date (ISO 8601) */
  lastmod?: string;
  /** Optional: Whether to include in sitemap (default true) */
  enabled?: boolean;
}

/** Page categories for organization */
export type PageCategory = "core" | "features" | "legal" | "dynamic";

/** Extended entry with metadata */
export interface CategorizedEntry extends SitemapEntry {
  category: PageCategory;
  /** Description for documentation */
  description?: string;
}

// ============================================================================
// Configuration
// ============================================================================

/** Base URL for the production site */
export const SITE_BASE_URL = "https://skatehubba.com";

/** Default values for sitemap entries */
export const SITEMAP_DEFAULTS = {
  changefreq: "weekly" as ChangeFrequency,
  priority: 0.5 as Priority,
  enabled: true,
} as const;

// ============================================================================
// Sitemap Entries
// ============================================================================

/**
 * All sitemap entries organized by category
 *
 * Priority Guide:
 * - 1.0: Homepage only
 * - 0.9: Core features (map, game, leaderboard)
 * - 0.8: Secondary pages (profile, shop)
 * - 0.7: Tertiary pages (settings, help)
 * - 0.5: Legal/static pages
 * - 0.3: Archives/low-priority
 */
export const SITEMAP_ENTRIES: readonly CategorizedEntry[] = [
  // -------------------------------------------------------------------------
  // Core Pages
  // -------------------------------------------------------------------------
  {
    path: "/",
    changefreq: "weekly",
    priority: 1.0,
    category: "core",
    description: "Homepage / Landing page",
  },
  {
    path: "/home",
    changefreq: "daily",
    priority: 0.9,
    category: "core",
    description: "Main app dashboard after login",
  },
  {
    path: "/map",
    changefreq: "daily",
    priority: 0.9,
    category: "core",
    description: "Interactive skate spots map",
  },
  {
    path: "/game",
    changefreq: "daily",
    priority: 0.9,
    category: "core",
    description: "Play SKATE challenge lobby",
  },

  // -------------------------------------------------------------------------
  // Feature Pages
  // -------------------------------------------------------------------------
  {
    path: "/leaderboard",
    changefreq: "daily",
    priority: 0.9,
    category: "features",
    description: "Global rankings and stats",
  },
  {
    path: "/spots",
    changefreq: "daily",
    priority: 0.9,
    category: "features",
    description: "Browse all skate spots",
  },
  {
    path: "/shop",
    changefreq: "weekly",
    priority: 0.8,
    category: "features",
    description: "Gear and collectibles shop",
  },
  {
    path: "/closet",
    changefreq: "weekly",
    priority: 0.8,
    category: "features",
    description: "User inventory and collectibles",
  },
  {
    path: "/profile",
    changefreq: "weekly",
    priority: 0.8,
    category: "features",
    description: "User profile page",
  },

  // -------------------------------------------------------------------------
  // Legal Pages
  // -------------------------------------------------------------------------
  {
    path: "/privacy",
    changefreq: "yearly",
    priority: 0.5,
    category: "legal",
    description: "Privacy policy",
  },
  {
    path: "/terms",
    changefreq: "yearly",
    priority: 0.5,
    category: "legal",
    description: "Terms of service",
  },

  // -------------------------------------------------------------------------
  // Dynamic/SEO Pages (generated from data)
  // -------------------------------------------------------------------------
  {
    path: "/demo",
    changefreq: "monthly",
    priority: 0.7,
    category: "dynamic",
    description: "Demo/preview page",
  },
] as const;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get all enabled sitemap entries
 */
export function getEnabledEntries(): SitemapEntry[] {
  return SITEMAP_ENTRIES.filter((entry) => entry.enabled !== false);
}

/**
 * Get entries by category
 */
export function getEntriesByCategory(category: PageCategory): SitemapEntry[] {
  return SITEMAP_ENTRIES.filter((entry) => entry.category === category);
}

/**
 * Generate full URL from path
 */
export function getFullUrl(path: string): string {
  return `${SITE_BASE_URL}${path}`;
}

/**
 * Generate sitemap XML string
 */
export function generateSitemapXml(): string {
  const entries = getEnabledEntries();

  const urls = entries
    .map((entry) => {
      const lastmod = entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : "";
      return `  <url>
    <loc>${getFullUrl(entry.path)}</loc>${lastmod}
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority.toFixed(1)}</priority>
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

/**
 * Validate sitemap entry
 */
export function validateEntry(entry: SitemapEntry): string[] {
  const errors: string[] = [];

  if (!entry.path.startsWith("/")) {
    errors.push(`Path must start with /: ${entry.path}`);
  }

  if (entry.priority < 0 || entry.priority > 1) {
    errors.push(`Priority must be between 0 and 1: ${entry.priority}`);
  }

  return errors;
}

/**
 * Validate all entries and return errors
 */
export function validateAllEntries(): Map<string, string[]> {
  const errorMap = new Map<string, string[]>();

  for (const entry of SITEMAP_ENTRIES) {
    const errors = validateEntry(entry);
    if (errors.length > 0) {
      errorMap.set(entry.path, errors);
    }
  }

  return errorMap;
}
