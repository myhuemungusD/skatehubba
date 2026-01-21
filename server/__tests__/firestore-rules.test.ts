import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const rulesPath = path.join(process.cwd(), "firestore.rules");
const rules = readFileSync(rulesPath, "utf8");

describe("Firestore rules contract", () => {
  it("locks down prod writes to sensitive collections", () => {
    expect(rules).toMatch(/match \/env\/prod\/\{collection\}\/\{docId=\*\*\}/);
    expect(rules).toMatch(
      /collection in \['billing', 'admin', 'moderation', 'analytics_events', 'users'\]/
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
