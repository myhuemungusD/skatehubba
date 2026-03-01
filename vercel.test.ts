/**
 * @fileoverview Tests for vercel.ts — the Vercel project configuration.
 *
 * Validates:
 * - Build, install, output, and framework settings
 * - Security headers on static/SPA routes (OWASP best practices)
 * - API-level CDN headers (defence-in-depth)
 * - Cache-control for immutable assets
 * - Preview vs production environment-aware headers
 * - Rewrite rules (SPA fallback, API routing)
 * - Serverless function configuration (duration, memory)
 * - No sensitive data leaked in exported config
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fresh-import vercel.ts so process.env mutations take effect. */
async function loadConfig() {
  const mod = await import("./vercel.ts");
  return mod;
}

/** Find a header rule whose `source` matches `pattern`. */
function findHeaderRule(
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>,
  pattern: string
) {
  return headers.find((h) => h.source === pattern);
}

/** Extract header value by key from a header rule. */
function getHeaderValue(rule: { headers: Array<{ key: string; value: string }> }, key: string) {
  return rule.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;
}

// =============================================================================
// Build & deployment settings
// =============================================================================

describe("vercel.ts — build and deployment settings", () => {
  let config: Awaited<ReturnType<typeof loadConfig>>["config"];

  beforeEach(async () => {
    vi.resetModules();
    const mod = await loadConfig();
    config = mod.config;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets installCommand to use pnpm with frozen lockfile", () => {
    expect(config.installCommand).toBe("pnpm install --frozen-lockfile");
  });

  it("runs public env verification before building the client", () => {
    expect(config.buildCommand).toContain("verify-public-env.mjs");
    expect(config.buildCommand).toContain("pnpm --filter skatehubba-client build");
  });

  it("outputs to client/dist", () => {
    expect(config.outputDirectory).toBe("client/dist");
  });

  it("uses the vite framework preset", () => {
    expect(config.framework).toBe("vite");
  });
});

// =============================================================================
// Serverless function configuration
// =============================================================================

describe("vercel.ts — serverless function configuration", () => {
  let config: Awaited<ReturnType<typeof loadConfig>>["config"];

  beforeEach(async () => {
    vi.resetModules();
    const mod = await loadConfig();
    config = mod.config;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("configures api/index.ts with 30s max duration and 1024 MB memory", () => {
    const fn = config.functions?.["api/index.ts"];
    expect(fn).toBeDefined();
    expect(fn!.maxDuration).toBe(30);
    expect(fn!.memory).toBe(1024);
  });

  it("configures api/env-check.ts with 10s max duration and 256 MB memory", () => {
    const fn = config.functions?.["api/env-check.ts"];
    expect(fn).toBeDefined();
    expect(fn!.maxDuration).toBe(10);
    expect(fn!.memory).toBe(256);
  });

  it("does not exceed Vercel Pro plan max duration (300s)", () => {
    const fns = config.functions ?? {};
    for (const [name, fn] of Object.entries(fns)) {
      expect(fn.maxDuration, `${name} maxDuration exceeds Pro plan limit`).toBeLessThanOrEqual(300);
    }
  });

  it("sets reasonable memory limits (256–3009 MB)", () => {
    const fns = config.functions ?? {};
    for (const [name, fn] of Object.entries(fns)) {
      if (fn.memory !== undefined) {
        expect(fn.memory, `${name} memory below minimum`).toBeGreaterThanOrEqual(128);
        expect(fn.memory, `${name} memory exceeds maximum`).toBeLessThanOrEqual(3009);
      }
    }
  });
});

// =============================================================================
// Security headers — static / SPA routes
// =============================================================================

describe("vercel.ts — static/SPA security headers", () => {
  let headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  let staticRule: ReturnType<typeof findHeaderRule>;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await loadConfig();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    headers = (mod.config.headers ?? []) as any;
    staticRule = findHeaderRule(headers, "/((?!api/).*)");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies headers to all non-API routes", () => {
    expect(staticRule).toBeDefined();
  });

  it("sets X-Frame-Options to DENY (clickjacking protection)", () => {
    expect(getHeaderValue(staticRule!, "X-Frame-Options")).toBe("DENY");
  });

  it("sets X-Content-Type-Options to nosniff (MIME sniffing protection)", () => {
    expect(getHeaderValue(staticRule!, "X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets strict Referrer-Policy", () => {
    expect(getHeaderValue(staticRule!, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("sets restrictive Permissions-Policy", () => {
    const value = getHeaderValue(staticRule!, "Permissions-Policy")!;
    expect(value).toContain("camera=()");
    expect(value).toContain("microphone=()");
    expect(value).toContain("geolocation=(self)");
    expect(value).toContain("payment=()");
    expect(value).toContain("usb=()");
  });

  it("sets HSTS with 2-year max-age, includeSubDomains, and preload", () => {
    const value = getHeaderValue(staticRule!, "Strict-Transport-Security")!;
    expect(value).toContain("max-age=63072000");
    expect(value).toContain("includeSubDomains");
    expect(value).toContain("preload");
  });

  it("disables DNS prefetching (X-DNS-Prefetch-Control)", () => {
    expect(getHeaderValue(staticRule!, "X-DNS-Prefetch-Control")).toBe("off");
  });

  it("blocks cross-domain policies (X-Permitted-Cross-Domain-Policies)", () => {
    expect(getHeaderValue(staticRule!, "X-Permitted-Cross-Domain-Policies")).toBe("none");
  });

  it("HSTS max-age is at least 1 year (31536000s)", () => {
    const value = getHeaderValue(staticRule!, "Strict-Transport-Security")!;
    const match = value.match(/max-age=(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(31536000);
  });
});

// =============================================================================
// Security headers — API routes (defence-in-depth)
// =============================================================================

describe("vercel.ts — API security headers", () => {
  let headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  let apiRule: ReturnType<typeof findHeaderRule>;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await loadConfig();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    headers = (mod.config.headers ?? []) as any;
    apiRule = findHeaderRule(headers, "/api/(.*)");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies headers to API routes", () => {
    expect(apiRule).toBeDefined();
  });

  it("sets X-Content-Type-Options to nosniff on API routes", () => {
    expect(getHeaderValue(apiRule!, "X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets X-Frame-Options to DENY on API routes", () => {
    expect(getHeaderValue(apiRule!, "X-Frame-Options")).toBe("DENY");
  });

  it("prevents caching of API responses at CDN level", () => {
    const value = getHeaderValue(apiRule!, "Cache-Control")!;
    expect(value).toContain("no-store");
    expect(value).toContain("no-cache");
    expect(value).toContain("must-revalidate");
    expect(value).toContain("proxy-revalidate");
  });

  it("sets Pragma: no-cache for HTTP/1.0 backwards compatibility", () => {
    expect(getHeaderValue(apiRule!, "Pragma")).toBe("no-cache");
  });

  it("sets Expires: 0 for legacy cache invalidation", () => {
    expect(getHeaderValue(apiRule!, "Expires")).toBe("0");
  });
});

// =============================================================================
// Cache control — immutable assets
// =============================================================================

describe("vercel.ts — cache control for static assets", () => {
  let headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  let assetRule: ReturnType<typeof findHeaderRule>;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await loadConfig();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    headers = (mod.config.headers ?? []) as any;
    assetRule = findHeaderRule(headers, "/assets/(.*)");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies cache-control to /assets/ paths", () => {
    expect(assetRule).toBeDefined();
  });

  it("sets immutable cache with 1-year max-age", () => {
    const value = getHeaderValue(assetRule!, "Cache-Control")!;
    expect(value).toContain("public");
    expect(value).toContain("max-age=31536000");
    expect(value).toContain("immutable");
  });
});

// =============================================================================
// Rewrite rules — SPA fallback and API routing
// =============================================================================

describe("vercel.ts — rewrite rules", () => {
  let rewrites: Array<{ source: string; destination: string }>;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await loadConfig();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rewrites = (mod.config.rewrites ?? []) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has exactly 3 rewrite rules", () => {
    expect(rewrites).toHaveLength(3);
  });

  it("routes /api/env-check to its own endpoint (explicit match before wildcard)", () => {
    const rule = rewrites.find((r) => r.source === "/api/env-check");
    expect(rule).toBeDefined();
    expect(rule!.destination).toBe("/api/env-check");
  });

  it("routes all other /api/* requests to the main API function", () => {
    const rule = rewrites.find((r) => r.source === "/api/(.*)");
    expect(rule).toBeDefined();
    expect(rule!.destination).toBe("/api");
  });

  it("falls back non-API routes to index.html (SPA routing)", () => {
    const rule = rewrites.find((r) => r.source === "/((?!api/).*)");
    expect(rule).toBeDefined();
    expect(rule!.destination).toBe("/index.html");
  });

  it("places env-check before the wildcard api rule (order matters)", () => {
    const envCheckIdx = rewrites.findIndex((r) => r.source === "/api/env-check");
    const wildcardIdx = rewrites.findIndex((r) => r.source === "/api/(.*)");
    expect(envCheckIdx).toBeLessThan(wildcardIdx);
  });

  it("places SPA fallback last", () => {
    const spaIdx = rewrites.findIndex((r) => r.source === "/((?!api/).*)");
    expect(spaIdx).toBe(rewrites.length - 1);
  });
});

// =============================================================================
// Environment-aware headers — production vs preview
// =============================================================================

describe("vercel.ts — environment-aware configuration", () => {
  const originalEnv = process.env.VERCEL_ENV;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    if (originalEnv !== undefined) {
      process.env.VERCEL_ENV = originalEnv;
    } else {
      delete process.env.VERCEL_ENV;
    }
  });

  it("adds X-Robots-Tag noindex on preview deployments", async () => {
    process.env.VERCEL_ENV = "preview";
    vi.resetModules();
    const mod = await import("./vercel.ts");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const headers = (mod.config.headers ?? []) as any;
    const staticRule = findHeaderRule(headers, "/((?!api/).*)");
    expect(getHeaderValue(staticRule!, "X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("adds X-Robots-Tag noindex on development deployments", async () => {
    process.env.VERCEL_ENV = "development";
    vi.resetModules();
    const mod = await import("./vercel.ts");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const headers = (mod.config.headers ?? []) as any;
    const staticRule = findHeaderRule(headers, "/((?!api/).*)");
    expect(getHeaderValue(staticRule!, "X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("does NOT add X-Robots-Tag on production deployments", async () => {
    process.env.VERCEL_ENV = "production";
    vi.resetModules();
    const mod = await import("./vercel.ts");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const headers = (mod.config.headers ?? []) as any;
    const staticRule = findHeaderRule(headers, "/((?!api/).*)");
    expect(getHeaderValue(staticRule!, "X-Robots-Tag")).toBeUndefined();
  });

  it("adds X-Robots-Tag to API routes on preview", async () => {
    process.env.VERCEL_ENV = "preview";
    vi.resetModules();
    const mod = await import("./vercel.ts");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const headers = (mod.config.headers ?? []) as any;
    const apiRule = findHeaderRule(headers, "/api/(.*)");
    expect(getHeaderValue(apiRule!, "X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("does NOT add X-Robots-Tag to API routes on production", async () => {
    process.env.VERCEL_ENV = "production";
    vi.resetModules();
    const mod = await import("./vercel.ts");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const headers = (mod.config.headers ?? []) as any;
    const apiRule = findHeaderRule(headers, "/api/(.*)");
    expect(getHeaderValue(apiRule!, "X-Robots-Tag")).toBeUndefined();
  });

  it("exports isProduction as true when VERCEL_ENV=production", async () => {
    process.env.VERCEL_ENV = "production";
    vi.resetModules();
    const mod = await import("./vercel.ts");
    expect(mod.isProduction).toBe(true);
  });

  it("exports isProduction as false when VERCEL_ENV is unset", async () => {
    delete process.env.VERCEL_ENV;
    vi.resetModules();
    const mod = await import("./vercel.ts");
    expect(mod.isProduction).toBe(false);
  });

  it("exports isProduction as false when VERCEL_ENV=preview", async () => {
    process.env.VERCEL_ENV = "preview";
    vi.resetModules();
    const mod = await import("./vercel.ts");
    expect(mod.isProduction).toBe(false);
  });
});

// =============================================================================
// Exported arrays — securityHeaders and apiHeaders
// =============================================================================

describe("vercel.ts — exported header arrays", () => {
  let securityHeaders: Awaited<ReturnType<typeof loadConfig>>["securityHeaders"];
  let apiHeaders: Awaited<ReturnType<typeof loadConfig>>["apiHeaders"];

  beforeEach(async () => {
    vi.resetModules();
    const mod = await loadConfig();
    securityHeaders = mod.securityHeaders;
    apiHeaders = mod.apiHeaders;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports securityHeaders with 7 entries", () => {
    expect(securityHeaders).toHaveLength(7);
  });

  it("exports apiHeaders with 5 entries", () => {
    expect(apiHeaders).toHaveLength(5);
  });

  it("securityHeaders keys are all non-empty strings", () => {
    for (const h of securityHeaders) {
      expect(h.key.length).toBeGreaterThan(0);
      expect(h.value.length).toBeGreaterThan(0);
    }
  });

  it("apiHeaders keys are all non-empty strings", () => {
    for (const h of apiHeaders) {
      expect(h.key.length).toBeGreaterThan(0);
      expect(h.value.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// Security audit — no sensitive data in config
// =============================================================================

describe("vercel.ts — security audit", () => {
  let configStr: string;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await loadConfig();
    configStr = JSON.stringify(mod.config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not contain API keys or secrets", () => {
    const sensitivePatterns = [
      /api[_-]?key/i,
      /secret/i,
      /password/i,
      /private[_-]?key/i,
      /token/i,
      /bearer/i,
    ];
    for (const pattern of sensitivePatterns) {
      expect(configStr, `config contains sensitive pattern: ${pattern}`).not.toMatch(pattern);
    }
  });

  it("does not contain hardcoded URLs to internal services", () => {
    expect(configStr).not.toContain("localhost");
    expect(configStr).not.toContain("127.0.0.1");
    expect(configStr).not.toContain("0.0.0.0");
  });

  it("does not expose database connection strings", () => {
    expect(configStr).not.toMatch(/postgresql:\/\//i);
    expect(configStr).not.toMatch(/mongodb:\/\//i);
    expect(configStr).not.toMatch(/redis:\/\//i);
  });

  it("does not contain environment variable values (only references)", () => {
    expect(configStr).not.toContain("process.env");
  });
});
