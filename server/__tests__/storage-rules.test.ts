import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const rulesPath = path.join(process.cwd(), "storage.rules");
const rules = readFileSync(rulesPath, "utf8");

describe("Storage rules contract", () => {
  it("scopes uploads to per-user paths with owner checks", () => {
    expect(rules).toMatch(/match \/uploads\/\{userId\}\/\{path=\*\*\}/);
    expect(rules).toMatch(/allow write: if isOwner\(userId\)/);
  });

  it("enforces content-type and size constraints", () => {
    expect(rules).toMatch(/request\.resource\.contentType\.matches\('image\/\.\*'\)/);
    expect(rules).toMatch(/request\.resource\.contentType\.matches\('video\/\.\*'\)/);
    expect(rules).toMatch(/request\.resource\.size < 50 \* 1024 \* 1024/);
  });

  it("keeps public assets read-only", () => {
    expect(rules).toMatch(/match \/public\/\{path=\*\*\}/);
    expect(rules).toMatch(/allow read: if true/);
    expect(rules).toMatch(/allow write: if false/);
  });
});
