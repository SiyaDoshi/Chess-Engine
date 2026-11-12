import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import * as board from '../public/js/engine/board.js';
import { evaluate } from '../public/js/engine/evaluate.js';
import { search, MATE } from '../public/js/engine/search.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';

function perft(chess, depth) {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of board.legalMoves(chess)) {
    board.makeMove(chess, m);
    n += perft(chess, depth - 1);
    board.undoMove(chess);
  }
  return n;
}

test('board layer: perft matches published move counts', () => {
  assert.equal(perft(new Chess(START), 3), 8902);
  assert.equal(perft(new Chess(KIWIPETE), 2), 2039);
});

test('board layer: make/undo leaves the position unchanged', () => {
  const chess = new Chess(KIWIPETE);
  perft(chess, 2);
  assert.equal(chess.fen(), KIWIPETE);
});

test('evaluate: start position is level, extra queen is a big plus', () => {
  assert.equal(evaluate(new Chess(START)), 0);
  const noBlackQueen = new Chess('rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  assert.ok(evaluate(noBlackQueen) > 800);
});

test('search: finds mate in 1', () => {
  const chess = new Chess('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
  const r = search(chess, { depth: 2 });
  assert.deepEqual(r.move, { from: 'a1', to: 'a8' });
  assert.ok(r.score > MATE - 10);
});

test('search: finds mate in 1 for Black', () => {
  const chess = new Chess('r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1');
  const r = search(chess, { depth: 2 });
  assert.deepEqual(r.move, { from: 'a8', to: 'a1' });
  assert.ok(r.score < -(MATE - 10));
});

test('search: takes a free queen', () => {
  const chess = new Chess('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1');
  const r = search(chess, { depth: 2 });
  assert.deepEqual(r.move, { from: 'd1', to: 'd5' });
});

test('search: leaves the position unchanged', () => {
  const chess = new Chess(KIWIPETE);
  search(chess, { depth: 3 });
  assert.equal(chess.fen(), KIWIPETE);
});

test('search: alpha-beta picks the same score as plain minimax with fewer nodes', () => {
  const plain = search(new Chess(START), { depth: 3, alphaBeta: false });
  const ab = search(new Chess(START), { depth: 3 });
  assert.equal(ab.score, plain.score);
  assert.ok(ab.nodes < plain.nodes);
});
