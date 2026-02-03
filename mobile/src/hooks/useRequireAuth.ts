import { useRouter } from "expo-router";
import { useAuth } from "./useAuth";
import { showMessage } from "react-native-flash-message";

interface RequireAuthOptions {
  /** Custom message to show when login is required */
  message?: string;
  /** Whether to redirect to sign-in page (default: true) */
  redirect?: boolean;
}

/**
 * Hook for protecting features that require authentication.
 * Returns a function that checks auth and either executes the callback
 * or prompts the user to sign in.
 */
export function useRequireAuth() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();

  /**
   * Wraps an action to require authentication.
   * If user is not logged in, shows a message and optionally redirects to sign-in.
   */
  const requireAuth = <T extends (...args: any[]) => any>(
    callback: T,
    options?: RequireAuthOptions
  ): ((...args: Parameters<T>) => ReturnType<T> | void) => {
    return (...args: Parameters<T>) => {
      if (!isAuthenticated) {
        showMessage({
          message: options?.message || "Sign in required",
          description: "Please sign in to access this feature",
          type: "warning",
          duration: 3000,
          icon: "warning",
        });

        if (options?.redirect !== false) {
          router.push("/auth/sign-in");
        }
        return;
      }
      return callback(...args);
    };
  };

  /**
   * Checks if user is authenticated and prompts sign-in if not.
   * Returns true if authenticated, false otherwise.
   */
  const checkAuth = (options?: RequireAuthOptions): boolean => {
    if (!isAuthenticated) {
      showMessage({
        message: options?.message || "Sign in required",
        description: "Please sign in to access this feature",
        type: "warning",
        duration: 3000,
        icon: "warning",
      });

      if (options?.redirect !== false) {
        router.push("/auth/sign-in");
      }
      return false;
    }
    return true;
  };

  return {
    user,
    isAuthenticated,
    requireAuth,
    checkAuth,
  };
}
