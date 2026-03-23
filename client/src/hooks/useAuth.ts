import { useAuthStore } from "../store/authStore";

export function useAuth() {
  const store = useAuthStore();

  return {
    ...store,
    isAuthenticated: !!store.firebaseUser,
    hasProfile: !!store.profile,
    isAdmin: store.backendUser?.roles?.includes("admin") ?? false,
  };
}
