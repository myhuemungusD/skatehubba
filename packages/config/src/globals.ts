/**
 * Cross-platform globalThis type for safe property access.
 *
 * Replaces `(globalThis as any)` throughout the config package with a
 * properly typed alternative, enabling type-safe cross-platform checks
 * for Vite's import.meta.env, Node's process.env, and browser globals.
 */
export interface CrossPlatformGlobal {
  import?: { meta?: { env?: Record<string, string | undefined> } };
  process?: { env: Record<string, string | undefined>; versions?: { node?: string } };
  window?: typeof globalThis;
  document?: unknown;
  navigator?: { product?: string; userAgent?: string };
  location?: { origin?: string; hostname?: string };
}

/** Type-safe cross-platform global access */
export const globals = globalThis as unknown as CrossPlatformGlobal;
