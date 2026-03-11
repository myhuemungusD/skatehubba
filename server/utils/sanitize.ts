/**
 * Server-side Input Sanitization
 *
 * Re-exports the shared `sanitizeText` as `sanitizeTextField` for
 * server route modules that need to compose it with Zod `.transform()`.
 *
 * @module server/utils/sanitize
 */

export { sanitizeText as sanitizeTextField } from "@shared/validation/sanitize";
