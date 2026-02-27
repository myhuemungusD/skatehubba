/**
 * Filmer Request Service
 *
 * Manages the workflow for users requesting professional filmers to capture their tricks.
 * Implements quota limits, trust requirements, and state management for the filmer request lifecycle.
 *
 * Features:
 * - Request creation with quota enforcement (10 requests per day per requester)
 * - Response handling with quota limits (50 responses per day per filmer)
 * - Trust level verification to prevent abuse
 * - TOCTOU-safe quota checks using SELECT FOR UPDATE row locking
 * - Audit trail for all operations
 *
 * @module services/filmerRequests
 */

export type { FilmerRequestStatus, FilmerRequestAction, FilmerRequestSummary } from "./types";
export { FilmerRequestError } from "./types";
export { createFilmerRequest, respondToFilmerRequest, listFilmerRequests } from "./operations";
