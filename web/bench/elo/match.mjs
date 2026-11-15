// Plays one of Gambit's levels against Stockfish in its strength-limited mode.
//
//   node bench/elo/match.mjs <level> <stockfishElo> <games> <out.json> [openingOffset]
//
// Stockfish plays on a 60s + 0.6s clock, the time control its UCI_Elo setting
// is calibrated at. Gambit uses the level's normal settings. Each opening is
// played twice, once with each colour. Set STOCKFISH to the binary's path.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { chooseMove } from '../../public/js/engine/levels.js';
import { evaluate } from '../../public/js/engine/evaluate.js';

const [level, sfEloArg, gamesArg, out, offsetArg = '0'] = process.argv.slice(2);
if (!level || !sfEloArg || !gamesArg || !out) {
  console.error('usage: node bench/elo/match.mjs <level> <stockfishElo> <games> <out.json> [openingOffset]');
  process.exit(1);
}
const SF_ELO = Number(sfEloArg);
const GAMES = Number(gamesArg);
const OFFSET = Number(offsetArg);
const MAX_PLIES = 200;

// 24 common openings, two plies each, so games don't all start the same way.
export const OPENINGS = [
  'e2e4 e7e5', 'e2e4 c7c5', 'e2e4 e7e6', 'e2e4 c7c6', 'e2e4 d7d5', 'e2e4 g8f6',
  'e2e4 d7d6', 'e2e4 g7g6', 'e2e4 b8c6', 'd2d4 d7d5', 'd2d4 g8f6', 'd2d4 f7f5',
  'd2d4 e7e6', 'd2d4 d7d6', 'd2d4 c7c5', 'c2c4 e7e5', 'c2c4 g8f6', 'c2c4 c7c5',
  'g1f3 d7d5', 'g1f3 g8f6', 'g1f3 c7c5', 'b2b3 e7e5', 'g2g3 d7d5', 'f2f4 d7d5',
].map((s) => s.split(' '));

class Stockfish {
  constructor(path, elo) {
    this.p = spawn(path);
    this.buf = '';
    this.waiters = [];
    this.p.stdout.on('data', (d) => {
      this.buf += d;
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        for (const w of [...this.waiters]) {
          if (line.startsWith(w.prefix)) {
            this.waiters.splice(this.waiters.indexOf(w), 1);
            w.resolve(line);
          }
        }
      }
    });
    this.send('uci');
    this.send('setoption name Threads value 1');
    this.send('setoption name UCI_LimitStrength value true');
    this.send(`setoption name UCI_Elo value ${elo}`);
  }

  send(s) { this.p.stdin.write(s + '\n'); }

  wait(prefix) { return new Promise((resolve) => this.waiters.push({ prefix, resolve })); }

  newGame() { this.clock = 60000; this.send('ucinewgame'); }

  async move(uciMoves) {
    this.send(`position startpos moves ${uciMoves.join(' ')}`);
    const t = Math.max(50, Math.round(this.clock));
    const start = Date.now();
    this.send(`go wtime ${t} btime ${t} winc 600 binc 600`);
    const line = await this.wait('bestmove');
    this.clock = this.clock - (Date.now() - start) + 600;
    return line.split(' ')[1];
  }

  quit() { this.send('quit'); }
}

const sf = new Stockfish(process.env.STOCKFISH ?? 'stockfish', SF_ELO);
const results = [];
let score = 0;

for (let g = 0; g < GAMES; g++) {
  const chess = new Chess();
  const uci = [];
  sf.newGame();
  const opening = OPENINGS[(OFFSET + Math.floor(g / 2)) % OPENINGS.length];
  for (const m of opening) {
    chess.move({ from: m.slice(0, 2), to: m.slice(2, 4) });
    uci.push(m);
  }
  const ourColor = g % 2 === 0 ? 'w' : 'b';
  while (!chess.isGameOver() && uci.length < MAX_PLIES) {
    let mv;
    if (chess.turn() === ourColor) {
      mv = chooseMove(chess, level).move;
    } else {
      const u = await sf.move(uci);
      mv = { from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] };
    }
    const done = chess.move(mv);
    uci.push(done.from + done.to + (done.promotion ?? ''));
  }

  let result = 0.5;
  let adjudicated = false;
  if (chess.isCheckmate()) {
    result = chess.turn() === ourColor ? 0 : 1;
  } else if (!chess.isGameOver()) {
    // Move cap reached: a lead of 5+ pawns counts as a win, anything else a draw.
    const e = evaluate(chess) * (ourColor === 'w' ? 1 : -1);
    if (Math.abs(e) >= 500) { result = e > 0 ? 1 : 0; adjudicated = true; }
  }
  score += result;
  results.push({ game: g + 1, opening: opening.join(' '), ourColor, result, plies: uci.length, mate: chess.isCheckmate(), adjudicated });
  writeFileSync(out, JSON.stringify({ level, stockfishElo: SF_ELO, played: g + 1, score, results }, null, 1));
  console.log(`${level} vs Stockfish ${SF_ELO}: game ${g + 1}/${GAMES} ${result} (${score}/${g + 1})`);
}
sf.quit();
