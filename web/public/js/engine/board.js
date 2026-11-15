/**
 * board.js — fast access to a chess.js position for the engine.
 *
 * chess.js's public API (moves({ verbose: true }), move(), undo()) builds
 * SAN strings and Move objects for every move, which is far too slow for a
 * search that visits tens of thousands of positions. chess.js keeps faster
 * internal methods that skip that work; this file wraps them so the rest of
 * the engine never touches chess.js internals directly.
 *
 * Squares use chess.js's 0x88 layout: index = rank * 16 + file, where
 * rank 0 is the 8th rank. Valid squares are those with (index & 0x88) === 0.
 *
 * Tested against chess.js 1.4.x (see tests/engine.test.mjs).
 */

/** Legal moves in the current position (internal move objects). */
export function legalMoves(chess) {
  return chess._moves({ legal: true });
}

/** Captures and promotions only, for quiescence search. */
export function noisyMoves(chess) {
  return chess._moves({ legal: true }).filter((m) => m.captured || m.promotion);
}

export function makeMove(chess, move) {
  chess._makeMove(move);
}

export function undoMove(chess) {
  chess._undoMove();
}

/**
 * A 64-bit Zobrist hash of the position (BigInt), kept up to date by
 * chess.js as moves are made and undone. Used as the transposition-table key.
 */
export function positionKey(chess) {
  return chess._hash;
}

/** How many times a position (by key) occurred in the moves actually played. */
export function gamePositionCount(chess, key) {
  return chess._positionCount.get(key) ?? 0;
}

/** Half-moves since the last capture or pawn move (for the 50-move rule). */
export function halfMoveClock(chess) {
  return chess._halfMoves;
}

/** Number of moves played so far (used to unwind an interrupted search). */
export function historyLength(chess) {
  return chess._history.length;
}

export function sideToMove(chess) {
  return chess._turn; // 'w' or 'b'
}

export function inCheck(chess) {
  return chess._isKingAttacked(chess._turn);
}

/** The raw 128-slot board: each slot is undefined or { type, color }. */
export function rawBoard(chess) {
  return chess._board;
}

/** 0x88 index -> algebraic square, e.g. 0x74 -> 'e1'. */
export function squareName(index) {
  return 'abcdefgh'[index & 7] + String(8 - (index >> 4));
}

/** Internal move -> plain { from, to, promotion } usable with chess.move(). */
export function toPublicMove(move) {
  const out = { from: squareName(move.from), to: squareName(move.to) };
  if (move.promotion) out.promotion = move.promotion;
  return out;
}

/** True when two internal moves are the same move. */
export function sameMove(a, b) {
  return !!a && !!b && a.from === b.from && a.to === b.to && a.promotion === b.promotion;
}
