/**
 * Filmer Request Service — Type Definitions
 */

/** Status of a filmer request */
export type FilmerRequestStatus = "pending" | "accepted" | "rejected";

/** Action types for responding to filmer requests */
export type FilmerRequestAction = "accept" | "reject";

/** Serialized summary of a filmer request for API responses */
export type FilmerRequestSummary = {
  /** Unique request identifier */
  id: string;
  /** Associated check-in ID */
  checkInId: string;
  /** User ID who requested the filmer */
  requesterUid: string;
  /** User ID of the filmer */
  filmerUid: string;
  /** Current status of the request */
  status: FilmerRequestStatus;
  /** ISO 8601 timestamp when request was created */
  createdAt: string;
  /** ISO 8601 timestamp when request was last updated */
  updatedAt: string;
  /** Optional rejection reason provided by filmer */
  reason?: string;
};

/** Internal context for request operations */
export type RequestContext = { checkInId: number; requesterId: string };

/**
 * Custom error class for filmer request operations
 * Includes HTTP status code and machine-readable error code
 */
export class FilmerRequestError extends Error {
  /** HTTP status code for the error */
  status: number;
  /** Machine-readable error code */
  code: string;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
