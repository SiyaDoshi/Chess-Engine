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
import { legalMoves, makeMove, undoMove, inCheck, sideToMove, toPublicMove } from './board.js';

export const MATE = 100_000;

/**
 * @typedef {object} SearchOptions
 * @property {number}  depth            search depth in plies (half-moves)
 * @property {boolean} [alphaBeta=true] set false to measure plain minimax
 * @property {boolean} [ordering=true]  set false to search moves unsorted
 */

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
 * @param {import('chess.js').Chess} chess  position to search (left unchanged)
 * @param {SearchOptions} opts
 */
export function search(chess, opts) {
  const options = { alphaBeta: true, ordering: true, ...opts };
  const order = (moves) => (options.ordering ? orderMoves(moves) : moves);
  const start = Date.now();
  let nodes = 0;

  function negamax(depth, ply, alpha, beta) {
    nodes++;
    const moves = legalMoves(chess);

    if (moves.length === 0) {
      // Checkmate (faster mates score higher) or stalemate (draw).
      return inCheck(chess) ? -MATE + ply : 0;
    }
    if (depth === 0) {
      const score = evaluate(chess);
      return sideToMove(chess) === 'w' ? score : -score;
    }

    let best = -Infinity;
    for (const move of order(moves)) {
      makeMove(chess, move);
      const score = -negamax(depth - 1, ply + 1, -beta, -alpha);
      undoMove(chess);

      if (score > best) best = score;
      if (options.alphaBeta) {
        if (score > alpha) alpha = score;
        if (alpha >= beta) break; // the opponent will never allow this line
      }
    }
    return best;
  }

  const rootMoves = order(legalMoves(chess));
  let bestMove = null;
  let bestScore = -Infinity;
  let alpha = -Infinity;

  for (const move of rootMoves) {
    makeMove(chess, move);
    const score = -negamax(options.depth - 1, 1, -Infinity, -alpha);
    undoMove(chess);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (options.alphaBeta && score > alpha) alpha = score;
  }

  const sign = sideToMove(chess) === 'w' ? 1 : -1;
  return {
    move: bestMove ? toPublicMove(bestMove) : null,
    score: bestScore * sign, // centipawns, White's point of view
    depth: options.depth,
    nodes,
    timeMs: Date.now() - start,
  };
}
