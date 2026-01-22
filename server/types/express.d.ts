import type { CustomUser } from "../../shared/schema";

/**
 * Extended user type that includes roles for admin checks.
 * Roles are populated by auth middleware from Firebase custom claims
 * or database lookup.
 */
export type AuthenticatedUser = CustomUser & {
  roles?: string[];
};

declare global {
  namespace Express {
    interface Request {
      currentUser?: AuthenticatedUser;
      isAuthenticated(): boolean;
    }
  }
}

export {};
