import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import {
  checkIns,
  customUsers,
  filmerDailyCounters,
  filmerRequests,
  userProfiles,
} from "@shared/schema";

vi.mock("../config/env", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    SESSION_SECRET: "test-secret-key",
  },
}));

import {
  createFilmerRequest,
  FilmerRequestError,
  respondToFilmerRequest,
} from "../services/filmerRequests";
import { handleFilmerRequest } from "../routes/filmer";
import * as filmerService from "../services/filmerRequests";

type MockCheckIn = {
  id: number;
  userId: string;
  filmerUid?: string | null;
  filmerStatus?: string | null;
  filmerRequestId?: string | null;
  filmerRequestedAt?: Date | null;
  filmerRespondedAt?: Date | null;
};

type MockUser = {
  id: string;
  isActive: boolean;
  trustLevel: number;
};

type MockProfile = {
  id: string;
  roles?: { filmer?: boolean } | null;
  filmerVerified?: boolean | null;
};

type MockFilmerRequest = {
  id: string;
  checkInId: number;
  requesterId: string;
  filmerId: string;
  status: string;
  reason?: string | null;
  createdAt: Date;
  updatedAt: Date;
  respondedAt?: Date | null;
};

type MockCounter = {
  counterKey: string;
  day: string;
  count: number;
  createdAt: Date;
  updatedAt: Date;
};

const { mockDb } = vi.hoisted(() => {
  const createMockDb = () => {
    let checkInsData: MockCheckIn[] = [];
    let usersData: MockUser[] = [];
    let profilesData: MockProfile[] = [];
    let requestsData: MockFilmerRequest[] = [];
    let countersData: MockCounter[] = [];

    const select = vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => {
            if (table === checkIns) {
              return checkInsData.slice(0, 1);
            }
            if (table === customUsers) {
              return usersData.slice(0, 1);
            }
            if (table === userProfiles) {
              return profilesData.slice(0, 1);
            }
            if (table === filmerRequests) {
              return requestsData.slice(0, 1);
            }
            if (table === filmerDailyCounters) {
              return countersData.slice(0, 1);
            }
            return [];
          }),
        })),
        orderBy: vi.fn(() => ({
          limit: vi.fn(async () => {
            if (table === filmerRequests) {
              return requestsData.slice(0, 1);
            }
            return [];
          }),
        })),
        limit: vi.fn(async () => {
          if (table === filmerRequests) {
            return requestsData.slice(0, 1);
          }
          return [];
        }),
      })),
    }));

    const insert = vi.fn((table: unknown) => ({
      values: vi.fn(async (payload: Record<string, unknown>) => {
        if (table === filmerRequests) {
          requestsData = [payload as MockFilmerRequest];
        }
        if (table === filmerDailyCounters) {
          countersData = [payload as MockCounter];
        }
        return [];
      }),
    }));

    const update = vi.fn((table: unknown) => ({
      set: vi.fn((changes: Record<string, unknown>) => ({
        where: vi.fn(() => {
          if (table === checkIns && checkInsData.length > 0) {
            checkInsData = [{ ...checkInsData[0], ...changes }];
          }
          if (table === filmerRequests && requestsData.length > 0) {
            requestsData = [{ ...requestsData[0], ...changes }];
          }
          if (table === filmerDailyCounters && countersData.length > 0) {
            countersData = [{ ...countersData[0], ...changes }];
          }
          return {
            returning: vi.fn(async () => {
              if (table === checkIns && checkInsData.length > 0) {
                return [{ id: checkInsData[0].id }];
              }
              if (table === filmerRequests && requestsData.length > 0) {
                return [{ id: requestsData[0].id }];
              }
              if (table === filmerDailyCounters && countersData.length > 0) {
                return [{ key: countersData[0].counterKey }];
              }
              return [];
            }),
          };
        }),
      })),
    }));

    const deleteFn = vi.fn((table: unknown) => ({
      where: vi.fn(() => {
        if (table === filmerDailyCounters) {
          countersData = countersData.filter((counter) => counter.day >= "2000-01-01");
        }
        return [];
      }),
    }));

    const transaction = vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({ select, insert, update });
    });

    return {
      select,
      insert,
      update,
      delete: deleteFn,
      transaction,
      setCheckIns: (data: MockCheckIn[]) => {
        checkInsData = data;
      },
      setUsers: (data: MockUser[]) => {
        usersData = data;
      },
      setProfiles: (data: MockProfile[]) => {
        profilesData = data;
      },
      setRequests: (data: MockFilmerRequest[]) => {
        requestsData = data;
      },
      setCounters: (data: MockCounter[]) => {
        countersData = data;
      },
      getCheckIns: () => checkInsData,
      getRequests: () => requestsData,
      getCounters: () => countersData,
      reset: () => {
        checkInsData = [];
        usersData = [];
        profilesData = [];
        requestsData = [];
        countersData = [];
      },
    };
  };

  return {
    mockDb: createMockDb(),
  };
});

vi.mock("../db", () => ({
  getDb: () => mockDb,
}));

vi.mock("../auth/audit", () => ({
  AuditLogger: {
    log: vi.fn().mockResolvedValue(undefined),
  },
  AUDIT_EVENTS: {
    FILMER_REQUEST_CREATED: "FILMER_REQUEST_CREATED",
    FILMER_REQUEST_ACCEPTED: "FILMER_REQUEST_ACCEPTED",
    FILMER_REQUEST_REJECTED: "FILMER_REQUEST_REJECTED",
  },
}));

const createMockResponse = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
};

describe("filmer request routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated filmer requests", async () => {
    const req = {
      body: { checkInId: "1", filmerUid: "filmer-1" },
    } as Request;
    const res = createMockResponse();

    await handleFilmerRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects attempts to set filmer status directly", async () => {
    const req = {
      body: { checkInId: "1", filmerUid: "filmer-1", filmerStatus: "accepted" },
      currentUser: { id: "skater-1", trustLevel: 1, isActive: true },
      get: vi.fn(),
    } as unknown as Request;
    const res = createMockResponse();
    const serviceSpy = vi.spyOn(filmerService, "createFilmerRequest");

    await handleFilmerRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(serviceSpy).not.toHaveBeenCalled();
  });
});

describe("filmer request service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.reset();
  });

  it("prevents non-eligible filmers from responding", async () => {
    mockDb.setUsers([{ id: "filmer-1", isActive: true, trustLevel: 0 }]);
    mockDb.setProfiles([{ id: "filmer-1", roles: { filmer: false }, filmerVerified: false }]);

    await expect(
      respondToFilmerRequest({
        requestId: "req-1",
        filmerId: "filmer-1",
        action: "accept",
        ipAddress: "127.0.0.1",
      })
    ).rejects.toBeInstanceOf(FilmerRequestError);
  });

  it("blocks after exceeding daily request quota", async () => {
    mockDb.setUsers([
      { id: "filmer-1", isActive: true, trustLevel: 1 },
      { id: "skater-1", isActive: true, trustLevel: 1 },
    ]);
    mockDb.setProfiles([{ id: "filmer-1", roles: { filmer: true }, filmerVerified: false }]);

    const today = new Date().toISOString().slice(0, 10);

    for (let i = 1; i <= 10; i += 1) {
      mockDb.setCheckIns([{ id: i, userId: "skater-1" }]);
      mockDb.setRequests([]);
      await createFilmerRequest({
        requesterId: "skater-1",
        requesterTrustLevel: 1,
        requesterIsActive: true,
        checkInId: i,
        filmerUid: "filmer-1",
        ipAddress: "127.0.0.1",
      });
    }

    mockDb.setCounters([
      {
        counterKey: "filmer:request:test:skater-1",
        day: today,
        count: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockDb.setCheckIns([{ id: 11, userId: "skater-1" }]);
    mockDb.setRequests([]);

    await expect(
      createFilmerRequest({
        requesterId: "skater-1",
        requesterTrustLevel: 1,
        requesterIsActive: true,
        checkInId: 11,
        filmerUid: "filmer-1",
        ipAddress: "127.0.0.1",
      })
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
  });

  it("returns existing pending request id", async () => {
    mockDb.setUsers([
      { id: "filmer-1", isActive: true, trustLevel: 1 },
      { id: "skater-1", isActive: true, trustLevel: 1 },
    ]);
    mockDb.setProfiles([{ id: "filmer-1", roles: { filmer: true }, filmerVerified: false }]);
    mockDb.setCheckIns([{ id: 1, userId: "skater-1" }]);

    const first = await createFilmerRequest({
      requesterId: "skater-1",
      requesterTrustLevel: 1,
      requesterIsActive: true,
      checkInId: 1,
      filmerUid: "filmer-1",
      ipAddress: "127.0.0.1",
    });

    const second = await createFilmerRequest({
      requesterId: "skater-1",
      requesterTrustLevel: 1,
      requesterIsActive: true,
      checkInId: 1,
      filmerUid: "filmer-1",
      ipAddress: "127.0.0.1",
    });

    expect(second.requestId).toBe(first.requestId);
    expect(second.status).toBe("pending");
    expect(second.alreadyExists).toBe(true);
  });

  it("rejects new request when previous is resolved", async () => {
    mockDb.setUsers([
      { id: "filmer-1", isActive: true, trustLevel: 1 },
      { id: "skater-1", isActive: true, trustLevel: 1 },
    ]);
    mockDb.setProfiles([{ id: "filmer-1", roles: { filmer: true }, filmerVerified: false }]);
    mockDb.setCheckIns([{ id: 1, userId: "skater-1" }]);
    mockDb.setRequests([
      {
        id: "req-1",
        checkInId: 1,
        requesterId: "skater-1",
        filmerId: "filmer-1",
        status: "accepted",
        createdAt: new Date(),
        updatedAt: new Date(),
        respondedAt: new Date(),
      },
    ]);

    await expect(
      createFilmerRequest({
        requesterId: "skater-1",
        requesterTrustLevel: 1,
        requesterIsActive: true,
        checkInId: 1,
        filmerUid: "filmer-1",
        ipAddress: "127.0.0.1",
      })
    ).rejects.toMatchObject({ code: "REQUEST_RESOLVED" });
  });

  it("rejects self-filming requests", async () => {
    mockDb.setUsers([{ id: "skater-1", isActive: true, trustLevel: 1 }]);
    mockDb.setProfiles([{ id: "skater-1", roles: { filmer: true }, filmerVerified: false }]);
    mockDb.setCheckIns([{ id: 1, userId: "skater-1" }]);

    await expect(
      createFilmerRequest({
        requesterId: "skater-1",
        requesterTrustLevel: 1,
        requesterIsActive: true,
        checkInId: 1,
        filmerUid: "skater-1",
        ipAddress: "127.0.0.1",
      })
    ).rejects.toMatchObject({ code: "SELF_FILMING_NOT_ALLOWED" });
  });

  it("updates check-in status on accept and reject", async () => {
    mockDb.setUsers([
      { id: "filmer-1", isActive: true, trustLevel: 1 },
      { id: "skater-1", isActive: true, trustLevel: 1 },
    ]);
    mockDb.setProfiles([{ id: "filmer-1", roles: { filmer: true }, filmerVerified: false }]);
    mockDb.setCheckIns([{ id: 1, userId: "skater-1" }]);
    mockDb.setRequests([]);

    const request = await createFilmerRequest({
      requesterId: "skater-1",
      requesterTrustLevel: 1,
      requesterIsActive: true,
      checkInId: 1,
      filmerUid: "filmer-1",
      ipAddress: "127.0.0.1",
    });

    const pendingCheckIn = mockDb.getCheckIns()[0];
    expect(pendingCheckIn.filmerStatus).toBe("pending");
    expect(pendingCheckIn.filmerRequestId).toBe(request.requestId);

    mockDb.setRequests([
      {
        id: request.requestId,
        checkInId: 1,
        requesterId: "skater-1",
        filmerId: "filmer-1",
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await respondToFilmerRequest({
      requestId: request.requestId,
      filmerId: "filmer-1",
      action: "accept",
      ipAddress: "127.0.0.1",
    });

    const acceptedCheckIn = mockDb.getCheckIns()[0];
    expect(acceptedCheckIn.filmerStatus).toBe("accepted");
    expect(acceptedCheckIn.filmerRespondedAt).toBeInstanceOf(Date);
    const acceptedRequest = mockDb.getRequests()[0];
    expect(acceptedRequest?.respondedAt).toBeInstanceOf(Date);

    mockDb.setCheckIns([{ id: 2, userId: "skater-1" }]);
    mockDb.setRequests([]);
    const rejectRequest = await createFilmerRequest({
      requesterId: "skater-1",
      requesterTrustLevel: 1,
      requesterIsActive: true,
      checkInId: 2,
      filmerUid: "filmer-1",
      ipAddress: "127.0.0.1",
    });

    mockDb.setRequests([
      {
        id: rejectRequest.requestId,
        checkInId: 2,
        requesterId: "skater-1",
        filmerId: "filmer-1",
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await respondToFilmerRequest({
      requestId: rejectRequest.requestId,
      filmerId: "filmer-1",
      action: "reject",
      reason: "Not my clip",
      ipAddress: "127.0.0.1",
    });

    const rejectedCheckIn = mockDb.getCheckIns()[0];
    expect(rejectedCheckIn.filmerStatus).toBe("rejected");
    expect(rejectedCheckIn.filmerRespondedAt).toBeInstanceOf(Date);
    const rejectedRequest = mockDb.getRequests()[0];
    expect(rejectedRequest?.respondedAt).toBeInstanceOf(Date);
  });
});
