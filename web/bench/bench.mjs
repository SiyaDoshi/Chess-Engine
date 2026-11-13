/**
 * bench.mjs — measure how each search technique cuts the work.
 *
 *   npm run bench
 *
 * Searches a few standard positions to a fixed depth with features turned
 * on one at a time (alpha-beta, move ordering, transposition table), and
 * reports positions visited and time taken.
 * Quiescence is off here so every row searches the same tree depth.
 */

import { Chess } from 'chess.js';
import { search, clearTranspositionTable } from '../public/js/engine/search.js';
import { LEVELS } from '../public/js/engine/levels.js';

// [fen, depth]. Kiwipete has ~48 moves per position, so plain minimax at
// depth 4 takes minutes; depth 3 keeps the benchmark under a minute.
const POSITIONS = {
  'Start position': ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 4],
  'Italian Game': ['r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 4],
  'Middlegame (Kiwipete)': ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 3],
};

const CONFIGS = [
  ['Minimax', { alphaBeta: false, ordering: false, quiescence: false, tt: false }],
  ['+ alpha-beta', { alphaBeta: true, ordering: false, quiescence: false, tt: false }],
  ['+ move ordering', { alphaBeta: true, ordering: true, quiescence: false, tt: false }],
  ['+ trans. table', { alphaBeta: true, ordering: true, quiescence: false, tt: true }],
];

const fmt = (n) => n.toLocaleString('en-US');
const pct = (a, b) => `${(100 * (1 - a / b)).toFixed(1)}%`;

console.log('Fixed-depth search, quiescence off\n');
for (const [name, [fen, depth]] of Object.entries(POSITIONS)) {
  console.log(`${name} (depth ${depth})`);
  let base = null;
  for (const [label, opts] of CONFIGS) {
    clearTranspositionTable(); // every row starts with an empty table
    const r = search(new Chess(fen), { depth, ...opts });
    base ??= r.nodes;
    const saved = r.nodes === base ? '' : `  (${pct(r.nodes, base)} fewer)`;
    console.log(`  ${label.padEnd(17)} ${fmt(r.nodes).padStart(10)} positions ${String(r.timeMs).padStart(6)} ms${saved}`);
  }
  console.log();
}

// The transposition table pays off in deeper searches, where the same
// positions are reached by many move orders.
console.log('Transposition table at depth 5 (full engine)\n');
for (const name of ['Italian Game', 'Middlegame (Kiwipete)']) {
  const [fen] = POSITIONS[name];
  clearTranspositionTable();
  const off = search(new Chess(fen), { depth: 5, tt: false });
  clearTranspositionTable();
  const on = search(new Chess(fen), { depth: 5 });
  console.log(`  ${name.padEnd(22)} ${fmt(off.nodes).padStart(9)} -> ${fmt(on.nodes).padStart(9)} positions  ${String(off.timeMs).padStart(5)} -> ${String(on.timeMs).padStart(5)} ms  (${pct(on.nodes, off.nodes)} fewer)`);
}
console.log();

console.log('Difficulty levels from the start position (full engine)\n');
for (const [key, level] of Object.entries(LEVELS)) {
  clearTranspositionTable();
  const r = search(new Chess(), { depth: level.depth, timeMs: level.timeMs });
  const nps = Math.round(r.nodes / Math.max(r.timeMs, 1) * 1000);
  console.log(`  ${level.label.padEnd(7)} depth ${r.depth}  ${fmt(r.nodes).padStart(9)} positions  ${String(r.timeMs).padStart(5)} ms  ~${fmt(nps)}/s`);
}
