/**
 * Constants for game types and scoring
 */
export const GAME_TYPES = {
  SKATE: {
    name: 'S.K.A.T.E.',
    letters: ['S', 'K', 'A', 'T', 'E'],
    description: 'The classic battle of skills! Match tricks, show your style, and stay in the game.',
    hypeText: '🏆 Go all out in this timeless skate showdown!',
    encouragements: [
      'Time to show your signature style!',
      'Keep that energy flowing!',
      'You got this in the bag!',
      'Every attempt counts, stay focused!',
      'Channel your inner pro!'
    ]
  },
  SKATE8: {
    name: 'S.K.8.',
    letters: ['S', 'K', '8'],
    description: 'Quick-fire challenge - three letters, pure intensity!',
    hypeText: '⚡ Fast, fierce, and totally rad!',
    encouragements: [
      'Short and sweet, give it all you got!',
      'Quick game, big tricks!',
      'Time to bring the heat!',
      'Show us your best moves!',
      'Fast and furious, let\'s go!'
    ]
  }
};

/**
 * Get the current score display for a player
 * @param {number} missedTricks - Number of tricks missed
 * @param {('SKATE'|'SKATE8')} gameType - Type of game being played
 * @returns {string} Current score display (e.g., "S.K.A." or "S.K")
 */
export function getScoreDisplay(missedTricks, gameType) {
  const letters = GAME_TYPES[gameType].letters;
  return letters.slice(0, missedTricks).join('.') || 'No Letters';
}

/**
 * Check if a player has lost the game
 * @param {number} missedTricks - Number of tricks missed
 * @param {('SKATE'|'SKATE8')} gameType - Type of game being played
 * @returns {boolean} Whether the player has lost
 */
export function hasPlayerLost(missedTricks, gameType) {
  return missedTricks >= GAME_TYPES[gameType].letters.length;
}

/**
 * Get the maximum number of misses allowed for a game type
 * @param {('SKATE'|'SKATE8')} gameType - Type of game being played
 * @returns {number} Maximum number of misses allowed
 */
export function getMaxMisses(gameType) {
  return GAME_TYPES[gameType].letters.length;
}
