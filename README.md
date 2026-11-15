<div align="center">

<img src="web/public/assets/icon-512.png" width="88" alt="" />

# Gambit

A chess engine built from scratch that plays at 1,900+ Elo, right in your browser.

**[Play it live](https://chess-engine-1smz.onrender.com/)** &nbsp;·&nbsp; [How it thinks](#how-it-thinks) &nbsp;·&nbsp; [How strong it is](#how-strong-it-is)

</div>

<br />

![Playing a game against Gambit](docs/demo.gif)

Gambit looks several moves ahead, skips the lines that can't matter, and remembers positions it has already worked out. There's no server doing the thinking: every move is searched on your own device.

## Highlights

- **Built from scratch.** Alpha-beta search, move ordering, a transposition table and more, each one measured.
- **99% less searching** than plain minimax, for the same answer.
- **A measured rating** from 96 games per level against Stockfish, with error bars.
- **Online play that holds up.** A refresh, a dropped connection or a server restart puts both players back in the game.

## Ways to play

| Against the engine | Two players | Online |
| --- | --- | --- |
| Easy, Medium or Hard, with an evaluation bar, hints, and the numbers behind each move | One screen, passed back and forth | Share a link or a room code. The server checks every move and keeps the clocks |

Every mode has drag or tap to move, time controls from 1+0 to 10+0, a move list you can step back through, board and piece themes, and games that survive a refresh.

<p align="center">
  <img src="docs/mobile.png" width="460" alt="Gambit on a phone: the home page and a game in progress" />
</p>

## How it thinks

On every move, Gambit asks one question: what is the best I can do if you always find your best reply? The tree of possible moves grows very fast, so most of the work goes into searching less of it.

| Technique | What it does |
| --- | --- |
| **Alpha-beta search** | Drops a move the moment it is proven worse than one already found |
| **Move ordering** | Tries the most promising moves first, so more of the tree can be skipped |
| **Transposition table** | Remembers positions reached by different move orders, instead of searching them again |
| **Quiescence search** | Plays out captures before judging a position, so it doesn't walk into a recapture |
| **Draw awareness** | Avoids repeating positions when it is winning, and looks for a repetition when it is losing |
| **Iterative deepening** | Searches one move deep, then two, then three, until its time runs out |

The search runs in a Web Worker, so the page stays smooth while Gambit thinks.

<details>
<summary><b>More detail on each technique</b></summary>
<br />

**Alpha-beta search.** The core is NegaMax, a compact form of minimax: my best score is the negative of your best score. Alpha-beta pruning stops looking at a move as soon as it can't beat an option already found.

**Move ordering.** Pruning works best when strong moves come first. Gambit tries the captures that win the most for the least first, and opens each search with the best line from the one before.

**Transposition table.** Each position is stored under a 64-bit hash with its score, depth and best move. At depth 5 this halves the work.

**Quiescence search.** Without it, Gambit would grab a defended pawn with its queen, because the recapture sits just past the end of its search.

**Draw awareness.** Repeated positions and the 50-move rule score as draws. These scores depend on how a position was reached, so they are kept out of the transposition table.

**Iterative deepening.** If time runs out mid-search, Gambit plays the best move from the last depth it finished.

</details>

<details>
<summary><b>Where the code lives</b></summary>
<br />

| File | Role |
| --- | --- |
| [`search.js`](web/public/js/engine/search.js) | The search and everything that speeds it up |
| [`evaluate.js`](web/public/js/engine/evaluate.js) | Scores a position: material, plus tables of good squares for each piece |
| [`board.js`](web/public/js/engine/board.js) | Fast move generation, about 575,000 positions per second |
| [`levels.js`](web/public/js/engine/levels.js) | Easy, Medium and Hard |
| [`worker.js`](web/public/js/engine/worker.js), [`client.js`](web/public/js/engine/client.js) | Runs the search off the main thread |

</details>

### Searching less

Positions searched to reach the same move, with and without the speed-ups:

| Position | Plain minimax | Gambit | Saved |
| --- | --- | --- | --- |
| Start position, depth 4 | 216,369 | 2,004 | **99.1%** |
| Italian Game, depth 4 | 978,800 | 9,706 | **99.0%** |
| Kiwipete, depth 3 | 102,087 | 2,641 | **97.4%** |

<details>
<summary><b>Each technique's share</b></summary>
<br />

`npm run bench` adds the techniques one at a time. Quiescence search is off, so every column searches the same tree.

| Position | Minimax | + Alpha-beta | + Move ordering | + Transposition table |
| --- | --- | --- | --- | --- |
| Start position (depth 4) | 216,369 · 5.1s | 2,152 · 0.06s | 2,128 · 0.05s | 2,004 · 0.04s |
| Italian Game (depth 4) | 978,800 · 30.9s | 92,739 · 2.8s | 13,087 · 0.42s | 9,706 · 0.30s |
| Kiwipete (depth 3) | 102,087 · 4.1s | 5,164 · 0.21s | 2,847 · 0.12s | 2,641 · 0.11s |

</details>

## How strong it is

| Level | How it plays | Elo | 95% range |
| --- | --- | --- | --- |
| Easy | Looks 3 moves ahead, and sometimes picks its second or third choice | **1,543** | 1,468–1,628 |
| Medium | Looks 4 moves ahead | **1,780** | 1,706–1,859 |
| Hard | Looks as far as it can in 2.5 seconds, usually 5–6 moves | **1,939** | 1,865–2,016 |

Each level played 96 games against Stockfish 16.1 in its strength-limited mode, so these ratings are on Stockfish's scale rather than chess.com's or FIDE's.

<details>
<summary><b>How the games were played</b></summary>
<br />

Every level faced two Stockfish settings, from 24 openings, playing each opening once with each color. The games used a 60s + 0.6s clock, the time control Stockfish's rating scale is calibrated for, and ran in parallel on GitHub Actions. Easy's weaker moves never give away a piece.

| Level | Wins / draws / losses |
| --- | --- |
| Easy | 64 / 1 / 31 |
| Medium | 56 / 4 / 36 |
| Hard | 51 / 4 / 41 |

</details>

## Try it locally

To run Gambit on your own computer:

```bash
cd web
npm install
npm start      # opens on http://localhost:3000
npm test       # engine and server tests
```

Or open the repo in GitHub Codespaces, which sets everything up for you.

<details>
<summary><b>What the tests cover</b></summary>
<br />

- **Engine:** finds forced mates, wins free material, avoids walking into recaptures, respects its time limit and handles draws. Every speed-up returns the same move as plain minimax.
- **Server:** plays real games through the server, covering turn order, illegal moves, clocks, private games, and players rejoining after a refresh or a server restart.
- **Move generator:** counts every position reachable in a few moves and matches the published numbers. These tests found three bugs in the original version, all fixed.

</details>

<details>
<summary><b>Project layout</b></summary>
<br />

```
web/                 the web app
  server.js          online games and clocks
  public/js/engine/  the chess engine
  public/js/app.js   game screen and modes
  public/js/board.js board, drag and drop, animations
  tests/             engine and server tests
  bench/             benchmarks and the Stockfish matches
desktop/             the first version, in Python
```

Gambit began as a desktop game in Python. The web version keeps its ideas and adds a faster search and a full interface. The live site runs on Render's free tier, and a GitHub Action visits it every 10 minutes to keep it awake.

</details>

## Credits

- **Pieces:** [Kosal](https://github.com/philatype/kosal) by philatype (CC BY 4.0)
- **Fonts:** [Inter](https://github.com/rsms/inter), [Outfit](https://github.com/Outfitio/Outfit-Fonts) and [Fraunces](https://github.com/undercasetype/Fraunces) (SIL Open Font License)
- **Chess rules:** [chess.js](https://github.com/jhlywa/chess.js)
- **Piece-square tables:** Tomasz Michniewski's Simplified Evaluation Function
- **Strength testing:** [Stockfish](https://stockfishchess.org) 16.1

## License

© 2026 Siya Doshi. All rights reserved. The code may be run locally for evaluation. See [LICENSE](LICENSE).
