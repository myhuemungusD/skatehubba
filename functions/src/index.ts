/**
 * Firebase Cloud Functions - Entry Point
 *
 * Secure serverless functions for SkateHubba.
 * Each domain is implemented in its own module; this file re-exports
 * all Cloud Functions so Firebase can discover and deploy them.
 *
 * Modules:
 * - admin/       Role management (RBAC with custom claims)
 * - game/        S.K.A.T.E. battle logic (tricks, judging)
 * - video/       Video validation and signed URL generation
 * - scheduling/  Vote timeout processing
 * - commerce/    Payments, inventory holds, Stripe webhooks
 */

// Ensure Firebase Admin SDK is initialized before any function runs
import "./firebaseAdmin";

// Admin functions
export { manageUserRole } from "./admin/manageUserRole";
export { getUserRoles } from "./admin/getUserRoles";

// S.K.A.T.E. game functions
export { submitTrick } from "./game/submitTrick";
export { judgeTrick } from "./game/judgeTrick";

// Video functions
export { validateChallengeVideo } from "./video/validateChallengeVideo";
export { getVideoUrl } from "./video/getVideoUrl";

// Scheduling
export { processVoteTimeouts } from "./scheduling/processVoteTimeouts";

// Commerce
export { holdAndCreatePaymentIntent } from "./commerce/holdAndCreateIntent";
export { stripeWebhook } from "./commerce/stripeWebhook";
export { expireHolds } from "./commerce/expireHolds";
