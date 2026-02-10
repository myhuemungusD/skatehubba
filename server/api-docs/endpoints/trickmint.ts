import type { APICategory } from "../types";

export const trickmintEndpoints: APICategory = {
  name: "TrickMint - Video Uploads",
  description: "Video upload pipeline for standalone trick clips with two supported flows: signed URLs and direct Firebase uploads",
  endpoints: [
    {
      method: "POST",
      path: "/api/trickmint/request-upload",
      description: "Request signed upload URLs for direct-to-storage video upload (Flow A, Step 1)",
      authentication: "Firebase authentication required",
      requestBody: {
        type: "application/json",
        example: {
          fileExtension: "mp4",
        },
      },
      responses: [
        {
          status: 200,
          description: "Signed URLs generated successfully",
          example: {
            uploadId: "upload_abc123xyz",
            videoUploadUrl: "https://storage.googleapis.com/...",
            thumbnailUploadUrl: "https://storage.googleapis.com/...",
            videoPath: "trickmint/user_123/video_abc.mp4",
            thumbnailPath: "trickmint/user_123/thumb_abc.jpg",
            expiresAt: "2025-01-15T11:30:00.000Z",
            limits: {
              maxVideoSizeBytes: 104857600,
              maxThumbnailSizeBytes: 5242880,
              maxVideoDurationMs: 60000,
              allowedVideoTypes: ["video/mp4", "video/webm", "video/quicktime"],
              allowedThumbnailTypes: ["image/jpeg", "image/png", "image/webp"],
            },
          },
        },
        {
          status: 400,
          description: "Invalid file extension",
          example: {
            error: "Invalid request",
          },
        },
        {
          status: 500,
          description: "Failed to generate upload URLs",
          example: {
            error: "Failed to generate upload URLs",
          },
        },
      ],
      notes: [
        "File extension must be 'webm', 'mp4', or 'mov'",
        "URLs expire after 1 hour",
        "Client uploads directly to signed URLs, then calls /confirm-upload",
        "Maximum video size: 100MB",
        "Maximum video duration: 60 seconds",
      ],
    },
    {
      method: "POST",
      path: "/api/trickmint/confirm-upload",
      description: "Confirm signed URL upload and create database record (Flow A, Step 2)",
      authentication: "Firebase authentication required",
      requestBody: {
        type: "application/json",
        example: {
          trickName: "Kickflip",
          description: "Clean kickflip at the local park",
          videoPath: "trickmint/user_123/video_abc.mp4",
          thumbnailPath: "trickmint/user_123/thumb_abc.jpg",
          videoDurationMs: 8500,
          spotId: 42,
          isPublic: true,
        },
      },
      responses: [
        {
          status: 201,
          description: "Upload confirmed and clip created",
          example: {
            clip: {
              id: 123,
              userId: "user_123",
              userName: "skater42",
              trickName: "Kickflip",
              description: "Clean kickflip at the local park",
              videoUrl: "https://firebasestorage.googleapis.com/...",
              thumbnailUrl: "https://firebasestorage.googleapis.com/...",
              videoDurationMs: 8500,
              spotId: 42,
              isPublic: true,
              status: "ready",
              views: 0,
              createdAt: "2025-01-15T10:30:00.000Z",
            },
          },
        },
        {
          status: 400,
          description: "Invalid request or file validation failed",
          example: {
            error: "Video exceeds maximum duration",
          },
        },
        {
          status: 403,
          description: "Video path does not belong to authenticated user",
          example: {
            error: "Upload path does not belong to you",
          },
        },
        {
          status: 503,
          description: "Database unavailable",
          example: {
            error: "Database unavailable",
          },
        },
      ],
      notes: [
        "Video path must match the path returned from /request-upload",
        "Server validates file exists in storage and meets size/duration limits",
        "Trick name is required (1-200 characters)",
        "Description is optional (max 1000 characters)",
      ],
    },
    {
      method: "POST",
      path: "/api/trickmint/submit",
      description: "Submit a direct Firebase upload and create database record (Flow B)",
      authentication: "Firebase authentication required",
      requestBody: {
        type: "application/json",
        example: {
          trickName: "Heelflip",
          description: "Smooth heelflip down a 3-stair",
          videoUrl: "https://firebasestorage.googleapis.com/...",
          thumbnailUrl: "https://firebasestorage.googleapis.com/...",
          videoDurationMs: 12000,
          fileSizeBytes: 8500000,
          mimeType: "video/mp4",
          spotId: 42,
          isPublic: true,
        },
      },
      responses: [
        {
          status: 201,
          description: "Clip submitted successfully",
          example: {
            clip: {
              id: 124,
              userId: "user_123",
              userName: "skater42",
              trickName: "Heelflip",
              videoUrl: "https://firebasestorage.googleapis.com/...",
              status: "ready",
              views: 0,
              createdAt: "2025-01-15T10:35:00.000Z",
            },
          },
        },
        {
          status: 400,
          description: "Invalid request or validation failed",
          example: {
            error: "Video file too large",
          },
        },
        {
          status: 503,
          description: "Database unavailable",
          example: {
            error: "Database unavailable",
          },
        },
      ],
      notes: [
        "Client uploads to Firebase Storage using client SDK first",
        "Video URL must be a valid Firebase Storage URL",
        "Server validates URL format and metadata",
        "File size must not exceed 100MB",
        "Video duration must not exceed 60 seconds",
      ],
    },
    {
      method: "GET",
      path: "/api/trickmint/my-clips",
      description: "List authenticated user's uploaded trick clips",
      authentication: "Firebase authentication required",
      parameters: [
        {
          name: "limit",
          type: "number",
          location: "query",
          required: false,
          description: "Number of clips to return (default: 20, max: 50)",
        },
        {
          name: "offset",
          type: "number",
          location: "query",
          required: false,
          description: "Pagination offset (default: 0)",
        },
      ],
      responses: [
        {
          status: 200,
          description: "List of user's clips",
          example: {
            clips: [
              {
                id: 123,
                trickName: "Kickflip",
                videoUrl: "https://firebasestorage.googleapis.com/...",
                views: 45,
                createdAt: "2025-01-15T10:30:00.000Z",
              },
            ],
            total: 10,
            limit: 20,
            offset: 0,
          },
        },
        {
          status: 503,
          description: "Database unavailable",
          example: {
            error: "Database unavailable",
          },
        },
      ],
      notes: [
        "Returns all clips owned by authenticated user (public and private)",
        "Results are ordered by creation date (newest first)",
        "Pagination supported via limit and offset",
      ],
    },
    {
      method: "GET",
      path: "/api/trickmint/feed",
      description: "Get public feed of trick clips from all users",
      authentication: "Firebase authentication required",
      parameters: [
        {
          name: "limit",
          type: "number",
          location: "query",
          required: false,
          description: "Number of clips to return (default: 20, max: 50)",
        },
        {
          name: "offset",
          type: "number",
          location: "query",
          required: false,
          description: "Pagination offset (default: 0)",
        },
      ],
      responses: [
        {
          status: 200,
          description: "Public feed of clips",
          example: {
            clips: [
              {
                id: 125,
                userId: "user_456",
                userName: "proSkater",
                trickName: "Tre Flip",
                videoUrl: "https://firebasestorage.googleapis.com/...",
                views: 230,
                createdAt: "2025-01-15T09:00:00.000Z",
              },
            ],
            total: 500,
            limit: 20,
            offset: 0,
          },
        },
        {
          status: 503,
          description: "Database unavailable",
          example: {
            error: "Database unavailable",
          },
        },
      ],
      notes: [
        "Only returns public clips with status 'ready'",
        "Results are ordered by creation date (newest first)",
        "Pagination supported via limit and offset",
      ],
    },
    {
      method: "GET",
      path: "/api/trickmint/:id",
      description: "Get single trick clip by ID",
      authentication: "Firebase authentication required",
      parameters: [
        {
          name: "id",
          type: "number",
          location: "path",
          required: true,
          description: "Clip ID",
        },
      ],
      responses: [
        {
          status: 200,
          description: "Clip details",
          example: {
            clip: {
              id: 123,
              userId: "user_123",
              userName: "skater42",
              trickName: "Kickflip",
              description: "Clean kickflip at the local park",
              videoUrl: "https://firebasestorage.googleapis.com/...",
              thumbnailUrl: "https://firebasestorage.googleapis.com/...",
              videoDurationMs: 8500,
              spotId: 42,
              views: 46,
              createdAt: "2025-01-15T10:30:00.000Z",
            },
          },
        },
        {
          status: 404,
          description: "Clip not found or not accessible",
          example: {
            error: "Clip not found",
          },
        },
        {
          status: 503,
          description: "Database unavailable",
          example: {
            error: "Database unavailable",
          },
        },
      ],
      notes: [
        "View count is incremented automatically with retry logic",
        "Private clips are only visible to the owner",
        "Public clips are visible to all authenticated users",
      ],
    },
    {
      method: "DELETE",
      path: "/api/trickmint/:id",
      description: "Delete own trick clip",
      authentication: "Firebase authentication required",
      parameters: [
        {
          name: "id",
          type: "number",
          location: "path",
          required: true,
          description: "Clip ID to delete",
        },
      ],
      responses: [
        {
          status: 200,
          description: "Clip deleted successfully",
          example: {
            message: "Clip deleted.",
          },
        },
        {
          status: 403,
          description: "User does not own the clip",
          example: {
            error: "You can only delete your own clips",
          },
        },
        {
          status: 404,
          description: "Clip not found",
          example: {
            error: "Clip not found",
          },
        },
        {
          status: 503,
          description: "Database unavailable",
          example: {
            error: "Database unavailable",
          },
        },
      ],
      notes: [
        "Users can only delete their own clips",
        "Deletion is permanent and cannot be undone",
        "Storage files (video and thumbnail) are not automatically deleted",
      ],
    },
    {
      method: "GET",
      path: "/api/trickmint/upload/limits",
      description: "Get upload limits for client-side validation",
      authentication: "None required",
      responses: [
        {
          status: 200,
          description: "Upload limits configuration",
          example: {
            maxVideoSizeBytes: 104857600,
            maxThumbnailSizeBytes: 5242880,
            maxVideoDurationMs: 60000,
            allowedVideoTypes: ["video/mp4", "video/webm", "video/quicktime"],
            allowedThumbnailTypes: ["image/jpeg", "image/png", "image/webp"],
          },
        },
      ],
      notes: [
        "Public endpoint - no authentication required",
        "Clients should use this to validate files before upload",
        "Limits are enforced server-side regardless of client validation",
      ],
    },
  ],
};
