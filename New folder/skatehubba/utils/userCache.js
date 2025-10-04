// Simple in-memory cache for user profiles
const userCache = new Map();
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

export function clearUserCache() {
  userCache.clear();
}

export function getCachedUser(uid) {
  const cached = userCache.get(uid);
  if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
    return cached.data;
  }
  return null;
}

export function cacheUser(uid, userData) {
  userCache.set(uid, {
    data: userData,
    timestamp: Date.now()
  });
}
