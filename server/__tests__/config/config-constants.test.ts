/**
 * @fileoverview Tests for config/constants.ts
 */

import { describe, it, expect } from "vitest";
import {
  SOCKET_PING_TIMEOUT_MS,
  SOCKET_PING_INTERVAL_MS,
  SOCKET_UPGRADE_TIMEOUT_MS,
  SOCKET_MAX_HTTP_BUFFER_SIZE,
  SOCKET_MAX_DISCONNECTION_DURATION_MS,
  MAX_AVATAR_BYTES,
  LOGIN_ATTEMPT_WINDOW_MS,
  SESSION_COOKIE_MAX_AGE_MS,
  EMAIL_VERIFICATION_TOKEN_TTL_MS,
  REAUTH_FRESHNESS_MS,
  SKATE_LETTERS_TO_LOSE,
  MAX_ACCURACY_BONUS_METERS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_AUDIT_PAGE_SIZE,
  DEFAULT_AUDIT_PAGE_SIZE,
  MAX_USERNAME_GENERATION_ATTEMPTS,
} from "../../config/constants";

describe("Application Constants", () => {
  describe("Socket.io Configuration", () => {
    it("SOCKET_PING_TIMEOUT_MS is 20 seconds", () => {
      expect(SOCKET_PING_TIMEOUT_MS).toBe(20_000);
    });

    it("SOCKET_PING_INTERVAL_MS is 25 seconds", () => {
      expect(SOCKET_PING_INTERVAL_MS).toBe(25_000);
    });

    it("SOCKET_UPGRADE_TIMEOUT_MS is 10 seconds", () => {
      expect(SOCKET_UPGRADE_TIMEOUT_MS).toBe(10_000);
    });

    it("SOCKET_MAX_HTTP_BUFFER_SIZE is 1 MB", () => {
      expect(SOCKET_MAX_HTTP_BUFFER_SIZE).toBe(1_048_576);
    });

    it("SOCKET_MAX_DISCONNECTION_DURATION_MS is 2 minutes", () => {
      expect(SOCKET_MAX_DISCONNECTION_DURATION_MS).toBe(2 * 60 * 1000);
    });
  });

  describe("File Upload Limits", () => {
    it("MAX_AVATAR_BYTES is 5 MB", () => {
      expect(MAX_AVATAR_BYTES).toBe(5 * 1024 * 1024);
    });
  });

  describe("Auth & Session", () => {
    it("LOGIN_ATTEMPT_WINDOW_MS is 1 hour", () => {
      expect(LOGIN_ATTEMPT_WINDOW_MS).toBe(60 * 60 * 1000);
    });

    it("SESSION_COOKIE_MAX_AGE_MS is 24 hours", () => {
      expect(SESSION_COOKIE_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
    });

    it("EMAIL_VERIFICATION_TOKEN_TTL_MS is 24 hours", () => {
      expect(EMAIL_VERIFICATION_TOKEN_TTL_MS).toBe(24 * 60 * 60 * 1000);
    });

    it("REAUTH_FRESHNESS_MS is 5 minutes", () => {
      expect(REAUTH_FRESHNESS_MS).toBe(5 * 60 * 1000);
    });
  });

  describe("Game (S.K.A.T.E.)", () => {
    it("SKATE_LETTERS_TO_LOSE is 5", () => {
      expect(SKATE_LETTERS_TO_LOSE).toBe(5);
    });
  });

  describe("Geolocation", () => {
    it("MAX_ACCURACY_BONUS_METERS is 100", () => {
      expect(MAX_ACCURACY_BONUS_METERS).toBe(100);
    });
  });

  describe("Admin / Pagination", () => {
    it("DEFAULT_PAGE_SIZE is 20", () => {
      expect(DEFAULT_PAGE_SIZE).toBe(20);
    });

    it("MAX_PAGE_SIZE is 50", () => {
      expect(MAX_PAGE_SIZE).toBe(50);
    });

    it("MAX_AUDIT_PAGE_SIZE is 100", () => {
      expect(MAX_AUDIT_PAGE_SIZE).toBe(100);
    });

    it("DEFAULT_AUDIT_PAGE_SIZE is 50", () => {
      expect(DEFAULT_AUDIT_PAGE_SIZE).toBe(50);
    });
  });

  describe("Username Generation", () => {
    it("MAX_USERNAME_GENERATION_ATTEMPTS is 5", () => {
      expect(MAX_USERNAME_GENERATION_ATTEMPTS).toBe(5);
    });
  });
});
