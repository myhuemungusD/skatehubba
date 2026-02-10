import type { APICategory } from "../types";

export const progressEndpoints: APICategory = {
  name: "User Progress",
  description: "User tutorial and onboarding progress tracking",
  endpoints: [
    {
      method: "GET",
      path: "/api/users/:userId/progress",
      description: "Get all progress records for a user",
      parameters: [
        {
          name: "userId",
          type: "string",
          location: "path",
          required: true,
          description: "User ID",
        },
      ],
      responses: [
        {
          status: 200,
          description: "List of user progress records",
          example: [
            {
              userId: "user_123",
              stepId: 1,
              completed: true,
              completedAt: "2025-11-03T07:00:00.000Z",
            },
          ],
        },
      ],
    },
    {
      method: "GET",
      path: "/api/users/:userId/progress/:stepId",
      description: "Get progress for a specific step",
      parameters: [
        {
          name: "userId",
          type: "string",
          location: "path",
          required: true,
          description: "User ID",
        },
        {
          name: "stepId",
          type: "integer",
          location: "path",
          required: true,
          description: "Tutorial step ID",
        },
      ],
      responses: [
        {
          status: 200,
          description: "Progress details for the step",
          example: {
            userId: "user_123",
            stepId: 1,
            completed: true,
            completedAt: "2025-11-03T07:00:00.000Z",
          },
        },
        {
          status: 404,
          description: "Progress not found",
          example: { error: "Progress not found" },
        },
      ],
    },
    {
      method: "POST",
      path: "/api/users/:userId/progress",
      description: "Create a new progress record",
      parameters: [
        {
          name: "userId",
          type: "string",
          location: "path",
          required: true,
          description: "User ID",
        },
      ],
      requestBody: {
        type: "application/json",
        example: {
          stepId: 1,
          completed: false,
        },
      },
      responses: [
        {
          status: 201,
          description: "Progress record created",
          example: {
            userId: "user_123",
            stepId: 1,
            completed: false,
            createdAt: "2025-11-03T07:00:00.000Z",
          },
        },
        {
          status: 400,
          description: "Invalid progress data",
          example: { error: "Invalid progress data" },
        },
      ],
    },
    {
      method: "PATCH",
      path: "/api/users/:userId/progress/:stepId",
      description: "Update progress for a step",
      parameters: [
        {
          name: "userId",
          type: "string",
          location: "path",
          required: true,
          description: "User ID",
        },
        {
          name: "stepId",
          type: "integer",
          location: "path",
          required: true,
          description: "Tutorial step ID",
        },
      ],
      requestBody: {
        type: "application/json",
        example: {
          completed: true,
        },
      },
      responses: [
        {
          status: 200,
          description: "Progress updated",
          example: {
            userId: "user_123",
            stepId: 1,
            completed: true,
            completedAt: "2025-11-03T07:00:00.000Z",
          },
        },
      ],
    },
  ],
};
