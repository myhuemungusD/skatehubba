import { describe, it, expect } from "vitest";
import {
  sanitizeHTML,
  sanitizeUsername,
  sanitizeDisplayName,
  sanitizeURL,
  sanitizeText,
  sanitizeEmail,
  stripHTMLTags,
  sanitizeFilename,
  sanitizePhoneNumber,
} from "./sanitize";

describe("sanitize utilities", () => {
  describe("sanitizeHTML", () => {
    it("should escape basic HTML characters", () => {
      expect(sanitizeHTML('<script>alert("XSS")</script>')).toBe(
        "&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;"
      );
    });

    it("should escape all dangerous HTML entities", () => {
      expect(sanitizeHTML("&<>\"'/")).toBe("&amp;&lt;&gt;&quot;&#x27;&#x2F;");
    });

    it("should preserve safe text", () => {
      expect(sanitizeHTML("Hello World")).toBe("Hello World");
    });

    it("should handle empty string", () => {
      expect(sanitizeHTML("")).toBe("");
    });

    it("should escape nested tags", () => {
      expect(sanitizeHTML("<div><span>test</span></div>")).toBe(
        "&lt;div&gt;&lt;span&gt;test&lt;&#x2F;span&gt;&lt;&#x2F;div&gt;"
      );
    });

    it("should escape javascript protocol in href", () => {
      const input = '<a href="javascript:alert(1)">Click</a>';
      const output = sanitizeHTML(input);
      expect(output).not.toContain("javascript:");
      expect(output).toContain("&lt;");
    });

    it("should prevent double-encoding by escaping ampersand first", () => {
      // If & is not escaped first, &lt; could become &amp;lt;
      expect(sanitizeHTML("&lt;")).toBe("&amp;lt;");
      expect(sanitizeHTML("&")).toBe("&amp;");
      // Verify the order prevents XSS bypass attempts
      expect(sanitizeHTML("&lt;script&gt;")).toBe("&amp;lt;script&amp;gt;");
    });

    it("should handle consecutive special characters", () => {
      expect(sanitizeHTML("<<>>")).toBe("&lt;&lt;&gt;&gt;");
      expect(sanitizeHTML("<script><script>")).toBe("&lt;script&gt;&lt;script&gt;");
    });
  });

  describe("sanitizeUsername", () => {
    it("should convert to lowercase", () => {
      expect(sanitizeUsername("JohnDoe")).toBe("johndoe");
    });

    it("should trim whitespace", () => {
      expect(sanitizeUsername("  username  ")).toBe("username");
    });

    it("should remove spaces", () => {
      expect(sanitizeUsername("john doe")).toBe("johndoe");
    });

    it("should allow alphanumeric, underscore, and hyphen", () => {
      expect(sanitizeUsername("user_123-test")).toBe("user_123-test");
    });

    it("should remove special characters", () => {
      expect(sanitizeUsername("user!@#$%^&*()")).toBe("user");
    });

    it("should respect max length", () => {
      const longUsername = "a".repeat(50);
      expect(sanitizeUsername(longUsername, 10)).toBe("a".repeat(10));
    });

    it("should use default max length of 30", () => {
      const longUsername = "a".repeat(50);
      expect(sanitizeUsername(longUsername)).toBe("a".repeat(30));
    });

    it("should handle unicode characters", () => {
      expect(sanitizeUsername("user🎯")).toBe("user");
    });
  });

  describe("sanitizeDisplayName", () => {
    it("should trim whitespace", () => {
      expect(sanitizeDisplayName("  John Doe  ")).toBe("John Doe");
    });

    it("should remove angle brackets", () => {
      expect(sanitizeDisplayName("John <script> Doe")).toBe("John  Doe");
    });

    it("should normalize multiple spaces", () => {
      expect(sanitizeDisplayName("John    Doe")).toBe("John Doe");
    });

    it("should preserve unicode characters", () => {
      expect(sanitizeDisplayName("José García")).toBe("José García");
    });

    it("should respect max length", () => {
      const longName = "a".repeat(100);
      expect(sanitizeDisplayName(longName, 20)).toBe("a".repeat(20));
    });

    it("should use default max length of 50", () => {
      const longName = "a".repeat(100);
      expect(sanitizeDisplayName(longName)).toBe("a".repeat(50));
    });

    it("should handle emoji", () => {
      expect(sanitizeDisplayName("John 🎯 Doe")).toBe("John 🎯 Doe");
    });
  });

  describe("sanitizeURL", () => {
    it("should accept valid HTTPS URL", () => {
      expect(sanitizeURL("https://example.com")).toBe("https://example.com/");
    });

    it("should accept valid HTTP URL", () => {
      expect(sanitizeURL("http://example.com")).toBe("http://example.com/");
    });

    it("should reject javascript protocol", () => {
      expect(sanitizeURL("javascript:alert(1)")).toBe(null);
    });

    it("should reject data protocol", () => {
      expect(sanitizeURL("data:text/html,<script>alert(1)</script>")).toBe(null);
    });

    it("should reject file protocol", () => {
      expect(sanitizeURL("file:///etc/passwd")).toBe(null);
    });

    it("should reject vbscript protocol", () => {
      expect(sanitizeURL("vbscript:alert(1)")).toBe(null);
    });

    it("should handle invalid URL format", () => {
      expect(sanitizeURL("not-a-url")).toBe(null);
    });

    it("should trim whitespace", () => {
      expect(sanitizeURL("  https://example.com  ")).toBe("https://example.com/");
    });

    it("should preserve URL parameters", () => {
      const url = "https://example.com/path?foo=bar&baz=qux";
      expect(sanitizeURL(url)).toBe(url);
    });

    it("should preserve URL fragments", () => {
      const url = "https://example.com/path#section";
      expect(sanitizeURL(url)).toBe(url);
    });
  });

  describe("sanitizeText", () => {
    it("should escape HTML and trim", () => {
      expect(sanitizeText("  <b>Hello</b>  ")).toBe("&lt;b&gt;Hello&lt;&#x2F;b&gt;");
    });

    it("should respect max length", () => {
      const longText = "a".repeat(10000);
      expect(sanitizeText(longText, 100)).toBe("a".repeat(100));
    });

    it("should use default max length of 5000", () => {
      const longText = "a".repeat(10000);
      expect(sanitizeText(longText).length).toBe(5000);
    });

    it("should preserve newlines", () => {
      expect(sanitizeText("line1\nline2\nline3")).toBe("line1\nline2\nline3");
    });

    it("should escape XSS attempts", () => {
      const xss = '<img src=x onerror="alert(1)">';
      const sanitized = sanitizeText(xss);
      expect(sanitized).not.toContain("<img");
      expect(sanitized).not.toContain("onerror");
    });
  });

  describe("sanitizeEmail", () => {
    it("should convert to lowercase", () => {
      expect(sanitizeEmail("User@EXAMPLE.COM")).toBe("user@example.com");
    });

    it("should trim whitespace", () => {
      expect(sanitizeEmail("  user@example.com  ")).toBe("user@example.com");
    });

    it("should accept valid email", () => {
      expect(sanitizeEmail("user@example.com")).toBe("user@example.com");
    });

    it("should accept email with subdomain", () => {
      expect(sanitizeEmail("user@mail.example.com")).toBe("user@mail.example.com");
    });

    it("should accept email with dots", () => {
      expect(sanitizeEmail("first.last@example.com")).toBe("first.last@example.com");
    });

    it("should accept email with plus", () => {
      expect(sanitizeEmail("user+tag@example.com")).toBe("user+tag@example.com");
    });

    it("should reject invalid email without @", () => {
      expect(sanitizeEmail("userexample.com")).toBe(null);
    });

    it("should reject invalid email without domain", () => {
      expect(sanitizeEmail("user@")).toBe(null);
    });

    it("should reject invalid email without TLD", () => {
      expect(sanitizeEmail("user@example")).toBe(null);
    });

    it("should reject email with spaces", () => {
      expect(sanitizeEmail("user @example.com")).toBe(null);
    });

    it("should reject email with angle brackets", () => {
      expect(sanitizeEmail("<user@example.com>")).toBe(null);
    });

    it("should reject email with quotes", () => {
      expect(sanitizeEmail('"user"@example.com')).toBe(null);
    });
  });

  describe("stripHTMLTags", () => {
    it("should remove all HTML tags", () => {
      expect(stripHTMLTags("<p>Hello <strong>World</strong>!</p>")).toBe("Hello World!");
    });

    it("should preserve text content", () => {
      expect(stripHTMLTags("<div><span>test</span></div>")).toBe("test");
    });

    it("should handle nested tags", () => {
      expect(stripHTMLTags("<div><p><span>nested</span></p></div>")).toBe("nested");
    });

    it("should handle self-closing tags", () => {
      expect(stripHTMLTags("before<br/>after")).toBe("beforeafter");
    });

    it("should trim result", () => {
      expect(stripHTMLTags("  <p>text</p>  ")).toBe("text");
    });

    it("should handle empty tags", () => {
      expect(stripHTMLTags("<div></div>")).toBe("");
    });

    it("should preserve multiple spaces in text", () => {
      expect(stripHTMLTags("<p>hello    world</p>")).toBe("hello    world");
    });
  });

  describe("sanitizeFilename", () => {
    it("should remove path traversal attempts", () => {
      expect(sanitizeFilename("../../etc/passwd")).toBe("etcpasswd");
    });

    it("should remove forward slashes", () => {
      expect(sanitizeFilename("path/to/file.txt")).toBe("pathtofile.txt");
    });

    it("should remove backslashes", () => {
      expect(sanitizeFilename("path\\to\\file.txt")).toBe("pathtofile.txt");
    });

    it("should replace special characters with underscore", () => {
      expect(sanitizeFilename("file!@#$%^&*().txt")).toBe("file__________.txt");
    });

    it("should preserve dots, hyphens, and underscores", () => {
      expect(sanitizeFilename("my-file_name.txt")).toBe("my-file_name.txt");
    });

    it("should respect max length", () => {
      const longFilename = "a".repeat(300) + ".txt";
      expect(sanitizeFilename(longFilename, 10)).toBe("aaaaaaaaaa");
    });

    it("should use default max length of 255", () => {
      const longFilename = "a".repeat(300);
      expect(sanitizeFilename(longFilename).length).toBe(255);
    });

    it("should handle spaces", () => {
      expect(sanitizeFilename("my file.txt")).toBe("my_file.txt");
    });
  });

  describe("sanitizePhoneNumber", () => {
    it("should accept valid phone with country code", () => {
      expect(sanitizePhoneNumber("+1 (555) 123-4567")).toBe("+1 (555) 123-4567");
    });

    it("should accept phone with spaces", () => {
      expect(sanitizePhoneNumber("555 123 4567")).toBe("555 123 4567");
    });

    it("should accept phone with hyphens", () => {
      expect(sanitizePhoneNumber("555-123-4567")).toBe("555-123-4567");
    });

    it("should accept phone with parentheses", () => {
      expect(sanitizePhoneNumber("(555) 123-4567")).toBe("(555) 123-4567");
    });

    it("should trim whitespace", () => {
      expect(sanitizePhoneNumber("  555-123-4567  ")).toBe("555-123-4567");
    });

    it("should reject phone with letters", () => {
      expect(sanitizePhoneNumber("555-CALL-NOW")).toBe(null);
    });

    it("should reject phone with XSS attempt", () => {
      expect(sanitizePhoneNumber("555<script>alert(1)</script>")).toBe(null);
    });

    it("should reject phone with HTML tags", () => {
      expect(sanitizePhoneNumber("555<br>123")).toBe(null);
    });

    it("should accept only digits", () => {
      expect(sanitizePhoneNumber("5551234567")).toBe("5551234567");
    });

    it("should reject special characters", () => {
      expect(sanitizePhoneNumber("555@123#4567")).toBe(null);
    });
  });

  describe("edge cases and combinations", () => {
    it("should handle very long inputs gracefully", () => {
      const veryLongString = "a".repeat(1000000);
      expect(() => sanitizeHTML(veryLongString)).not.toThrow();
      expect(() => sanitizeText(veryLongString)).not.toThrow();
    });

    it("should handle unicode in various functions", () => {
      expect(sanitizeText("Hello 世界")).toBe("Hello 世界");
      expect(sanitizeDisplayName("用户 名称")).toBe("用户 名称");
    });

    it("should handle mixed case XSS attempts", () => {
      expect(sanitizeHTML("<ScRiPt>alert(1)</sCrIpT>")).toContain("&lt;");
    });

    it("should handle null bytes", () => {
      expect(sanitizeFilename("file\x00name.txt")).toBe("file_name.txt");
    });

    it("should handle control characters", () => {
      expect(sanitizeText("hello\x01\x02world")).toBe("hello\x01\x02world");
    });
  });
});
