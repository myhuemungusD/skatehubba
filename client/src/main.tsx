import "./env-bridge"; // MUST be first — bridges import.meta.env to globalThis for @skatehubba/config
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { getMissingRequiredEnv } from "./env";
import EnvErrorScreen from "./components/EnvErrorScreen";
import "./index.css";
import "./sentry";
import "./vitals";
import { logger } from "./lib/logger";

// Catch unhandled promise rejections globally
window.addEventListener("unhandledrejection", (event) => {
  const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
  logger.error("[Global] Unhandled promise rejection:", error);
  Sentry.captureException(error, { tags: { source: "unhandledrejection" } });
});

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

const root = createRoot(rootElement);
const missing = getMissingRequiredEnv();

if (missing.length > 0) {
  root.render(<EnvErrorScreen missingKeys={missing} />);
} else {
  import("./App")
    .then(({ default: App }) => {
      root.render(<App />);
    })
    .catch((error) => {
      logger.error("[App] Failed to bootstrap application", error);
      root.render(<EnvErrorScreen missingKeys={[]} error={error} />);
    });
}
