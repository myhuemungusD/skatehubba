/**
 * OpenAPI 3.0 Specification Generator
 *
 * Converts the existing APICategory[] documentation into a
 * standard OpenAPI 3.0.3 JSON spec, enabling Swagger UI,
 * client code generation, and partner integrations.
 */

import { apiDocumentation } from "./index";
import type { APIEndpoint } from "./types";

interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    description: string;
    version: string;
    contact: { name: string; url: string };
    license: { name: string };
  };
  servers: Array<{ url: string; description: string }>;
  tags: Array<{ name: string; description: string }>;
  paths: Record<string, Record<string, unknown>>;
  components: {
    securitySchemes: Record<string, unknown>;
    schemas: Record<string, unknown>;
  };
}

function inferJsonSchema(example: unknown): Record<string, unknown> {
  if (example === null || example === undefined) {
    return { type: "string", nullable: true };
  }
  if (Array.isArray(example)) {
    return {
      type: "array",
      items: example.length > 0 ? inferJsonSchema(example[0]) : { type: "object" },
    };
  }
  if (typeof example === "object") {
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(example as Record<string, unknown>)) {
      properties[key] = inferJsonSchema(value);
    }
    return { type: "object", properties };
  }
  if (typeof example === "number") {
    return Number.isInteger(example) ? { type: "integer" } : { type: "number" };
  }
  if (typeof example === "boolean") {
    return { type: "boolean" };
  }
  return { type: "string" };
}

function convertEndpointToOperation(endpoint: APIEndpoint, tag: string): Record<string, unknown> {
  const operation: Record<string, unknown> = {
    tags: [tag],
    summary: endpoint.description,
    operationId: generateOperationId(endpoint.method, endpoint.path),
    responses: {} as Record<string, unknown>,
  };

  // Security
  if (endpoint.authentication) {
    const authLower = endpoint.authentication.toLowerCase();
    if (authLower.includes("firebase") || authLower.includes("bearer")) {
      operation.security = [{ BearerAuth: [] }];
    } else if (authLower.includes("session") || authLower.includes("cookie")) {
      operation.security = [{ SessionAuth: [] }];
    } else {
      operation.security = [{ BearerAuth: [] }, { SessionAuth: [] }];
    }
  }

  // Parameters (path, query, header)
  const params = (endpoint.parameters || []).filter((p) => p.location !== "body");
  if (params.length > 0) {
    operation.parameters = params.map((p) => ({
      name: p.name,
      in: p.location,
      required: p.required,
      description: p.description,
      schema: { type: mapParamType(p.type) },
    }));
  }

  // Request body
  const bodyParams = (endpoint.parameters || []).filter((p) => p.location === "body");
  if (endpoint.requestBody) {
    operation.requestBody = {
      required: true,
      content: {
        [endpoint.requestBody.type || "application/json"]: {
          schema: inferJsonSchema(endpoint.requestBody.example),
          example: endpoint.requestBody.example,
        },
      },
    };
  } else if (bodyParams.length > 0) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const bp of bodyParams) {
      properties[bp.name] = { type: mapParamType(bp.type), description: bp.description };
      if (bp.required) required.push(bp.name);
    }
    operation.requestBody = {
      required: required.length > 0,
      content: {
        "application/json": {
          schema: { type: "object", properties, ...(required.length > 0 ? { required } : {}) },
        },
      },
    };
  }

  // Responses
  const responses: Record<string, unknown> = {};
  for (const resp of endpoint.responses) {
    const responseObj: Record<string, unknown> = { description: resp.description };
    if (resp.example) {
      responseObj.content = {
        "application/json": {
          schema: inferJsonSchema(resp.example),
          example: resp.example,
        },
      };
    }
    responses[String(resp.status)] = responseObj;
  }
  operation.responses = responses;

  // Notes as x-notes extension
  if (endpoint.notes && endpoint.notes.length > 0) {
    operation["x-notes"] = endpoint.notes;
  }

  return operation;
}

function generateOperationId(method: string, path: string): string {
  // /api/admin/users/:userId/tier → adminUsersUserIdTier
  const cleaned = path
    .replace(/^\/api\//, "")
    .replace(/:[a-zA-Z]+/g, (match) => match.slice(1))
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  const parts = cleaned.split("_").filter(Boolean);
  const camelCase = parts
    .map((p, i) =>
      i === 0 ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
    )
    .join("");
  return `${method.toLowerCase()}${camelCase.charAt(0).toUpperCase()}${camelCase.slice(1)}`;
}

function mapParamType(type: string): string {
  const lower = type.toLowerCase();
  if (lower.includes("int") || lower === "number") return "integer";
  if (lower === "boolean" || lower === "bool") return "boolean";
  if (lower === "array") return "array";
  return "string";
}

function convertPathParams(path: string): string {
  // Convert Express-style :param to OpenAPI-style {param}
  return path.replace(/:([a-zA-Z][a-zA-Z0-9]*)/g, "{$1}");
}

export function generateOpenAPISpec(): OpenAPISpec {
  const tags: Array<{ name: string; description: string }> = [];
  const paths: Record<string, Record<string, unknown>> = {};

  for (const category of apiDocumentation) {
    tags.push({ name: category.name, description: category.description });

    for (const endpoint of category.endpoints) {
      const openApiPath = convertPathParams(endpoint.path);
      const method = endpoint.method.toLowerCase();
      const operation = convertEndpointToOperation(endpoint, category.name);

      if (!paths[openApiPath]) {
        paths[openApiPath] = {};
      }
      paths[openApiPath][method] = operation;
    }
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "SkateHubba API",
      description:
        "REST API for SkateHubba — the skateboarding community platform featuring S.K.A.T.E. games, " +
        "TrickMint video uploads, spot discovery, real-time battles, and social features.\n\n" +
        "## Authentication\n" +
        "Most endpoints require a Firebase ID token passed as a Bearer token in the Authorization header. " +
        "After initial login, a session cookie is set for subsequent requests.\n\n" +
        "## Rate Limiting\n" +
        "All `/api` routes are globally rate-limited. Individual endpoints may have stricter limits.\n\n" +
        "## Account Tiers\n" +
        "Some endpoints (Games, TrickMint) require a Pro or Premium account tier.",
      version: "1.0.0",
      contact: { name: "SkateHubba Support", url: "https://skatehubba.com" },
      license: { name: "Proprietary" },
    },
    servers: [
      { url: "https://skatehubba.com", description: "Production" },
      { url: "https://staging.skatehubba.com", description: "Staging" },
      { url: "http://localhost:5000", description: "Local Development" },
    ],
    tags,
    paths,
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "Firebase ID Token",
          description: "Firebase ID token obtained via Firebase Auth SDK",
        },
        SessionAuth: {
          type: "apiKey",
          in: "cookie",
          name: "connect.sid",
          description: "Session cookie set after successful login",
        },
        CsrfToken: {
          type: "apiKey",
          in: "header",
          name: "X-CSRF-Token",
          description: "CSRF token from csrf_token cookie (required for state-changing requests)",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: { type: "string" },
            message: { type: "string" },
          },
        },
        User: {
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string", format: "email" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            isEmailVerified: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Spot: {
          type: "object",
          properties: {
            id: { type: "integer" },
            name: { type: "string" },
            description: { type: "string" },
            spotType: { type: "string", enum: ["skatepark", "street", "diy"] },
            lat: { type: "number", format: "double" },
            lng: { type: "number", format: "double" },
            address: { type: "string" },
            city: { type: "string" },
            state: { type: "string" },
            country: { type: "string" },
            isVerified: { type: "boolean" },
          },
        },
        Game: {
          type: "object",
          properties: {
            id: { type: "string" },
            creatorId: { type: "string" },
            opponentId: { type: "string" },
            status: {
              type: "string",
              enum: ["pending", "active", "completed", "forfeited", "disputed"],
            },
            creatorLetters: { type: "integer" },
            opponentLetters: { type: "integer" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        TrickClip: {
          type: "object",
          properties: {
            id: { type: "string" },
            userId: { type: "string" },
            videoUrl: { type: "string", format: "uri" },
            trickName: { type: "string" },
            status: { type: "string", enum: ["processing", "ready", "failed", "flagged"] },
            durationMs: { type: "integer" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
  };
}
