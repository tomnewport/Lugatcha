/**
 * The roster of bonus mini-games that can follow a finished daily practice.
 *
 * Which one a learner gets is a coin toss, so the reward stays a small surprise
 * rather than the same board every evening. Adding a game to the roster is the
 * only change needed for it to start appearing.
 */
export type MiniGameId = 'snake' | 'bubbles' | 'bazar' | 'taxi'

export const MINI_GAMES: readonly MiniGameId[] = ['snake', 'bubbles', 'bazar', 'taxi']

/** Picks the mini-game for one bonus round, uniformly at random. */
export function pickMiniGame(rng: () => number = Math.random): MiniGameId {
  return MINI_GAMES[Math.floor(rng() * MINI_GAMES.length) % MINI_GAMES.length]
}
