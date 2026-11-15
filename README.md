# Gambit

A chess engine I wrote from scratch, and a place to play it.

**[Play it live →](https://chess-engine-1smz.onrender.com/)**

![Playing a game against Gambit](docs/demo.gif)

Gambit looks several moves ahead, skips the lines that can't matter, and remembers positions it has already worked out. On Hard it plays at about **1,940 Elo** against Stockfish, and it does all of this in your browser, without a server doing the thinking.

## At a glance

- **A real search engine.** Alpha-beta search, move ordering, a transposition table, quiescence search and iterative deepening, each one measured.
- **99% less work.** Those techniques cut the positions searched by about 99% compared with plain minimax, with the same answer.
- **A measured rating.** Each level played 96 games against Stockfish on GitHub Actions, so the numbers below come with error bars.
- **Online play that holds up.** A refresh, a dropped connection or even a server restart puts both players back in their game.

## Playing

**Against the engine.** Pick Easy, Medium or Hard and your color. An evaluation bar shows who is ahead, a hint is one click away, and "How Gambit chose its move" opens the numbers behind each reply.

**Two players, one screen.** Pass the device back and forth, and flip the board when you like.

**Online.** Create a game and send the link or the room code. The server checks every move and keeps the clocks, so neither side can cheat the timer. Once two players join, the game is private.

**Everywhere:**

- Drag or tap to move, with a promotion picker and captured pieces beside each player
- Time controls from 1+0 to 10+0, plus 3+2 and 5+3
- Step back through the moves with the arrow keys without changing the game
- A refresh brings back the exact game, and leaving mid-game asks first
- Five board colors, two piece sets, light and dark backgrounds, and move sounds

<p align="center">
  <img src="docs/mobile.png" width="520" alt="Gambit on a phone: the home page and a game in progress" />
</p>

## How Gambit thinks

On every move, Gambit asks one question: what is the best I can do if you always find your best reply? Answering it means searching a tree of moves that grows very fast, so most of the work goes into searching less of it.

**Search.** The core is NegaMax, a compact form of minimax: my best score is the negative of your best score. Alpha-beta pruning drops a move the moment it is proven worse than one already found.

**Move ordering.** Pruning works best when strong moves come first. Gambit tries the captures that win the most for the least first, and opens each search with the best line from the one before.

**Transposition table.** Different move orders often reach the same position. Each position Gambit searches is stored under a 64-bit hash, so it is looked up instead of searched again. At depth 5 this halves the work.

**Quiescence search.** The search keeps playing out captures until the position is quiet. Without it, Gambit would grab a defended pawn with its queen because the recapture sits just past its horizon.

**Draw awareness.** Repeated positions and the 50-move rule count as draws, so Gambit doesn't drift into a repetition when it is winning, and looks for one when it is losing.

**Iterative deepening.** It searches one move deep, then two, then three, and stops when its time runs out, keeping the last complete answer.

The search runs in a Web Worker, so the page stays smooth while Gambit thinks. The code is in [`web/public/js/engine/`](web/public/js/engine):

| File | Role |
| --- | --- |
| `search.js` | The search and everything that speeds it up |
| `evaluate.js` | Scores a position: material plus piece-square tables, with a separate king table for the endgame |
| `board.js` | Fast move generation on chess.js's internal board, about 575,000 positions per second |
| `levels.js` | Easy, Medium and Hard |
| `worker.js`, `client.js` | Runs the search off the main thread |

### Searching less

`npm run bench` searches standard positions with each technique added in turn:

| Position | Depth | Minimax | + Alpha-beta | + Move ordering | + Transposition table |
| --- | --- | --- | --- | --- | --- |
| Start position | 4 | 216,369 · 5.1s | 2,152 · 0.06s | 2,128 · 0.05s | 2,004 · 0.04s (**99.1% fewer**) |
| Italian Game | 4 | 978,800 · 30.9s | 92,739 · 2.8s | 13,087 · 0.42s | 9,706 · 0.30s (**99.0% fewer**) |
| Kiwipete (middlegame) | 3 | 102,087 · 4.1s | 5,164 · 0.21s | 2,847 · 0.12s | 2,641 · 0.11s (**97.4% fewer**) |

Quiescence search is off here, so every column searches the same tree.

### How strong is it?

Each level played **96 games against Stockfish 16.1** in its strength-limited mode, from 24 openings with each color, on the 60s + 0.6s clock that Stockfish's rating scale is calibrated for. The games run in parallel on GitHub Actions.

| Level | How it plays | W / D / L | Elo (95% range) |
| --- | --- | --- | --- |
| Easy | Looks 3 moves deep and sometimes picks its second or third choice, but never gives away a piece | 64 / 1 / 31 | **1,543** (1,468–1,628) |
| Medium | Looks 4 moves deep, up to 1 second per move | 56 / 4 / 36 | **1,780** (1,706–1,859) |
| Hard | Searches as deep as it can in 2.5 seconds, usually 5–6 moves | 51 / 4 / 41 | **1,939** (1,865–2,016) |

These ratings are on Stockfish's scale, which is not the same as chess.com or FIDE ratings.

## Tests

```bash
cd web && npm test                          # engine and server
python3 -m unittest discover desktop/tests  # the original Python version
```

The engine tests check that Gambit finds forced mates, wins free material, avoids the horizon trap, respects its time limit and handles draws. They also check that every speed-up returns the same move as plain minimax. The server tests play real games through the server: turn order, illegal moves, clocks, private games, and players rejoining after a refresh or a server restart.

Perft tests, which count every position reachable in a few moves, found three bugs in the original move generator, all now fixed.

## Run it yourself

```bash
cd web
npm install
npm start    # http://localhost:3000
```

You can also open the repo in GitHub Codespaces, which installs everything and starts the app.

The live site runs on Render's free tier, which sleeps when idle. A small GitHub Action visits it every 10 minutes to keep it awake.

## Project layout

```
web/                 the web app
  server.js          Express and Socket.IO: online games and clocks
  public/js/engine/  the chess engine
  public/js/app.js   game screen, modes and clocks
  public/js/board.js board, drag and drop, animations
  tests/             engine and server tests
  bench/             benchmarks and the Stockfish matches
desktop/             the first version, in Python and pygame
```

Gambit started as a desktop game in Python, where the move generator and the first search were written. The web version keeps those ideas and adds a faster search, more techniques and a full interface.

## Credits

- Chess pieces: [Kosal](https://github.com/philatype/kosal) by philatype, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The logo's pawn and knight come from this set.
- Fonts: [Inter](https://github.com/rsms/inter), [Outfit](https://github.com/Outfitio/Outfit-Fonts) and [Fraunces](https://github.com/undercasetype/Fraunces), under the SIL Open Font License 1.1.
- Rules and move legality: [chess.js](https://github.com/jhlywa/chess.js). Piece-square tables: Tomasz Michniewski's Simplified Evaluation Function.
- Strength testing: [Stockfish](https://stockfishchess.org) 16.1, used only to measure Gambit's rating.

## License

© 2026 Siya Doshi. All rights reserved. The code is shared for viewing only; see [LICENSE](LICENSE). The pieces and fonts keep their own licenses.
