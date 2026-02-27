/**
 * Typed auth / user mock factories for server tests.
 *
 * Provides consistent, properly-typed test fixtures for CustomUser,
 * AuthSession, and related auth objects so tests don't need
 * ad-hoc `as any` object literals.
 */

import { vi } from "vitest";
import type { Mock } from "vitest";

// ---------------------------------------------------------------------------
// Re-usable type shapes (mirrors the shared schema without importing it
// at runtime, since test files vi.mock() the schema module).
// ---------------------------------------------------------------------------

export interface MockCustomUser {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string | null;
  lastName: string | null;
  firebaseUid: string | null;
  pushToken: string | null;
  isEmailVerified: boolean;
  emailVerificationToken: string | null;
  emailVerificationExpires: Date | null;
  resetPasswordToken: string | null;
  resetPasswordExpires: Date | null;
  isActive: boolean;
  trustLevel: number;
  accountTier: "free" | "pro" | "premium";
  proAwardedBy: string | null;
  premiumPurchasedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles?: string[];
}

export interface MockAuthSession {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

let userIdCounter = 0;

/**
 * Create a mock `CustomUser` with sensible defaults.
 * Override any field via the `overrides` parameter.
 *
 * @example
 * ```ts
 * const admin = createMockUser({ roles: ["admin"], accountTier: "premium" });
 * const unverified = createMockUser({ isEmailVerified: false });
 * ```
 */
export function createMockUser(overrides: Partial<MockCustomUser> = {}): MockCustomUser {
  userIdCounter++;
  const now = new Date();

  return {
    id: `user-${userIdCounter}`,
    email: `user${userIdCounter}@test.com`,
    passwordHash: "$2b$12$mockHashedPasswordForTesting",
    firstName: "Test",
    lastName: "User",
    firebaseUid: null,
    pushToken: null,
    isEmailVerified: true,
    emailVerificationToken: null,
    emailVerificationExpires: null,
    resetPasswordToken: null,
    resetPasswordExpires: null,
    isActive: true,
    trustLevel: 0,
    accountTier: "free",
    proAwardedBy: null,
    premiumPurchasedAt: null,
    lastLoginAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create a mock `AuthSession`.
 */
export function createMockSession(overrides: Partial<MockAuthSession> = {}): MockAuthSession {
  const now = new Date();
  return {
    id: `session-${Date.now()}`,
    userId: "user-1",
    token: `tok_${Math.random().toString(36).slice(2)}`,
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    createdAt: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock logger (used in almost every server test)
// ---------------------------------------------------------------------------

export interface MockLogger {
  info: Mock;
  warn: Mock;
  error: Mock;
  debug: Mock;
  fatal: Mock;
  child: Mock;
}

/**
 * Create a mock logger matching the server logger interface.
 *
 * @example
 * ```ts
 * vi.doMock("../../logger", () => ({
 *   default: createMockLogger(),
 *   createChildLogger: vi.fn(() => createMockLogger()),
 * }));
 * ```
 */
export function createMockLogger(): MockLogger {
  const logger: MockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger;
}

/**
 * Return a complete mock logger module shape for `vi.mock("../logger", …)`.
 */
export function createMockLoggerModule() {
  const logger = createMockLogger();
  return {
    default: logger,
    createChildLogger: vi.fn(() => createMockLogger()),
  };
}

// ---------------------------------------------------------------------------
// Mock environment config
// ---------------------------------------------------------------------------

export interface MockEnv {
  DATABASE_URL: string;
  JWT_SECRET: string;
  SESSION_SECRET: string;
  NODE_ENV: string;
  [key: string]: string | undefined;
}

/**
 * Create a mock `env` config object.
 */
export function createMockEnv(overrides: Partial<MockEnv> = {}): MockEnv {
  return {
    DATABASE_URL: "mock://test",
    JWT_SECRET: "test-jwt-secret-at-least-32-characters-long!",
    SESSION_SECRET: "test-session-secret-at-least-32-chars-long",
    NODE_ENV: "test",
    ...overrides,
  };
}

/**
 * Return a mock env module shape for `vi.doMock("../config/env", …)`.
 */
export function createMockEnvModule(overrides: Partial<MockEnv> = {}) {
  return { env: createMockEnv(overrides) };
}

// ---------------------------------------------------------------------------
// Reset helper
// ---------------------------------------------------------------------------

/**
 * Reset the internal user-ID counter (call in `beforeEach` if deterministic IDs matter).
 */
export function resetMockUserCounter() {
  userIdCounter = 0;
}
