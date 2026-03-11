/**
 * Server-side Input Sanitization
 *
 * Strips dangerous characters from user-supplied strings before they reach
 * the database. These helpers are designed to be composed with Zod
 * `.transform()` calls in validation schemas so sanitization is declarative
 * and impossible to skip.
 *
 * @module server/utils/sanitize
 */

/**
 * Strips HTML angle brackets and collapses whitespace.
 * Use for free-text fields (bios, descriptions, notes) that should never
 * contain markup.
 */
export function stripHtmlChars(input: string): string {
  return input.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Strips control characters (U+0000–U+001F except \n and \t, plus U+007F)
 * that can break JSON parsers or cause rendering issues.
 */
export function stripControlChars(input: string): string {
  // Keep newlines (\n = 0x0A) and tabs (\t = 0x09); remove everything else
  // in the C0 range plus DEL (0x7F).
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

/**
 * Combined sanitization for generic text fields.
 * Strips control chars, removes HTML angle brackets, collapses whitespace.
 */
export function sanitizeTextField(input: string): string {
  return stripHtmlChars(stripControlChars(input));
}
