/**
 * Tests for client/src/lib/firebase.ts
 *
 * Covers: re-exports from firebase/config and the analytics placeholder (line 24).
 */

vi.mock("../firebase/config", () => ({
  app: { name: "mock-app" },
  auth: { _type: "mock-auth" },
  db: { _type: "mock-db" },
  storage: { _type: "mock-storage" },
  functions: { _type: "mock-functions" },
  isFirebaseInitialized: true,
  setAuthPersistence: vi.fn(),
}));

describe("firebase re-export module", () => {
  it("exports analytics as null", async () => {
    const mod = await import("../firebase");
    expect(mod.analytics).toBeNull();
  });

  it("re-exports app from config", async () => {
    const mod = await import("../firebase");
    expect(mod.app).toEqual({ name: "mock-app" });
  });

  it("re-exports auth from config", async () => {
    const mod = await import("../firebase");
    expect(mod.auth).toEqual({ _type: "mock-auth" });
  });

  it("re-exports db from config", async () => {
    const mod = await import("../firebase");
    expect(mod.db).toEqual({ _type: "mock-db" });
  });

  it("re-exports storage from config", async () => {
    const mod = await import("../firebase");
    expect(mod.storage).toEqual({ _type: "mock-storage" });
  });

  it("re-exports functions from config", async () => {
    const mod = await import("../firebase");
    expect(mod.functions).toEqual({ _type: "mock-functions" });
  });

  it("re-exports isFirebaseInitialized from config", async () => {
    const mod = await import("../firebase");
    expect(mod.isFirebaseInitialized).toBe(true);
  });

  it("re-exports setAuthPersistence from config", async () => {
    const mod = await import("../firebase");
    expect(typeof mod.setAuthPersistence).toBe("function");
  });
});
