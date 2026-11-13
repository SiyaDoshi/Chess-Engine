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
  server = spawn(process.execPath, ['server.js'], { cwd, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
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

  const watcher = await player();
  assert.equal((await call(watcher, 'joinGame', { gameId: created.gameId })).color, 'spectator');
  assert.equal((await call(watcher, 'makeMove', { from: 'e7', to: 'e5' })).ok, false, 'spectators cannot move');

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
