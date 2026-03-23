import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f4ff",
          500: "#667eea",
          600: "#5a6fd6",
          700: "#4c5ec2",
          900: "#1e2a5a",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
