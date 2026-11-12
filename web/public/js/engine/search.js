/**
 * search.js — the engine's brain.
 *
 * NegaMax search with alpha-beta pruning.
 *
 * NegaMax is minimax written once: "my best score is the negative of my
 * opponent's best score". Alpha-beta skips branches that cannot change the
 * result: once a move is proven worse than an option we already have, we
 * stop looking at it.
 *
 * Scores inside the search are from the side to move's point of view;
 * the result is converted back to White's point of view.
 */

import { evaluate, PIECE_VALUES } from './evaluate.js';
import {
  legalMoves,
  noisyMoves,
  makeMove,
  undoMove,
  inCheck,
  sideToMove,
  toPublicMove,
  sameMove,
  historyLength,
} from './board.js';

export const MATE = 100_000;

/**
 * @typedef {object} SearchOptions
 * @property {number}  depth             maximum depth in plies (half-moves)
 * @property {number}  [timeMs]          stop deepening once this much time is used
 * @property {boolean} [alphaBeta=true]  set false to measure plain minimax
 * @property {boolean} [ordering=true]   set false to search moves unsorted
 * @property {boolean} [quiescence=true] set false to stop dead at depth 0
 * @property {(info: object) => void} [onDepth] called after each finished depth
 */

/** Thrown inside the search when the time limit runs out. */
class TimeUp extends Error {}

/**
 * Move ordering: alpha-beta prunes most when the best move is tried first.
 * Captures go first, sorted by MVV-LVA (Most Valuable Victim, Least
 * Valuable Attacker): taking a queen with a pawn before taking a pawn with
 * a queen. Promotions come next, then quiet moves.
 */
function moveScore(move) {
  let score = 0;
  if (move.captured) score += 10 * PIECE_VALUES[move.captured] - PIECE_VALUES[move.piece] + 10_000;
  if (move.promotion) score += PIECE_VALUES[move.promotion] + 5_000;
  return score;
}

export function orderMoves(moves) {
  return moves
    .map((move) => ({ move, score: moveScore(move) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.move);
}

/**
 * Find the best move for the side to move.
 *
 * Uses iterative deepening: search depth 1, then 2, then 3, ... up to
 * opts.depth. Each pass is cheap compared to the next one, it lets us stop
 * cleanly when time runs out (keeping the last finished answer), and the
 * best line from one pass is searched first in the next, which makes
 * alpha-beta prune even more.
 *
 * @param {import('chess.js').Chess} chess  position to search (left unchanged)
 * @param {SearchOptions} opts
 */
export function search(chess, opts) {
  const options = { alphaBeta: true, ordering: true, quiescence: true, ...opts };
  const start = Date.now();
  const deadline = options.timeMs ? start + options.timeMs : Infinity;
  let nodes = 0;
  let pvMoves = []; // best line from the previous depth, searched first

  function checkTime() {
    // Checking the clock is slow-ish, so only do it every 1024 positions.
    if ((nodes & 1023) === 0 && Date.now() > deadline) throw new TimeUp();
  }

  function order(moves, ply) {
    const sorted = options.ordering ? orderMoves(moves) : moves;
    const pvMove = pvMoves[ply];
    if (!pvMove) return sorted;
    const i = sorted.findIndex((m) => sameMove(m, pvMove));
    if (i > 0) sorted.unshift(sorted.splice(i, 1)[0]);
    return sorted;
  }

  function staticScore() {
    const score = evaluate(chess);
    return sideToMove(chess) === 'w' ? score : -score;
  }

  /**
   * Quiescence search: at the end of the main search, keep playing out
   * captures until the position is quiet. Without it the engine would judge
   * "I just took a pawn with my queen" as +1, without noticing the queen is
   * recaptured on the next move (the horizon effect).
   */
  function quiesce(alpha, beta) {
    nodes++;
    checkTime();
    const standPat = staticScore(); // the side to move may also decline all captures
    if (standPat >= beta) return standPat;
    if (standPat > alpha) alpha = standPat;

    for (const move of orderMoves(noisyMoves(chess))) {
      makeMove(chess, move);
      const score = -quiesce(-beta, -alpha);
      undoMove(chess);
      if (score >= beta) return score;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  /** Returns { score, line } where line is the best sequence from here. */
  function negamax(depth, ply, alpha, beta) {
    nodes++;
    checkTime();
    const moves = legalMoves(chess);

    if (moves.length === 0) {
      // Checkmate (faster mates score higher) or stalemate (draw).
      return { score: inCheck(chess) ? -MATE + ply : 0, line: [] };
    }
    if (depth === 0) {
      return { score: options.quiescence ? quiesce(alpha, beta) : staticScore(), line: [] };
    }

    let best = { score: -Infinity, line: [] };
    for (const move of order(moves, ply)) {
      makeMove(chess, move);
      const child = negamax(depth - 1, ply + 1, -beta, -alpha);
      undoMove(chess);
      const score = -child.score;

      if (score > best.score) best = { score, line: [move, ...child.line] };
      if (options.alphaBeta) {
        if (score > alpha) alpha = score;
        if (alpha >= beta) break; // the opponent will never allow this line
      }
    }
    return best;
  }

  const sign = sideToMove(chess) === 'w' ? 1 : -1;
  const movesPlayedBefore = historyLength(chess);
  let result = null;

  for (let depth = 1; depth <= options.depth; depth++) {
    try {
      const { score, line } = negamax(depth, 0, -Infinity, Infinity);
      pvMoves = line;
      result = {
        move: line.length ? toPublicMove(line[0]) : null,
        line: line.map(toPublicMove),
        score: score * sign, // centipawns, White's point of view
        depth,
        nodes,
        timeMs: Date.now() - start,
      };
      options.onDepth?.(result);
      // A forced mate was found; deeper search can't improve on it.
      if (Math.abs(score) > MATE - 1000) break;
    } catch (err) {
      if (!(err instanceof TimeUp)) throw err;
      // Restore the position: unwind any moves still on the board.
      const extra = historyLength(chess) - movesPlayedBefore;
      for (let i = 0; i < extra; i++) undoMove(chess);
      break;
    }
  }

  if (result) {
    result.nodes = nodes;
    result.timeMs = Date.now() - start;
  }
  return result ?? { move: null, line: [], score: 0, depth: 0, nodes, timeMs: Date.now() - start };
}
