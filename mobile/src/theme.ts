export const SKATE = {
  colors: {
    ink: "#0a0a0a",
    paper: "#f5f3ef",
    neon: "#00ff41",
    blood: "#ff1a1a",
    orange: "#ff6600",
    gold: "#ffd700",
    grime: "#1c1c1c",
    gray: "#666",
    darkGray: "#2a2a2a",
    lightGray: "#999",
    white: "#fff",
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    full: 999,
  },
  accessibility: {
    focusRing: {
      color: "#00ff41",
      width: 2,
      offset: 2,
    },
    minimumTouchTarget: 44,
  },
};

export type SkateTheme = typeof SKATE;
