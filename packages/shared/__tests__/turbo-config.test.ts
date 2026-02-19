import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

/* ---------------------------------------------------------------------------
 * Helpers — resolve paths relative to the monorepo root regardless of cwd.
 * Mirrors the pattern in firestore-rules.test.ts / storage-rules.test.ts.
 * ------------------------------------------------------------------------ */

const resolveFromRoot = (relativePath: string): string => {
  const candidates = [
    path.resolve(process.cwd(), relativePath),
    path.resolve(process.cwd(), "..", relativePath),
    path.resolve(process.cwd(), "../..", relativePath),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Cannot find ${relativePath} at any of: ${candidates.join(", ")}`);
};

const readJson = (relativePath: string) =>
  JSON.parse(readFileSync(resolveFromRoot(relativePath), "utf8"));

/* ---------------------------------------------------------------------------
 * Load the config files once — they're static during the test run.
 * ------------------------------------------------------------------------ */

const turbo = readJson("turbo.json");
const tasks = turbo.tasks;

// Shared library packages that app packages depend on via workspace:*
const sharedPackageNames = ["config", "types", "db", "firebase", "utils"] as const;
const sharedPackages = sharedPackageNames.map((name) => ({
  name,
  pkg: readJson(`packages/${name}/package.json`),
}));

// App packages that run dev servers
const appPackages = [
  { name: "client", pkg: readJson("client/package.json") },
  { name: "server", pkg: readJson("server/package.json") },
  { name: "mobile", pkg: readJson("mobile/package.json") },
];

/* ---------------------------------------------------------------------------
 * 1. turbo.json schema integrity
 * ------------------------------------------------------------------------ */

describe("turbo.json schema", () => {
  it("is valid JSON with $schema reference", () => {
    expect(turbo.$schema).toBe("https://turbo.build/schema.json");
  });

  it("defines all required pipeline tasks", () => {
    const expectedTasks = ["build", "dev", "typecheck", "lint", "test"];
    for (const task of expectedTasks) {
      expect(tasks).toHaveProperty(task);
    }
  });
});

/* ---------------------------------------------------------------------------
 * 2. dev task — the core invariant this change protects
 * ------------------------------------------------------------------------ */

describe("dev task (inner-loop)", () => {
  it("has no task dependencies (starts immediately)", () => {
    expect(tasks.dev.dependsOn).toBeUndefined();
  });

  it("is persistent (long-running dev servers)", () => {
    expect(tasks.dev.persistent).toBe(true);
  });

  it("disables caching (dev output is non-deterministic)", () => {
    expect(tasks.dev.cache).toBe(false);
  });

  it("does not reference ^build anywhere in its config", () => {
    const serialized = JSON.stringify(tasks.dev);
    expect(serialized).not.toContain("^build");
  });
});

/* ---------------------------------------------------------------------------
 * 3. CI/release tasks — must still use ^build for correctness
 * ------------------------------------------------------------------------ */

describe("CI/release tasks", () => {
  it("build depends on ^build", () => {
    expect(tasks.build.dependsOn).toContain("^build");
  });

  it("build enables caching with output globs", () => {
    expect(tasks.build.cache).toBe(true);
    expect(tasks.build.outputs).toEqual(expect.arrayContaining(["dist/**"]));
    expect(tasks.build.outputs.length).toBeGreaterThan(0);
  });

  it("typecheck depends on ^build", () => {
    expect(tasks.typecheck.dependsOn).toContain("^build");
  });

  it("test depends on ^build", () => {
    expect(tasks.test.dependsOn).toContain("^build");
  });

  it("lint has no build dependencies", () => {
    expect(tasks.lint.dependsOn).toBeUndefined();
  });
});

/* ---------------------------------------------------------------------------
 * 4. Workspace packages — validates the premise: shared packages are
 *    source-based so ^build on dev is unnecessary overhead.
 * ------------------------------------------------------------------------ */

describe("workspace packages (dev-dependency premise)", () => {
  it("shared packages export .ts source directly (no compiled output)", () => {
    for (const { name, pkg } of sharedPackages) {
      const mainEntry = pkg.main || pkg.exports?.["."];
      expect(mainEntry, `${name} should have a main/.exports entry`).toBeDefined();
      expect(mainEntry, `${name} main entry should be a .ts file, not compiled output`).toMatch(
        /\.ts$/
      );
    }
  });

  it("shared packages have no build script (nothing to compile)", () => {
    // 'shared' (the root packages/shared) is allowed a no-op build; the
    // five library packages under packages/* must not have one at all.
    for (const { name, pkg } of sharedPackages) {
      expect(
        pkg.scripts?.build,
        `@skatehubba/${name} should not have a build script`
      ).toBeUndefined();
    }
  });

  it("app packages define dev scripts", () => {
    for (const { name, pkg } of appPackages) {
      expect(pkg.scripts?.dev, `${name} should have a dev script`).toBeDefined();
      expect(typeof pkg.scripts.dev).toBe("string");
    }
  });
});
