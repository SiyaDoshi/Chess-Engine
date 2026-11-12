/**
 * worker.js — runs the engine in a background thread (Web Worker).
 *
 * A search can take a couple of seconds. Running it here keeps the page
 * responsive: clocks keep ticking and animations stay smooth while the
 * engine thinks.
 *
 * Message in:  { id, fen, level, maxTimeMs? }
 * Message out: { id, move, line, score, depth, nodes, timeMs, random }
 *          or: { id, error }
 */

import { Chess } from '/lib/chess.js';
import { chooseMove } from './levels.js';

self.onmessage = (event) => {
  const { id, fen, level, maxTimeMs } = event.data;
  try {
    const chess = new Chess(fen);
    const result = chooseMove(chess, level, { maxTimeMs });
    self.postMessage({ id, ...result });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
