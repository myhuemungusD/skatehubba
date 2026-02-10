import type { APICategory } from "../types";

export const authEndpoints: APICategory = {
  name: "Authentication",
  description: "Firebase-based authentication endpoints",
  endpoints: [
    {
      method: "POST",
      path: "/api/auth/login",
      description: "Login or register with Firebase ID token",
      authentication: "Firebase ID Token (Bearer)",
      parameters: [
        {
          name: "Authorization",
          type: "string",
          location: "header",
          required: true,
          description: "Bearer token with Firebase ID token",
        },
      ],
      requestBody: {
        type: "application/json",
        example: {
          firstName: "John",
          lastName: "Doe",
          isRegistration: true,
        },
      },
      responses: [
        {
          status: 200,
          description: "Login successful, session cookie set",
          example: {
            user: {
              id: "user_123",
              email: "user@example.com",
              displayName: "John Doe",
              photoUrl: "https://example.com/photo.jpg",
              roles: [],
              createdAt: "2025-11-03T07:00:00.000Z",
              provider: "firebase",
            },
            strategy: "firebase",
          },
        },
        {
          status: 401,
          description: "Invalid Firebase token",
          example: { error: "Invalid Firebase token" },
        },
      ],
      notes: [
        "Rate limited to prevent brute force attacks",
        "Creates HttpOnly session cookie for subsequent requests",
        "Auto-creates user record if first login",
      ],
    },
    {
      method: "GET",
      path: "/api/auth/me",
      description: "Get current authenticated user information",
      authentication: "Session Cookie or Bearer Token",
      responses: [
        {
          status: 200,
          description: "User information retrieved",
          example: {
            user: {
              id: "user_123",
              email: "user@example.com",
              firstName: "John",
              lastName: "Doe",
              isEmailVerified: true,
              lastLoginAt: "2025-11-03T07:00:00.000Z",
              createdAt: "2025-11-03T06:00:00.000Z",
            },
          },
        },
        {
          status: 401,
          description: "Not authenticated",
          example: { error: "Authentication required" },
        },
      ],
    },
    {
      method: "POST",
      path: "/api/auth/logout",
      description: "Logout and clear session",
      authentication: "Session Cookie or Bearer Token",
      responses: [
        {
          status: 200,
          description: "Logout successful",
          example: {
            success: true,
            message: "Logged out successfully",
          },
        },
      ],
      notes: ["Clears HttpOnly session cookie", "Deletes session from database"],
    },
  ],
};
