// Combines match files into one rating per level.
//
//   node bench/elo/summarize.mjs <dir-with-json-files> [out.json]
//
// The rating is the performance rating: the Elo R at which the expected
// score against the opponents actually faced equals the score achieved.
// The range is a 95% interval from the spread of game results.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, out] = process.argv.slice(2);

function jsonFiles(d) {
  return readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    if (statSync(p).isDirectory()) return jsonFiles(p);
    return f.endsWith('.json') ? [p] : [];
  });
}

const expected = (r, opp) => 1 / (1 + 10 ** ((opp - r) / 400));

/** The rating whose expected score against `opps` is `score` (binary search). */
function performance(opps, score) {
  const s = Math.min(Math.max(score, 0.25), opps.length - 0.25); // keep 0% / 100% finite
  let lo = 0;
  let hi = 4000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const e = opps.reduce((sum, o) => sum + expected(mid, o), 0);
    if (e < s) lo = mid; else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

const byLevel = {};
for (const file of jsonFiles(dir)) {
  const m = JSON.parse(readFileSync(file, 'utf8'));
  for (const g of m.results) (byLevel[m.level] ??= []).push({ ...g, opp: m.stockfishElo });
}

const order = ['easy', 'medium', 'hard'];
const summary = [];
for (const level of order.filter((l) => byLevel[l])) {
  const games = byLevel[level];
  const n = games.length;
  const score = games.reduce((s, g) => s + g.result, 0);
  const mean = score / n;
  const sd = Math.sqrt(games.reduce((s, g) => s + (g.result - mean) ** 2, 0) / Math.max(1, n - 1));
  const margin = 1.96 * sd / Math.sqrt(n) * n; // in points
  const opps = games.map((g) => g.opp);
  const perOpp = {};
  for (const g of games) {
    const o = (perOpp[g.opp] ??= { games: 0, score: 0 });
    o.games += 1;
    o.score += g.result;
  }
  summary.push({
    level,
    games: n,
    score,
    wins: games.filter((g) => g.result === 1).length,
    draws: games.filter((g) => g.result === 0.5).length,
    losses: games.filter((g) => g.result === 0).length,
    elo: performance(opps, score),
    low: performance(opps, score - margin),
    high: performance(opps, score + margin),
    perOpponent: perOpp,
  });
}

const lines = [
  '| Level | Games | W / D / L | Score | Elo | 95% range | By opponent |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...summary.map((s) => `| ${s.level} | ${s.games} | ${s.wins} / ${s.draws} / ${s.losses} | ${s.score} (${Math.round(100 * s.score / s.games)}%) | **${s.elo}** | ${s.low}–${s.high} | ${Object.entries(s.perOpponent).map(([o, v]) => `SF ${o}: ${v.score}/${v.games}`).join(', ')} |`),
];
console.log(lines.join('\n'));
if (out) writeFileSync(out, JSON.stringify(summary, null, 1));
