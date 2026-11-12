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
 * Endgame = no queens, or each side with a queen has at most one minor piece.
 */
function isEndgame(board) {
  const count = { w: { q: 0, minor: 0, r: 0 }, b: { q: 0, minor: 0, r: 0 } };
  for (const row of board) {
    for (const sq of row) {
      if (!sq) continue;
      if (sq.type === 'q') count[sq.color].q++;
      else if (sq.type === 'r') count[sq.color].r++;
      else if (sq.type === 'n' || sq.type === 'b') count[sq.color].minor++;
    }
  }
  const sideIsLight = (c) => c.q === 0 || (c.r === 0 && c.minor <= 1);
  return sideIsLight(count.w) && sideIsLight(count.b);
}

/**
 * Evaluate a chess.js position. Returns centipawns from White's view.
 * @param {import('chess.js').Chess} chess
 */
export function evaluate(chess) {
  const board = chess.board();
  const endgame = isEndgame(board);
  let score = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (!sq) continue;
      // White reads the table directly; Black reads it upside-down.
      const idx = sq.color === 'w' ? r * 8 + c : (7 - r) * 8 + c;
      const table =
        sq.type === 'k' ? (endgame ? KING_ENDGAME : KING_MIDDLEGAME) : PST[sq.type];
      const value = PIECE_VALUES[sq.type] + table[idx];
      score += sq.color === 'w' ? value : -value;
    }
  }
  return score;
}
