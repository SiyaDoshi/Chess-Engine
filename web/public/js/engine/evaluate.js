/**
 * evaluate.js — static evaluation for the chess engine.
 *
 * Score is in centipawns from White's point of view (positive = White better).
 *
 * Two parts:
 *  1. Material: what pieces each side has.
 *  2. Piece-square tables (PST): a bonus or penalty for *where* each piece
 *     stands, e.g. knights like the centre, rooks like the 7th rank, the king
 *     hides behind pawns in the middlegame but walks to the centre in the endgame.
 *
 * Tables follow the well-known "Simplified Evaluation Function"
 * (Tomasz Michniewski). They are written from White's view, rank 8 first,
 * so table[0] is a8 and table[63] is h1. Black uses the mirrored square.
 */

import { rawBoard } from './board.js';

export const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// prettier-ignore
const PAWN = [
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0,
];

// prettier-ignore
const KNIGHT = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
];

// prettier-ignore
const BISHOP = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20,
];

// prettier-ignore
const ROOK = [
   0,  0,  0,  0,  0,  0,  0,  0,
   5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   0,  0,  0,  5,  5,  0,  0,  0,
];

// prettier-ignore
const QUEEN = [
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5,  5,  5,  5,  0,-10,
   -5,  0,  5,  5,  5,  5,  0, -5,
    0,  0,  5,  5,  5,  5,  0, -5,
  -10,  5,  5,  5,  5,  5,  0,-10,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20,
];

// prettier-ignore
const KING_MIDDLEGAME = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
   20, 20,  0,  0,  0,  0, 20, 20,
   20, 30, 10,  0,  0, 10, 30, 20,
];

// prettier-ignore
const KING_ENDGAME = [
  -50,-40,-30,-20,-20,-30,-40,-50,
  -30,-20,-10,  0,  0,-10,-20,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-30,  0,  0,  0,  0,-30,-30,
  -50,-30,-30,-30,-30,-30,-30,-50,
];

const PST = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN };

/**
 * Endgame = no queens, or each side with a queen has no other big pieces
 * (no rooks and at most one minor piece).
 */
function isEndgame(board) {
  const count = { w: { q: 0, r: 0, minor: 0 }, b: { q: 0, r: 0, minor: 0 } };
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const p = board[sq];
    if (!p) continue;
    if (p.type === 'q') count[p.color].q++;
    else if (p.type === 'r') count[p.color].r++;
    else if (p.type === 'n' || p.type === 'b') count[p.color].minor++;
  }
  const light = (c) => c.q === 0 || (c.r === 0 && c.minor <= 1);
  return light(count.w) && light(count.b);
}

// Distances on a 0x88 board
const fileOf = (sq) => sq & 7;
const rankOf = (sq) => sq >> 4;
const manhattan = (a, b) => Math.abs(fileOf(a) - fileOf(b)) + Math.abs(rankOf(a) - rankOf(b));
const centerDistance = (sq) => Math.max(3 - fileOf(sq), fileOf(sq) - 4) + Math.max(3 - rankOf(sq), rankOf(sq) - 4);

/**
 * Mop-up: when one side is down to a bare king, help the stronger side
 * finish. Piece-square tables alone can't see a mate that is 15+ moves
 * away, so reward the steps that lead there: lone king pushed to the edge,
 * own king close to it. Bishop + knight can only mate in a corner of the
 * bishop's color, so there the lone king is driven to those two corners.
 * Returns a bonus for the stronger side (centipawns).
 */
function mopUp(strongKing, weakKing, strong) {
  const kingsClose = 14 - manhattan(strongKing, weakKing);
  if (strong.onlyBishopKnight) {
    // Corners of the bishop's square color: (a1, h8) for dark, (a8, h1) for light.
    // 0x88 indices: a8 = 0x00, h8 = 0x07, a1 = 0x70, h1 = 0x77. a1 is dark.
    const corners = strong.bishopOnDark ? [0x70, 0x07] : [0x00, 0x77];
    const toCorner = Math.min(...corners.map((c) => manhattan(weakKing, c)));
    const knightClose = 14 - manhattan(strong.knightSquare, weakKing);
    return 40 * (14 - toCorner) + 10 * kingsClose + 4 * knightClose + 8 * centerDistance(weakKing);
  }
  return 12 * centerDistance(weakKing) + 6 * kingsClose;
}

/**
 * Evaluate a position. Returns centipawns from White's point of view.
 * @param {import('chess.js').Chess} chess
 */
export function evaluate(chess) {
  const board = rawBoard(chess);
  const endgame = isEndgame(board);
  let score = 0;
  const kings = {};
  const side = {
    w: { material: 0, pieces: 0, bishops: 0, knights: 0, other: 0, bishopOnDark: false, knightSquare: 0 },
    b: { material: 0, pieces: 0, bishops: 0, knights: 0, other: 0, bishopOnDark: false, knightSquare: 0 },
  };

  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) {
      sq += 7; // skip the 8 off-board slots at the end of each rank
      continue;
    }
    const p = board[sq];
    if (!p) continue;
    const rank = sq >> 4; // 0 = 8th rank
    const file = sq & 7;
    const info = side[p.color];
    if (p.type === 'k') kings[p.color] = sq;
    else {
      info.pieces++;
      info.material += PIECE_VALUES[p.type];
      if (p.type === 'b') {
        info.bishops++;
        info.bishopOnDark = (rank + file) % 2 === 1; // a1 (rank 7, file 0) is dark
      } else if (p.type === 'n') {
        info.knights++;
        info.knightSquare = sq;
      }
      else info.other++;
    }
    // White reads the table directly; Black reads it upside-down.
    const idx = p.color === 'w' ? rank * 8 + file : (7 - rank) * 8 + file;
    const table = p.type === 'k' ? (endgame ? KING_ENDGAME : KING_MIDDLEGAME) : PST[p.type];
    const value = PIECE_VALUES[p.type] + table[idx];
    score += p.color === 'w' ? value : -value;
  }

  // One side has only its king, the other enough to mate (a rook, a queen,
  // two minor pieces...): add the mop-up guidance.
  for (const [strong, weak, sign] of [['w', 'b', 1], ['b', 'w', -1]]) {
    if (side[weak].pieces === 0 && side[strong].material >= 500 && kings.w !== undefined && kings.b !== undefined) {
      const s = side[strong];
      s.onlyBishopKnight = s.pieces === 2 && s.bishops === 1 && s.knights === 1;
      score += sign * mopUp(kings[strong], kings[weak], s);
    }
  }
  return score;
}
