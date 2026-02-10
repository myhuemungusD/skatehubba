import type { APICategory } from "../types";

export const usersEndpoints: APICategory = {
  name: "Users",
  description: "User profile and onboarding management",
  endpoints: [
    {
      method: "GET",
      path: "/api/users/:id",
      description: "Get user profile by ID",
      parameters: [
        {
          name: "id",
          type: "string",
          location: "path",
          required: true,
          description: "User ID",
        },
      ],
      responses: [
        {
          status: 200,
          description: "User profile",
          example: {
            id: "user_123",
            email: "user@example.com",
            firstName: "John",
            lastName: "Doe",
            onboardingCompleted: false,
            onboardingStep: 1,
          },
        },
        {
          status: 404,
          description: "User not found",
          example: { error: "User not found" },
        },
      ],
    },
    {
      method: "PATCH",
      path: "/api/users/:id/onboarding",
      description: "Update user onboarding status",
      parameters: [
        {
          name: "id",
          type: "string",
          location: "path",
          required: true,
          description: "User ID",
        },
      ],
      requestBody: {
        type: "application/json",
        example: {
          completed: true,
          currentStep: 5,
        },
      },
      responses: [
        {
          status: 200,
          description: "Onboarding status updated",
          example: {
            id: "user_123",
            onboardingCompleted: true,
            onboardingStep: 5,
          },
        },
      ],
    },
    {
      method: "POST",
      path: "/api/demo-user",
      description: "Create a demo user for testing",
      responses: [
        {
          status: 201,
          description: "Demo user created",
          example: {
            id: "demo_skater_1730620800000",
            firstName: "Demo",
            lastName: "User",
          },
        },
      ],
      notes: ["For development and testing purposes only"],
    },
  ],
};
