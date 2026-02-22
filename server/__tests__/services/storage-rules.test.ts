import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const resolveRulesPath = (fileName: string) => {
  const candidates = [path.join(process.cwd(), fileName), path.join(process.cwd(), "..", fileName)];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Missing ${fileName} at ${candidates.join(", ")}`);
};

const rulesPath = resolveRulesPath("storage.rules");
const rules = readFileSync(rulesPath, "utf8");

describe("Storage rules contract", () => {
  it("scopes profile images to owner writes and public reads", () => {
    expect(rules).toMatch(/match \/profiles\/\{userId\}\/\{fileName\}/);
    expect(rules).toMatch(/allow read: if true/);
    expect(rules).toMatch(/allow write: if isOwner\(userId\)/);
  });

  it("enforces uploads to be owner-bound with type + size limits", () => {
    expect(rules).toMatch(/match \/uploads\/\{userId\}\/\{path=\*\*\}/);
    expect(rules).toMatch(/allow read: if isAuthenticated\(\)/);
    expect(rules).toMatch(/allow write: if isOwner\(userId\)/);
    expect(rules).toMatch(/isImage\(\) \|\| isVideo\(\)/);
    expect(rules).toMatch(/request\.resource\.size < 50 \* 1024 \* 1024/);
  });

  it("keeps spots public-read and admin-gated on deletes", () => {
    expect(rules).toMatch(/match \/spots\/\{spotId\}\/\{fileName\}/);
    expect(rules).toMatch(/allow read: if true/);
    expect(rules).toMatch(/allow create, update: if isAuthenticated\(\) && isImage\(\)/);
    expect(rules).toMatch(
      /allow delete: if isAuthenticated\(\) && request\.auth\.token\.admin == true/
    );
  });

  it("keeps public assets read-only", () => {
    expect(rules).toMatch(/match \/public\/\{path=\*\*\}/);
    expect(rules).toMatch(/allow read: if true/);
    expect(rules).toMatch(/allow write: if false/);
  });
});
