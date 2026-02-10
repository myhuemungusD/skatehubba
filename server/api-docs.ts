/**
 * API Documentation Generator
 * Provides comprehensive documentation for all SkateHubba API endpoints
 *
 * This file re-exports from the api-docs/ directory for backward compatibility.
 */

export type { APIEndpoint, APICategory } from "./api-docs/types";
export { apiDocumentation } from "./api-docs/index";
export { generateHTMLDocs } from "./api-docs/htmlGenerator";
