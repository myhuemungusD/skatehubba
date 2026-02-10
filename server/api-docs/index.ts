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
import { profileEndpoints } from "./endpoints/profile";
import { analyticsEndpoints } from "./endpoints/analytics";
import { moderationEndpoints } from "./endpoints/moderation";
import { trickmintEndpoints } from "./endpoints/trickmint";
import { metricsEndpoints } from "./endpoints/metrics";

/**
 * Complete API documentation structure
 * Organized by functional categories with detailed endpoint information
 */
export const apiDocumentation: APICategory[] = [
  healthEndpoints,
  authEndpoints,
  profileEndpoints,
  tutorialEndpoints,
  progressEndpoints,
  usersEndpoints,
  spotsEndpoints,
  // Products category removed for MVP
  paymentsEndpoints,
  subscribersEndpoints,
  // AI Chat category removed for MVP
  gameEndpoints,
  trickmintEndpoints,
  analyticsEndpoints,
  moderationEndpoints,
  metricsEndpoints,
];

export { generateHTMLDocs } from "./htmlGenerator";
