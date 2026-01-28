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
exports.submitClaim = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const CLAIM_PATH_REGEX = /^claims\/([^/]+)\/([^/]+)\.mp4$/;
exports.submitClaim = functions.https.onCall(async (data, context) => {
    var _a;
    const uid = (_a = context.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
    }
    const { bountyId, clipStoragePath, durationSeconds, filmerUid } = data;
    if (!bountyId || typeof bountyId !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "bountyId is required.");
    }
    if (!clipStoragePath || typeof clipStoragePath !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "clipStoragePath is required.");
    }
    const pathMatch = clipStoragePath.match(CLAIM_PATH_REGEX);
    if (!pathMatch) {
        throw new functions.https.HttpsError("invalid-argument", "clipStoragePath must be claims/{bountyId}/{claimId}.mp4");
    }
    const [, pathBountyId, claimId] = pathMatch;
    if (pathBountyId !== bountyId) {
        throw new functions.https.HttpsError("invalid-argument", "clipStoragePath bountyId does not match payload bountyId.");
    }
    if (filmerUid && filmerUid === uid) {
        throw new functions.https.HttpsError("invalid-argument", "Filmer cannot be the claimer.");
    }
    const db = admin.firestore();
    const bountyRef = db.collection("bounties").doc(bountyId);
    const claimRef = bountyRef.collection("claims").doc(claimId);
    await db.runTransaction(async (transaction) => {
        var _a, _b;
        const bountySnap = await transaction.get(bountyRef);
        if (!bountySnap.exists) {
            throw new functions.https.HttpsError("not-found", "Bounty not found.");
        }
        const bountyData = bountySnap.data();
        if (bountyData.status !== "OPEN") {
            throw new functions.https.HttpsError("failed-precondition", "Bounty is not open.");
        }
        const expiresAt = (_a = bountyData.expiresAt) === null || _a === void 0 ? void 0 : _a.toDate();
        if (expiresAt && expiresAt.getTime() <= Date.now()) {
            throw new functions.https.HttpsError("failed-precondition", "Bounty has expired.");
        }
        const existingClaimSnap = await transaction.get(bountyRef.collection("claims").where("claimerUid", "==", uid).limit(1));
        if (!existingClaimSnap.empty) {
            throw new functions.https.HttpsError("failed-precondition", "Claim already exists.");
        }
        const claimSnap = await transaction.get(claimRef);
        if (claimSnap.exists) {
            throw new functions.https.HttpsError("already-exists", "Claim already exists.");
        }
        const claimPayload = {
            bountyId,
            spotId: (_b = bountyData.spotId) !== null && _b !== void 0 ? _b : null,
            claimerUid: uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            clip: {
                storagePath: clipStoragePath,
                durationSeconds: durationSeconds !== null && durationSeconds !== void 0 ? durationSeconds : null,
            },
            filmer: filmerUid
                ? {
                    uid: filmerUid,
                    confirmed: false,
                    confirmedAt: null,
                }
                : null,
            status: "PENDING",
            votes: {
                approveCount: 0,
                rejectCount: 0,
                weightedApprove: 0,
                weightedReject: 0,
                lastVoteAt: null,
            },
        };
        transaction.set(claimRef, claimPayload);
        transaction.update(bountyRef, {
            claimCount: admin.firestore.FieldValue.increment(1),
        });
    });
    return { claimId };
});
//# sourceMappingURL=submitClaim.js.map