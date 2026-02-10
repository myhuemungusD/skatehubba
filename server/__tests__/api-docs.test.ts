/**
 * @fileoverview Unit tests for API docs barrel export and HTML generator
 */

import { describe, it, expect } from "vitest";
import { apiDocumentation, generateHTMLDocs } from "../api-docs/index";

describe("API Documentation", () => {
  describe("apiDocumentation", () => {
    it("should be an array of API categories", () => {
      expect(Array.isArray(apiDocumentation)).toBe(true);
      expect(apiDocumentation.length).toBeGreaterThan(0);
    });

    it("should contain expected categories", () => {
      const names = apiDocumentation.map((c) => c.name);
      expect(names.length).toBeGreaterThanOrEqual(10);
    });

    it("each category should have name, description, and endpoints", () => {
      for (const category of apiDocumentation) {
        expect(typeof category.name).toBe("string");
        expect(typeof category.description).toBe("string");
        expect(Array.isArray(category.endpoints)).toBe(true);
        expect(category.endpoints.length).toBeGreaterThan(0);
      }
    });

    it("each endpoint should have method, path, and responses", () => {
      for (const category of apiDocumentation) {
        for (const endpoint of category.endpoints) {
          expect(typeof endpoint.method).toBe("string");
          expect(typeof endpoint.path).toBe("string");
          expect(typeof endpoint.description).toBe("string");
          expect(Array.isArray(endpoint.responses)).toBe(true);
        }
      }
    });
  });

  describe("generateHTMLDocs", () => {
    let html: string;

    // Generate once for all tests
    it("should return valid HTML", () => {
      html = generateHTMLDocs();
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("</html>");
    });

    it("should contain the page title", () => {
      html = html || generateHTMLDocs();
      expect(html).toContain("SkateHubba");
      expect(html).toContain("API");
    });

    it("should include HTTP method CSS classes", () => {
      html = html || generateHTMLDocs();
      expect(html).toContain('class="method');
    });

    it("should include endpoint paths from categories", () => {
      html = html || generateHTMLDocs();
      expect(html).toContain("/api/");
    });

    it("should include response status codes", () => {
      html = html || generateHTMLDocs();
      expect(html).toContain("status-code");
      expect(html).toContain("200");
    });

    it("should include responsive CSS", () => {
      html = html || generateHTMLDocs();
      expect(html).toContain("@media");
    });

    it("should include footer", () => {
      html = html || generateHTMLDocs();
      expect(html).toContain("footer");
      expect(html).toContain("Design Mainline LLC");
    });

    it("should contain category names", () => {
      html = html || generateHTMLDocs();
      for (const cat of apiDocumentation) {
        expect(html).toContain(cat.name);
      }
    });
  });
});
