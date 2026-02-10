import type { APICategory } from "../types";

export const profileEndpoints: APICategory = {
  name: "Profile Management",
  description: "User profile creation and management endpoints for onboarding and profile data",
  endpoints: [
    {
      method: "GET",
      path: "/api/profile/me",
      description: "Get the authenticated user's profile",
      authentication: "Firebase ID token required",
      responses: [
        {
          status: 200,
          description: "Profile retrieved successfully",
          example: {
            profile: {
              uid: "firebase_uid_123",
              username: "skater42",
              stance: "regular",
              experienceLevel: "intermediate",
              favoriteTricks: ["kickflip", "heelflip"],
              bio: "Love skating street spots",
              sponsorFlow: null,
              sponsorTeam: null,
              hometownShop: "Local Skate Shop",
              spotsVisited: 15,
              crewName: "Street Crew",
              credibilityScore: 85,
              avatarUrl: "https://firebasestorage.googleapis.com/...",
              createdAt: "2025-01-15T10:30:00.000Z",
              updatedAt: "2025-01-20T14:45:00.000Z",
            },
          },
        },
        {
          status: 404,
          description: "Profile not found",
          example: {
            code: "PROFILE_NOT_FOUND",
            message: "Profile not found.",
          },
        },
        {
          status: 503,
          description: "Database unavailable",
          example: {
            code: "database_unavailable",
            message: "Database is temporarily unavailable. Please try again.",
          },
        },
      ],
    },
    {
      method: "GET",
      path: "/api/profile/username-check",
      description: "Check if a username is available for registration",
      authentication: "None required",
      parameters: [
        {
          name: "username",
          type: "string",
          location: "query",
          required: true,
          description: "Username to check for availability (3-20 characters, alphanumeric + underscore)",
        },
      ],
      responses: [
        {
          status: 200,
          description: "Username availability status",
          example: {
            available: true,
          },
        },
        {
          status: 400,
          description: "Invalid username format",
          example: {
            code: "invalid_username",
            message: "Username format is invalid.",
            details: { field: "username" },
          },
        },
        {
          status: 503,
          description: "Database unavailable",
          example: {
            code: "DATABASE_UNAVAILABLE",
            message: "Could not check username availability. Please try again shortly.",
          },
        },
      ],
      notes: [
        "Rate limited to prevent abuse",
        "Username must be 3-20 characters, alphanumeric with underscores",
        "Username check is case-insensitive",
      ],
    },
    {
      method: "POST",
      path: "/api/profile/create",
      description: "Create a new user profile during onboarding",
      authentication: "Firebase ID token required",
      requestBody: {
        type: "application/json",
        example: {
          username: "skater42",
          stance: "regular",
          experienceLevel: "intermediate",
          favoriteTricks: ["kickflip", "heelflip"],
          bio: "Love skating street spots",
          sponsorFlow: null,
          sponsorTeam: null,
          hometownShop: "Local Skate Shop",
          spotsVisited: 0,
          crewName: "Street Crew",
          credibilityScore: 0,
          avatarBase64: "data:image/png;base64,iVBORw0KGgoAAAANS...",
          skip: false,
        },
      },
      responses: [
        {
          status: 201,
          description: "Profile created successfully",
          example: {
            profile: {
              uid: "firebase_uid_123",
              username: "skater42",
              stance: "regular",
              avatarUrl: "https://firebasestorage.googleapis.com/...",
              createdAt: "2025-01-15T10:30:00.000Z",
              updatedAt: "2025-01-15T10:30:00.000Z",
            },
          },
        },
        {
          status: 200,
          description: "Profile already exists (idempotent response)",
          example: {
            profile: {
              uid: "firebase_uid_123",
              username: "existing_user",
              createdAt: "2025-01-10T08:00:00.000Z",
              updatedAt: "2025-01-10T08:00:00.000Z",
            },
          },
        },
        {
          status: 400,
          description: "Invalid profile data or avatar format",
          example: {
            code: "INVALID_AVATAR_FORMAT",
            message: "Avatar format is invalid.",
            details: { field: "avatarBase64" },
          },
        },
        {
          status: 409,
          description: "Username already taken",
          example: {
            code: "USERNAME_TAKEN",
            message: "That username is already taken.",
            details: { field: "username" },
          },
        },
        {
          status: 413,
          description: "Avatar file too large",
          example: {
            code: "AVATAR_TOO_LARGE",
            message: "Avatar file is too large.",
          },
        },
      ],
      notes: [
        "Rate limited to prevent abuse",
        "If skip=true, generates a random username like 'skater42xyz'",
        "Avatar must be base64-encoded data URL (PNG, JPEG, WebP, GIF)",
        "Maximum avatar size: 5MB",
        "Username reservation is atomic to prevent race conditions",
        "If profile already exists, returns existing profile (idempotent)",
        "Avatar is uploaded to Firebase Storage, not PostgreSQL",
      ],
    },
  ],
};
