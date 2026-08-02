/**
 * server.js — online multiplayer + authoritative clocks
 *
 * Preserved:
 *  - max 3 concurrent games
 *  - share links /g/:id
 *  - Socket.IO move sync + chess.js validation
 *
 * Added:
 *  - time controls (1+0, 3+0, 5+0, 10+0, 3+2, 5+3)
 *  - synchronized clock state in publicState
 */

const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Chess } = require('chess.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const MAX_GAMES = 3;

const TIME_PRESETS = {
  '1+0': { baseMs: 60_000, incrementMs: 0 },
  '3+0': { baseMs: 180_000, incrementMs: 0 },
  '5+0': { baseMs: 300_000, incrementMs: 0 },
  '10+0': { baseMs: 600_000, incrementMs: 0 },
  '3+2': { baseMs: 180_000, incrementMs: 2_000 },
  '5+3': { baseMs: 300_000, incrementMs: 3_000 },
};

/** @type {Map<string, object>} */
const games = new Map();

app.use(express.static(path.join(__dirname, 'public')));
app.use('/pieces', express.static(path.join(__dirname, '..', 'images')));
app.use('/lib', express.static(path.join(__dirname, 'node_modules', 'chess.js', 'dist', 'esm')));

app.get('/g/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function makeGameId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function parseTimeControl(tc) {
  return TIME_PRESETS[tc] ? tc : '5+0';
}

function createClockState(timeControl) {
  const preset = TIME_PRESETS[parseTimeControl(timeControl)];
  return {
    timeControl: parseTimeControl(timeControl),
    whiteMs: preset.baseMs,
    blackMs: preset.baseMs,
    incrementMs: preset.incrementMs,
    lastTickAt: null,
    clocksRunning: false,
    timedOut: null, // 'w' | 'b' | null
  };
}

/** Apply elapsed time for the side to move since lastTickAt */
function settleClocks(game, now = Date.now()) {
  if (!game.clocks.clocksRunning || game.clocks.timedOut || !game.clocks.lastTickAt) {
    return;
  }
  if (game.chess.isGameOver()) return;

  const elapsed = Math.max(0, now - game.clocks.lastTickAt);
  const turn = game.chess.turn();
  if (turn === 'w') {
    game.clocks.whiteMs = Math.max(0, game.clocks.whiteMs - elapsed);
    if (game.clocks.whiteMs <= 0) game.clocks.timedOut = 'w';
  } else {
    game.clocks.blackMs = Math.max(0, game.clocks.blackMs - elapsed);
    if (game.clocks.blackMs <= 0) game.clocks.timedOut = 'b';
  }
  game.clocks.lastTickAt = now;

  if (game.clocks.timedOut) {
    game.clocks.clocksRunning = false;
  }
}

function maybeStartClocks(game) {
  if (
    game.whiteId &&
    game.blackId &&
    !game.clocks.clocksRunning &&
    !game.clocks.timedOut &&
    !game.chess.isGameOver()
  ) {
    game.clocks.clocksRunning = true;
    game.clocks.lastTickAt = Date.now();
  }
}

function publicState(game, gameId) {
  settleClocks(game);
  return {
    gameId,
    fen: game.chess.fen(),
    turn: game.chess.turn(),
    whiteConnected: !!game.whiteId,
    blackConnected: !!game.blackId,
    isCheckmate: game.chess.isCheckmate(),
    isDraw: game.chess.isDraw(),
    isGameOver: game.chess.isGameOver() || !!game.clocks.timedOut,
    timedOut: game.clocks.timedOut,
    timeControl: game.clocks.timeControl,
    whiteMs: game.clocks.whiteMs,
    blackMs: game.clocks.blackMs,
    clocksRunning: game.clocks.clocksRunning,
    serverNow: Date.now(),
    activeGames: games.size,
    maxGames: MAX_GAMES,
  };
}

function removeIfEmpty(gameId) {
  const game = games.get(gameId);
  if (!game) return;
  if (!game.whiteId && !game.blackId) {
    games.delete(gameId);
    console.log(`Game ${gameId} removed. Active: ${games.size}/${MAX_GAMES}`);
  }
}

function emitState(gameId) {
  const game = games.get(gameId);
  if (!game) return;
  io.to(gameId).emit('playerUpdate', publicState(game, gameId));
}

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  socket.on('createGame', (payload, ack) => {
    const cb = typeof payload === 'function' ? payload : ack;
    const opts = typeof payload === 'function' ? {} : (payload || {});

    if (games.size >= MAX_GAMES) {
      cb({ ok: false, error: 'Server full — only 3 games allowed at once. Try later.' });
      return;
    }

    let id = makeGameId();
    while (games.has(id)) id = makeGameId();

    const timeControl = parseTimeControl(opts.timeControl);
    games.set(id, {
      chess: new Chess(),
      whiteId: socket.id,
      blackId: null,
      clocks: createClockState(timeControl),
    });

    socket.join(id);
    socket.data.gameId = id;
    socket.data.color = 'w';

    console.log(`Game ${id} created (${timeControl}). Active: ${games.size}/${MAX_GAMES}`);
    cb({
      ok: true,
      gameId: id,
      color: 'w',
      sharePath: `/g/${id}`,
      state: publicState(games.get(id), id),
    });
  });

  socket.on('setTimeControl', ({ timeControl }, ack) => {
    const id = socket.data.gameId;
    const game = games.get(id);
    if (!game) {
      ack?.({ ok: false, error: 'No active game.' });
      return;
    }
    if (socket.data.color !== 'w') {
      ack?.({ ok: false, error: 'Only the host can change the timer.' });
      return;
    }
    if (game.blackId) {
      ack?.({ ok: false, error: 'Timer locked once the opponent joins.' });
      return;
    }

    game.clocks = createClockState(timeControl);
    const state = publicState(game, id);
    io.to(id).emit('playerUpdate', state);
    ack?.({ ok: true, state });
  });

  socket.on('joinGame', ({ gameId }, ack) => {
    const id = (gameId || '').toLowerCase();
    const game = games.get(id);

    if (!game) {
      ack({ ok: false, error: 'Game not found. It may have ended or the link is wrong.' });
      return;
    }

    if (!game.whiteId) {
      game.whiteId = socket.id;
      socket.join(id);
      socket.data.gameId = id;
      socket.data.color = 'w';
      maybeStartClocks(game);
      const state = publicState(game, id);
      socket.to(id).emit('playerUpdate', state);
      ack({ ok: true, gameId: id, color: 'w', state });
      return;
    }

    if (!game.blackId) {
      game.blackId = socket.id;
      socket.join(id);
      socket.data.gameId = id;
      socket.data.color = 'b';
      maybeStartClocks(game);
      const state = publicState(game, id);
      io.to(id).emit('playerUpdate', state);
      ack({ ok: true, gameId: id, color: 'b', state });
      return;
    }

    socket.join(id);
    socket.data.gameId = id;
    socket.data.color = 'spectator';
    ack({
      ok: true,
      gameId: id,
      color: 'spectator',
      state: publicState(game, id),
      note: 'Both seats taken — you are spectating.',
    });
  });

  socket.on('makeMove', ({ from, to, promotion }, ack) => {
    const id = socket.data.gameId;
    const game = games.get(id);
    if (!game) {
      ack({ ok: false, error: 'No active game.' });
      return;
    }

    settleClocks(game);
    if (game.clocks.timedOut) {
      const state = publicState(game, id);
      io.to(id).emit('playerUpdate', state);
      ack({ ok: false, error: 'Game over on time.', state });
      return;
    }

    const color = socket.data.color;
    if (color !== 'w' && color !== 'b') {
      ack({ ok: false, error: 'Spectators cannot move.' });
      return;
    }
    if (game.chess.turn() !== color) {
      ack({ ok: false, error: 'Not your turn.' });
      return;
    }
    if (!game.whiteId || !game.blackId) {
      ack({ ok: false, error: 'Waiting for opponent to join.' });
      return;
    }

    let move;
    try {
      move = game.chess.move({ from, to, promotion: promotion || 'q' });
    } catch {
      move = null;
    }

    if (!move) {
      ack({ ok: false, error: 'Illegal move.' });
      return;
    }

    // Increment for the side that just moved
    if (color === 'w') game.clocks.whiteMs += game.clocks.incrementMs;
    else game.clocks.blackMs += game.clocks.incrementMs;

    if (!game.chess.isGameOver()) {
      game.clocks.lastTickAt = Date.now();
      game.clocks.clocksRunning = true;
    } else {
      game.clocks.clocksRunning = false;
    }

    const state = publicState(game, id);
    io.to(id).emit('moveMade', { move, state });
    ack({ ok: true, move, state });
  });

  socket.on('disconnect', () => {
    const id = socket.data.gameId;
    if (!id) return;
    const game = games.get(id);
    if (!game) return;

    if (game.whiteId === socket.id) game.whiteId = null;
    if (game.blackId === socket.id) game.blackId = null;

    // Pause clocks if a player leaves mid-game
    if (game.clocks.clocksRunning) {
      settleClocks(game);
      game.clocks.clocksRunning = false;
      game.clocks.lastTickAt = null;
    }

    io.to(id).emit('playerUpdate', publicState(game, id));
    removeIfEmpty(id);
    console.log('Disconnected:', socket.id);
  });
});

// Periodic timeout checks so both clients update even without moves
setInterval(() => {
  for (const [id, game] of games) {
    if (!game.clocks.clocksRunning || game.clocks.timedOut) continue;
    const before = game.clocks.timedOut;
    settleClocks(game);
    if (game.clocks.timedOut && game.clocks.timedOut !== before) {
      io.to(id).emit('playerUpdate', publicState(game, id));
    }
  }
}, 250);

server.listen(PORT, () => {
  console.log(`Chess server listening on port ${PORT}`);
  console.log(`Max concurrent online games: ${MAX_GAMES}`);
});
