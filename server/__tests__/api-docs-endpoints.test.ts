/**
 * @fileoverview Unit tests for API docs endpoint definitions
 */

import { describe, it, expect } from "vitest";

import { healthEndpoints } from "../api-docs/endpoints/health";
import { authEndpoints } from "../api-docs/endpoints/auth";
import { gameEndpoints } from "../api-docs/endpoints/game";
import { analyticsEndpoints } from "../api-docs/endpoints/analytics";
import { moderationEndpoints } from "../api-docs/endpoints/moderation";
import { metricsEndpoints } from "../api-docs/endpoints/metrics";
import { spotsEndpoints } from "../api-docs/endpoints/spots";
import { paymentsEndpoints } from "../api-docs/endpoints/payments";
import { subscribersEndpoints } from "../api-docs/endpoints/subscribers";
import { profileEndpoints } from "../api-docs/endpoints/profile";
import { progressEndpoints } from "../api-docs/endpoints/progress";
import { trickmintEndpoints } from "../api-docs/endpoints/trickmint";
import { tutorialEndpoints } from "../api-docs/endpoints/tutorial";
import { usersEndpoints } from "../api-docs/endpoints/users";

const allEndpointModules = [
  { name: "health", module: healthEndpoints },
  { name: "auth", module: authEndpoints },
  { name: "game", module: gameEndpoints },
  { name: "analytics", module: analyticsEndpoints },
  { name: "moderation", module: moderationEndpoints },
  { name: "metrics", module: metricsEndpoints },
  { name: "spots", module: spotsEndpoints },
  { name: "payments", module: paymentsEndpoints },
  { name: "subscribers", module: subscribersEndpoints },
  { name: "profile", module: profileEndpoints },
  { name: "progress", module: progressEndpoints },
  { name: "trickmint", module: trickmintEndpoints },
  { name: "tutorial", module: tutorialEndpoints },
  { name: "users", module: usersEndpoints },
];

describe("API Docs Endpoint Definitions", () => {
  for (const { name, module: endpointModule } of allEndpointModules) {
    describe(`${name} endpoints`, () => {
      it("should have a name property", () => {
        expect(endpointModule.name).toBeDefined();
        expect(typeof endpointModule.name).toBe("string");
      });

      it("should have a description property", () => {
        expect(endpointModule.description).toBeDefined();
        expect(typeof endpointModule.description).toBe("string");
      });

      it("should have an endpoints array", () => {
        expect(Array.isArray(endpointModule.endpoints)).toBe(true);
        expect(endpointModule.endpoints.length).toBeGreaterThan(0);
      });

      it("each endpoint should have required fields", () => {
        for (const endpoint of endpointModule.endpoints) {
          expect(endpoint.method).toBeDefined();
          expect(["GET", "POST", "PUT", "PATCH", "DELETE"]).toContain(endpoint.method);
          expect(endpoint.path).toBeDefined();
          expect(typeof endpoint.path).toBe("string");
          expect(endpoint.description).toBeDefined();
          expect(Array.isArray(endpoint.responses)).toBe(true);
          expect(endpoint.responses.length).toBeGreaterThan(0);
        }
      });

      it("each response should have status and description", () => {
        for (const endpoint of endpointModule.endpoints) {
          for (const response of endpoint.responses) {
            expect(typeof response.status).toBe("number");
            expect(typeof response.description).toBe("string");
          }
        }
      });
    });
  }
});
