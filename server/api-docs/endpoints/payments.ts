import type { APICategory } from "../types";

export const paymentsEndpoints: APICategory = {
  name: "Payments",
  description: "Stripe payment processing",
  endpoints: [
    {
      method: "POST",
      path: "/api/create-payment-intent",
      description: "Create payment intent for donations",
      requestBody: {
        type: "application/json",
        example: {
          amount: 25.0,
          currency: "usd",
          description: "SkateHubba Donation",
        },
      },
      responses: [
        {
          status: 200,
          description: "Payment intent created",
          example: {
            clientSecret: "pi_xxx_secret_xxx",
            paymentIntentId: "pi_xxx",
          },
        },
        {
          status: 400,
          description: "Invalid amount",
          example: { error: "Amount must be between $0.50 and $10,000" },
        },
      ],
      notes: [
        "Amount must be between $0.50 and $10,000",
        "Supports card, Apple Pay, Google Pay, and Link",
      ],
    },
    {
      method: "GET",
      path: "/api/payment-intent/:id",
      description: "Get payment intent status",
      parameters: [
        {
          name: "id",
          type: "string",
          location: "path",
          required: true,
          description: "Payment Intent ID",
        },
      ],
      responses: [
        {
          status: 200,
          description: "Payment intent status",
          example: {
            status: "succeeded",
            amount: 25.0,
            currency: "usd",
            description: "SkateHubba Donation",
          },
        },
      ],
    },
    // create-shop-payment-intent removed for MVP
    {
      method: "POST",
      path: "/api/record-donation",
      description: "Record successful donation",
      requestBody: {
        type: "application/json",
        example: {
          paymentIntentId: "pi_xxx",
          firstName: "John",
        },
      },
      responses: [
        {
          status: 200,
          description: "Donation recorded",
          example: {
            message: "Donation recorded successfully",
            donationId: 1,
          },
        },
      ],
    },
    {
      method: "GET",
      path: "/api/recent-donors",
      description: "Get recent donors (first names only)",
      parameters: [
        {
          name: "limit",
          type: "integer",
          location: "query",
          required: false,
          description: "Number of donors to return (max 50, default 10)",
        },
      ],
      responses: [
        {
          status: 200,
          description: "List of recent donors",
          example: [
            {
              firstName: "John",
              createdAt: "2025-11-03T07:00:00.000Z",
            },
          ],
        },
      ],
    },
  ],
};
