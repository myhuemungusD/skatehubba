/**
 * Environment Bridge for @skatehubba/config
 *
 * Vite statically replaces `import.meta.env` references at build time,
 * but @skatehubba/config reads env vars from `globalThis.import.meta.env`
 * for cross-platform compatibility (web/mobile/server).
 *
 * In production builds, `globalThis.import` doesn't exist in the browser,
 * so the config package fails to detect the "vite" platform and can't read
 * any environment variables — causing Firebase init to throw and the app
 * to show a blank screen.
 *
 * This bridge exposes the Vite-replaced env object on globalThis so the
 * config package can find it. MUST be imported before any module that
 * transitively uses @skatehubba/config.
 */
const g = globalThis as unknown as Record<string, unknown>;
const imp = (g["import"] ?? {}) as Record<string, unknown>;
const meta = (imp.meta ?? {}) as Record<string, unknown>;
meta.env = import.meta.env;
imp.meta = meta;
g["import"] = imp;
