/**
 * Input Sanitization Utilities
 *
 * Provides functions to sanitize user input to prevent XSS and other injection attacks.
 * Use these utilities before rendering user-generated content or sending it to APIs.
 *
 * @module lib/validation/sanitize
 */

/**
 * Escapes HTML special characters to prevent XSS attacks.
 * Converts: < > & " ' / to HTML entities in the correct order.
 * Note: & must be escaped first to prevent double-encoding.
 *
 * @param input - The string to sanitize
 * @returns Sanitized string with HTML entities
 *
 * @example
 * ```ts
 * sanitizeHTML('<script>alert("XSS")</script>')
 * // Returns: '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
 * ```
 */
export function sanitizeHTML(input: string): string {
  // IMPORTANT: & must be replaced first to prevent double-encoding
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

/**
 * Sanitizes a username/handle to allow only alphanumeric characters, underscores, and hyphens.
 * Trims whitespace and converts to lowercase.
 *
 * @param input - The username to sanitize
 * @param maxLength - Maximum allowed length (default: 30)
 * @returns Sanitized username
 *
 * @example
 * ```ts
 * sanitizeUsername('John Doe!')
 * // Returns: 'johndoe'
 *
 * sanitizeUsername('user_123-test')
 * // Returns: 'user_123-test'
 * ```
 */
export function sanitizeUsername(input: string, maxLength = 30): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, maxLength);
}

/**
 * Sanitizes a display name by removing potentially dangerous characters
 * while preserving unicode characters for international names.
 *
 * @param input - The display name to sanitize
 * @param maxLength - Maximum allowed length (default: 50)
 * @returns Sanitized display name
 *
 * @example
 * ```ts
 * sanitizeDisplayName('  John <script> Doe  ')
 * // Returns: 'John  Doe'
 * ```
 */
export function sanitizeDisplayName(input: string, maxLength = 50): string {
  return input
    .trim()
    .replace(/[<>]/g, "") // Remove angle brackets
    .replace(/\s+/g, " ") // Normalize whitespace
    .slice(0, maxLength);
}

/**
 * Sanitizes a URL to ensure it uses safe protocols (http/https).
 * Returns null if the URL is invalid or uses an unsafe protocol.
 *
 * @param input - The URL to sanitize
 * @returns Sanitized URL or null if invalid
 *
 * @example
 * ```ts
 * sanitizeURL('javascript:alert("XSS")')
 * // Returns: null
 *
 * sanitizeURL('https://example.com')
 * // Returns: 'https://example.com'
 * ```
 */
export function sanitizeURL(input: string): string | null {
  try {
    const url = new URL(input.trim());

    // Only allow http and https protocols
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

/**
 * Sanitizes free-form text input by escaping HTML and trimming whitespace.
 * Useful for comments, descriptions, and other user-generated text.
 *
 * @param input - The text to sanitize
 * @param maxLength - Maximum allowed length (default: 5000)
 * @returns Sanitized text
 *
 * @example
 * ```ts
 * sanitizeText('Hello <b>World</b>!')
 * // Returns: 'Hello &lt;b&gt;World&lt;/b&gt;!'
 * ```
 */
export function sanitizeText(input: string, maxLength = 5000): string {
  return sanitizeHTML(input.trim()).slice(0, maxLength);
}

/**
 * Validates and sanitizes an email address.
 * Returns null if the email is invalid.
 *
 * @param input - The email to sanitize
 * @returns Sanitized email or null if invalid
 *
 * @example
 * ```ts
 * sanitizeEmail('  user@EXAMPLE.com  ')
 * // Returns: 'user@example.com'
 *
 * sanitizeEmail('invalid-email')
 * // Returns: null
 * ```
 */
export function sanitizeEmail(input: string): string | null {
  const trimmed = input.trim().toLowerCase();

  // Basic email validation pattern
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(trimmed)) {
    return null;
  }

  // Additional safety: no angle brackets or quotes
  if (/[<>"']/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

/**
 * Removes all HTML tags from a string while preserving text content.
 * Useful for converting rich text to plain text.
 *
 * @param input - The HTML string to strip
 * @returns Plain text without HTML tags
 *
 * @example
 * ```ts
 * stripHTMLTags('<p>Hello <strong>World</strong>!</p>')
 * // Returns: 'Hello World!'
 * ```
 */
export function stripHTMLTags(input: string): string {
  let output = input;
  let previous: string;

  // Repeatedly remove tags until no more <...> patterns remain,
  // preventing partially removed constructs (e.g., nested or malformed tags)
  // from leaving behind unsafe substrings like "<script".
  do {
    previous = output;
    output = output.replace(/<[^>]*>/g, "");
  } while (output !== previous);

  return output.trim();
}

/**
 * Sanitizes a filename to remove path traversal attempts and unsafe characters.
 *
 * @param input - The filename to sanitize
 * @param maxLength - Maximum allowed length (default: 255)
 * @returns Sanitized filename
 *
 * @example
 * ```ts
 * sanitizeFilename('../../etc/passwd')
 * // Returns: 'etcpasswd'
 *
 * sanitizeFilename('my file!@#.txt')
 * // Returns: 'my_file.txt'
 * ```
 */
export function sanitizeFilename(input: string, maxLength = 255): string {
  return input
    .replace(/\.\./g, "") // Remove path traversal
    .replace(/[/\\]/g, "") // Remove slashes
    .replace(/[^a-zA-Z0-9._-]/g, "_") // Replace unsafe chars with underscore
    .slice(0, maxLength);
}

/**
 * Validates and sanitizes a phone number to contain only digits, spaces, and common symbols.
 * Returns null if the input contains suspicious characters.
 *
 * @param input - The phone number to sanitize
 * @returns Sanitized phone number or null if invalid
 *
 * @example
 * ```ts
 * sanitizePhoneNumber('+1 (555) 123-4567')
 * // Returns: '+1 (555) 123-4567'
 *
 * sanitizePhoneNumber('555<script>alert(1)</script>')
 * // Returns: null
 * ```
 */
export function sanitizePhoneNumber(input: string): string | null {
  const trimmed = input.trim();

  // Allow only digits, spaces, parentheses, hyphens, and plus
  const phonePattern = /^[0-9\s()+-]+$/;

  if (!phonePattern.test(trimmed)) {
    return null;
  }

  return trimmed;
}
