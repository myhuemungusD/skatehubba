/**
 * Deep linking utilities for SkateHubba.
 *
 * Supports two URL forms:
 *   - Custom scheme:  skatehubba://game/{id}  (native app-to-app)
 *   - Universal link:  https://skatehubba.com/game/{id}  (web fallback + App/Play Store redirect)
 *
 * Expo Router automatically handles incoming links for both forms
 * via the scheme in app.config.js and the associated domains / intent filters.
 */

import * as Linking from "expo-linking";

const WEB_ORIGIN = "https://skatehubba.com";

/** Build a native deep link URL (skatehubba://...) */
export function createDeepLink(path: string): string {
  return Linking.createURL(path);
}

/** Build a universal link (https://skatehubba.com/...) that works in browsers and as App Links */
export function createUniversalLink(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${WEB_ORIGIN}${normalized}`;
}

/** Generate a shareable game invite link. */
export function gameLink(gameId: string): string {
  return createUniversalLink(`/game/${gameId}`);
}

/** Generate a shareable challenge link. */
export function challengeLink(challengeId: string): string {
  return createUniversalLink(`/challenge/${challengeId}`);
}

/** Open a URL using the system handler (browser, or target app if installed). */
export async function openLink(url: string): Promise<void> {
  const supported = await Linking.canOpenURL(url);
  if (!supported) {
    if (__DEV__) {
      console.warn(`[linking] Cannot open URL: ${url}`);
    }
    return;
  }
  await Linking.openURL(url);
}
