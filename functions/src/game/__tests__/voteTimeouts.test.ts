/**
 * @fileoverview Focused tests for voteTimeouts.ts covering all branches.
 *
 * Covers the uncovered lines/branches: 72, 77-155, 160-176 including:
 * - sendVoteReminderNotifications: no pending move, no moves array,
 *   judgmentVotes fallback, attacker already voted, defender already voted,
 *   no fcmToken, defender id logic
 * - autoResolveVoteTimeout: freshSnap not exists, turnPhase mismatch,
 *   voteDeadline null, voteDeadline not expired, no pending move in fresh data,
 *   move.judgmentVotes fallback, defender id computation
 * - sendTimeoutNotifications: no fcmToken, fcmToken present
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Hoisted mock state
// ============================================================================

const mocks = vi.hoisted(() => {
  const transaction = {
    get: vi.fn(),
    update: vi.fn(),
    set: vi.fn(),
  };

  const runTransaction = vi.fn(async (fn: any) => fn(transaction));

  const docRef: Record<string, any> = {
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({ exists: false, data: () => ({}), get: () => null }),
    update: vi.fn().mockResolvedValue(undefined),
  };

  const collectionRef: Record<string, any> = {
    add: vi.fn().mockResolvedValue({ id: "audit-log-id" }),
    doc: vi.fn().mockReturnValue(docRef),
    where: vi.fn(),
    get: vi.fn().mockResolvedValue({ docs: [] }),
  };
  collectionRef.where.mockReturnValue(collectionRef);

  const firestoreInstance = {
    collection: vi.fn().mockReturnValue(collectionRef),
    doc: vi.fn().mockReturnValue(docRef),
    runTransaction,
  };

  const messagingInstance = {
    send: vi.fn().mockResolvedValue("message-id"),
  };

  const logger = {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  return {
    transaction,
    runTransaction,
    collectionRef,
    docRef,
    firestoreInstance,
    messagingInstance,
    logger,
  };
});

// ============================================================================
// Module mocks
// ============================================================================

vi.mock("firebase-functions/v2", () => ({
  logger: mocks.logger,
}));

vi.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: vi.fn((_schedule: string, handler: any) => handler),
}));

vi.mock("firebase-functions", () => ({
  logger: mocks.logger,
}));

vi.mock("firebase-admin", () => {
  const firestoreFn = Object.assign(
    vi.fn(() => mocks.firestoreInstance),
    {
      FieldValue: {
        serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
        arrayUnion: vi.fn((...args: any[]) => args),
      },
      Timestamp: {
        fromDate: vi.fn((date: Date) => ({ toMillis: () => date.getTime() })),
        now: vi.fn(() => ({ toMillis: () => Date.now() })),
      },
    }
  );

  const mod = {
    apps: [{ name: "mock" }],
    initializeApp: vi.fn(),
    firestore: firestoreFn,
    messaging: vi.fn(() => mocks.messagingInstance),
  };

  return { ...mod, default: mod };
});

// ============================================================================
// Import under test (after all vi.mock)
// ============================================================================

import { processVoteTimeouts } from "../voteTimeouts";

// ============================================================================
// Helper: invoke the scheduled handler
// ============================================================================

const run = () => (processVoteTimeouts as any)();

// ============================================================================
// Tests
// ============================================================================

describe("voteTimeouts", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset default mock behaviors
    mocks.collectionRef.get.mockResolvedValue({ docs: [] });
    mocks.collectionRef.where.mockReturnValue(mocks.collectionRef);
    mocks.firestoreInstance.collection.mockReturnValue(mocks.collectionRef);
    mocks.firestoreInstance.doc.mockReturnValue(mocks.docRef);
    mocks.docRef.get.mockResolvedValue({ exists: false, data: () => ({}), get: () => null });
    mocks.messagingInstance.send.mockResolvedValue("message-id");
    mocks.runTransaction.mockImplementation(async (fn: any) => fn(mocks.transaction));
  });

  // ==========================================================================
  // processVoteTimeouts - main loop
  // ==========================================================================

  describe("main loop", () => {
    it("does nothing when there are no games in judging", async () => {
      mocks.collectionRef.get.mockResolvedValue({ docs: [] });
      await run();
      expect(mocks.runTransaction).not.toHaveBeenCalled();
    });

    it("skips game docs with null voteDeadline (continue branch)", async () => {
      const gameDoc = {
        id: "game-null-deadline",
        data: () => ({
          voteDeadline: null,
          voteReminderSent: false,
        }),
        ref: { update: vi.fn() },
      };

      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });
      await run();

      expect(gameDoc.ref.update).not.toHaveBeenCalled();
      expect(mocks.runTransaction).not.toHaveBeenCalled();
    });

    it("does not send reminder or auto-resolve when deadline is far away", async () => {
      const nowMs = Date.now();
      const deadlineMs = nowMs + 60000; // 60s away — outside 30s window

      const gameDoc = {
        id: "game-far",
        data: () => ({
          player1Id: "p1",
          player2Id: "p2",
          currentAttacker: "p1",
          voteDeadline: { toMillis: () => deadlineMs },
          voteReminderSent: false,
          moves: [],
        }),
        ref: { update: vi.fn() },
      };

      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });
      await run();

      expect(gameDoc.ref.update).not.toHaveBeenCalled();
      expect(mocks.runTransaction).not.toHaveBeenCalled();
    });

    it("does not send reminder when voteReminderSent is already true", async () => {
      const nowMs = Date.now();
      const deadlineMs = nowMs + 20000; // 20s remaining (within window)

      const gameDoc = {
        id: "game-already-reminded",
        data: () => ({
          player1Id: "p1",
          player2Id: "p2",
          currentAttacker: "p1",
          voteDeadline: { toMillis: () => deadlineMs },
          voteReminderSent: true, // already sent
          moves: [{ type: "match", result: "pending", judgmentVotes: { attackerVote: null, defenderVote: null } }],
        }),
        ref: { update: vi.fn() },
      };

      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });
      await run();

      // Reminder should not be sent again
      expect(gameDoc.ref.update).not.toHaveBeenCalled();
      expect(mocks.runTransaction).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // sendVoteReminderNotifications
  // ==========================================================================

  describe("sendVoteReminderNotifications", () => {
    /** Helper: create a gameDoc in the 30s reminder window */
    function makeReminderGameDoc(overrides: Record<string, any> = {}) {
      const nowMs = Date.now();
      const deadlineMs = nowMs + 20000; // 20s remaining (within 30s window, > 0)

      return {
        id: overrides.id ?? "game-reminder",
        data: () => ({
          player1Id: "p1",
          player2Id: "p2",
          currentAttacker: "p1",
          voteDeadline: { toMillis: () => deadlineMs },
          voteReminderSent: false,
          moves: [
            {
              type: "match",
              result: "pending",
              judgmentVotes: { attackerVote: null, defenderVote: null },
            },
          ],
          ...overrides,
        }),
        ref: { update: vi.fn().mockResolvedValue(undefined) },
      };
    }

    it("returns early when no pending move exists (line 77)", async () => {
      const gameDoc = makeReminderGameDoc({
        moves: [{ type: "match", result: "landed" }], // no pending move
      });

      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });
      await run();

      // voteReminderSent should still be updated (the outer code calls update after sendVoteReminderNotifications)
      // Actually, sendVoteReminderNotifications returns early, then the outer code still calls update.
      // Let me re-read the code...
      // The outer code calls sendVoteReminderNotifications, then updates. So update is still called.
      expect(gameDoc.ref.update).toHaveBeenCalledWith({ voteReminderSent: true });
      // But no notifications should be sent
      expect(mocks.messagingInstance.send).not.toHaveBeenCalled();
    });

    it("handles missing moves array (line 72 - fallback to empty array)", async () => {
      const gameDoc = makeReminderGameDoc({
        moves: undefined, // no moves array at all
      });

      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });
      await run();

      // No pending move found, but update still happens
      expect(gameDoc.ref.update).toHaveBeenCalledWith({ voteReminderSent: true });
      expect(mocks.messagingInstance.send).not.toHaveBeenCalled();
    });

    it("uses judgmentVotes fallback when pendingMove has no judgmentVotes (line 79-82)", async () => {
      const gameDoc = makeReminderGameDoc({
        moves: [
          {
            type: "match",
            result: "pending",
            // no judgmentVotes property — will fall back to { attackerVote: null, defenderVote: null }
          },
        ],
      });

      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ fcmToken: "token-fb" }),
        get: (field: string) => (field === "fcmToken" ? "token-fb" : null),
      });

      await run();

      // Both attacker and defender should be notified (both votes are null via fallback)
      expect(mocks.messagingInstance.send).toHaveBeenCalledTimes(2);
      expect(gameDoc.ref.update).toHaveBeenCalledWith({ voteReminderSent: true });
    });

    it("skips attacker notification when attackerVote is not null (line 87)", async () => {
      const gameDoc = makeReminderGameDoc({
        moves: [
          {
            type: "match",
            result: "pending",
            judgmentVotes: { attackerVote: "landed", defenderVote: null },
          },
        ],
      });

      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ fcmToken: "token-def" }),
        get: (field: string) => (field === "fcmToken" ? "token-def" : null),
      });

      await run();

      // Only defender should be notified (attacker already voted)
      expect(mocks.messagingInstance.send).toHaveBeenCalledTimes(1);
    });

    it("skips defender notification when defenderVote is not null (line 92)", async () => {
      const gameDoc = makeReminderGameDoc({
        moves: [
          {
            type: "match",
            result: "pending",
            judgmentVotes: { attackerVote: null, defenderVote: "bailed" },
          },
        ],
      });

      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ fcmToken: "token-atk" }),
        get: (field: string) => (field === "fcmToken" ? "token-atk" : null),
      });

      await run();

      // Only attacker should be notified (defender already voted)
      expect(mocks.messagingInstance.send).toHaveBeenCalledTimes(1);
    });

    it("skips notifications for both when both have already voted", async () => {
      const gameDoc = makeReminderGameDoc({
        moves: [
          {
            type: "match",
            result: "pending",
            judgmentVotes: { attackerVote: "landed", defenderVote: "landed" },
          },
        ],
      });

      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });
      await run();

      // No one needs to be notified
      expect(mocks.messagingInstance.send).not.toHaveBeenCalled();
    });

    it("resolves defenderId via player2Id when currentAttacker is player1Id (line 91)", async () => {
      const gameDoc = makeReminderGameDoc({
        currentAttacker: "p1",
        player1Id: "p1",
        player2Id: "p2",
        moves: [
          {
            type: "match",
            result: "pending",
            judgmentVotes: { attackerVote: "landed", defenderVote: null }, // only defender needs notify
          },
        ],
      });

      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      mocks.firestoreInstance.doc.mockImplementation((path: string) => {
        if (path === "users/p2") {
          return {
            get: vi.fn().mockResolvedValue({
              exists: true,
              data: () => ({ fcmToken: "token-p2" }),
              get: (field: string) => (field === "fcmToken" ? "token-p2" : null),
            }),
          };
        }
        return mocks.docRef;
      });

      await run();

      // Should notify p2 (defender)
      expect(mocks.messagingInstance.send).toHaveBeenCalledTimes(1);
      expect(mocks.messagingInstance.send).toHaveBeenCalledWith(
        expect.objectContaining({ token: "token-p2" })
      );
    });

    it("resolves defenderId via player1Id when currentAttacker is player2Id (line 91 else)", async () => {
      const gameDoc = makeReminderGameDoc({
        currentAttacker: "p2",
        player1Id: "p1",
        player2Id: "p2",
        moves: [
          {
            type: "match",
            result: "pending",
            judgmentVotes: { attackerVote: "landed", defenderVote: null }, // only defender needs notify
          },
        ],
      });

      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      mocks.firestoreInstance.doc.mockImplementation((path: string) => {
        if (path === "users/p1") {
          return {
            get: vi.fn().mockResolvedValue({
              exists: true,
              data: () => ({ fcmToken: "token-p1" }),
              get: (field: string) => (field === "fcmToken" ? "token-p1" : null),
            }),
          };
        }
        return mocks.docRef;
      });

      await run();

      // Should notify p1 (defender when attacker is p2)
      expect(mocks.messagingInstance.send).toHaveBeenCalledTimes(1);
      expect(mocks.messagingInstance.send).toHaveBeenCalledWith(
        expect.objectContaining({ token: "token-p1" })
      );
    });

    it("does not send notification when user has no fcmToken (line 102)", async () => {
      const gameDoc = makeReminderGameDoc({
        moves: [
          {
            type: "match",
            result: "pending",
            judgmentVotes: { attackerVote: null, defenderVote: null },
          },
        ],
      });

      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      // User has no fcmToken
      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({}),
        get: () => null,
      });

      await run();

      expect(mocks.messagingInstance.send).not.toHaveBeenCalled();
      expect(gameDoc.ref.update).toHaveBeenCalledWith({ voteReminderSent: true });
    });

    it("sends notifications with correct payload when fcmToken exists (lines 103-125)", async () => {
      const gameDoc = makeReminderGameDoc({
        id: "game-payload-test",
        moves: [
          {
            type: "match",
            result: "pending",
            judgmentVotes: { attackerVote: null, defenderVote: null },
          },
        ],
      });

      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ fcmToken: "token-payload" }),
        get: (field: string) => (field === "fcmToken" ? "token-payload" : null),
      });

      await run();

      expect(mocks.messagingInstance.send).toHaveBeenCalledWith(
        expect.objectContaining({
          token: "token-payload",
          notification: {
            title: "Vote Required!",
            body: "30 seconds left to judge the trick. Tap to vote!",
          },
          data: {
            type: "vote_reminder",
            gameId: "game-payload-test",
          },
          android: { priority: "high" },
          apns: {
            payload: {
              aps: { sound: "default", badge: 1 },
            },
          },
        })
      );
    });

    it("catches and logs error when notification send fails (line 127-129)", async () => {
      const gameDoc = makeReminderGameDoc();

      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ fcmToken: "token-fail" }),
        get: (field: string) => (field === "fcmToken" ? "token-fail" : null),
      });

      mocks.messagingInstance.send.mockRejectedValue(new Error("FCM failed"));

      await run();

      expect(mocks.logger.error).toHaveBeenCalledWith(
        expect.stringContaining("[VoteReminder] Failed to send notification"),
        expect.any(Error)
      );
    });
  });

  // ==========================================================================
  // autoResolveVoteTimeout
  // ==========================================================================

  describe("autoResolveVoteTimeout", () => {
    /** Helper: create a gameDoc with expired deadline */
    function makeExpiredGameDoc(overrides: Record<string, any> = {}) {
      const nowMs = Date.now();
      const deadlineMs = nowMs - 5000; // 5s ago — expired

      return {
        id: overrides.id ?? "game-expired",
        data: () => ({
          player1Id: "p1",
          player2Id: "p2",
          currentAttacker: "p1",
          voteDeadline: { toMillis: () => deadlineMs },
          voteReminderSent: true,
          turnPhase: "judging",
          roundNumber: 1,
          moves: [
            {
              type: "match",
              result: "pending",
              judgmentVotes: { attackerVote: null, defenderVote: null },
            },
          ],
          ...overrides,
        }),
        ref: { update: vi.fn().mockResolvedValue(undefined) },
      };
    }

    it("returns early when freshSnap does not exist (line 144)", async () => {
      const gameDoc = makeExpiredGameDoc();
      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      // Transaction re-read: document does not exist
      mocks.transaction.get.mockResolvedValue({
        exists: false,
        data: () => null,
      });

      await run();

      expect(mocks.transaction.update).not.toHaveBeenCalled();
    });

    it("returns early when turnPhase is not 'judging' (line 149)", async () => {
      const gameDoc = makeExpiredGameDoc();
      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      mocks.transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({
          ...gameDoc.data(),
          turnPhase: "attacker_recording", // not judging anymore
        }),
      });

      await run();

      expect(mocks.transaction.update).not.toHaveBeenCalled();
    });

    it("returns early when voteDeadline is null in fresh data (line 152 - null branch)", async () => {
      const gameDoc = makeExpiredGameDoc();
      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      mocks.transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({
          ...gameDoc.data(),
          turnPhase: "judging",
          voteDeadline: null, // cleared by another process
        }),
      });

      await run();

      expect(mocks.transaction.update).not.toHaveBeenCalled();
    });

    it("returns early when voteDeadline has not expired yet in fresh data (line 152 - future deadline)", async () => {
      const gameDoc = makeExpiredGameDoc();
      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      mocks.transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({
          ...gameDoc.data(),
          turnPhase: "judging",
          voteDeadline: { toMillis: () => Date.now() + 30000 }, // 30s in the future
        }),
      });

      await run();

      expect(mocks.transaction.update).not.toHaveBeenCalled();
    });

    it("returns early when no pending match move in fresh data (line 160)", async () => {
      const nowMs = Date.now();
      const gameDoc = makeExpiredGameDoc();
      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      mocks.transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({
          player1Id: "p1",
          player2Id: "p2",
          currentAttacker: "p1",
          turnPhase: "judging",
          roundNumber: 1,
          voteDeadline: { toMillis: () => nowMs - 1000 },
          moves: [{ type: "match", result: "landed" }], // no pending move
        }),
      });

      await run();

      expect(mocks.transaction.update).not.toHaveBeenCalled();
    });

    it("handles missing moves array in fresh data (line 155 - fallback to [])", async () => {
      const nowMs = Date.now();
      const gameDoc = makeExpiredGameDoc();
      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      mocks.transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({
          player1Id: "p1",
          player2Id: "p2",
          currentAttacker: "p1",
          turnPhase: "judging",
          roundNumber: 1,
          voteDeadline: { toMillis: () => nowMs - 1000 },
          moves: undefined, // no moves at all
        }),
      });

      await run();

      // No pending move found (empty array), so no update
      expect(mocks.transaction.update).not.toHaveBeenCalled();
    });

    it("auto-resolves with judgmentVotes fallback when move has no judgmentVotes (line 168)", async () => {
      const nowMs = Date.now();
      const gameDoc = makeExpiredGameDoc();
      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      const freshData = {
        player1Id: "p1",
        player2Id: "p2",
        currentAttacker: "p1",
        turnPhase: "judging",
        roundNumber: 1,
        voteDeadline: { toMillis: () => nowMs - 1000 },
        moves: [
          {
            type: "match",
            result: "pending",
            // no judgmentVotes — fallback to {} in spread
          },
        ],
      };

      mocks.transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({ ...freshData }),
      });

      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({}),
        get: () => null,
      });

      await run();

      expect(mocks.transaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          turnPhase: "attacker_recording",
          voteDeadline: null,
          voteTimeoutOccurred: true,
        })
      );

      // Verify the move was auto-resolved with correct data
      const updateCall = mocks.transaction.update.mock.calls[0][1];
      const resolvedMove = updateCall.moves[0];
      expect(resolvedMove.result).toBe("landed");
      expect(resolvedMove.judgmentVotes.timedOut).toBe(true);
      expect(resolvedMove.judgmentVotes.autoResolved).toBe("landed");
    });

    it("sets nextAttacker to defender (p2) when currentAttacker is p1 (line 175-176)", async () => {
      const nowMs = Date.now();
      const freshData = {
        player1Id: "p1",
        player2Id: "p2",
        currentAttacker: "p1",
        turnPhase: "judging",
        roundNumber: 2,
        voteDeadline: { toMillis: () => nowMs - 1000 },
        moves: [
          {
            type: "match",
            result: "pending",
            judgmentVotes: { attackerVote: null, defenderVote: null },
          },
        ],
      };

      const gameDoc = makeExpiredGameDoc({ id: "game-defender-p2" });
      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      mocks.transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({ ...freshData }),
      });

      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({}),
        get: () => null,
      });

      await run();

      expect(mocks.transaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          currentTurn: "p2",
          currentAttacker: "p2",
          roundNumber: 2,
        })
      );
    });

    it("sets nextAttacker to defender (p1) when currentAttacker is p2 (line 175-176 else)", async () => {
      const nowMs = Date.now();
      const freshData = {
        player1Id: "p1",
        player2Id: "p2",
        currentAttacker: "p2", // p2 is attacker, so defender is p1
        turnPhase: "judging",
        roundNumber: 3,
        voteDeadline: { toMillis: () => nowMs - 1000 },
        moves: [
          {
            type: "match",
            result: "pending",
            judgmentVotes: { attackerVote: null, defenderVote: null },
          },
        ],
      };

      const gameDoc = makeExpiredGameDoc({ id: "game-defender-p1", currentAttacker: "p2" });
      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      mocks.transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({ ...freshData }),
      });

      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({}),
        get: () => null,
      });

      await run();

      expect(mocks.transaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          currentTurn: "p1",
          currentAttacker: "p1",
          roundNumber: 3,
        })
      );
    });

    it("writes full update data with all fields (lines 182-193)", async () => {
      const nowMs = Date.now();
      const freshData = {
        player1Id: "p1",
        player2Id: "p2",
        currentAttacker: "p1",
        turnPhase: "judging",
        roundNumber: 1,
        voteDeadline: { toMillis: () => nowMs - 1000 },
        moves: [
          {
            type: "match",
            result: "pending",
            judgmentVotes: { attackerVote: null, defenderVote: null },
          },
        ],
      };

      const gameDoc = makeExpiredGameDoc({ id: "game-full-update" });
      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      mocks.transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({ ...freshData }),
      });

      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({}),
        get: () => null,
      });

      await run();

      expect(mocks.transaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          turnPhase: "attacker_recording",
          currentTurn: "p2",
          currentAttacker: "p2",
          roundNumber: 1,
          currentSetMove: null,
          voteDeadline: null,
          voteReminderSent: null,
          updatedAt: "SERVER_TIMESTAMP",
          voteTimeoutOccurred: true,
        })
      );
    });
  });

  // ==========================================================================
  // sendTimeoutNotifications
  // ==========================================================================

  describe("sendTimeoutNotifications", () => {
    function makeExpiredGameDocForNotify(overrides: Record<string, any> = {}) {
      const nowMs = Date.now();
      const deadlineMs = nowMs - 5000;

      return {
        id: overrides.id ?? "game-timeout-notify",
        data: () => ({
          player1Id: "p1",
          player2Id: "p2",
          currentAttacker: "p1",
          voteDeadline: { toMillis: () => deadlineMs },
          voteReminderSent: true,
          turnPhase: "judging",
          roundNumber: 1,
          moves: [
            {
              type: "match",
              result: "pending",
              judgmentVotes: { attackerVote: null, defenderVote: null },
            },
          ],
          ...overrides,
        }),
        ref: { update: vi.fn().mockResolvedValue(undefined) },
      };
    }

    it("sends timeout notifications to both players with fcmToken (lines 216-228)", async () => {
      const gameDoc = makeExpiredGameDocForNotify({ id: "game-tn-both" });
      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      const freshData = gameDoc.data();
      mocks.transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({ ...freshData }),
      });

      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ fcmToken: "token-tn" }),
        get: (field: string) => (field === "fcmToken" ? "token-tn" : null),
      });

      await run();

      // Both p1 and p2 should receive timeout notification
      const timeoutNotifCalls = mocks.messagingInstance.send.mock.calls.filter(
        (call: any[]) => call[0]?.data?.type === "vote_timeout"
      );
      expect(timeoutNotifCalls.length).toBe(2);
      expect(timeoutNotifCalls[0][0]).toMatchObject({
        notification: {
          title: "Vote Timed Out",
          body: "Trick counted as landed. Roles have switched!",
        },
        data: {
          type: "vote_timeout",
          gameId: "game-tn-both",
        },
      });
    });

    it("skips timeout notification when user has no fcmToken (line 216)", async () => {
      const gameDoc = makeExpiredGameDocForNotify({ id: "game-tn-no-token" });
      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      const freshData = gameDoc.data();
      mocks.transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({ ...freshData }),
      });

      // No fcmToken
      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({}),
        get: () => null,
      });

      await run();

      // Transaction update should still happen, but no messaging send for timeout
      expect(mocks.transaction.update).toHaveBeenCalled();
      // Filter for timeout notifications — should be none
      const timeoutNotifCalls = mocks.messagingInstance.send.mock.calls.filter(
        (call: any[]) => call[0]?.data?.type === "vote_timeout"
      );
      expect(timeoutNotifCalls.length).toBe(0);
    });

    it("catches and logs error when timeout notification fails (line 229-231)", async () => {
      const gameDoc = makeExpiredGameDocForNotify({ id: "game-tn-error" });
      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      const freshData = gameDoc.data();
      mocks.transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({ ...freshData }),
      });

      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ fcmToken: "token-err" }),
        get: (field: string) => (field === "fcmToken" ? "token-err" : null),
      });

      mocks.messagingInstance.send.mockRejectedValue(new Error("FCM timeout notification error"));

      await run();

      expect(mocks.logger.error).toHaveBeenCalledWith(
        expect.stringContaining("[VoteTimeout] Failed to notify"),
        expect.any(Error)
      );
    });
  });

  // ==========================================================================
  // Edge cases: combined scenarios
  // ==========================================================================

  describe("combined edge cases", () => {
    it("processes multiple games in a single run", async () => {
      const nowMs = Date.now();

      // Game 1: needs reminder
      const game1 = {
        id: "game-multi-1",
        data: () => ({
          player1Id: "a1",
          player2Id: "a2",
          currentAttacker: "a1",
          voteDeadline: { toMillis: () => nowMs + 20000 },
          voteReminderSent: false,
          moves: [{ type: "match", result: "pending", judgmentVotes: { attackerVote: null, defenderVote: null } }],
        }),
        ref: { update: vi.fn().mockResolvedValue(undefined) },
      };

      // Game 2: expired
      const game2 = {
        id: "game-multi-2",
        data: () => ({
          player1Id: "b1",
          player2Id: "b2",
          currentAttacker: "b1",
          voteDeadline: { toMillis: () => nowMs - 5000 },
          voteReminderSent: true,
          turnPhase: "judging",
          roundNumber: 1,
          moves: [{ type: "match", result: "pending", judgmentVotes: { attackerVote: null, defenderVote: null } }],
        }),
        ref: { update: vi.fn().mockResolvedValue(undefined) },
      };

      mocks.collectionRef.get.mockResolvedValue({ docs: [game1, game2] });

      mocks.transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({
          ...game2.data(),
          voteDeadline: { toMillis: () => nowMs - 5000 },
        }),
      });

      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({}),
        get: () => null,
      });

      await run();

      // Game 1 should get reminder update
      expect(game1.ref.update).toHaveBeenCalledWith({ voteReminderSent: true });
      // Game 2 should trigger transaction
      expect(mocks.runTransaction).toHaveBeenCalled();
    });

    it("handles game with expired deadline AND reminder not sent (both branches)", async () => {
      const nowMs = Date.now();
      const deadlineMs = nowMs - 1000; // expired (timeRemainingMs <= 0)

      const gameDoc = {
        id: "game-both",
        data: () => ({
          player1Id: "p1",
          player2Id: "p2",
          currentAttacker: "p1",
          voteDeadline: { toMillis: () => deadlineMs },
          voteReminderSent: false,
          turnPhase: "judging",
          roundNumber: 1,
          moves: [{ type: "match", result: "pending", judgmentVotes: { attackerVote: null, defenderVote: null } }],
        }),
        ref: { update: vi.fn().mockResolvedValue(undefined) },
      };

      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      mocks.transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({
          ...gameDoc.data(),
          voteDeadline: { toMillis: () => deadlineMs },
        }),
      });

      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({}),
        get: () => null,
      });

      await run();

      // When timeRemainingMs <= 0, the reminder condition (timeRemainingMs > 0) is false,
      // so reminder is NOT sent, but auto-resolve IS triggered
      expect(gameDoc.ref.update).not.toHaveBeenCalledWith({ voteReminderSent: true });
      expect(mocks.runTransaction).toHaveBeenCalled();
    });
  });
});
