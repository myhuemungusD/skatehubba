import type { APICategory } from "../types";

export const tutorialEndpoints: APICategory = {
  name: "Tutorial Steps",
  description: "Onboarding tutorial step management",
  endpoints: [
    {
      method: "GET",
      path: "/api/tutorial/steps",
      description: "Get all tutorial steps",
      responses: [
        {
          status: 200,
          description: "List of tutorial steps",
          example: [
            {
              id: 1,
              title: "Welcome",
              description: "Welcome to SkateHubba",
              order: 1,
            },
          ],
        },
      ],
    },
    {
      method: "GET",
      path: "/api/tutorial/steps/:id",
      description: "Get a specific tutorial step by ID",
      parameters: [
        {
          name: "id",
          type: "integer",
          location: "path",
          required: true,
          description: "Tutorial step ID",
        },
      ],
      responses: [
        {
          status: 200,
          description: "Tutorial step details",
          example: {
            id: 1,
            title: "Welcome",
            description: "Welcome to SkateHubba",
            order: 1,
          },
        },
        {
          status: 404,
          description: "Tutorial step not found",
          example: { error: "Tutorial step not found" },
        },
      ],
    },
  ],
};
