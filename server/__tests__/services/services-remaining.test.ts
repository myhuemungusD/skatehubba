/**
 * @fileoverview Coverage tests for uncovered branches in server service files
 *
 * Covers:
 * 1. server/auth/service.ts - verifyEmailByUserId (lines 211-222), validateSession return path (line 275)
 * 2. server/auth/lockout.ts - recordAttempt lockout threshold branch (line 183 area)
 * 3. server/services/filmerRequests.ts - various branches in create/respond/list
 * 4. server/services/osmDiscovery.ts - error/null paths (lines 66, 145, 186, 223)
 * 5. server/services/videoTranscoder.ts - processVideoJob catch block (lines 435-438)
 * 6. server/monitoring/index.ts - "unknown" version branch (line 187), admin status (lines 212-222)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// =============================================================================
// Section 1: AuthService.verifyEmailByUserId & validateSession
// =============================================================================

describe("AuthService — verifyEmailByUserId and validateSession", () => {
  const mockReturning = vi.fn();
  const mockWhere = vi.fn(() => ({ returning: mockReturning }));
  const mockSet = vi.fn(() => ({ where: mockWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockSet }));

  const mockSelectWhere = vi.fn();
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("verifyEmailByUserId should update user and return updated user", async () => {
    vi.doMock("../../config/env", () => ({
      env: {
        DATABASE_URL: "mock://test",
        JWT_SECRET: "test-jwt-secret-at-least-32-characters-long!",
        SESSION_SECRET: "test-session-secret-at-least-32-chars-long",
        NODE_ENV: "test",
      },
    }));

    const updatedUser = {
      id: "user-1",
      email: "test@example.com",
      isEmailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
    };

    vi.doMock("../../db", () => ({
      getDb: () => ({
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue([updatedUser]),
            })),
          })),
        })),
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn().mockResolvedValue([]),
          })),
        })),
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([]),
          })),
        })),
        delete: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([]),
        })),
      }),
    }));

    const { AuthService } = await import("../../auth/service");

    const result = await AuthService.verifyEmailByUserId("user-1");
    expect(result).toEqual(updatedUser);
    expect(result!.isEmailVerified).toBe(true);
    expect(result!.emailVerificationToken).toBeNull();
  });

  it("verifyEmailByUserId should return undefined when user not found", async () => {
    vi.doMock("../../config/env", () => ({
      env: {
        DATABASE_URL: "mock://test",
        JWT_SECRET: "test-jwt-secret-at-least-32-characters-long!",
        SESSION_SECRET: "test-session-secret-at-least-32-chars-long",
        NODE_ENV: "test",
      },
    }));

    vi.doMock("../../db", () => ({
      getDb: () => ({
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn().mockResolvedValue([]),
          })),
        })),
      }),
    }));

    const { AuthService } = await import("../../auth/service");

    const result = await AuthService.verifyEmailByUserId("nonexistent-user");
    expect(result).toBeUndefined();
  });

  it("validateSession should return user when session is valid (line 275)", async () => {
    const mockUser = {
      id: "user-123",
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      isActive: true,
      isEmailVerified: true,
    };

    vi.doMock("../../config/env", () => ({
      env: {
        DATABASE_URL: "mock://test",
        JWT_SECRET: "test-jwt-secret-at-least-32-characters-long!",
        SESSION_SECRET: "test-session-secret-at-least-32-chars-long",
        NODE_ENV: "test",
      },
    }));

    // Track which call the select chain is on
    let selectCallCount = 0;

    vi.doMock("../../db", () => ({
      getDb: () => ({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => {
              selectCallCount++;
              if (selectCallCount === 1) {
                // session lookup
                return Promise.resolve([
                  { userId: "user-123", token: "hash", expiresAt: new Date(Date.now() + 100000) },
                ]);
              }
              // findUserById lookup
              return Promise.resolve([mockUser]);
            }),
          })),
        })),
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([]),
          })),
        })),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
        delete: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([]),
        })),
      }),
    }));

    const { AuthService } = await import("../../auth/service");

    // Generate a real JWT token from the service
    const token = AuthService.generateJWT("user-123");

    selectCallCount = 0;
    const result = await AuthService.validateSession(token);
    expect(result).toEqual(mockUser);
    expect(result!.id).toBe("user-123");
  });
});

// =============================================================================
// Section 2: LockoutService.recordAttempt - lockout threshold
// =============================================================================

describe("LockoutService — recordAttempt lockout threshold branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should create lockout record when failed attempts exceed MAX_ATTEMPTS (line 183 area)", async () => {
    vi.doMock("../../config/env", () => ({
      env: {
        DATABASE_URL: "mock://test",
        JWT_SECRET: "test-jwt-secret",
        NODE_ENV: "test",
      },
    }));

    vi.doMock("../../security", () => ({
      SECURITY_CONFIG: {
        MAX_LOGIN_ATTEMPTS: 5,
        LOCKOUT_DURATION: 15 * 60 * 1000,
      },
    }));

    vi.doMock("../../config/constants", () => ({
      LOGIN_ATTEMPT_WINDOW_MS: 60 * 60 * 1000,
    }));

    vi.doMock("../../logger", () => ({
      default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },

      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }));

    const mockInsertValues = vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    });
    const mockInsert = vi.fn().mockReturnValue({
      values: mockInsertValues,
    });
    const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
    const mockDelete = vi.fn().mockReturnValue({
      where: mockDeleteWhere,
    });

    // Track select calls to return correct data
    let selectCallCount = 0;
    const mockSelectChain = () => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // checkLockout: active lockout check -> no lockout
        return Promise.resolve([]);
      }
      if (selectCallCount === 2) {
        // checkLockout: count recent failed attempts -> 6 (over threshold of 5)
        return Promise.resolve([{ count: 6 }]);
      }
      return Promise.resolve([]);
    };

    vi.doMock("../../db", () => ({
      getDb: () => ({
        insert: mockInsert,
        delete: mockDelete,
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              for: vi.fn(() => ({
                limit: vi.fn(mockSelectChain),
              })),
              then: vi.fn((cb: any) => mockSelectChain().then(cb)),
            })),
          })),
        })),
      }),
    }));

    vi.doMock("../../auth/audit", () => ({
      AuditLogger: {
        logAccountLocked: vi.fn().mockResolvedValue(undefined),
        log: vi.fn().mockResolvedValue(undefined),
      },
    }));

    vi.doMock("drizzle-orm", () => ({
      eq: vi.fn(),
      and: vi.fn(),
      gt: vi.fn(),
      sql: vi.fn(),
      count: vi.fn(),
    }));

    vi.doMock("@shared/schema", () => ({
      loginAttempts: {
        email: "email",
        ipAddress: "ipAddress",
        success: "success",
        createdAt: "createdAt",
      },
      accountLockouts: {
        email: "email",
        unlockAt: "unlockAt",
        failedAttempts: "failedAttempts",
        lockedAt: "lockedAt",
      },
    }));

    const { LockoutService } = await import("../../auth/lockout");

    const result = await LockoutService.recordAttempt("test@example.com", "127.0.0.1", false);

    // Since failedAttempts (6) >= MAX_ATTEMPTS (5) and isLocked is false,
    // the lockout record should be created
    expect(result).toBeDefined();
    expect(result.isLocked).toBe(true);
    expect(result.unlockAt).toBeDefined();
    expect(result.failedAttempts).toBe(6);
  });

  it("should handle error in recordAttempt and fall back to checkLockout (line 183)", async () => {
    vi.doMock("../../config/env", () => ({
      env: {
        DATABASE_URL: "mock://test",
        JWT_SECRET: "test-jwt-secret",
        NODE_ENV: "test",
      },
    }));

    vi.doMock("../../security", () => ({
      SECURITY_CONFIG: {
        MAX_LOGIN_ATTEMPTS: 5,
        LOCKOUT_DURATION: 15 * 60 * 1000,
      },
    }));

    vi.doMock("../../config/constants", () => ({
      LOGIN_ATTEMPT_WINDOW_MS: 60 * 60 * 1000,
    }));

    vi.doMock("../../logger", () => ({
      default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },

      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }));

    // Make the insert throw an error to hit the catch block at line 181-183
    let callCount = 0;
    vi.doMock("../../db", () => ({
      getDb: () => ({
        insert: vi.fn(() => ({
          values: vi.fn().mockRejectedValue(new Error("DB insert failed")),
        })),
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => {
              callCount++;
              return Promise.resolve(callCount <= 1 ? [] : [{ count: 0 }]);
            }),
          })),
        })),
        delete: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(undefined),
        })),
      }),
    }));

    vi.doMock("../../auth/audit", () => ({
      AuditLogger: {
        logAccountLocked: vi.fn().mockResolvedValue(undefined),
        log: vi.fn().mockResolvedValue(undefined),
      },
    }));

    vi.doMock("drizzle-orm", () => ({
      eq: vi.fn(),
      and: vi.fn(),
      gt: vi.fn(),
      sql: vi.fn(),
      count: vi.fn(),
    }));

    vi.doMock("@shared/schema", () => ({
      loginAttempts: {
        email: "email",
        ipAddress: "ipAddress",
        success: "success",
        createdAt: "createdAt",
      },
      accountLockouts: {
        email: "email",
        unlockAt: "unlockAt",
        failedAttempts: "failedAttempts",
        lockedAt: "lockedAt",
      },
    }));

    const { LockoutService } = await import("../../auth/lockout");

    const result = await LockoutService.recordAttempt("test@example.com", "127.0.0.1", false);

    // Should return a result from checkLockout fallback, not throw
    expect(result).toBeDefined();
    expect(result.isLocked).toBe(false);
  });
});

// =============================================================================
// Section 3: FilmerRequests — uncovered branches
// =============================================================================

describe("FilmerRequests — uncovered branches", () => {
  // Helper to create a mock transaction
  function createMockTx(overrides: Record<string, any> = {}) {
    const tx: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
            for: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn().mockResolvedValue(undefined),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
      ...overrides,
    };
    return tx;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  function setupFilmerMocks(dbOverrides: any = {}) {
    vi.doMock("../../config/env", () => ({
      env: {
        NODE_ENV: "test",
        DATABASE_URL: "mock://test",
        SESSION_SECRET: "test-secret-key-at-least-32-chars-long",
      },
    }));

    vi.doMock("../../logger", () => ({
      default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },

      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }));

    vi.doMock("drizzle-orm", () => ({
      and: vi.fn((...args: any[]) => args),
      desc: vi.fn((col: any) => col),
      eq: vi.fn((a: any, b: any) => ({ a, b })),
      lt: vi.fn(),
      or: vi.fn((...args: any[]) => args),
      sql: vi.fn(),
    }));

    vi.doMock("@shared/schema", () => ({
      checkIns: {
        id: "id",
        userId: "userId",
        filmerUid: "filmerUid",
        filmerStatus: "filmerStatus",
        filmerRequestId: "filmerRequestId",
        filmerRequestedAt: "filmerRequestedAt",
        filmerRespondedAt: "filmerRespondedAt",
      },
      customUsers: { id: "id", isActive: "isActive" },
      filmerDailyCounters: {
        counterKey: "counterKey",
        day: "day",
        count: "count",
        updatedAt: "updatedAt",
        createdAt: "createdAt",
      },
      filmerRequests: {
        id: "id",
        checkInId: "checkInId",
        requesterId: "requesterId",
        filmerId: "filmerId",
        status: "status",
        reason: "reason",
        createdAt: "createdAt",
        updatedAt: "updatedAt",
        respondedAt: "respondedAt",
      },
      userProfiles: { id: "id", roles: "roles", filmerVerified: "filmerVerified" },
    }));

    vi.doMock("../../auth/audit", () => ({
      AuditLogger: {
        log: vi.fn().mockResolvedValue(undefined),
      },
      AUDIT_EVENTS: {
        FILMER_REQUEST_CREATED: "FILMER_REQUEST_CREATED",
        FILMER_REQUEST_ACCEPTED: "FILMER_REQUEST_ACCEPTED",
        FILMER_REQUEST_REJECTED: "FILMER_REQUEST_REJECTED",
      },
    }));

    const mockDb: any = {
      transaction: vi.fn(),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn().mockResolvedValue(undefined),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
      ...dbOverrides,
    };

    vi.doMock("../../db", () => ({
      getDb: () => mockDb,
    }));

    return mockDb;
  }

  // Helper to setup filmer eligibility check mocks
  function makeEligibleFilmerDb(mockDb: any) {
    // Make select().from() return appropriate data based on the table
    let selectCallCount = 0;
    mockDb.select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => {
            selectCallCount++;
            // First call: customUsers check (filmer is active)
            if (selectCallCount === 1) {
              return Promise.resolve([{ isActive: true }]);
            }
            // Second call: userProfiles check (filmer is verified)
            if (selectCallCount === 2) {
              return Promise.resolve([{ roles: { filmer: true }, filmerVerified: true }]);
            }
            return Promise.resolve([]);
          }),
        })),
      })),
    }));
    return () => {
      selectCallCount = 0;
    };
  }

  describe("createFilmerRequest", () => {
    it("should return existing request when pending request exists (idempotent)", async () => {
      const mockDb = setupFilmerMocks();
      const resetSelect = makeEligibleFilmerDb(mockDb);

      const tx = createMockTx();
      // Set up the tx to return a checkIn owned by the requester
      let txSelectCount = 0;
      tx.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => {
              txSelectCount++;
              if (txSelectCount === 1) {
                // checkIn lookup
                return Promise.resolve([
                  { id: 100, userId: "requester-1", filmerUid: null, filmerRequestId: null },
                ]);
              }
              if (txSelectCount === 2) {
                // existing request lookup - pending
                return Promise.resolve([{ id: "existing-req-id", status: "pending" }]);
              }
              return Promise.resolve([]);
            }),
          })),
        })),
      }));

      mockDb.transaction.mockImplementation(async (cb: any) => cb(tx));

      const { createFilmerRequest } = await import("../../services/filmerRequests");

      const result = await createFilmerRequest({
        requesterId: "requester-1",
        requesterTrustLevel: 2,
        requesterIsActive: true,
        checkInId: 100,
        filmerUid: "filmer-1",
        ipAddress: "127.0.0.1",
      });

      expect(result.alreadyExists).toBe(true);
      expect(result.requestId).toBe("existing-req-id");
      expect(result.status).toBe("pending");
    });

    it("should throw REQUEST_RESOLVED when existing request is already resolved", async () => {
      const mockDb = setupFilmerMocks();
      makeEligibleFilmerDb(mockDb);

      const tx = createMockTx();
      let txSelectCount = 0;
      tx.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => {
              txSelectCount++;
              if (txSelectCount === 1) {
                return Promise.resolve([
                  { id: 100, userId: "requester-1", filmerUid: null, filmerRequestId: null },
                ]);
              }
              if (txSelectCount === 2) {
                // existing request - already resolved (accepted)
                return Promise.resolve([{ id: "existing-req-id", status: "accepted" }]);
              }
              return Promise.resolve([]);
            }),
          })),
        })),
      }));

      mockDb.transaction.mockImplementation(async (cb: any) => cb(tx));

      const { createFilmerRequest, FilmerRequestError } =
        await import("../../services/filmerRequests");

      await expect(
        createFilmerRequest({
          requesterId: "requester-1",
          requesterTrustLevel: 2,
          requesterIsActive: true,
          checkInId: 100,
          filmerUid: "filmer-1",
          ipAddress: "127.0.0.1",
        })
      ).rejects.toThrow("Filmer request already resolved");
    });

    it("should throw ALREADY_REQUESTED when checkIn already has filmerUid set (line 267-268)", async () => {
      const mockDb = setupFilmerMocks();
      makeEligibleFilmerDb(mockDb);

      const tx = createMockTx();
      let txSelectCount = 0;
      tx.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => {
              txSelectCount++;
              if (txSelectCount === 1) {
                // checkIn has filmerUid already set
                return Promise.resolve([
                  {
                    id: 100,
                    userId: "requester-1",
                    filmerUid: "other-filmer",
                    filmerRequestId: "other-req",
                  },
                ]);
              }
              if (txSelectCount === 2) {
                // no existing request for this filmer
                return Promise.resolve([]);
              }
              return Promise.resolve([]);
            }),
          })),
        })),
      }));

      mockDb.transaction.mockImplementation(async (cb: any) => cb(tx));

      const { createFilmerRequest } = await import("../../services/filmerRequests");

      await expect(
        createFilmerRequest({
          requesterId: "requester-1",
          requesterTrustLevel: 2,
          requesterIsActive: true,
          checkInId: 100,
          filmerUid: "filmer-1",
          ipAddress: "127.0.0.1",
        })
      ).rejects.toThrow("Filmer already requested");
    });

    it("should throw CHECKIN_UPDATE_FAILED when update returns no rows (line 294)", async () => {
      const mockDb = setupFilmerMocks();
      makeEligibleFilmerDb(mockDb);

      const tx = createMockTx();
      let txSelectCount = 0;
      tx.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => {
              txSelectCount++;
              if (txSelectCount === 1) {
                return Promise.resolve([
                  { id: 100, userId: "requester-1", filmerUid: null, filmerRequestId: null },
                ]);
              }
              if (txSelectCount === 2) {
                // no existing request
                return Promise.resolve([]);
              }
              return Promise.resolve([]);
            }),
            for: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      }));
      // Quota: no existing counter
      tx.insert = vi.fn(() => ({
        values: vi.fn().mockResolvedValue(undefined),
      }));
      // Update returns empty (no rows updated)
      tx.update = vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([]),
          })),
        })),
      }));

      mockDb.transaction.mockImplementation(async (cb: any) => cb(tx));

      const { createFilmerRequest } = await import("../../services/filmerRequests");

      await expect(
        createFilmerRequest({
          requesterId: "requester-1",
          requesterTrustLevel: 2,
          requesterIsActive: true,
          checkInId: 100,
          filmerUid: "filmer-1",
          ipAddress: "127.0.0.1",
        })
      ).rejects.toThrow("Failed to update check-in");
    });

    it("should throw CHECKIN_NOT_FOUND when checkIn does not exist", async () => {
      const mockDb = setupFilmerMocks();
      makeEligibleFilmerDb(mockDb);

      const tx = createMockTx();
      // select returns empty for checkIn
      tx.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      }));

      mockDb.transaction.mockImplementation(async (cb: any) => cb(tx));

      const { createFilmerRequest } = await import("../../services/filmerRequests");

      await expect(
        createFilmerRequest({
          requesterId: "requester-1",
          requesterTrustLevel: 2,
          requesterIsActive: true,
          checkInId: 999,
          filmerUid: "filmer-1",
          ipAddress: "127.0.0.1",
        })
      ).rejects.toThrow("Check-in not found");
    });

    it("should throw NOT_OWNER when checkIn belongs to another user", async () => {
      const mockDb = setupFilmerMocks();
      makeEligibleFilmerDb(mockDb);

      const tx = createMockTx();
      tx.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi
              .fn()
              .mockResolvedValue([
                { id: 100, userId: "other-user", filmerUid: null, filmerRequestId: null },
              ]),
          })),
        })),
      }));

      mockDb.transaction.mockImplementation(async (cb: any) => cb(tx));

      const { createFilmerRequest } = await import("../../services/filmerRequests");

      await expect(
        createFilmerRequest({
          requesterId: "requester-1",
          requesterTrustLevel: 2,
          requesterIsActive: true,
          checkInId: 100,
          filmerUid: "filmer-1",
          ipAddress: "127.0.0.1",
        })
      ).rejects.toThrow("Cannot request filmer for another user");
    });
  });

  describe("respondToFilmerRequest", () => {
    it("should throw NOT_FOUND when request does not exist", async () => {
      const mockDb = setupFilmerMocks();
      makeEligibleFilmerDb(mockDb);

      const tx = createMockTx();
      // Quota passes
      tx.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
            for: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      }));
      tx.insert = vi.fn(() => ({
        values: vi.fn().mockResolvedValue(undefined),
      }));

      mockDb.transaction.mockImplementation(async (cb: any) => cb(tx));

      const { respondToFilmerRequest } = await import("../../services/filmerRequests");

      await expect(
        respondToFilmerRequest({
          requestId: "nonexistent-req",
          filmerId: "filmer-1",
          action: "accept",
          ipAddress: "127.0.0.1",
        })
      ).rejects.toThrow("Filmer request not found");
    });

    it("should throw FORBIDDEN when wrong filmer tries to respond", async () => {
      const mockDb = setupFilmerMocks();
      makeEligibleFilmerDb(mockDb);

      let txSelectCount = 0;
      const tx = createMockTx();
      tx.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => {
              txSelectCount++;
              if (txSelectCount === 1) {
                // request found but belongs to different filmer
                return Promise.resolve([
                  {
                    id: "req-1",
                    checkInId: 100,
                    requesterId: "requester-1",
                    filmerId: "other-filmer",
                    status: "pending",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                ]);
              }
              return Promise.resolve([]);
            }),
            for: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      }));
      tx.insert = vi.fn(() => ({
        values: vi.fn().mockResolvedValue(undefined),
      }));

      mockDb.transaction.mockImplementation(async (cb: any) => cb(tx));

      const { respondToFilmerRequest } = await import("../../services/filmerRequests");

      await expect(
        respondToFilmerRequest({
          requestId: "req-1",
          filmerId: "filmer-1",
          action: "accept",
          ipAddress: "127.0.0.1",
        })
      ).rejects.toThrow("Only the filmer can respond");
    });

    it("should throw INVALID_STATUS when request is already resolved", async () => {
      const mockDb = setupFilmerMocks();
      makeEligibleFilmerDb(mockDb);

      let txSelectCount = 0;
      const tx = createMockTx();
      tx.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => {
              txSelectCount++;
              if (txSelectCount === 1) {
                return Promise.resolve([
                  {
                    id: "req-1",
                    checkInId: 100,
                    requesterId: "requester-1",
                    filmerId: "filmer-1",
                    status: "accepted",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                ]);
              }
              return Promise.resolve([]);
            }),
            for: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      }));
      tx.insert = vi.fn(() => ({
        values: vi.fn().mockResolvedValue(undefined),
      }));

      mockDb.transaction.mockImplementation(async (cb: any) => cb(tx));

      const { respondToFilmerRequest } = await import("../../services/filmerRequests");

      await expect(
        respondToFilmerRequest({
          requestId: "req-1",
          filmerId: "filmer-1",
          action: "accept",
          ipAddress: "127.0.0.1",
        })
      ).rejects.toThrow("Request already resolved");
    });

    it("should throw CHECKIN_UPDATE_FAILED when check-in update fails in respond", async () => {
      const mockDb = setupFilmerMocks();
      makeEligibleFilmerDb(mockDb);

      let txSelectCount = 0;
      const tx = createMockTx();
      tx.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => {
              txSelectCount++;
              if (txSelectCount === 1) {
                return Promise.resolve([
                  {
                    id: "req-1",
                    checkInId: 100,
                    requesterId: "requester-1",
                    filmerId: "filmer-1",
                    status: "pending",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                ]);
              }
              return Promise.resolve([]);
            }),
            for: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      }));
      tx.insert = vi.fn(() => ({
        values: vi.fn().mockResolvedValue(undefined),
      }));

      // First update succeeds (filmerRequests update), second fails (checkIns update returns empty)
      let updateCallCount = 0;
      tx.update = vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(() => {
              updateCallCount++;
              if (updateCallCount === 1) {
                // filmerRequests update succeeds
                return Promise.resolve([{ id: "req-1" }]);
              }
              // checkIns update fails (no rows)
              return Promise.resolve([]);
            }),
          })),
        })),
      }));

      mockDb.transaction.mockImplementation(async (cb: any) => cb(tx));

      const { respondToFilmerRequest } = await import("../../services/filmerRequests");

      await expect(
        respondToFilmerRequest({
          requestId: "req-1",
          filmerId: "filmer-1",
          action: "accept",
          ipAddress: "127.0.0.1",
        })
      ).rejects.toThrow("Failed to update check-in");
    });

    it("should throw REASON_REQUIRED when rejecting without reason (line 375-376)", async () => {
      const mockDb = setupFilmerMocks();
      makeEligibleFilmerDb(mockDb);

      const { respondToFilmerRequest } = await import("../../services/filmerRequests");

      await expect(
        respondToFilmerRequest({
          requestId: "req-1",
          filmerId: "filmer-1",
          action: "reject",
          ipAddress: "127.0.0.1",
        })
      ).rejects.toThrow("Reject reason is required");
    });
  });

  describe("listFilmerRequests", () => {
    it("should list requests with role=all filter", async () => {
      const mockDb = setupFilmerMocks();
      const now = new Date();

      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([
                {
                  id: "req-1",
                  checkInId: 100,
                  requesterId: "requester-1",
                  filmerId: "filmer-1",
                  status: "pending",
                  reason: null,
                  createdAt: now,
                  updatedAt: now,
                },
              ]),
            })),
          })),
        })),
      }));

      const { listFilmerRequests } = await import("../../services/filmerRequests");

      const results = await listFilmerRequests({
        userId: "requester-1",
        role: "all",
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("req-1");
      expect(results[0].requesterUid).toBe("requester-1");
    });

    it("should list requests with role=requester and status filter", async () => {
      const mockDb = setupFilmerMocks();
      const now = new Date();

      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([
                {
                  id: "req-2",
                  checkInId: 200,
                  requesterId: "requester-1",
                  filmerId: "filmer-2",
                  status: "accepted",
                  reason: "Great spot!",
                  createdAt: now,
                  updatedAt: now,
                },
              ]),
            })),
          })),
        })),
      }));

      const { listFilmerRequests } = await import("../../services/filmerRequests");

      const results = await listFilmerRequests({
        userId: "requester-1",
        role: "requester",
        status: "accepted",
        limit: 10,
      });

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe("accepted");
      expect(results[0].reason).toBe("Great spot!");
    });

    it("should use default role=filmer when not specified", async () => {
      const mockDb = setupFilmerMocks();

      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      }));

      const { listFilmerRequests } = await import("../../services/filmerRequests");

      const results = await listFilmerRequests({
        userId: "filmer-1",
      });

      expect(results).toHaveLength(0);
    });
  });
});

// =============================================================================
// Section 4: OSM Discovery — error/null paths
// =============================================================================

describe("OSM Discovery — uncovered error/null paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should skip elements with no lat/lng (line 143/145)", async () => {
    vi.doMock("../../logger", () => ({
      default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },

      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }));

    vi.doMock("../../redis", () => ({
      getRedisClient: () => null,
    }));

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          elements: [
            {
              type: "node",
              id: 1,
              // No lat/lon/center — should be skipped (line 143)
              tags: { name: "Ghost Park", leisure: "skatepark" },
            },
            {
              type: "way",
              id: 2,
              center: { lat: 40.75, lon: -73.99 },
              tags: {
                name: "Real Park",
                leisure: "skatepark",
                surface: "concrete",
              },
            },
            {
              type: "node",
              id: 3,
              lat: 40.71,
              lon: -74.01,
              // No name, no leisure tag -> name becomes "Skatepark" but leisure is missing (line 149)
              tags: { sport: "skateboard" },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { discoverSkateparks } = await import("../../services/osmDiscovery");

    // Use coordinates that won't be cached
    const results = await discoverSkateparks(55.55, 55.55, 10000);

    // Element 1 skipped (no coords), element 3 skipped (unnamed + no leisure)
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Real Park");
  });

  it("should handle AbortError when Overpass API times out (line 182-183)", async () => {
    vi.doMock("../../logger", () => ({
      default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },

      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }));

    vi.doMock("../../redis", () => ({
      getRedisClient: () => null,
    }));

    const abortError = new Error("Aborted");
    abortError.name = "AbortError";
    const mockFetch = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal("fetch", mockFetch);

    const { discoverSkateparks } = await import("../../services/osmDiscovery");

    const results = await discoverSkateparks(66.66, 66.66, 10000);
    expect(results).toEqual([]);
  });

  it("should handle non-AbortError failures (line 185-186)", async () => {
    vi.doMock("../../logger", () => ({
      default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },

      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }));

    vi.doMock("../../redis", () => ({
      getRedisClient: () => null,
    }));

    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", mockFetch);

    const { discoverSkateparks } = await import("../../services/osmDiscovery");

    const results = await discoverSkateparks(77.77, 77.77, 10000);
    expect(results).toEqual([]);
  });

  it("should handle non-OK response from Overpass API (line 124-126)", async () => {
    vi.doMock("../../logger", () => ({
      default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },

      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }));

    vi.doMock("../../redis", () => ({
      getRedisClient: () => null,
    }));

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    });
    vi.stubGlobal("fetch", mockFetch);

    const { discoverSkateparks } = await import("../../services/osmDiscovery");

    const results = await discoverSkateparks(88.88, 88.88, 10000);
    expect(results).toEqual([]);
  });

  it("should use name:en fallback, infer bowl spot type, and build full address (line 146, 223-224)", async () => {
    vi.doMock("../../logger", () => ({
      default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },

      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }));

    vi.doMock("../../redis", () => ({
      getRedisClient: () => null,
    }));

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          elements: [
            {
              type: "node",
              id: 10,
              lat: 35.0,
              lon: 135.0,
              tags: {
                // Use tags.name with "bowl" so inferSpotType returns "bowl"
                name: "Tokyo Bowl Park",
                leisure: "skatepark",
                "addr:street": "Main St",
                "addr:housenumber": "123",
                "addr:city": "Tokyo",
                "addr:state": "Tokyo",
                "addr:country": "JP",
              },
            },
            {
              type: "node",
              id: 11,
              lat: 35.01,
              lon: 135.01,
              tags: {
                // No tags.name, only name:en — tests line 146 fallback
                "name:en": "Osaka Street Spot",
                leisure: "pitch",
                sport: "skateboard",
                "addr:street": "Second Ave",
              },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { discoverSkateparks } = await import("../../services/osmDiscovery");

    const results = await discoverSkateparks(35.0, 135.0, 10000);
    expect(results).toHaveLength(2);

    // First element: uses tags.name which contains "bowl"
    expect(results[0].name).toBe("Tokyo Bowl Park");
    expect(results[0].spotType).toBe("bowl");
    expect(results[0].address).toContain("123 Main St");
    expect(results[0].city).toBe("Tokyo");
    expect(results[0].country).toBe("JP");

    // Second element: uses name:en fallback
    expect(results[1].name).toBe("Osaka Street Spot");
    expect(results[1].spotType).toBe("park"); // leisure=pitch -> "park"
    expect(results[1].address).toContain("Second Ave");
  });

  it("should handle Redis cache check failure and fall back to memory (line 64-68)", async () => {
    vi.doMock("../../logger", () => ({
      default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },

      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }));

    const mockRedisClient = {
      exists: vi.fn().mockRejectedValue(new Error("Redis connection failed")),
      set: vi.fn(),
    };

    vi.doMock("../../redis", () => ({
      getRedisClient: () => mockRedisClient,
    }));

    const { isAreaCached } = await import("../../services/osmDiscovery");

    // Should fall back to in-memory cache and return false
    const result = await isAreaCached(11.11, 11.11);
    expect(result).toBe(false);
  });
});

// =============================================================================
// Section 5: VideoTranscoder — processVideoJob catch block
// =============================================================================

describe("VideoTranscoder — processVideoJob catch block (lines 435-438)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should catch errors, log them, and set clip status to failed", async () => {
    vi.doMock("../../config/env", () => ({
      env: {
        DATABASE_URL: "mock://test",
        NODE_ENV: "test",
      },
    }));

    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    vi.doMock("../../logger", () => ({
      default: mockLogger,

      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }));

    const execFileAsyncMock = vi.fn();
    vi.doMock("node:child_process", () => ({
      execFile: vi.fn(),
    }));
    vi.doMock("node:util", () => ({
      promisify: () => execFileAsyncMock,
    }));

    const mockMkdtemp = vi.fn().mockResolvedValue("/tmp/skate-transcode-test");
    const mockRm = vi.fn().mockResolvedValue(undefined);
    const mockStat = vi.fn().mockResolvedValue({ size: 1024 });
    vi.doMock("node:fs/promises", () => ({
      mkdtemp: (...args: any[]) => mockMkdtemp(...args),
      rm: (...args: any[]) => mockRm(...args),
      stat: (...args: any[]) => mockStat(...args),
    }));

    vi.doMock("node:os", () => ({
      tmpdir: () => "/tmp",
    }));

    // Make join() throw on the third call (thumbPath) to trigger the outer catch
    let joinCallCount = 0;
    vi.doMock("node:path", () => ({
      join: (...parts: string[]) => {
        joinCallCount++;
        // First call: mkdtemp prefix (tmpdir + "skate-transcode-")
        // Second call: thumbPath = join(workDir, "thumb.jpg") — throw here!
        if (joinCallCount === 2) {
          throw new Error("Unexpected path error");
        }
        return parts.join("/");
      },
    }));

    vi.doMock("drizzle-orm", () => ({
      eq: (col: any, val: any) => ({ _op: "eq", col, val }),
    }));

    vi.doMock("@shared/schema", () => ({
      trickClips: {
        _table: "trickClips",
        id: { name: "id" },
      },
    }));

    const mockDbUpdate = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    }));

    vi.doMock("../../db", () => ({
      getDb: () => ({
        update: mockDbUpdate,
      }),
    }));

    // Make probeVideo succeed with valid h264 video (needsTranscode = false)
    execFileAsyncMock.mockResolvedValue({
      stdout: JSON.stringify({
        format: { duration: "5", size: "500000", bit_rate: "500000" },
        streams: [
          {
            codec_type: "video",
            codec_name: "h264",
            width: 720,
            height: 1280,
            r_frame_rate: "30/1",
          },
        ],
      }),
    });

    const { processVideoJob } = await import("../../services/videoTranscoder");

    const result = await processVideoJob(42, "/test/video.mp4");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unexpected path error");
    // Verify the error was logged
    expect(mockLogger.error).toHaveBeenCalledWith(
      "[Transcoder] processVideoJob failed",
      expect.objectContaining({ clipId: 42 })
    );
    // Verify clip status was set to "failed"
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it("should handle non-Error thrown objects in catch block", async () => {
    vi.doMock("../../config/env", () => ({
      env: {
        DATABASE_URL: "mock://test",
        NODE_ENV: "test",
      },
    }));

    vi.doMock("../../logger", () => ({
      default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },

      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }));

    const execFileAsyncMock2 = vi.fn();
    vi.doMock("node:child_process", () => ({
      execFile: vi.fn(),
    }));
    vi.doMock("node:util", () => ({
      promisify: () => execFileAsyncMock2,
    }));

    vi.doMock("node:fs/promises", () => ({
      mkdtemp: vi.fn().mockResolvedValue("/tmp/skate-transcode-test2"),
      rm: vi.fn().mockResolvedValue(undefined),
      stat: vi.fn().mockResolvedValue({ size: 1024 }),
    }));

    vi.doMock("node:os", () => ({ tmpdir: () => "/tmp" }));

    // Throw a non-Error value from join to test String(err) branch
    let joinCallCount2 = 0;
    vi.doMock("node:path", () => ({
      join: (...parts: string[]) => {
        joinCallCount2++;
        if (joinCallCount2 === 2) {
          throw "string error thrown"; // Non-Error thrown
        }
        return parts.join("/");
      },
    }));

    vi.doMock("drizzle-orm", () => ({
      eq: vi.fn(),
    }));
    vi.doMock("@shared/schema", () => ({
      trickClips: { _table: "trickClips", id: { name: "id" } },
    }));
    vi.doMock("../../db", () => ({
      getDb: () => ({
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn().mockResolvedValue(undefined),
          })),
        })),
      }),
    }));

    // Make probeVideo succeed with valid h264 video
    execFileAsyncMock2.mockResolvedValue({
      stdout: JSON.stringify({
        format: { duration: "5", size: "500000", bit_rate: "500000" },
        streams: [
          {
            codec_type: "video",
            codec_name: "h264",
            width: 720,
            height: 1280,
            r_frame_rate: "30/1",
          },
        ],
      }),
    });

    const { processVideoJob } = await import("../../services/videoTranscoder");

    const result = await processVideoJob(99, "/test/video2.mp4");
    expect(result.success).toBe(false);
    expect(result.error).toBe("string error thrown");
  });
});

// =============================================================================
// Section 6: Monitoring — "unknown" version branch and admin status
// =============================================================================

describe("Monitoring — version fallback and admin system status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should use 'unknown' when npm_package_version is not set (line 187)", async () => {
    // Save and clear the env var
    const originalVersion = process.env.npm_package_version;
    delete process.env.npm_package_version;

    vi.doMock("../../logger", () => ({
      default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },

      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }));

    vi.doMock("../../config/env", () => ({
      env: { DATABASE_URL: "mock://test", NODE_ENV: "test" },
    }));

    vi.doMock("../../db", () => ({
      getDb: () => ({
        execute: vi.fn().mockResolvedValue("ok"),
      }),
      isDatabaseAvailable: vi.fn(() => true),
    }));

    vi.doMock("../../redis", () => ({
      getRedisClient: () => null,
    }));

    vi.doMock("drizzle-orm", () => ({
      sql: (strings: TemplateStringsArray, ...values: any[]) => ({
        _sql: strings.join("?"),
        values,
      }),
    }));

    vi.doMock("../../services/videoTranscoder", () => ({
      checkFfmpegAvailable: vi.fn().mockResolvedValue({ ffmpeg: true, ffprobe: true }),
    }));

    const { registerMonitoringRoutes, metricsMiddleware } = await import("../../monitoring/index");

    // Capture routes
    const routes: Record<string, Function> = {};
    const app: any = {
      get: vi.fn((path: string, ...handlers: Function[]) => {
        routes[path] = handlers[handlers.length - 1];
      }),
    };
    registerMonitoringRoutes(app);

    // Call the health endpoint
    const jsonData: any[] = [];
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn((data: any) => {
        jsonData.push(data);
        return res;
      }),
    };

    await routes["/api/health"]({}, res);

    expect(jsonData[0].version).toBe("unknown");

    // Restore env
    if (originalVersion !== undefined) {
      process.env.npm_package_version = originalVersion;
    }
  });

  it("should return full admin system status with metrics, percentile, memory, CPU (lines 212-222)", async () => {
    vi.doMock("../../logger", () => ({
      default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },

      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }));

    vi.doMock("../../config/env", () => ({
      env: { DATABASE_URL: "mock://test", NODE_ENV: "test" },
    }));

    vi.doMock("../../db", () => ({
      getDb: () => ({
        execute: vi.fn().mockResolvedValue("ok"),
      }),
      isDatabaseAvailable: vi.fn(() => true),
    }));

    vi.doMock("../../redis", () => ({
      getRedisClient: () => null,
    }));

    vi.doMock("drizzle-orm", () => ({
      sql: (strings: TemplateStringsArray, ...values: any[]) => ({
        _sql: strings.join("?"),
        values,
      }),
    }));

    vi.doMock("../../services/videoTranscoder", () => ({
      checkFfmpegAvailable: vi.fn().mockResolvedValue({ ffmpeg: true, ffprobe: true }),
    }));

    const { registerMonitoringRoutes, metricsMiddleware } = await import("../../monitoring/index");

    // Record some requests via middleware to populate metrics
    const middleware = metricsMiddleware();
    const statusCodes = [200, 200, 200, 404, 500, 200, 302, 201];
    for (const code of statusCodes) {
      const finishListeners: Function[] = [];
      const mockRes: any = {
        statusCode: code,
        on: vi.fn((event: string, cb: Function) => {
          if (event === "finish") finishListeners.push(cb);
          return mockRes;
        }),
      };
      const next = vi.fn();
      middleware({} as any, mockRes, next);
      // Trigger finish
      for (const cb of finishListeners) cb();
    }

    // Register routes
    const routes: Record<string, Function> = {};
    const app: any = {
      get: vi.fn((path: string, ...handlers: Function[]) => {
        routes[path] = handlers[handlers.length - 1];
      }),
    };
    registerMonitoringRoutes(app);

    // Call admin system status
    const jsonData: any[] = [];
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn((data: any) => {
        jsonData.push(data);
        return res;
      }),
    };

    await routes["/api/admin/system-status"]({}, res);

    const status = jsonData[0];

    // Verify health section
    expect(status.health).toBeDefined();
    expect(status.health.status).toBe("healthy");

    // Verify metrics section
    expect(status.metrics).toBeDefined();
    expect(status.metrics.totalRequests).toBeGreaterThanOrEqual(statusCodes.length);
    expect(status.metrics.totalErrors).toBeGreaterThanOrEqual(1); // at least the 500
    expect(typeof status.metrics.errorRate).toBe("number");
    expect(typeof status.metrics.avgLatencyMs).toBe("number");
    expect(typeof status.metrics.p95LatencyMs).toBe("number");
    expect(typeof status.metrics.p99LatencyMs).toBe("number");
    expect(typeof status.metrics.requestsPerMinute).toBe("number");
    expect(status.metrics.topStatusCodes).toBeDefined();
    expect(Array.isArray(status.metrics.topStatusCodes)).toBe(true);

    // Verify process section
    expect(status.process).toBeDefined();
    expect(typeof status.process.memoryUsageMb).toBe("number");
    expect(typeof status.process.heapUsedMb).toBe("number");
    expect(typeof status.process.cpuUser).toBe("number");
    expect(typeof status.process.cpuSystem).toBe("number");
    expect(typeof status.process.pid).toBe("number");
    expect(typeof status.process.nodeVersion).toBe("string");
  });
});
