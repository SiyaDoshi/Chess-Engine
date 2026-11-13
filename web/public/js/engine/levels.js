/**
 * levels.js — difficulty settings.
 *
 * Difficulty is mostly how far ahead the engine looks (depth, in half-moves)
 * and how long it may think. Easy also makes the occasional plausible
 * mistake: instead of its best move it picks one of its few best moves at
 * random. It plays loosely, like a beginner, but doesn't throw pieces away
 * for nothing.
 */

import { search, MATE } from './search.js';

export const LEVELS = {
  easy: { label: 'Easy', depth: 2, timeMs: 400, mistakeChance: 0.25, mistakeChoices: 4 },
  medium: { label: 'Medium', depth: 4, timeMs: 1000, mistakeChance: 0 },
  hard: { label: 'Hard', depth: 12, timeMs: 2500, mistakeChance: 0 },
};

export const DEFAULT_LEVEL = 'medium';

/** A "mistake" may cost at most this much compared to the best move. */
const MAX_MISTAKE_CP = 250;

/**
 * Score every legal move with a short search (the opponent's best reply,
 * plus captures) and return them best first, from the mover's point of view.
 */
function rankMoves(chess) {
  const sign = chess.turn() === 'w' ? 1 : -1;
  const ranked = [];
  for (const m of chess.moves({ verbose: true })) {
    chess.move(m);
    let score;
    if (chess.isCheckmate()) score = MATE;
    else if (chess.isDraw()) score = 0;
    else score = search(chess, { depth: 1, tt: false }).score * sign;
    chess.undo();
    ranked.push({ move: { from: m.from, to: m.to, promotion: m.promotion }, score });
  }
  return ranked.sort((a, b) => b.score - a.score);
}

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

  if (level.mistakeChance && random() < level.mistakeChance) {
    const ranked = rankMoves(chess);
    const best = ranked[0]?.score ?? 0;
    // Never miss a mate in one, and never pick a move that loses too much.
    if (best < MATE - 1000) {
      const options = ranked.slice(0, level.mistakeChoices).filter((r) => r.score >= best - MAX_MISTAKE_CP);
      const pick = options[Math.floor(random() * options.length)];
      if (pick) {
        const move = { from: pick.move.from, to: pick.move.to };
        if (pick.move.promotion) move.promotion = pick.move.promotion;
        return { ...result, move, line: [move], mistake: true };
      }
    }
  }
  return { ...result, mistake: false };
}
