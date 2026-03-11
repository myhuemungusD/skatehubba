import { z } from "zod";

/**
 * Strip HTML angle brackets, control chars, and collapse whitespace.
 *
 * Designed for user-supplied text that must never contain markup
 * (bios, descriptions, spot names, notes, etc.).
 */
export function sanitizeText(input: string): string {
  return input
    .replace(
      // eslint-disable-next-line no-control-regex
      /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,
      ""
    )
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Zod helper — sanitized optional/nullable string with max length.
 *
 * Usage: `safeText(500)` produces a schema that accepts
 * `string | undefined | null`, enforces `max`, and strips
 * HTML / control chars via `sanitizeText`.
 */
export const safeText = (max: number) =>
  z.string().max(max).transform(sanitizeText).optional().nullable();
