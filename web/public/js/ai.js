/**
 * ai.js — simple browser AI for Single Player mode
 *
 * Strategy (lightweight):
 *  1. Prefer capturing the highest-value piece
 *  2. Otherwise pick a random legal move
 *
 * Runs entirely in the browser — no server needed for vs AI.
 */

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function findAiMove(chess) {
  const moves = chess.moves({ verbose: true });
  if (!moves.length) return null;

  let bestScore = -1;
  let best = [];

  for (const move of moves) {
    let score = 0;
    if (move.captured) score += 10 * (PIECE_VALUE[move.captured] || 0);
    if (move.promotion) score += 9;
    // Small bonus for checks
    chess.move(move);
    if (chess.isCheck()) score += 1;
    chess.undo();

    if (score > bestScore) {
      bestScore = score;
      best = [move];
    } else if (score === bestScore) {
      best.push(move);
    }
  }

  return best[Math.floor(Math.random() * best.length)];
}

window.findAiMove = findAiMove;
