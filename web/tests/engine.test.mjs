import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import * as board from '../public/js/engine/board.js';
import { evaluate } from '../public/js/engine/evaluate.js';
import { search, MATE, clearTranspositionTable, transpositionTableSize } from '../public/js/engine/search.js';
import { LEVELS, chooseMove } from '../public/js/engine/levels.js';

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

test('move ordering: same result, fewer positions searched', () => {
  const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
  const unordered = search(new Chess(fen), { depth: 4, ordering: false });
  const ordered = search(new Chess(fen), { depth: 4 });
  assert.equal(ordered.score, unordered.score);
  assert.ok(ordered.nodes < unordered.nodes);
});

test('quiescence: does not grab a defended pawn with the queen', () => {
  // Qxf7+ wins a pawn at depth 1, but the king takes the queen next move.
  const fen = 'rnb1kbnr/ppp2ppp/3p4/4p3/4P3/5Q2/PPPP1PPP/RNB1KBNR w KQkq - 0 1';
  const shallow = search(new Chess(fen), { depth: 1, quiescence: false });
  assert.deepEqual(shallow.move, { from: 'f3', to: 'f7' });
  const r = search(new Chess(fen), { depth: 1 });
  assert.notDeepEqual(r.move, { from: 'f3', to: 'f7' });
});

test('iterative deepening: stops at the time limit and keeps a legal answer', () => {
  const chess = new Chess(KIWIPETE);
  const r = search(chess, { depth: 20, timeMs: 300 });
  assert.ok(r.timeMs < 1000, `took ${r.timeMs}ms`);
  assert.ok(r.depth >= 2);
  assert.ok(chess.moves({ verbose: true }).some((m) => m.from === r.move.from && m.to === r.move.to));
  assert.equal(chess.fen(), KIWIPETE);
});

test('iterative deepening: reports the best line, starting with the best move', () => {
  const r = search(new Chess(START), { depth: 3 });
  assert.equal(r.line.length, 3);
  assert.deepEqual(r.line[0], r.move);
});

test('search: finds a mate in 2', () => {
  // King and rook vs king: e.g. 1. Kb6 Kb8 2. Rh8#. No mate in 1 exists.
  const chess = new Chess('k7/8/2K5/8/8/8/8/7R w - - 0 1');
  const r = search(chess, { depth: 4 });
  assert.equal(r.score, MATE - 3); // mate on the 3rd half-move
});

test('levels: harder levels look further ahead', () => {
  assert.ok(LEVELS.easy.depth < LEVELS.medium.depth);
  assert.ok(LEVELS.medium.depth < LEVELS.hard.depth);
});

test('levels: easy sometimes plays a random legal move', () => {
  const chess = new Chess(START);
  const r = chooseMove(chess, 'easy', { random: () => 0 }); // force the random branch
  assert.equal(r.random, true);
  assert.ok(chess.moves({ verbose: true }).some((m) => m.from === r.move.from && m.to === r.move.to));
});

test('levels: medium never plays randomly and finds the mate', () => {
  const chess = new Chess('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
  const r = chooseMove(chess, 'medium', { random: () => 0 });
  assert.equal(r.random, false);
  assert.deepEqual(r.move, { from: 'a1', to: 'a8' });
});

test('levels: a time cap shortens the search', () => {
  const r = chooseMove(new Chess(KIWIPETE), 'hard', { maxTimeMs: 150 });
  assert.ok(r.timeMs < 600, `took ${r.timeMs}ms`);
});

test('transposition table: same scores as without it, with fewer positions searched', () => {
  const fens = [START, KIWIPETE, 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'];
  for (const fen of fens) {
    clearTranspositionTable();
    const without = search(new Chess(fen), { depth: 4, tt: false, quiescence: false });
    clearTranspositionTable();
    const withTable = search(new Chess(fen), { depth: 4, quiescence: false });
    assert.equal(withTable.score, without.score, fen);
    assert.ok(withTable.nodes < without.nodes, `${fen}: ${withTable.nodes} vs ${without.nodes}`);
  }
});

test('transposition table: mate scores stay correct when reused', () => {
  clearTranspositionTable();
  const chess = new Chess('k7/8/2K5/8/8/8/8/7R w - - 0 1');
  search(chess, { depth: 4 });
  const again = search(chess, { depth: 4 }); // now served largely from the table
  assert.equal(again.score, MATE - 3);
  assert.ok(again.ttHits > 0);
});

test('transposition table: remembers positions and can be cleared', () => {
  clearTranspositionTable();
  search(new Chess(START), { depth: 3 });
  assert.ok(transpositionTableSize() > 0);
  clearTranspositionTable();
  assert.equal(transpositionTableSize(), 0);
});

test('draws: a losing side heads for a repetition', () => {
  // White is a queen down; the knights have already shuffled out and back once.
  const chess = new Chess('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1');
  for (const m of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6']) chess.move(m);
  clearTranspositionTable();
  const r = search(chess, { depth: 3 });
  assert.deepEqual(r.move, { from: 'f3', to: 'g1' }); // repeats instead of staying a queen down
  assert.equal(r.score, 0);
});

test('draws: a winning side avoids repeating', () => {
  // Same shuffle, but now Black is the side a queen down and must not let White repeat.
  const chess = new Chess('rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  for (const m of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6']) chess.move(m);
  clearTranspositionTable();
  const r = search(chess, { depth: 3 });
  assert.notDeepEqual(r.move, { from: 'f3', to: 'g1' });
  assert.ok(r.score > 500);
});

test('draws: the 50-move rule counts as a draw in the search', () => {
  // Rook up, but 99 half-moves without a capture or pawn move: any quiet move ends the game drawn.
  const chess = new Chess('4k3/8/8/8/8/8/8/R3K3 w - - 99 80');
  clearTranspositionTable();
  const r = search(chess, { depth: 2, quiescence: false });
  assert.equal(r.score, 0);
});

test('mop-up: a bare king is pushed to the edge', () => {
  // White has a rook vs a bare king: king on the edge must score higher than in the centre.
  const edge = evaluate(new Chess('4k3/8/8/8/8/8/8/R3K3 w - - 0 1'));
  const centre = evaluate(new Chess('8/8/8/4k3/8/8/8/R3K3 w - - 0 1'));
  assert.ok(edge > centre, `${edge} vs ${centre}`);
});

test('mop-up: bishop + knight drive the king to a corner of the bishop\'s color', () => {
  // Dark-squared bishop (c1): the a1/h8 corners are the mating corners, a8/h1 are not.
  const right = evaluate(new Chess('7k/8/8/8/8/8/8/2B1KN2 w - - 0 1')); // king on h8 (dark)
  const wrong = evaluate(new Chess('k7/8/8/8/8/8/8/2B1KN2 w - - 0 1')); // king on a8 (light)
  assert.ok(right > wrong, `${right} vs ${wrong}`);
});
