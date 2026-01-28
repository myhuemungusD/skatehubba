"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.castVote = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
exports.castVote = functions.https.onCall(async (data, context) => {
    var _a;
    const uid = (_a = context.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
    }
    const { bountyId, claimId, vote, comment } = data;
    if (!bountyId || typeof bountyId !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "bountyId is required.");
    }
    if (!claimId || typeof claimId !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "claimId is required.");
    }
    if (vote !== "APPROVE" && vote !== "REJECT") {
        throw new functions.https.HttpsError("invalid-argument", "vote must be APPROVE or REJECT.");
    }
    const db = admin.firestore();
    const bountyRef = db.collection("bounties").doc(bountyId);
    const claimRef = bountyRef.collection("claims").doc(claimId);
    const voteRef = claimRef.collection("votes").doc(uid);
    const userRef = db.collection("users").doc(uid);
    await db.runTransaction(async (transaction) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        const [bountySnap, claimSnap, voteSnap, userSnap] = await Promise.all([
            transaction.get(bountyRef),
            transaction.get(claimRef),
            transaction.get(voteRef),
            transaction.get(userRef),
        ]);
        if (!bountySnap.exists || !claimSnap.exists) {
            throw new functions.https.HttpsError("not-found", "Bounty or claim not found.");
        }
        const bountyData = bountySnap.data();
        const claimData = claimSnap.data();
        if (claimData.claimerUid === uid) {
            throw new functions.https.HttpsError("failed-precondition", "Cannot vote on your own claim.");
        }
        if (claimData.status !== "PENDING") {
            throw new functions.https.HttpsError("failed-precondition", "Claim is not pending.");
        }
        if (bountyData.status !== "OPEN") {
            throw new functions.https.HttpsError("failed-precondition", "Bounty is not open.");
        }
        const userData = (userSnap.data() || {});
        const reputation = (_b = (_a = userData.bountyStats) === null || _a === void 0 ? void 0 : _a.reputation) !== null && _b !== void 0 ? _b : 0;
        if (reputation < 30) {
            throw new functions.https.HttpsError("failed-precondition", "Reputation too low to vote.");
        }
        const previousVote = voteSnap.exists
            ? voteSnap.data()
            : null;
        let approveCount = (_d = (_c = claimData.votes) === null || _c === void 0 ? void 0 : _c.approveCount) !== null && _d !== void 0 ? _d : 0;
        let rejectCount = (_f = (_e = claimData.votes) === null || _e === void 0 ? void 0 : _e.rejectCount) !== null && _f !== void 0 ? _f : 0;
        let weightedApprove = (_h = (_g = claimData.votes) === null || _g === void 0 ? void 0 : _g.weightedApprove) !== null && _h !== void 0 ? _h : 0;
        let weightedReject = (_k = (_j = claimData.votes) === null || _j === void 0 ? void 0 : _j.weightedReject) !== null && _k !== void 0 ? _k : 0;
        if ((previousVote === null || previousVote === void 0 ? void 0 : previousVote.vote) === "APPROVE") {
            approveCount -= 1;
            weightedApprove -= 1;
        }
        if ((previousVote === null || previousVote === void 0 ? void 0 : previousVote.vote) === "REJECT") {
            rejectCount -= 1;
            weightedReject -= 1;
        }
        if (vote === "APPROVE") {
            approveCount += 1;
            weightedApprove += 1;
        }
        if (vote === "REJECT") {
            rejectCount += 1;
            weightedReject += 1;
        }
        const wasNewVote = !previousVote;
        transaction.set(voteRef, {
            voterUid: uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            vote,
            weight: 1,
            comment: comment !== null && comment !== void 0 ? comment : null,
        });
        transaction.update(claimRef, {
            "votes.approveCount": approveCount,
            "votes.rejectCount": rejectCount,
            "votes.weightedApprove": weightedApprove,
            "votes.weightedReject": weightedReject,
            "votes.lastVoteAt": admin.firestore.FieldValue.serverTimestamp(),
        });
        if (wasNewVote) {
            transaction.update(bountyRef, {
                voteCount: admin.firestore.FieldValue.increment(1),
            });
        }
        const totalVotes = approveCount + rejectCount;
        const minVotes = (_m = (_l = bountyData.verifyPolicy) === null || _l === void 0 ? void 0 : _l.minVotes) !== null && _m !== void 0 ? _m : 5;
        const approveRatio = (_p = (_o = bountyData.verifyPolicy) === null || _o === void 0 ? void 0 : _o.approveRatio) !== null && _p !== void 0 ? _p : 0.6;
        const approvalRate = totalVotes === 0 ? 0 : approveCount / totalVotes;
        if (totalVotes < minVotes || approvalRate < approveRatio) {
            return;
        }
        transaction.update(claimRef, {
            status: "APPROVED",
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
            decisionBy: {
                uid: "auto",
                role: "AUTO",
            },
        });
        transaction.update(bountyRef, {
            status: "LOCKED",
            lockedAt: admin.firestore.FieldValue.serverTimestamp(),
            lockedReason: "Claim approved",
        });
    });
    return { success: true };
});
//# sourceMappingURL=castVote.js.map