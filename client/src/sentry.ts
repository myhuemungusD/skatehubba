import * as Sentry from "@sentry/react";
import { env } from "./config/env";

if (env.EXPO_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: env.EXPO_PUBLIC_SENTRY_DSN,
    environment: env.MODE,
    tracesSampleRate: env.MODE === "production" ? 0.2 : 1.0,
    replaysSessionSampleRate: env.MODE === "production" ? 0.1 : 0,
    beforeSend(event) {
      // Drop events from browser extensions
      if (
        event.exception?.values?.some((v) =>
          v.stacktrace?.frames?.some((f) => f.filename?.startsWith("chrome-extension://"))
        )
      ) {
        return null;
      }
      return event;
    },
    initialScope: {
      tags: {
        app: "skatehubba-web",
      },
    },
  });
}

export default Sentry;
