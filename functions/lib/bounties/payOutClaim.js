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
exports.payOutClaim = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const writeTx_1 = require("../ledger/writeTx");
const getWalletBalance = (userData) => {
    var _a, _b;
    return (_b = (_a = userData === null || userData === void 0 ? void 0 : userData.wallet) === null || _a === void 0 ? void 0 : _a.hubbaCredit) !== null && _b !== void 0 ? _b : 0;
};
exports.payOutClaim = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
    }
    const callerRoles = context.auth.token.roles || [];
    if (!callerRoles.includes("admin")) {
        throw new functions.https.HttpsError("permission-denied", "Admin role required.");
    }
    const { bountyId, claimId } = data;
    if (!bountyId || typeof bountyId !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "bountyId is required.");
    }
    if (!claimId || typeof claimId !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "claimId is required.");
    }
    const db = admin.firestore();
    const bountyRef = db.collection("bounties").doc(bountyId);
    const claimRef = bountyRef.collection("claims").doc(claimId);
    await db.runTransaction(async (transaction) => {
        var _a, _b, _c, _d, _e, _f, _g;
        const [bountySnap, claimSnap] = await Promise.all([
            transaction.get(bountyRef),
            transaction.get(claimRef),
        ]);
        if (!bountySnap.exists || !claimSnap.exists) {
            throw new functions.https.HttpsError("not-found", "Bounty or claim not found.");
        }
        const bounty = bountySnap.data();
        const claim = claimSnap.data();
        if (claim.status === "PAID" || ((_a = claim.payout) === null || _a === void 0 ? void 0 : _a.paidAt)) {
            return;
        }
        if (claim.status !== "APPROVED") {
            throw new functions.https.HttpsError("failed-precondition", "Claim not approved.");
        }
        if (bounty.status !== "LOCKED") {
            throw new functions.https.HttpsError("failed-precondition", "Bounty not locked.");
        }
        const rewardTotal = (_b = bounty.rewardTotal) !== null && _b !== void 0 ? _b : 0;
        if (!Number.isInteger(rewardTotal) || rewardTotal <= 0) {
            throw new functions.https.HttpsError("failed-precondition", "Invalid reward total.");
        }
        const platformFeeBps = (_c = bounty.platformFeeBps) !== null && _c !== void 0 ? _c : 0;
        const filmerCutBps = (_d = bounty.filmerCutBps) !== null && _d !== void 0 ? _d : 0;
        const platformFee = Math.floor((rewardTotal * platformFeeBps) / 10000);
        const netReward = rewardTotal - platformFee;
        const filmerConfirmed = (_f = (_e = claim.filmer) === null || _e === void 0 ? void 0 : _e.confirmed) !== null && _f !== void 0 ? _f : false;
        const filmerAmount = filmerConfirmed
            ? Math.floor((netReward * filmerCutBps) / 10000)
            : 0;
        const claimerAmount = netReward - filmerAmount;
        if (!claim.claimerUid) {
            throw new functions.https.HttpsError("failed-precondition", "Claim missing claimerUid.");
        }
        const claimerRef = db.collection("users").doc(claim.claimerUid);
        const filmerUid = (_g = claim.filmer) === null || _g === void 0 ? void 0 : _g.uid;
        const filmerRef = filmerUid ? db.collection("users").doc(filmerUid) : null;
        const [claimerSnap, filmerSnap] = await Promise.all([
            transaction.get(claimerRef),
            filmerRef ? transaction.get(filmerRef) : Promise.resolve(null),
        ]);
        const claimerBalance = getWalletBalance(claimerSnap === null || claimerSnap === void 0 ? void 0 : claimerSnap.data());
        const filmerBalance = getWalletBalance(filmerSnap === null || filmerSnap === void 0 ? void 0 : filmerSnap.data());
        transaction.set(claimRef, {
            payout: {
                platformFee,
                netReward,
                claimerAmount,
                filmerAmount,
                paidAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            status: "PAID",
        }, { merge: true });
        transaction.update(bountyRef, {
            status: "PAID",
        });
        transaction.set(claimerRef, {
            wallet: {
                hubbaCredit: claimerBalance + claimerAmount,
            },
        }, { merge: true });
        if (filmerRef && filmerUid && filmerConfirmed) {
            transaction.set(filmerRef, {
                wallet: {
                    hubbaCredit: filmerBalance + filmerAmount,
                },
            }, { merge: true });
        }
        (0, writeTx_1.writeLedgerTx)({
            type: "PLATFORM_FEE",
            amount: platformFee,
            currency: "HUBBA_CREDIT",
            bountyId,
            claimId,
            memo: "Platform fee from bounty payout",
        }, { transaction });
        (0, writeTx_1.writeLedgerTx)({
            type: "CLAIM_PAYOUT",
            amount: claimerAmount,
            currency: "HUBBA_CREDIT",
            toUid: claim.claimerUid,
            bountyId,
            claimId,
            memo: "Claim payout to claimer",
        }, { transaction });
        if (filmerRef && filmerUid && filmerConfirmed && filmerAmount > 0) {
            (0, writeTx_1.writeLedgerTx)({
                type: "CLAIM_PAYOUT",
                amount: filmerAmount,
                currency: "HUBBA_CREDIT",
                toUid: filmerUid,
                bountyId,
                claimId,
                memo: "Claim payout to filmer",
            }, { transaction });
        }
    });
    return { success: true };
});
//# sourceMappingURL=payOutClaim.js.map