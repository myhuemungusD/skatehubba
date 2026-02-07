/**
 * User Roles Hook
 *
 * Provides utilities for managing user roles and custom claims.
 * Wraps auth store role state and adds admin actions.
 *
 * @module hooks/useUserRoles
 */

import { useState, useCallback } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase/config";
import { useAuth, UserRole } from "../hooks/useAuth";
import { logger } from "../lib/logger";

export type { UserRole };

interface UseUserRolesReturn {
  /** Current user's roles */
  roles: UserRole[];
  /** Loading state for admin operations */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Force refresh the user's token to get updated roles */
  refreshUserClaims: () => Promise<UserRole[]>;
  /** Check if user has a specific role */
  hasRole: (role: UserRole) => boolean;
  /** Check if user is admin */
  isAdmin: boolean;
  /** Check if user is moderator */
  isModerator: boolean;
  /** Check if user is verified pro */
  isVerifiedPro: boolean;
  /** Grant a role to another user (admin only) */
  grantRole: (targetUid: string, role: UserRole) => Promise<void>;
  /** Revoke a role from another user (admin only) */
  revokeRole: (targetUid: string, role: UserRole) => Promise<void>;
}

/**
 * Hook for managing user roles
 *
 * @example
 * ```tsx
 * const { roles, isAdmin, isVerifiedPro, grantRole } = useUserRoles();
 *
 * // Grant a role (admin only)
 * await grantRole(targetUserId, 'verified_pro');
 * ```
 */
export function useUserRoles(): UseUserRolesReturn {
  const auth = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Grant a role to another user (admin only)
   */
  const grantRole = useCallback(async (targetUid: string, role: UserRole): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const manageUserRole = httpsCallable(functions, "manageUserRole");
      await manageUserRole({ targetUid, role, action: "grant" });
      logger.log(`[useUserRoles] Granted ${role} to ${targetUid}`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to grant role";
      logger.error("[useUserRoles] Error granting role:", err);
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Revoke a role from another user (admin only)
   */
  const revokeRole = useCallback(async (targetUid: string, role: UserRole): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const manageUserRole = httpsCallable(functions, "manageUserRole");
      await manageUserRole({ targetUid, role, action: "revoke" });
      logger.log(`[useUserRoles] Revoked ${role} from ${targetUid}`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to revoke role";
      logger.error("[useUserRoles] Error revoking role:", err);
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    // From auth store (single source of truth)
    roles: auth.roles,
    refreshUserClaims: auth.refreshRoles,
    hasRole: auth.hasRole,
    isAdmin: auth.isAdmin,
    isModerator: auth.isModerator,
    isVerifiedPro: auth.isVerifiedPro,
    // Local state for admin operations
    isLoading,
    error,
    grantRole,
    revokeRole,
  };
}

export default useUserRoles;
