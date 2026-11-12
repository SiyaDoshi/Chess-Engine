# Gambit

A chess engine written from scratch, playable in the browser.

**[Play it live →](https://chess-engine-1smz.onrender.com/)**

![Playing against Gambit](docs/demo.gif)

The engine searches with NegaMax and alpha-beta pruning, orders moves so it can skip most of the tree, keeps calculating through captures with quiescence search, and deepens iteratively until its time runs out. It runs in a Web Worker, so the page stays smooth while it thinks.

## Features

- **Play the engine** at Easy, Medium or Hard, as White or Black, with an evaluation bar and a live readout of what the engine found (score, depth, positions searched, time, best line)
- **Two Player** on one device, or **Play Online** with a share link (Socket.IO, server-side move validation and clocks)
- Drag-and-drop or click-to-move, promotion picker, move list with review (← →), captured pieces, hints
- Time controls from 1+0 to 10+0 with increments; the engine manages its own clock
- Board and piece themes, light and dark mode, sounds, and settings that are remembered
- Works on phones and laptops

![Home page](docs/home.png)

## How the engine works

The engine lives in [`web/public/js/engine/`](web/public/js/engine):

| File | What it does |
| --- | --- |
| `board.js` | Fast move generation on top of chess.js's internal 0x88 board (~575k positions/sec) |
| `evaluate.js` | Material plus piece-square tables, with a separate king table for the endgame |
| `search.js` | NegaMax + alpha-beta, MVV-LVA move ordering, quiescence search, iterative deepening, time limit |
| `levels.js` | Easy / Medium / Hard settings |
| `worker.js`, `client.js` | Runs the search in a Web Worker and exposes `think(fen, level)` |

**Search.** NegaMax is minimax written once: my best score is the negative of my opponent's best score. Alpha-beta pruning stops looking at a move as soon as it's proven worse than an option already found.

**Move ordering.** Alpha-beta prunes the most when good moves come first, so captures are tried first, sorted by *most valuable victim, least valuable attacker*, and the best line from the previous depth is tried before anything else.

**Quiescence search.** At the end of the main search the engine keeps playing out captures until the position is quiet. Without this it would happily take a defended pawn with its queen because the recapture is one move past its horizon.

**Iterative deepening.** It searches depth 1, 2, 3, … and stops when its time budget runs out, keeping the last finished answer.

### Benchmarks

`npm run bench` searches standard positions with each technique switched on in turn (quiescence off so every row searches the same tree):

| Position | Depth | Minimax | + Alpha-beta | + Move ordering |
| --- | --- | --- | --- | --- |
| Start position | 4 | 216,369 positions · 5.2s | 2,152 · 0.07s | 2,128 · 0.05s (**99.0% fewer**) |
| Italian Game | 4 | 978,800 positions · 33.4s | 92,739 · 3.1s | 13,087 · 0.46s (**98.7% fewer**) |
| Kiwipete (middlegame) | 3 | 102,087 positions · 4.6s | 5,164 · 0.26s | 2,847 · 0.13s (**97.2% fewer**) |

| Level | Search | Typical result |
| --- | --- | --- |
| Easy | depth 1, plays a random move 30% of the time | instant |
| Medium | depth 4, capped at 1s | depth 3–4 in 0.15–1s |
| Hard | as deep as it can in 2.5s | depth 5 in the opening, 4 in busy middlegames |

## Tests

```bash
cd web && npm test                          # engine tests (Node's built-in test runner)
python3 -m unittest discover desktop/tests  # desktop move generator and AI
```

- **Perft** checks count every position reachable in N moves and compare with the published numbers. Running them against the original Python move generator found three bugs: castling rights saved in the wrong order, castling still allowed after the rook was captured, and no under-promotion. All three are fixed, and it now matches all six standard test positions.
- Engine tests check mates in one and two, winning free material, the horizon effect, time limits, and that alpha-beta and move ordering return the same result as plain minimax while searching less.

## Run it locally

```bash
cd web
npm install
npm start          # http://localhost:3000
```

Or open the repo in **GitHub Codespaces**: the dev container installs everything and starts the app.

## Project structure

```
web/                 the web app (deployed)
  server.js          Express + Socket.IO: online games and clocks
  public/
    js/engine/       the chess engine
    js/app.js        game screen, clocks, modes
    js/board.js      board rendering, drag-and-drop, animations
  tests/             engine tests
  bench/             benchmark script
desktop/             the original Python + pygame version
  ChessEngine.py     board state and move generation
  ChessAI.py         NegaMax + alpha-beta for the desktop game
  tests/             perft and AI tests
```

The desktop version came first: it's where the move generator and the first NegaMax search were written. The web version uses the same ideas, with a faster search, more techniques and a full UI.

## Hosting note

The live demo runs on Render's free tier, which sleeps after a period without visitors, so the first load after a break can take up to a minute. A free uptime monitor (for example UptimeRobot pinging the site every 10 minutes) keeps it awake.

## Credits

- Chess pieces: [Kosal](https://github.com/philatype/kosal) by philatype, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The Gambit logo's pawn and knight are cropped from this set. Original "Classic" pieces are also available in settings.
- Fonts: [Inter](https://github.com/rsms/inter) and [Outfit](https://github.com/Outfitio/Outfit-Fonts), SIL Open Font License 1.1 (see `web/public/fonts`).
- Rules and move legality: [chess.js](https://github.com/jhlywa/chess.js). Piece-square tables: Tomasz Michniewski's Simplified Evaluation Function.

## License

MIT for the code, see [LICENSE](LICENSE). Pieces and fonts keep their own licenses listed above.
