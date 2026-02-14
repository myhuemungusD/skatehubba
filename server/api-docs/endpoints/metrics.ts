import type { APICategory } from "../types";

export const metricsEndpoints: APICategory = {
  name: "Metrics & Analytics Dashboard",
  description: "Admin-only endpoints for business metrics, KPIs, and analytics dashboards",
  endpoints: [
    {
      method: "GET",
      path: "/api/metrics/wab-au",
      description: "Get current WAB/AU (Weekly Active Battles / Active Users) snapshot for the last 7 days",
      authentication: "Admin role required",
      responses: [
        {
          status: 200,
          description: "Current WAB/AU metrics",
          example: {
            wab: 42,
            au: 150,
            wab_per_au: 0.28,
          },
        },
        {
          status: 403,
          description: "User is not an admin",
          example: {
            code: "ADMIN_REQUIRED",
            message: "Admin access required.",
          },
        },
        {
          status: 500,
          description: "Database query failed",
          example: {
            code: "QUERY_FAILED",
            message: "Database query failed.",
          },
        },
        {
          status: 503,
          description: "Database unavailable",
          example: {
            code: "database_unavailable",
            message: "Database is temporarily unavailable.",
          },
        },
      ],
      notes: [
        "WAB = Weekly Active Battles (unique battles in last 7 days)",
        "AU = Active Users (unique users active in last 7 days)",
        "WAB/AU ratio indicates user engagement with battle feature",
        "Admin authentication required",
      ],
    },
    {
      method: "GET",
      path: "/api/metrics/wab-au/trend",
      description: "Get WAB/AU trend over the last 12 weeks for time-series dashboards",
      authentication: "Admin role required",
      responses: [
        {
          status: 200,
          description: "12-week WAB/AU trend data",
          example: [
            {
              week_start: "2025-01-06",
              wab: 38,
              au: 142,
              wab_per_au: 0.27,
            },
            {
              week_start: "2025-01-13",
              wab: 42,
              au: 150,
              wab_per_au: 0.28,
            },
          ],
        },
        {
          status: 403,
          description: "User is not an admin",
          example: {
            code: "ADMIN_REQUIRED",
            message: "Admin access required.",
          },
        },
        {
          status: 500,
          description: "Database query failed",
          example: {
            code: "QUERY_FAILED",
            message: "Database query failed.",
          },
        },
      ],
      notes: [
        "Returns weekly aggregated data for last 12 weeks",
        "Dashboard-ready time series format",
        "Useful for tracking engagement trends over time",
        "Admin authentication required",
      ],
    },
    {
      method: "GET",
      path: "/api/metrics/kpi",
      description: "Get all KPI metrics in a single response for executive dashboards",
      authentication: "Admin role required",
      responses: [
        {
          status: 200,
          description: "Comprehensive KPI dashboard data",
          example: {
            wab: 42,
            au: 150,
            wab_per_au: 0.28,
            response_rate_48h: 0.85,
            avg_votes_per_battle: 2.3,
            crew_join_rate: 0.42,
            d7_retention: 0.38,
            total_users: 1250,
            total_battles: 485,
            total_spots: 320,
          },
        },
        {
          status: 403,
          description: "User is not an admin",
          example: {
            code: "ADMIN_REQUIRED",
            message: "Admin access required.",
          },
        },
        {
          status: 500,
          description: "Database query failed",
          example: {
            code: "QUERY_FAILED",
            message: "Database query failed.",
          },
        },
      ],
      notes: [
        "Single endpoint for all key performance indicators",
        "Optimized for executive dashboard views",
        "Combines multiple metrics queries into one response",
        "Admin authentication required",
      ],
    },
    {
      method: "GET",
      path: "/api/metrics/response-rate",
      description: "Get percentage of uploads that received a response within 48 hours",
      authentication: "Admin role required",
      responses: [
        {
          status: 200,
          description: "Response rate metric",
          example: {
            total_uploads: 250,
            uploads_with_response: 213,
            response_rate: 0.852,
          },
        },
        {
          status: 403,
          description: "User is not an admin",
          example: {
            code: "ADMIN_REQUIRED",
            message: "Admin access required.",
          },
        },
        {
          status: 500,
          description: "Database query failed",
          example: {
            code: "QUERY_FAILED",
            message: "Database query failed.",
          },
        },
      ],
      notes: [
        "Measures user engagement and community responsiveness",
        "48-hour window is the target for healthy engagement",
        "Higher response rate indicates active community",
        "Admin authentication required",
      ],
    },
    {
      method: "GET",
      path: "/api/metrics/votes-per-battle",
      description: "Get average number of votes per battle",
      authentication: "Admin role required",
      responses: [
        {
          status: 200,
          description: "Average votes per battle",
          example: {
            total_battles: 485,
            total_votes: 1116,
            avg_votes_per_battle: 2.3,
          },
        },
        {
          status: 403,
          description: "User is not an admin",
          example: {
            code: "ADMIN_REQUIRED",
            message: "Admin access required.",
          },
        },
        {
          status: 500,
          description: "Database query failed",
          example: {
            code: "QUERY_FAILED",
            message: "Database query failed.",
          },
        },
      ],
      notes: [
        "Measures community engagement with battle voting",
        "Higher average indicates more active voting participation",
        "Target is 2+ votes per battle for dual-vote judging system",
        "Admin authentication required",
      ],
    },
    {
      method: "GET",
      path: "/api/metrics/crew-join-rate",
      description: "Get percentage of users who have joined a crew",
      authentication: "Admin role required",
      responses: [
        {
          status: 200,
          description: "Crew join rate",
          example: {
            total_users: 1250,
            users_in_crews: 525,
            crew_join_rate: 0.42,
          },
        },
        {
          status: 403,
          description: "User is not an admin",
          example: {
            code: "ADMIN_REQUIRED",
            message: "Admin access required.",
          },
        },
        {
          status: 500,
          description: "Database query failed",
          example: {
            code: "QUERY_FAILED",
            message: "Database query failed.",
          },
        },
      ],
      notes: [
        "Measures social feature adoption",
        "Higher rate indicates strong community building",
        "Crew membership drives retention and engagement",
        "Admin authentication required",
      ],
    },
    {
      method: "GET",
      path: "/api/metrics/retention",
      description: "Get Day 7 (D7) retention rate",
      authentication: "Admin role required",
      responses: [
        {
          status: 200,
          description: "D7 retention rate",
          example: {
            cohort_size: 200,
            retained_d7: 76,
            d7_retention: 0.38,
          },
        },
        {
          status: 403,
          description: "User is not an admin",
          example: {
            code: "ADMIN_REQUIRED",
            message: "Admin access required.",
          },
        },
        {
          status: 500,
          description: "Database query failed",
          example: {
            code: "QUERY_FAILED",
            message: "Database query failed.",
          },
        },
      ],
      notes: [
        "Measures percentage of new users who return after 7 days",
        "Key indicator of product-market fit and onboarding success",
        "Industry benchmark for social apps is 25-40%",
        "Admin authentication required",
      ],
    },
  ],
};
