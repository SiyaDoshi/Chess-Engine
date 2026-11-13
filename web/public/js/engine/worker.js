/**
 * worker.js — runs the engine in a background thread (Web Worker).
 *
 * A search can take a couple of seconds. Running it here keeps the page
 * responsive: clocks keep ticking and animations stay smooth while the
 * engine thinks.
 *
 * Message in:  { id, fen, level, maxTimeMs?, moves? }
 *   moves: the game so far as [{ from, to, promotion }] from the start
 *   position. Replaying them lets the engine see repetitions; if they don't
 *   lead to `fen`, the engine just uses `fen`.
 * Message out: { id, move, line, score, depth, nodes, timeMs, random }
 *          or: { id, error }
 */

import { Chess } from '/lib/chess.js';
import { chooseMove } from './levels.js';

function gameFrom(fen, moves) {
  if (Array.isArray(moves) && moves.length) {
    try {
      const game = new Chess();
      for (const m of moves) game.move(m);
      if (game.fen() === fen) return game;
    } catch {
      // fall back to the position alone
    }
  }
  return new Chess(fen);
}

self.onmessage = (event) => {
  const { id, fen, level, maxTimeMs, moves } = event.data;
  try {
    const chess = gameFrom(fen, moves);
    const result = chooseMove(chess, level, { maxTimeMs });
    self.postMessage({ id, ...result });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
