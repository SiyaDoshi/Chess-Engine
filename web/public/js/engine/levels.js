/**
 * levels.js — difficulty settings.
 *
 * Difficulty is mostly how far ahead the engine looks (depth, in half-moves)
 * and how long it may think. Easy also plays a random move now and then so
 * beginners can win.
 */

import { search } from './search.js';

export const LEVELS = {
  easy: { label: 'Easy', depth: 1, timeMs: 300, randomMoveChance: 0.3 },
  medium: { label: 'Medium', depth: 4, timeMs: 1000, randomMoveChance: 0 },
  hard: { label: 'Hard', depth: 12, timeMs: 2500, randomMoveChance: 0 },
};

export const DEFAULT_LEVEL = 'medium';

/**
 * Pick the engine's move at a given difficulty.
 * @param {import('chess.js').Chess} chess
 * @param {keyof LEVELS} levelName
 * @param {{ maxTimeMs?: number, random?: () => number }} [opts]
 *   maxTimeMs caps the level's time (e.g. low on clock); random is for tests
 */
export function chooseMove(chess, levelName, { maxTimeMs, random = Math.random } = {}) {
  const level = LEVELS[levelName] ?? LEVELS[DEFAULT_LEVEL];
  const timeMs = maxTimeMs ? Math.min(level.timeMs, maxTimeMs) : level.timeMs;
  const result = search(chess, { depth: level.depth, timeMs });

  if (level.randomMoveChance && random() < level.randomMoveChance) {
    const moves = chess.moves({ verbose: true });
    const pick = moves[Math.floor(random() * moves.length)];
    if (pick) {
      const move = { from: pick.from, to: pick.to };
      if (pick.promotion) move.promotion = pick.promotion;
      return { ...result, move, line: [move], random: true };
    }
  }
  return { ...result, random: false };
}
