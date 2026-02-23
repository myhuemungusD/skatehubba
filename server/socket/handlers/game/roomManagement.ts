/**
 * Game Socket Handlers — Socket-Game Room Tracking
 *
 * Maintains a mapping from socket IDs to the game IDs they have joined.
 * Used during disconnect cleanup to leave all game rooms correctly.
 */

/** Tracks which game IDs each socket is a member of */
export const socketGameMap = new Map<string, Set<string>>();

/**
 * Record that a socket has joined a game
 */
export function trackSocketGame(socketId: string, gameId: string): void {
  if (!socketGameMap.has(socketId)) {
    socketGameMap.set(socketId, new Set());
  }
  socketGameMap.get(socketId)!.add(gameId);
}

/**
 * Remove all game tracking for a socket (call on disconnect)
 */
export function untrackSocket(socketId: string): void {
  socketGameMap.delete(socketId);
}

/**
 * Get all game IDs a socket is tracked in
 */
export function getSocketGames(socketId: string): Set<string> {
  return socketGameMap.get(socketId) ?? new Set();
}
