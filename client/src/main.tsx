import { createRoot } from "react-dom/client";
import { getMissingPublicEnvVars } from "@skatehubba/config";
import EnvErrorScreen from "./components/EnvErrorScreen";
import "./index.css";
import "leaflet/dist/leaflet.css";
import "./sentry";
import "./vitals";

const REQUIRED_ENV = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
];

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

const root = createRoot(rootElement);
const missing = getMissingPublicEnvVars(REQUIRED_ENV);

if (missing.length > 0) {
  root.render(<EnvErrorScreen missingKeys={missing} />);
} else {
  import("./App")
    .then(({ default: App }) => {
      root.render(<App />);
    })
    .catch((error) => {
      console.error("[App] Failed to bootstrap application", error);
      root.render(<EnvErrorScreen missingKeys={[]} error={error} />);
    });
}
