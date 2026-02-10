import type { APICategory } from "../types";

export const analyticsEndpoints: APICategory = {
  name: "Analytics",
  description: "Client-side analytics event ingestion for tracking user behavior and app usage",
  endpoints: [
    {
      method: "POST",
      path: "/api/analytics/events",
      description: "Ingest a single analytics event from the client",
      authentication: "Firebase ID token required",
      requestBody: {
        type: "application/json",
        example: {
          event_id: "evt_1234567890abcdef",
          event_name: "spot_viewed",
          occurred_at: "2025-01-15T10:30:00.000Z",
          session_id: "session_abc123",
          source: "mobile",
          app_version: "1.2.0",
          properties: {
            spot_id: 42,
            spot_name: "Downtown Plaza",
          },
        },
      },
      responses: [
        {
          status: 204,
          description: "Event ingested successfully (no content)",
          example: null,
        },
        {
          status: 400,
          description: "Invalid event data or properties",
          example: {
            code: "INVALID_PROPERTIES",
            message: "Event properties failed validation.",
          },
        },
        {
          status: 500,
          description: "Event storage failed",
          example: {
            code: "EVENT_INSERT_FAILED",
            message: "Failed to store analytics event.",
          },
        },
      ],
      notes: [
        "Server derives user UID from Firebase token - client cannot spoof identity",
        "Event names are validated against an allowlist",
        "Event properties are validated per-event-type where strict validation matters",
        "Idempotent on event_id (primary key) - duplicate events are silently dropped",
        "If database is unavailable, returns 204 success to avoid breaking client flow",
        "All timestamps should be ISO 8601 format",
      ],
    },
    {
      method: "POST",
      path: "/api/analytics/events/batch",
      description: "Ingest multiple analytics events in a single request (useful for offline sync)",
      authentication: "Firebase ID token required",
      requestBody: {
        type: "application/json",
        example: [
          {
            event_id: "evt_1234567890abcdef",
            event_name: "spot_viewed",
            occurred_at: "2025-01-15T10:30:00.000Z",
            session_id: "session_abc123",
            source: "mobile",
            app_version: "1.2.0",
            properties: {
              spot_id: 42,
            },
          },
          {
            event_id: "evt_0987654321fedcba",
            event_name: "trick_landed",
            occurred_at: "2025-01-15T10:35:00.000Z",
            session_id: "session_abc123",
            source: "mobile",
            app_version: "1.2.0",
            properties: {
              trick_name: "kickflip",
              difficulty: "medium",
            },
          },
        ],
      },
      responses: [
        {
          status: 200,
          description: "Batch processed with acceptance/rejection summary",
          example: {
            accepted: 2,
            rejected: 0,
          },
        },
        {
          status: 200,
          description: "Partial success - some events rejected",
          example: {
            accepted: 1,
            rejected: 1,
            errors: [
              {
                index: 1,
                error: "invalid_properties",
              },
            ],
          },
        },
        {
          status: 400,
          description: "Invalid batch payload",
          example: {
            code: "INVALID_EVENT",
            message: "Invalid batch payload type.",
          },
        },
        {
          status: 500,
          description: "Batch insert failed",
          example: {
            code: "BATCH_INSERT_FAILED",
            message: "Failed to store analytics batch.",
          },
        },
      ],
      notes: [
        "Same security and validation rules as single event endpoint",
        "Individual events with validation errors are skipped, not the entire batch",
        "Returns count of accepted vs rejected events",
        "Useful for offline-first mobile apps that queue events",
        "Maximum batch size should be reasonable (typically 50-100 events)",
        "All events share the same authenticated user UID",
      ],
    },
  ],
};
