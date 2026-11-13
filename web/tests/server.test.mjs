// Online play: rules enforced by the server, and robustness against bad input.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const PORT = 3199;
const BASE = `http://localhost:${PORT}`;
let server;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const connect = () =>
  new Promise((resolve) => {
    const s = io(BASE, { transports: ['websocket'], forceNew: true, reconnection: false });
    s.on('connect', () => resolve(s));
  });
const call = (s, event, payload) => new Promise((resolve) => s.emit(event, payload, resolve));
const alive = async () => {
  try {
    return (await fetch(BASE)).status === 200;
  } catch {
    return false;
  }
};
const sockets = [];
const player = async () => {
  const s = await connect();
  sockets.push(s);
  return s;
};

before(async () => {
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  server = spawn(process.execPath, ['server.js'], { cwd, env: { ...process.env, PORT: String(PORT), MAX_GAMES: '10', EMPTY_GAME_GRACE_MS: '1500' }, stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await alive()); i++) await sleep(100);
});

after(() => {
  for (const s of sockets) s.close();
  server.kill();
});

test('server: a full game follows the rules', async () => {
  const white = await player();
  const created = await call(white, 'createGame', { timeControl: '5+0' });
  assert.equal(created.color, 'w');
  assert.equal((await call(white, 'makeMove', { from: 'e2', to: 'e4' })).ok, false, 'no moves before Black joins');

  const black = await player();
  const joined = await call(black, 'joinGame', { gameId: created.gameId.toUpperCase() });
  assert.equal(joined.color, 'b');

  assert.equal((await call(black, 'makeMove', { from: 'e7', to: 'e5' })).ok, false, 'out of turn');
  assert.equal((await call(white, 'makeMove', { from: 'e2', to: 'e5' })).ok, false, 'illegal');
  const first = await call(white, 'makeMove', { from: 'e2', to: 'e4' });
  assert.ok(first.ok);
  assert.match(first.state.pgn, /e4/, 'state carries the move history');

  const stranger = await player();
  const refused = await call(stranger, 'joinGame', { gameId: created.gameId });
  assert.equal(refused.ok, false, 'a third person cannot join or watch');
  assert.equal(refused.full, true);
  assert.equal((await call(stranger, 'makeMove', { from: 'e7', to: 'e5' })).ok, false, 'and cannot move');

  await call(black, 'makeMove', { from: 'g7', to: 'g5' });
  await call(white, 'makeMove', { from: 'b1', to: 'c3' });
  await call(black, 'makeMove', { from: 'f7', to: 'f5' });
  const mate = await call(white, 'makeMove', { from: 'd1', to: 'h5' });
  assert.ok(mate.state.isCheckmate);
  assert.equal((await call(black, 'makeMove', { from: 'a7', to: 'a6' })).ok, false, 'no moves after mate');
});

test('server: unknown game codes are refused', async () => {
  const s = await player();
  const r = await call(s, 'joinGame', { gameId: 'zzzz' });
  assert.equal(r.ok, false);
});

test('server: malformed messages never crash it', async () => {
  const s = await player();
  s.emit('makeMove', null, () => {});
  s.emit('joinGame', null, () => {});
  s.emit('setTimeControl', null, () => {});
  s.emit('makeMove', { from: 'e2', to: 'e4' }); // no reply callback
  s.emit('joinGame', { gameId: { $gt: '' } }, () => {});
  s.emit('makeMove', { from: 'zz', to: 12, promotion: 'king' }, () => {});
  await sleep(500);
  assert.ok(await alive(), 'server still answers after bad input');
});

test('server: clocks start with White\'s first move, not when Black joins', async () => {
  const white = await player();
  const created = await call(white, 'createGame', { timeControl: '5+0' });
  const black = await player();
  const joined = await call(black, 'joinGame', { gameId: created.gameId });
  assert.equal(joined.state.clocksRunning, false, 'no clock before the first move');
  await sleep(300);
  const first = await call(white, 'makeMove', { from: 'e2', to: 'e4' });
  assert.equal(first.state.clocksRunning, true);
  assert.equal(first.state.whiteMs, 5 * 60 * 1000, "White's first move cost no time");
});

test('server: players can name themselves; names are cleaned and shared', async () => {
  const white = await player();
  const created = await call(white, 'createGame', { timeControl: '5+0' });
  const black = await player();
  await call(black, 'joinGame', { gameId: created.gameId });
  const seen = new Promise((resolve) => white.on('playerUpdate', (st) => st.blackName && resolve(st)));
  const named = await call(black, 'setName', { name: '  Siya   <b>Doshi</b>\u0007 and a very long tail ' });
  assert.equal(named.ok, true);
  assert.equal(named.name, 'Siya bDoshi/b and a', 'tags, control characters and extra length removed');
  assert.equal((await seen).blackName, named.name, 'the other player sees it');

  const stranger = await player();
  await call(stranger, 'joinGame', { gameId: created.gameId });
  assert.equal((await call(stranger, 'setName', { name: 'Stranger' })).ok, false, 'only the two players can set names');
  assert.equal((await call(white, 'setName', { name: 42 })).name, '', 'non-text names are ignored');
  white.emit('setName', null, () => {});
  white.emit('setName', { name: 'x' }); // no reply callback
  await sleep(200);
  assert.ok(await alive());
});

test('server: a player who reconnects or refreshes gets their own seat back', async () => {
  const white = await player();
  const created = await call(white, 'createGame', { timeControl: '5+0' });
  assert.match(created.token, /^[0-9a-f]{32}$/, 'the creator gets a private seat key');
  const black = await player();
  const joined = await call(black, 'joinGame', { gameId: created.gameId });
  await call(white, 'makeMove', { from: 'e2', to: 'e4' });

  // Black's connection drops; a new connection with the key takes the seat back
  black.close();
  await sleep(200);
  const black2 = await player();
  const back = await call(black2, 'joinGame', { gameId: created.gameId, token: joined.token });
  assert.equal(back.color, 'b');
  assert.equal(back.rejoined, true);
  assert.equal(back.state.blackConnected, true);
  assert.ok((await call(black2, 'makeMove', { from: 'e7', to: 'e5' })).ok, 'and can keep playing');

  // White refreshes while the old connection is still open: the new one replaces it
  const white2 = await player();
  const again = await call(white2, 'joinGame', { gameId: created.gameId, token: created.token });
  assert.equal(again.color, 'w');
  await sleep(200);
  assert.equal(white.connected, false, 'the old connection is closed');
  assert.ok((await call(white2, 'makeMove', { from: 'g1', to: 'f3' })).ok);
  assert.equal((await call(white2, 'makeMove', { from: 'a2', to: 'a3' })).ok, false, 'still one move at a time');

  // A wrong key doesn't steal a seat
  const thief = await player();
  const stolen = await call(thief, 'joinGame', { gameId: created.gameId, token: 'f'.repeat(32) });
  assert.equal(stolen.ok, false);

  // Both leave: the game waits a little for them, then is removed
  white2.close();
  black2.close();
  await sleep(300);
  const early = await player();
  assert.equal((await call(early, 'joinGame', { gameId: created.gameId, token: created.token })).color, 'w', 'kept for a short while');
  early.close();
  await sleep(1900);
  const late = await player();
  assert.equal((await call(late, 'joinGame', { gameId: created.gameId, token: created.token })).ok, false, 'removed after the grace period');
});

test('server: a backup seat key only works while that seat is empty', async () => {
  const white = await player();
  const created = await call(white, 'createGame', { timeControl: '5+0' });
  // A second tab in the same browser has the backup key but White is still connected: it joins as Black
  const tab2 = await player();
  const joined = await call(tab2, 'joinGame', { gameId: created.gameId, backupToken: created.token });
  assert.equal(joined.color, 'b');
  // White closes their tab and opens the link again later: the backup key brings them back
  white.close();
  await sleep(200);
  const reopened = await player();
  assert.equal((await call(reopened, 'joinGame', { gameId: created.gameId, backupToken: created.token })).color, 'w');
});

test('server: a game survives a server restart, restored from a player\'s copy', async () => {
  const port = 3198;
  const base = `http://localhost:${port}`;
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const start = () => spawn(process.execPath, ['server.js'], { cwd, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  const up = async () => {
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(base)).status === 200) return; } catch { /* starting */ }
      await sleep(100);
    }
  };
  const join = () => new Promise((resolve) => {
    const s = io(base, { transports: ['websocket'], forceNew: true, reconnection: false });
    s.on('connect', () => resolve(s));
  });
  let srv = start();
  await up();
  const open = [];
  try {
    const white = await join(); open.push(white);
    const created = await call(white, 'createGame', { timeControl: '5+0' });
    const black = await join(); open.push(black);
    const joined = await call(black, 'joinGame', { gameId: created.gameId });
    await call(black, 'setName', { name: 'Rohan' });
    await call(white, 'makeMove', { from: 'e2', to: 'e4' });
    const last = await call(black, 'makeMove', { from: 'e7', to: 'e5' });
    const snapshot = { ...last.state, pgn: last.state.pgn };
    assert.ok(snapshot.seatHashes.w && snapshot.seatHashes.b, 'both seat hashes are shared');

    // The server restarts and loses every game
    srv.kill();
    await sleep(300);
    srv = start();
    await up();

    const black2 = await join(); open.push(black2);
    const gone = await call(black2, 'joinGame', { gameId: created.gameId, token: joined.token });
    assert.equal(gone.ok, false, 'the new server has never heard of the game');
    const back = await call(black2, 'restoreGame', { gameId: created.gameId, token: joined.token, snapshot });
    assert.equal(back.ok, true);
    assert.equal(back.color, 'b');
    assert.equal(back.state.pgn, snapshot.pgn, 'same moves');
    assert.equal(back.state.blackName, 'Rohan', 'same names');

    const white2 = await join(); open.push(white2);
    const whiteBack = await call(white2, 'joinGame', { gameId: created.gameId, token: created.token });
    assert.equal(whiteBack.color, 'w', 'White gets their seat back with their own key');
    assert.ok((await call(white2, 'makeMove', { from: 'g1', to: 'f3' })).ok, 'and the game goes on');

    const stranger = await join(); open.push(stranger);
    assert.equal((await call(stranger, 'joinGame', { gameId: created.gameId })).full, true, 'still private');
    const again = await call(stranger, 'restoreGame', { gameId: created.gameId, token: 'x', snapshot });
    assert.equal(again.ok, false, 'a game that exists cannot be restored over');
    const forged = await call(stranger, 'restoreGame', { gameId: 'zzzz', token: 'not-a-seat-key', snapshot });
    assert.equal(forged.ok, false, 'a key that matches no seat restores nothing');
    const badMoves = await call(stranger, 'restoreGame', {
      gameId: 'yyyy', token: joined.token, snapshot: { ...snapshot, pgn: '1. e4 e5 2. Ke3 Ke6' },
    });
    assert.equal(badMoves.ok, false, 'illegal moves in the copy are rejected');
  } finally {
    for (const s of open) s.close();
    srv.kill();
  }
});
