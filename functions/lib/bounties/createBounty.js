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
exports.createBounty = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const writeTx_1 = require("../ledger/writeTx");
const MIN_REWARD = 500;
const DEFAULT_PLATFORM_FEE_BPS = 1000;
const DEFAULT_FILMER_CUT_BPS = 2000;
const DEFAULT_MIN_VOTES = 5;
const DEFAULT_APPROVE_RATIO = 0.6;
const DEFAULT_MAX_CLIP_SECONDS = 20;
const DEFAULT_ONE_TAKE = true;
const isSameMonth = (a, b) => {
    return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
};
exports.createBounty = functions.https.onCall(async (data, context) => {
    var _a;
    const uid = (_a = context.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
    }
    const { spotId, trickDesc, rules, rewardTotal, expiresAt } = data;
    if (!spotId || typeof spotId !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "spotId is required.");
    }
    if (!trickDesc || typeof trickDesc !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "trickDesc is required.");
    }
    if (!Number.isInteger(rewardTotal) || rewardTotal < MIN_REWARD) {
        throw new functions.https.HttpsError("invalid-argument", `rewardTotal must be an integer >= ${MIN_REWARD}.`);
    }
    const expiresAtDate = new Date(expiresAt);
    if (Number.isNaN(expiresAtDate.getTime())) {
        throw new functions.https.HttpsError("invalid-argument", "expiresAt must be ISO string.");
    }
    const db = admin.firestore();
    const bountyRef = db.collection("bounties").doc();
    const userRef = db.collection("users").doc(uid);
    await db.runTransaction(async (transaction) => {
        var _a, _b, _c, _d, _e, _f;
        const userSnap = await transaction.get(userRef);
        const userData = (userSnap.data() || {});
        const walletBalance = (_b = (_a = userData.wallet) === null || _a === void 0 ? void 0 : _a.hubbaCredit) !== null && _b !== void 0 ? _b : 0;
        if (walletBalance < rewardTotal) {
            transaction.set(userRef, { wallet: { hubbaCredit: walletBalance } }, { merge: true });
            throw new functions.https.HttpsError("failed-precondition", "Insufficient balance.");
        }
        const tier = (_c = userData.tier) !== null && _c !== void 0 ? _c : "SKATER";
        const bountyStats = (_d = userData.bountyStats) !== null && _d !== void 0 ? _d : {};
        const now = new Date();
        const lastBountyAt = (_e = bountyStats.lastBountyAt) === null || _e === void 0 ? void 0 : _e.toDate();
        const isSameMonthAsLast = lastBountyAt ? isSameMonth(now, lastBountyAt) : false;
        const monthlyCount = isSameMonthAsLast ? (_f = bountyStats.monthlyBountyCount) !== null && _f !== void 0 ? _f : 0 : 0;
        if (tier === "SKATER" && monthlyCount >= 3) {
            throw new functions.https.HttpsError("resource-exhausted", "Monthly bounty limit reached.");
        }
        const nextMonthlyCount = monthlyCount + 1;
        transaction.set(userRef, {
            "wallet.hubbaCredit": walletBalance - rewardTotal,
            "bountyStats.lastBountyAt": admin.firestore.FieldValue.serverTimestamp(),
            "bountyStats.monthlyBountyCount": nextMonthlyCount,
            "bountyStats.bountiesPosted": admin.firestore.FieldValue.increment(1),
        }, { merge: true });
        transaction.set(bountyRef, {
            spotId,
            creatorUid: uid,
            trickDesc,
            rules: rules !== null && rules !== void 0 ? rules : null,
            requirements: {
                oneTake: DEFAULT_ONE_TAKE,
                mustShowSpot: true,
                maxClipSeconds: DEFAULT_MAX_CLIP_SECONDS,
            },
            rewardType: "CREDIT",
            rewardTotal,
            currency: "HUBBA_CREDIT",
            platformFeeBps: DEFAULT_PLATFORM_FEE_BPS,
            filmerCutBps: DEFAULT_FILMER_CUT_BPS,
            status: "OPEN",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: admin.firestore.Timestamp.fromDate(expiresAtDate),
            claimCount: 0,
            voteCount: 0,
            verifyPolicy: {
                minVotes: DEFAULT_MIN_VOTES,
                approveRatio: DEFAULT_APPROVE_RATIO,
                proVoteWeight: 2,
            },
        });
        (0, writeTx_1.writeLedgerTx)({
            type: "BOUNTY_POST_HOLD",
            amount: -rewardTotal,
            currency: "HUBBA_CREDIT",
            fromUid: uid,
            bountyId: bountyRef.id,
            memo: "Bounty reward escrow hold",
        }, { transaction });
    });
    return { bountyId: bountyRef.id };
});
//# sourceMappingURL=createBounty.js.map