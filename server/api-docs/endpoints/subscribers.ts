import type { APICategory } from "../types";

export const subscribersEndpoints: APICategory = {
  name: "Subscribers",
  description: "Beta subscriber management",
  endpoints: [
    {
      method: "POST",
      path: "/api/subscribe",
      description: "Subscribe to beta list",
      requestBody: {
        type: "application/json",
        example: {
          email: "user@example.com",
          firstName: "John",
        },
      },
      responses: [
        {
          status: 201,
          description: "Subscription created",
          example: {
            ok: true,
            status: "created",
            id: 1,
            msg: "Welcome to the beta list! Check your email for confirmation.",
          },
        },
        {
          status: 200,
          description: "Already subscribed",
          example: {
            ok: true,
            status: "exists",
            msg: "You're already on the beta list! We'll notify you when it's ready.",
          },
        },
      ],
      notes: ["Sends welcome email via Resend", "Idempotent - safe to call multiple times"],
    },
    {
      method: "GET",
      path: "/api/subscribers",
      description: "Get all subscribers (admin only)",
      authentication: "API Key required",
      parameters: [
        {
          name: "x-api-key",
          type: "string",
          location: "header",
          required: true,
          description: "Admin API key",
        },
      ],
      responses: [
        {
          status: 200,
          description: "List of subscribers",
          example: [
            {
              id: 1,
              email: "user@example.com",
              firstName: "John",
              isActive: true,
              createdAt: "2025-11-03T07:00:00.000Z",
            },
          ],
        },
        {
          status: 401,
          description: "Unauthorized",
          example: { error: "Invalid or missing API key" },
        },
      ],
    },
  ],
};
