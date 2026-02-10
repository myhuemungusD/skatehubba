import type { APICategory } from "../types";

export const spotsEndpoints: APICategory = {
  name: "Spots",
  description: "Skate spot discovery and check-in",
  endpoints: [
    {
      method: "GET",
      path: "/api/spots",
      description: "Get all skate spots",
      responses: [
        {
          status: 200,
          description: "List of all spots",
          example: [
            {
              spotId: "spot_001",
              name: "Love Park",
              lat: 39.9526,
              lng: -75.1652,
              description: "Legendary Philadelphia skate spot",
            },
          ],
        },
      ],
    },
    {
      method: "GET",
      path: "/api/spots/:spotId",
      description: "Get specific spot details",
      parameters: [
        {
          name: "spotId",
          type: "string",
          location: "path",
          required: true,
          description: "Spot ID",
        },
      ],
      responses: [
        {
          status: 200,
          description: "Spot details",
          example: {
            spotId: "spot_001",
            name: "Love Park",
            lat: 39.9526,
            lng: -75.1652,
            description: "Legendary Philadelphia skate spot",
          },
        },
        {
          status: 404,
          description: "Spot not found",
          example: { error: "Spot not found" },
        },
      ],
    },
    {
      method: "POST",
      path: "/api/spots/check-in",
      description: "Check in at a spot with geo-verification",
      requestBody: {
        type: "application/json",
        example: {
          spotId: "spot_001",
          userId: "user_123",
          latitude: 39.9526,
          longitude: -75.1652,
        },
      },
      responses: [
        {
          status: 200,
          description: "Check-in successful",
          example: {
            success: true,
            message: "Successfully checked in at Love Park!",
            access: {
              spotId: "spot_001",
              accessGrantedAt: 1730620800000,
              expiresAt: 1730707200000,
              trickId: "trick_spot_001_1730620800000",
            },
            distance: 15,
          },
        },
        {
          status: 403,
          description: "Too far from spot",
          example: {
            success: false,
            message: "You must be within 30m of Love Park to check in. You are 150m away.",
            distance: 150,
          },
        },
      ],
      notes: [
        "Uses Haversine formula to calculate distance",
        "Requires user to be within 30 meters of spot",
      ],
    },
  ],
};
