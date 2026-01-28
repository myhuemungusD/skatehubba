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
exports.expireBounties = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const writeTx_1 = require("../ledger/writeTx");
const REFUND_RATE = 0.8;
exports.expireBounties = functions.pubsub
    .schedule("every 60 minutes")
    .onRun(async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.fromDate(new Date());
    const snapshot = await db
        .collection("bounties")
        .where("status", "==", "OPEN")
        .where("expiresAt", "<=", now)
        .get();
    if (snapshot.empty) {
        return null;
    }
    const tasks = snapshot.docs.map((doc) => {
        const bountyRef = doc.ref;
        return db.runTransaction(async (transaction) => {
            var _a, _b, _c;
            const bountySnap = await transaction.get(bountyRef);
            if (!bountySnap.exists) {
                return;
            }
            const bounty = bountySnap.data();
            if (bounty.status !== "OPEN") {
                return;
            }
            const rewardTotal = (_a = bounty.rewardTotal) !== null && _a !== void 0 ? _a : 0;
            const refundAmount = Math.floor(rewardTotal * REFUND_RATE);
            if (!bounty.creatorUid) {
                transaction.update(bountyRef, {
                    status: "EXPIRED",
                    lockedReason: "Expired",
                    lockedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                return;
            }
            const userRef = db.collection("users").doc(bounty.creatorUid);
            const userSnap = await transaction.get(userRef);
            const userData = (userSnap.data() || {});
            const walletBalance = (_c = (_b = userData.wallet) === null || _b === void 0 ? void 0 : _b.hubbaCredit) !== null && _c !== void 0 ? _c : 0;
            transaction.set(userRef, {
                wallet: {
                    hubbaCredit: walletBalance + refundAmount,
                },
            }, { merge: true });
            transaction.update(bountyRef, {
                status: "EXPIRED",
                lockedReason: "Expired",
                lockedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            (0, writeTx_1.writeLedgerTx)({
                type: "BOUNTY_REFUND",
                amount: refundAmount,
                currency: "HUBBA_CREDIT",
                toUid: bounty.creatorUid,
                bountyId: bountyRef.id,
                memo: "Bounty refund on expiry (80%)",
            }, { transaction });
        });
    });
    await Promise.all(tasks);
    return null;
});
//# sourceMappingURL=expireBounties.js.map