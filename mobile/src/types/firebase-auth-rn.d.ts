import type { Persistence } from "firebase/auth";

/**
 * firebase/auth ships getReactNativePersistence in its RN-specific entrypoint
 * (index.rn.d.ts) but the main TypeScript types don't export it.
 * Metro resolves the correct RN entry at runtime; this declaration
 * makes TypeScript aware of the export for static checking.
 */
declare module "firebase/auth" {
  interface ReactNativeAsyncStorage {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
  }
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
