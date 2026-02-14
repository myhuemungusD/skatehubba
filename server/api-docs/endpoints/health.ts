import type { APICategory } from "../types";

export const healthEndpoints: APICategory = {
  name: "Health & Status",
  description: "System health and status endpoints",
  endpoints: [
    {
      method: "GET",
      path: "/api/health",
      description: "Check API health status",
      responses: [
        {
          status: 200,
          description: "API is healthy",
          example: {
            status: "ok",
            env: "development",
            time: "2025-11-03T07:00:00.000Z",
          },
        },
      ],
    },
  ],
};
