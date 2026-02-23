import { createBaseAuthStore } from "@skatehubba/firebase";
import { auth } from "@/lib/firebase.config";
import { clearAnalyticsSession } from "@/lib/analytics/logEvent";
import { clearOfflineCache } from "@/lib/offlineCache";

export const useAuthStore = createBaseAuthStore(auth, async () => {
  // Clear analytics session to prevent cross-account session tracking
  await clearAnalyticsSession();
  // Clear offline cache to prevent stale data on re-login
  await clearOfflineCache();
});
