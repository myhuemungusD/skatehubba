import type { APICategory } from "../types";

export const moderationEndpoints: APICategory = {
  name: "Moderation & Trust & Safety",
  description: "Content moderation, user reporting, and trust & safety enforcement",
  endpoints: [
    {
      method: "POST",
      path: "/api/moderation/report",
      description: "Report a user, post, check-in, or comment for moderation review",
      authentication: "Firebase authentication required",
      requestBody: {
        type: "application/json",
        example: {
          targetType: "user",
          targetId: "user_123",
          reason: "harassment",
          notes: "User posted offensive content and harassed other members",
        },
      },
      parameters: [
        {
          name: "targetType",
          type: "string",
          location: "body",
          required: true,
          description: "Type of content being reported: 'user', 'post', 'checkin', or 'comment'",
        },
        {
          name: "targetId",
          type: "string",
          location: "body",
          required: true,
          description: "ID of the content being reported (max 128 characters)",
        },
        {
          name: "reason",
          type: "string",
          location: "body",
          required: true,
          description: "Reason for the report (3-100 characters)",
        },
        {
          name: "notes",
          type: "string",
          location: "body",
          required: false,
          description: "Additional context about the report (max 500 characters)",
        },
      ],
      responses: [
        {
          status: 201,
          description: "Report created successfully",
          example: {
            reportId: "report_abc123xyz",
          },
        },
        {
          status: 400,
          description: "Invalid report data",
          example: {
            code: "INVALID_REPORT",
            message: "Invalid report data.",
          },
        },
        {
          status: 401,
          description: "User not authenticated",
          example: {
            code: "UNAUTHORIZED",
            message: "Authentication required.",
          },
        },
        {
          status: 429,
          description: "Rate limit exceeded",
          example: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many reports. Please try again later.",
          },
        },
      ],
      notes: [
        "Trust action enforcement applied - users with low trust scores may be restricted",
        "Rate limited to prevent report spam",
        "Reporter identity is logged but may be anonymized to target user",
        "Reports are queued for admin review",
      ],
    },
    {
      method: "GET",
      path: "/api/moderation/admin/reports",
      description: "List moderation reports for admin review",
      authentication: "Admin role required",
      parameters: [
        {
          name: "status",
          type: "string",
          location: "query",
          required: false,
          description: "Filter by report status (e.g., 'pending', 'resolved', 'dismissed')",
        },
        {
          name: "page",
          type: "number",
          location: "query",
          required: false,
          description: "Page number for pagination (default: 1)",
        },
        {
          name: "limit",
          type: "number",
          location: "query",
          required: false,
          description: "Number of reports per page (default: 20, max: 100)",
        },
      ],
      responses: [
        {
          status: 200,
          description: "List of moderation reports",
          example: {
            reports: [
              {
                id: "report_abc123",
                reporterId: "user_reporter",
                targetType: "user",
                targetId: "user_offender",
                reason: "harassment",
                notes: "Offensive language in comments",
                status: "pending",
                createdAt: "2025-01-15T10:30:00.000Z",
              },
            ],
            total: 42,
            page: 1,
            limit: 20,
          },
        },
        {
          status: 403,
          description: "User is not an admin",
          example: {
            code: "ADMIN_REQUIRED",
            message: "Admin access required.",
          },
        },
      ],
      notes: [
        "Admin authentication required",
        "Rate limited for admin safety",
        "Returns paginated results sorted by creation date",
      ],
    },
    {
      method: "POST",
      path: "/api/moderation/admin/mod-action",
      description: "Apply a moderation action to a user",
      authentication: "Admin role required",
      requestBody: {
        type: "application/json",
        example: {
          targetUserId: "user_123",
          actionType: "temp_ban",
          reasonCode: "harassment_violation",
          notes: "User violated community guidelines",
          reversible: true,
          expiresAt: "2025-01-22T10:30:00.000Z",
          relatedReportId: "report_abc123",
        },
      },
      parameters: [
        {
          name: "targetUserId",
          type: "string",
          location: "body",
          required: true,
          description: "User ID to apply the action to",
        },
        {
          name: "actionType",
          type: "string",
          location: "body",
          required: true,
          description: "Action type: 'warn', 'remove_content', 'temp_ban', 'perm_ban', 'verify_pro', 'revoke_pro'",
        },
        {
          name: "reasonCode",
          type: "string",
          location: "body",
          required: true,
          description: "Machine-readable reason code (2-50 characters)",
        },
        {
          name: "notes",
          type: "string",
          location: "body",
          required: false,
          description: "Human-readable explanation (max 500 characters)",
        },
        {
          name: "reversible",
          type: "boolean",
          location: "body",
          required: false,
          description: "Whether the action can be reversed (default: true)",
        },
        {
          name: "expiresAt",
          type: "string",
          location: "body",
          required: false,
          description: "Expiration timestamp for temporary actions (ISO 8601 format)",
        },
        {
          name: "relatedReportId",
          type: "string",
          location: "body",
          required: false,
          description: "ID of the report that triggered this action",
        },
      ],
      responses: [
        {
          status: 200,
          description: "Moderation action applied successfully",
          example: {
            modActionId: "action_xyz789",
          },
        },
        {
          status: 400,
          description: "Invalid moderation action data",
          example: {
            code: "INVALID_MOD_ACTION",
            message: "Invalid moderation action.",
          },
        },
        {
          status: 403,
          description: "User is not an admin",
          example: {
            code: "ADMIN_REQUIRED",
            message: "Admin access required.",
          },
        },
      ],
      notes: [
        "Admin authentication required",
        "All actions are logged with admin ID for audit trail",
        "Temporary bans require expiresAt timestamp",
        "Permanent bans cannot have reversible=true",
        "Rate limited for admin safety",
      ],
    },
    {
      method: "POST",
      path: "/api/moderation/admin/pro-verify",
      description: "Set pro verification status for a user",
      authentication: "Admin role required",
      requestBody: {
        type: "application/json",
        example: {
          userId: "user_123",
          status: "verified",
          evidence: [
            "https://instagram.com/pro_skater",
            "Verified sponsor: Element Skateboards",
          ],
          notes: "Verified professional skater with sponsor proof",
        },
      },
      parameters: [
        {
          name: "userId",
          type: "string",
          location: "body",
          required: true,
          description: "User ID to verify",
        },
        {
          name: "status",
          type: "string",
          location: "body",
          required: true,
          description: "Verification status: 'none', 'pending', 'verified', or 'rejected'",
        },
        {
          name: "evidence",
          type: "array",
          location: "body",
          required: false,
          description: "Array of evidence URLs or descriptions (3-200 characters each)",
        },
        {
          name: "notes",
          type: "string",
          location: "body",
          required: false,
          description: "Admin notes about verification decision (max 500 characters)",
        },
      ],
      responses: [
        {
          status: 200,
          description: "Pro verification status updated",
          example: {
            modActionId: "action_verify_123",
          },
        },
        {
          status: 400,
          description: "Invalid pro verification data",
          example: {
            code: "INVALID_PRO_VERIFICATION",
            message: "Invalid pro verification data.",
          },
        },
        {
          status: 403,
          description: "User is not an admin",
          example: {
            code: "ADMIN_REQUIRED",
            message: "Admin access required.",
          },
        },
      ],
      notes: [
        "Admin authentication required",
        "Evidence array should contain links to social media, sponsor websites, or competition results",
        "Status changes are logged for audit trail",
        "Pro verified users get special badges and privileges",
      ],
    },
  ],
};
