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

const rulesPath = resolveRulesPath("firestore.rules");
const rules = readFileSync(rulesPath, "utf8");

describe("Firestore rules contract", () => {
  it("locks down prod writes to all collections via default deny", () => {
    expect(rules).toMatch(/match \/env\/prod\/\{collection\}\/\{docId=\*\*\}/);
    // Prod catch-all now blocks ALL client writes (previously used a denylist).
    // Individual collections that need client writes have explicit match rules.
    expect(rules).toMatch(
      /match \/env\/prod\/\{collection\}\/\{docId=\*\*\}[\s\S]*?allow write: if false/
    );
  });

  it("enforces ownership and field constraints on presence writes", () => {
    expect(rules).toMatch(/match \/presence\/\{userId\}/);
    expect(rules).toMatch(/allow write: if isOwner\(userId\)/);
    expect(rules).toMatch(/request\.resource\.data\.status in \['online', 'offline', 'away'\]/);
  });

  it("limits chat message creation to user-owned messages", () => {
    expect(rules).toMatch(/match \/chat_messages\/\{messageId\}/);
    expect(rules).toMatch(/request\.resource\.data\.role == 'user'/);
    expect(rules).toMatch(/messageId\.matches\('\^\' \+ request\.auth\.uid \+ '_\.\*'\)/);
  });
});
