/**
 * Tests for client/src/lib/analytics.ts
 *
 * Covers: trackEvent, trackPageView, trackButtonClick, trackDonation,
 *         trackSignup, trackAppDemo, and the legacy `analytics` object.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("firebase/analytics", () => ({
  logEvent: vi.fn(),
}));

vi.mock("../firebase", () => ({
  analytics: { _type: "mock-analytics-instance" },
}));

vi.mock("../../config/env", () => ({
  env: { DEV: false },
}));

vi.mock("../logger", () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    info: vi.fn(),
  },
}));

// Stub window.location for browser-dependent helpers
vi.stubGlobal("window", {
  location: {
    href: "https://skatehubba.com/spots",
    pathname: "/spots",
  },
});

// ── Imports (resolved AFTER mocks are hoisted) ─────────────────────────────

import { logEvent } from "firebase/analytics";
import { env } from "../../config/env";
import { logger } from "../logger";

import {
  trackEvent,
  trackPageView,
  trackButtonClick,
  trackDonation,
  trackSignup,
  trackAppDemo,
  analytics,
} from "../analytics";

// ── Tests ──────────────────────────────────────────────────────────────────

describe("analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (env as any).DEV = false;
  });

  // ────────────────────────────────────────────────────────────────────────
  // trackEvent
  // ────────────────────────────────────────────────────────────────────────

  describe("trackEvent", () => {
    it("calls logEvent in production mode", () => {
      trackEvent("test_event", { key: "value" });

      expect(logEvent).toHaveBeenCalledWith({ _type: "mock-analytics-instance" }, "test_event", {
        key: "value",
      });
    });

    it("calls logEvent without parameters when none provided", () => {
      trackEvent("simple_event");

      expect(logEvent).toHaveBeenCalledWith(
        { _type: "mock-analytics-instance" },
        "simple_event",
        undefined
      );
    });

    it("logs to debug instead of logEvent in development mode", () => {
      (env as any).DEV = true;

      trackEvent("dev_event", { foo: "bar" });

      expect(logger.debug).toHaveBeenCalledWith("[Analytics] dev_event", { foo: "bar" });
      expect(logEvent).not.toHaveBeenCalled();
    });

    it("returns early in dev mode without calling logEvent", () => {
      (env as any).DEV = true;

      trackEvent("dev_only");

      expect(logEvent).not.toHaveBeenCalled();
    });

    it("catches and warns when logEvent throws", () => {
      vi.mocked(logEvent).mockImplementationOnce(() => {
        throw new Error("Firebase Analytics unavailable");
      });

      trackEvent("failing_event");

      expect(logger.warn).toHaveBeenCalledWith("Analytics tracking failed:", expect.any(Error));
    });

    it("does nothing when firebaseAnalytics is null (non-dev mode)", async () => {
      // Reset modules so we can re-mock firebase with analytics = null
      vi.resetModules();

      vi.doMock("firebase/analytics", () => ({
        logEvent: vi.fn(),
      }));
      vi.doMock("../firebase", () => ({
        analytics: null,
      }));
      vi.doMock("../../config/env", () => ({
        env: { DEV: false },
      }));
      vi.doMock("../logger", () => ({
        logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn(), info: vi.fn() },
      }));

      const { logEvent: freshLogEvent } = await import("firebase/analytics");
      const { trackEvent: freshTrackEvent } = await import("../analytics");

      freshTrackEvent("null_analytics_event", { key: "value" });

      // logEvent should NOT have been called since firebaseAnalytics is null
      expect(freshLogEvent).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // trackPageView
  // ────────────────────────────────────────────────────────────────────────

  describe("trackPageView", () => {
    it("sends page_view event with page title and location", () => {
      trackPageView("Spots Page");

      expect(logEvent).toHaveBeenCalledWith({ _type: "mock-analytics-instance" }, "page_view", {
        page_title: "Spots Page",
        page_location: "https://skatehubba.com/spots",
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // trackButtonClick
  // ────────────────────────────────────────────────────────────────────────

  describe("trackButtonClick", () => {
    it("sends button_click event with explicit location", () => {
      trackButtonClick("download_app", "hero_section");

      expect(logEvent).toHaveBeenCalledWith({ _type: "mock-analytics-instance" }, "button_click", {
        button_name: "download_app",
        location: "hero_section",
      });
    });

    it("defaults location to window.location.pathname", () => {
      trackButtonClick("nav_item");

      expect(logEvent).toHaveBeenCalledWith({ _type: "mock-analytics-instance" }, "button_click", {
        button_name: "nav_item",
        location: "/spots",
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // trackDonation
  // ────────────────────────────────────────────────────────────────────────

  describe("trackDonation", () => {
    it("sends donation_initiated event with amount, currency, and method", () => {
      trackDonation(25, "stripe");

      expect(logEvent).toHaveBeenCalledWith(
        { _type: "mock-analytics-instance" },
        "donation_initiated",
        {
          value: 25,
          currency: "USD",
          payment_method: "stripe",
        }
      );
    });

    it("handles decimal amounts", () => {
      trackDonation(9.99, "paypal");

      expect(logEvent).toHaveBeenCalledWith(
        { _type: "mock-analytics-instance" },
        "donation_initiated",
        {
          value: 9.99,
          currency: "USD",
          payment_method: "paypal",
        }
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // trackSignup
  // ────────────────────────────────────────────────────────────────────────

  describe("trackSignup", () => {
    it("defaults to email method", () => {
      trackSignup();

      expect(logEvent).toHaveBeenCalledWith({ _type: "mock-analytics-instance" }, "sign_up", {
        method: "email",
      });
    });

    it("accepts a custom method", () => {
      trackSignup("google");

      expect(logEvent).toHaveBeenCalledWith({ _type: "mock-analytics-instance" }, "sign_up", {
        method: "google",
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // trackAppDemo
  // ────────────────────────────────────────────────────────────────────────

  describe("trackAppDemo", () => {
    it("sends app_demo_click event with source", () => {
      trackAppDemo("hero_banner");

      expect(logEvent).toHaveBeenCalledWith(
        { _type: "mock-analytics-instance" },
        "app_demo_click",
        { source: "hero_banner" }
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Legacy analytics object
  // ────────────────────────────────────────────────────────────────────────

  describe("analytics (legacy)", () => {
    describe("subscribeSubmitted", () => {
      it("tracks sign_up and subscribe_submitted with email domain", () => {
        analytics.subscribeSubmitted("user@gmail.com");

        expect(logEvent).toHaveBeenCalledWith(expect.anything(), "sign_up", { method: "email" });
        expect(logEvent).toHaveBeenCalledWith(expect.anything(), "subscribe_submitted", {
          email_domain: "gmail.com",
        });
      });

      it("uses 'unknown' domain for email without @ symbol", () => {
        analytics.subscribeSubmitted("bad-email");

        expect(logEvent).toHaveBeenCalledWith(expect.anything(), "subscribe_submitted", {
          email_domain: "unknown",
        });
      });
    });

    describe("subscribeSuccess", () => {
      it("tracks subscribe_success event", () => {
        analytics.subscribeSuccess();

        expect(logEvent).toHaveBeenCalledWith(expect.anything(), "subscribe_success", undefined);
      });
    });

    describe("ctaClickHero", () => {
      it("tracks button_click and cta_click_hero events", () => {
        analytics.ctaClickHero("Get the App");

        expect(logEvent).toHaveBeenCalledWith(expect.anything(), "button_click", {
          button_name: "hero_cta",
          location: "hero_section",
        });
        expect(logEvent).toHaveBeenCalledWith(expect.anything(), "cta_click_hero", {
          cta_text: "Get the App",
        });
      });
    });

    describe("videoPlay", () => {
      it("tracks video_play event with section", () => {
        analytics.videoPlay("intro");

        expect(logEvent).toHaveBeenCalledWith(expect.anything(), "video_play", {
          video_section: "intro",
        });
      });
    });
  });
});
