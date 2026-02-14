/**
 * SkateHubba Authenticated Load Test — k6
 *
 * Tests authenticated API endpoints that require a Firebase token.
 * Set K6_AUTH_TOKEN to a valid Firebase ID token before running.
 *
 * Usage:
 *   K6_AUTH_TOKEN=<firebase-id-token> k6 run benchmarks/k6-auth-flows.js
 *   K6_AUTH_TOKEN=<token> K6_BASE_URL=https://staging.skatehubba.com k6 run benchmarks/k6-auth-flows.js
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const errorRate = new Rate("auth_errors");
const gameListLatency = new Trend("game_list_latency", true);
const spotDiscoveryLatency = new Trend("spot_discovery_latency", true);
const profileMeLatency = new Trend("profile_me_latency", true);
const challengesLatency = new Trend("challenges_latency", true);
const notificationsLatency = new Trend("notifications_latency", true);

const BASE_URL = __ENV.K6_BASE_URL || "http://localhost:3001";
const AUTH_TOKEN = __ENV.K6_AUTH_TOKEN;

export const options = {
  scenarios: {
    authenticated_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "20s", target: 10 },
        { duration: "1m", target: 10 },
        { duration: "20s", target: 30 },
        { duration: "1m", target: 30 },
        { duration: "20s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<1000", "p(99)<3000"],
    auth_errors: ["rate<0.15"],
    game_list_latency: ["p(95)<1000"],
    spot_discovery_latency: ["p(95)<1200"],
    profile_me_latency: ["p(95)<500"],
  },
};

function authHeaders() {
  return {
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
      "Content-Type": "application/json",
    },
  };
}

export default function () {
  if (!AUTH_TOKEN) {
    console.error("K6_AUTH_TOKEN environment variable is required");
    return;
  }

  group("Profile (authenticated)", () => {
    const res = http.get(`${BASE_URL}/api/profile/me`, authHeaders());
    profileMeLatency.add(res.timings.duration);
    const success = check(res, {
      "profile 200": (r) => r.status === 200,
      "profile has user data": (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.id !== undefined || body.uid !== undefined;
        } catch {
          return false;
        }
      },
    });
    errorRate.add(!success);
  });

  sleep(0.5);

  group("Spots Discovery", () => {
    const res = http.get(`${BASE_URL}/api/spots`, authHeaders());
    spotDiscoveryLatency.add(res.timings.duration);
    const success = check(res, {
      "spots 200": (r) => r.status === 200,
      "spots returns array": (r) => {
        try {
          return Array.isArray(JSON.parse(r.body));
        } catch {
          return false;
        }
      },
    });
    errorRate.add(!success);
  });

  sleep(0.5);

  group("Games List", () => {
    const res = http.get(`${BASE_URL}/api/games`, authHeaders());
    gameListLatency.add(res.timings.duration);
    const success = check(res, {
      "games 200 or 403": (r) => r.status === 200 || r.status === 403,
    });
    errorRate.add(!success);
  });

  sleep(0.5);

  group("Notifications Feed", () => {
    const res = http.get(`${BASE_URL}/api/notifications/feed`, authHeaders());
    notificationsLatency.add(res.timings.duration);
    const success = check(res, {
      "notifications 200": (r) => r.status === 200,
    });
    errorRate.add(!success);
  });

  sleep(1);
}
