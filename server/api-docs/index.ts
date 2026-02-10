/**
 * API Documentation - Barrel Export
 *
 * Aggregates all endpoint documentation categories and re-exports types and generators.
 */

export type { APIEndpoint, APICategory } from "./types";

import type { APICategory } from "./types";
import { healthEndpoints } from "./endpoints/health";
import { authEndpoints } from "./endpoints/auth";
import { tutorialEndpoints } from "./endpoints/tutorial";
import { progressEndpoints } from "./endpoints/progress";
import { usersEndpoints } from "./endpoints/users";
import { spotsEndpoints } from "./endpoints/spots";
import { paymentsEndpoints } from "./endpoints/payments";
import { subscribersEndpoints } from "./endpoints/subscribers";
import { gameEndpoints } from "./endpoints/game";

/**
 * Complete API documentation structure
 * Organized by functional categories with detailed endpoint information
 */
export const apiDocumentation: APICategory[] = [
  healthEndpoints,
  authEndpoints,
  tutorialEndpoints,
  progressEndpoints,
  usersEndpoints,
  spotsEndpoints,
  // Products category removed for MVP
  paymentsEndpoints,
  subscribersEndpoints,
  // AI Chat category removed for MVP
  gameEndpoints,
];

export { generateHTMLDocs } from "./htmlGenerator";
