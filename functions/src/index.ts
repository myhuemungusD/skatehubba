/**
 * Firebase Cloud Functions — Entry Point
 *
 * This file re-exports all Cloud Functions from their respective modules.
 * Each functional domain lives in its own directory:
 *
 *   admin/   — Role management (manageUserRole, getUserRoles)
 *   game/    — S.K.A.T.E. battle logic (submitTrick, judgeTrick, getVideoUrl, voteTimeouts)
 *   video/   — Storage triggers (validateChallengeVideo)
 *   commerce/ — Stripe / payment functions (holdAndCreatePaymentIntent, etc.)
 *
 * Security Features:
 * - App Check enforcement for abuse prevention
 * - Firestore-backed rate limiting (multi-instance safe)
 * - RBAC with custom claims
 * - Comprehensive audit logging
 * - Firestore transactions for race condition prevention
 */

// Admin functions
export { manageUserRole, getUserRoles } from "./admin/roles";

// Game functions
export { submitTrick } from "./game/submitTrick";
export { judgeTrick } from "./game/judgeTrick";
export { setterBail } from "./game/setterBail";
export { getVideoUrl } from "./game/getVideoUrl";
export { processVoteTimeouts } from "./game/voteTimeouts";

// Video functions
export { validateChallengeVideo } from "./video/validateVideo";

// Commerce functions
export { holdAndCreatePaymentIntent } from "./commerce/holdAndCreateIntent";
export { stripeWebhook } from "./commerce/stripeWebhook";
export { expireHolds } from "./commerce/expireHolds";
