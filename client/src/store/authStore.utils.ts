import type { ProfileCache, Result, UserProfile } from "./authStore.types";

export const isEmbeddedBrowser = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || navigator.vendor || "";
  return (
    ua.includes("FBAN") ||
    ua.includes("FBAV") ||
    ua.includes("Instagram") ||
    ua.includes("Twitter") ||
    ua.includes("Line/") ||
    ua.includes("KAKAOTALK") ||
    ua.includes("Snapchat") ||
    ua.includes("TikTok") ||
    (ua.includes("wv") && ua.includes("Android"))
  );
};

export const isPopupSafe = () => {
  if (typeof window === "undefined") return false;
  return !isEmbeddedBrowser();
};

const profileCacheKey = (uid: string) => `skatehubba.profile.${uid}`;

export const readProfileCache = (uid: string): ProfileCache | null => {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(profileCacheKey(uid));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ProfileCache;
    if (parsed.profile) {
      return {
        status: parsed.status,
        profile: {
          ...parsed.profile,
          createdAt: new Date(parsed.profile.createdAt),
          updatedAt: new Date(parsed.profile.updatedAt),
        },
      };
    }
    return parsed;
  } catch {
    return null;
  }
};

export const writeProfileCache = (uid: string, cache: ProfileCache) => {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(profileCacheKey(uid), JSON.stringify(cache));
};

export const clearProfileCache = (uid: string) => {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(profileCacheKey(uid));
};

export const transformProfile = (uid: string, data: Record<string, unknown>): UserProfile => {
  return {
    uid,
    username: String(data.username ?? ""),
    stance: (data.stance as UserProfile["stance"]) ?? null,
    experienceLevel: (data.experienceLevel as UserProfile["experienceLevel"]) ?? null,
    favoriteTricks: Array.isArray(data.favoriteTricks) ? (data.favoriteTricks as string[]) : [],
    bio: (data.bio as string | null) ?? null,
    sponsorFlow: (data.sponsorFlow as string | null) ?? null,
    sponsorTeam: (data.sponsorTeam as string | null) ?? null,
    hometownShop: (data.hometownShop as string | null) ?? null,
    spotsVisited: typeof data.spotsVisited === "number" ? data.spotsVisited : 0,
    crewName: (data.crewName as string | null) ?? null,
    credibilityScore: typeof data.credibilityScore === "number" ? data.credibilityScore : 0,
    avatarUrl: (data.avatarUrl as string | null) ?? null,
    createdAt: typeof data.createdAt === "string" ? new Date(data.createdAt) : new Date(),
    updatedAt: typeof data.updatedAt === "string" ? new Date(data.updatedAt) : new Date(),
  };
};

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<Result<T>> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<Result<T>>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({ status: "timeout", error: `${label} exceeded ${ms}ms` });
    }, ms);
  });

  try {
    const data = await Promise.race([
      promise.then((res): Result<T> => ({ status: "ok", data: res })),
      timeoutPromise,
    ]);
    return data;
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timeoutId!);
  }
}
