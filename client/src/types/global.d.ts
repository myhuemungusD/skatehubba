export {};

declare global {
  interface Window {
    Cypress?: unknown;
    __SKATEHUBBA_UID__?: string | null;
    __enableDevAdmin?: () => void;
    __disableDevAdmin?: () => void;
  }
}
