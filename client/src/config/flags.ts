export const GHOST_MODE =
  import.meta.env.VITE_GHOST_MODE === "true" || import.meta.env.VITE_GUEST_MODE === "true";
export const GUEST_MODE = GHOST_MODE;
