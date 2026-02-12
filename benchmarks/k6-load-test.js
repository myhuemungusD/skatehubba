/**
 * SkateHubba Load Test Suite — k6
 *
 * Usage:
 *   k6 run benchmarks/k6-load-test.js                          # default (10 VUs, 30s)
 *   k6 run --vus 50 --duration 2m benchmarks/k6-load-test.js   # custom load
 *   K6_BASE_URL=https://staging.skatehubba.com k6 run benchmarks/k6-load-test.js
 *
 * Install k6: https://k6.io/docs/get-started/installation/
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// Custom metrics
const errorRate = new Rate("errors");
const healthLatency = new Trend("health_latency", true);
const spotsLatency = new Trend("spots_latency", true);
const profileLatency = new Trend("profile_latency", true);
const docsLatency = new Trend("docs_latency", true);

const BASE_URL = __ENV.K6_BASE_URL || "http://localhost:3001";

export const options = {
  scenarios: {
    // Smoke test: verify basic functionality under minimal load
    smoke: {
      executor: "constant-vus",
      vus: 5,
      duration: "30s",
      tags: { scenario: "smoke" },
    },
    // Load test: simulate normal traffic patterns
    load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 20 },  // ramp up
        { duration: "1m", target: 20 },   // sustain
        { duration: "30s", target: 50 },  // peak
        { duration: "1m", target: 50 },   // sustain peak
        { duration: "30s", target: 0 },   // ramp down
      ],
      startTime: "30s", // start after smoke finishes
      tags: { scenario: "load" },
    },
    // Spike test: sudden burst of traffic
    spike: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 100 },
        { duration: "30s", target: 100 },
        { duration: "10s", target: 0 },
      ],
      startTime: "3m30s", // start after load finishes
      tags: { scenario: "spike" },
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<1500"],
    http_req_failed: ["rate<0.05"],
    errors: ["rate<0.1"],
    health_latency: ["p(95)<100"],
    spots_latency: ["p(95)<800"],
    docs_latency: ["p(95)<300"],
  },
};

export default function () {
  group("Health Check", () => {
    const res = http.get(`${BASE_URL}/api/health`);
    healthLatency.add(res.timings.duration);
    const success = check(res, {
      "health status 200": (r) => r.status === 200,
      "health latency < 100ms": (r) => r.timings.duration < 100,
    });
    errorRate.add(!success);
  });

  sleep(0.5);

  group("API Documentation", () => {
    const res = http.get(`${BASE_URL}/api/docs/openapi.json`);
    docsLatency.add(res.timings.duration);
    const success = check(res, {
      "docs status 200": (r) => r.status === 200,
      "docs has openapi field": (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.openapi === "3.0.3";
        } catch {
          return false;
        }
      },
    });
    errorRate.add(!success);
  });

  sleep(0.5);

  group("Spots API (Public-ish)", () => {
    const res = http.get(`${BASE_URL}/api/spots`);
    spotsLatency.add(res.timings.duration);
    const success = check(res, {
      "spots status is 200 or 401": (r) => r.status === 200 || r.status === 401,
      "spots latency < 800ms": (r) => r.timings.duration < 800,
    });
    errorRate.add(!success);
  });

  sleep(0.5);

  group("Profile API (Auth Required)", () => {
    // This will return 401 without auth — that's expected
    const res = http.get(`${BASE_URL}/api/profile/me`);
    profileLatency.add(res.timings.duration);
    const success = check(res, {
      "profile returns 401 without auth": (r) => r.status === 401,
      "profile latency < 200ms": (r) => r.timings.duration < 200,
    });
    errorRate.add(!success);
  });

  sleep(1);
}

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    metrics: {
      http_reqs: data.metrics.http_reqs?.values?.count || 0,
      http_req_duration_p95: data.metrics.http_req_duration?.values?.["p(95)"] || 0,
      http_req_duration_p99: data.metrics.http_req_duration?.values?.["p(99)"] || 0,
      http_req_duration_avg: data.metrics.http_req_duration?.values?.avg || 0,
      http_req_failed_rate: data.metrics.http_req_failed?.values?.rate || 0,
      error_rate: data.metrics.errors?.values?.rate || 0,
      health_p95: data.metrics.health_latency?.values?.["p(95)"] || 0,
      spots_p95: data.metrics.spots_latency?.values?.["p(95)"] || 0,
      docs_p95: data.metrics.docs_latency?.values?.["p(95)"] || 0,
    },
    thresholds: Object.fromEntries(
      Object.entries(data.metrics)
        .filter(([, v]) => v.thresholds)
        .map(([k, v]) => [k, v.thresholds])
    ),
  };

  return {
    stdout: textSummary(data, { indent: "  ", enableColors: true }),
    "benchmarks/results/latest.json": JSON.stringify(summary, null, 2),
  };
}

// k6 built-in text summary
import { textSummary } from "https://jslib.k6.io/k6-summary/0.1.0/index.js";
