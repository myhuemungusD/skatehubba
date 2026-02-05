import {
  SITE_BASE_URL,
  SITEMAP_ENTRIES,
  SITEMAP_DEFAULTS,
  getEnabledEntries,
  getEntriesByCategory,
  getFullUrl,
  generateSitemapXml,
  validateEntry,
  validateAllEntries,
} from "../sitemap-config";

describe("SITE_BASE_URL", () => {
  it("is the production URL", () => {
    expect(SITE_BASE_URL).toBe("https://skatehubba.com");
  });
});

describe("SITEMAP_DEFAULTS", () => {
  it("has weekly change frequency", () => {
    expect(SITEMAP_DEFAULTS.changefreq).toBe("weekly");
  });

  it("has 0.5 priority", () => {
    expect(SITEMAP_DEFAULTS.priority).toBe(0.5);
  });

  it("is enabled by default", () => {
    expect(SITEMAP_DEFAULTS.enabled).toBe(true);
  });
});

describe("SITEMAP_ENTRIES", () => {
  it("has entries defined", () => {
    expect(SITEMAP_ENTRIES.length).toBeGreaterThan(0);
  });

  it("includes homepage at root path", () => {
    const homepage = SITEMAP_ENTRIES.find((e) => e.path === "/");
    expect(homepage).toBeDefined();
    expect(homepage!.priority).toBe(1.0);
    expect(homepage!.category).toBe("core");
  });

  it("all paths start with /", () => {
    for (const entry of SITEMAP_ENTRIES) {
      expect(entry.path).toMatch(/^\//);
    }
  });

  it("all priorities are between 0 and 1", () => {
    for (const entry of SITEMAP_ENTRIES) {
      expect(entry.priority).toBeGreaterThanOrEqual(0);
      expect(entry.priority).toBeLessThanOrEqual(1);
    }
  });

  it("has all required categories represented", () => {
    const categories = new Set(SITEMAP_ENTRIES.map((e) => e.category));
    expect(categories.has("core")).toBe(true);
    expect(categories.has("features")).toBe(true);
    expect(categories.has("legal")).toBe(true);
  });
});

describe("getEnabledEntries", () => {
  it("returns all entries when none are disabled", () => {
    const enabled = getEnabledEntries();
    expect(enabled.length).toBe(SITEMAP_ENTRIES.length);
  });
});

describe("getEntriesByCategory", () => {
  it("returns only core entries", () => {
    const core = getEntriesByCategory("core");
    expect(core.length).toBeGreaterThan(0);
    expect(core.every((e) => e.category === "core")).toBe(true);
  });

  it("returns only legal entries", () => {
    const legal = getEntriesByCategory("legal");
    expect(legal.length).toBeGreaterThan(0);
    expect(legal.every((e) => e.category === "legal")).toBe(true);
  });

  it("returns empty for nonexistent category", () => {
    const result = getEntriesByCategory("nonexistent" as any);
    expect(result.length).toBe(0);
  });
});

describe("getFullUrl", () => {
  it("joins base URL with path", () => {
    expect(getFullUrl("/about")).toBe("https://skatehubba.com/about");
    expect(getFullUrl("/")).toBe("https://skatehubba.com/");
  });
});

describe("generateSitemapXml", () => {
  it("generates valid XML structure", () => {
    const xml = generateSitemapXml();
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<urlset");
    expect(xml).toContain("</urlset>");
  });

  it("includes loc elements with full URLs", () => {
    const xml = generateSitemapXml();
    expect(xml).toContain("<loc>https://skatehubba.com/</loc>");
  });

  it("includes changefreq and priority", () => {
    const xml = generateSitemapXml();
    expect(xml).toContain("<changefreq>");
    expect(xml).toContain("<priority>");
  });

  it("has one url block per enabled entry", () => {
    const xml = generateSitemapXml();
    const urlCount = (xml.match(/<url>/g) || []).length;
    expect(urlCount).toBe(getEnabledEntries().length);
  });
});

describe("validateEntry", () => {
  it("returns no errors for valid entry", () => {
    const errors = validateEntry({ path: "/test", changefreq: "weekly", priority: 0.5 });
    expect(errors).toEqual([]);
  });

  it("reports error for path not starting with /", () => {
    const errors = validateEntry({ path: "test", changefreq: "weekly", priority: 0.5 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("Path must start with /");
  });

  it("reports error for priority out of range", () => {
    const errors = validateEntry({ path: "/test", changefreq: "weekly", priority: 1.5 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("Priority");
  });

  it("reports error for negative priority", () => {
    const errors = validateEntry({ path: "/test", changefreq: "weekly", priority: -0.1 });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("validateAllEntries", () => {
  it("returns no errors for built-in entries", () => {
    const errors = validateAllEntries();
    expect(errors.size).toBe(0);
  });
});
