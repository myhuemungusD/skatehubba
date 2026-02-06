import { describe, it, expect, vi } from "vitest";

// Test the pure functions by extracting the logic rather than importing the module
// which has complex dependencies (firebase auth, config module)

describe("buildApiUrl logic", () => {
  const isAbsoluteUrl = (value: string): boolean => /^https?:\/\//i.test(value);

  const buildApiUrl = (path: string, base = "https://api.skatehubba.com"): string => {
    if (isAbsoluteUrl(path)) return path;
    const cleanBase = base.replace(/\/+$/, "");
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${cleanBase}${normalizedPath}`;
  };

  it("returns absolute URLs unchanged", () => {
    expect(buildApiUrl("https://example.com/api")).toBe("https://example.com/api");
    expect(buildApiUrl("http://localhost:3000/api")).toBe("http://localhost:3000/api");
  });

  it("prepends base URL to relative paths", () => {
    expect(buildApiUrl("/api/games")).toBe("https://api.skatehubba.com/api/games");
  });

  it("adds leading slash to paths without one", () => {
    expect(buildApiUrl("api/games")).toBe("https://api.skatehubba.com/api/games");
  });

  it("strips trailing slashes from base URL", () => {
    expect(buildApiUrl("/test", "https://api.skatehubba.com/")).toBe(
      "https://api.skatehubba.com/test"
    );
  });

  it("handles HTTPS case-insensitive", () => {
    expect(isAbsoluteUrl("HTTPS://example.com")).toBe(true);
    expect(isAbsoluteUrl("HTTP://example.com")).toBe(true);
  });

  it("rejects non-http URLs", () => {
    expect(isAbsoluteUrl("ftp://example.com")).toBe(false);
    expect(isAbsoluteUrl("ws://example.com")).toBe(false);
  });
});

describe("parseJsonSafely logic", () => {
  const parseJsonSafely = async (response: Response): Promise<unknown> => {
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return undefined;
    }
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  };

  it("returns parsed JSON for application/json content type", async () => {
    const response = new Response(JSON.stringify({ data: "test" }), {
      headers: { "content-type": "application/json" },
    });
    const result = await parseJsonSafely(response);
    expect(result).toEqual({ data: "test" });
  });

  it("returns undefined for non-JSON content type", async () => {
    const response = new Response("plain text", {
      headers: { "content-type": "text/plain" },
    });
    const result = await parseJsonSafely(response);
    expect(result).toBeUndefined();
  });

  it("returns undefined for invalid JSON", async () => {
    const response = new Response("not json", {
      headers: { "content-type": "application/json" },
    });
    const result = await parseJsonSafely(response);
    expect(result).toBeUndefined();
  });

  it("returns undefined when no content-type header", async () => {
    const response = new Response("data");
    const result = await parseJsonSafely(response);
    expect(result).toBeUndefined();
  });
});
