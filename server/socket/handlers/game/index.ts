/**
 * S.K.A.T.E. Game Socket Handlers
 *
 * Real-time WebSocket handlers for multiplayer S.K.A.T.E. games.
 * Uses PostgreSQL for persistent, race-condition-safe game state.
 */

import { registerRateLimitRules } from "../../socketRateLimit";
import { registerCreateHandler } from "./create";
import { registerJoinHandler } from "./join";
import { registerActionsHandler } from "./actions";
import { registerReconnectHandler } from "./reconnect";
import type { TypedServer, TypedSocket } from "./types";

// Register game-specific rate-limit rules once at module load
registerRateLimitRules({
  "game:create": { maxPerWindow: 3, windowMs: 60_000 },
  "game:join": { maxPerWindow: 5, windowMs: 60_000 },
  "game:trick": { maxPerWindow: 10, windowMs: 60_000 },
  "game:pass": { maxPerWindow: 10, windowMs: 60_000 },
  "game:forfeit": { maxPerWindow: 3, windowMs: 60_000 },
  "game:reconnect": { maxPerWindow: 5, windowMs: 60_000 },
});

/**
 * Register game event handlers on a socket
 */
export function registerGameHandlers(io: TypedServer, socket: TypedSocket): void {
  registerCreateHandler(io, socket);
  registerJoinHandler(io, socket);
  registerActionsHandler(io, socket);
  registerReconnectHandler(io, socket);
}

export { cleanupGameSubscriptions } from "./cleanup";
