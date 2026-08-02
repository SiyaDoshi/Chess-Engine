/**
 * app.js — homepage vs game UI, clocks, themes, online play
 */

import { Chess } from '/lib/chess.js';

const TIME_PRESETS = {
  '1+0': { baseMs: 60_000, incrementMs: 0 },
  '3+0': { baseMs: 180_000, incrementMs: 0 },
  '5+0': { baseMs: 300_000, incrementMs: 0 },
  '10+0': { baseMs: 600_000, incrementMs: 0 },
  '3+2': { baseMs: 180_000, incrementMs: 2_000 },
  '5+3': { baseMs: 300_000, incrementMs: 3_000 },
};

const menuEl = document.getElementById('menu');
const gameEl = document.getElementById('game');
const boardEl = document.getElementById('board');
const previewEl = document.getElementById('preview-board');
const statusEl = document.getElementById('status');
const modeLabelEl = document.getElementById('mode-label');
const lobbyPanel = document.getElementById('lobby-panel');
const roomBadge = document.getElementById('room-badge');
const shareLinkEl = document.getElementById('share-link');
const roomCodeEl = document.getElementById('room-code');
const waitMsg = document.getElementById('wait-msg');
const youAreEl = document.getElementById('you-are');
const menuError = document.getElementById('menu-error');
const gameError = document.getElementById('game-error');
const playControls = document.getElementById('play-controls');
const clocksEl = document.getElementById('clocks');
const btnUndo = document.getElementById('btn-undo');
const btnReset = document.getElementById('btn-reset');
const btnCopy = document.getElementById('btn-copy');
const btnHome = document.getElementById('btn-home');
const themeSelect = document.getElementById('theme-select');
const bgSelect = document.getElementById('bg-select');
const timerSelect = document.getElementById('timer-select');
const timerField = document.getElementById('timer-field');
const timeWhiteEl = document.getElementById('time-white');
const timeBlackEl = document.getElementById('time-black');
const clockWhiteEl = document.getElementById('clock-white');
const clockBlackEl = document.getElementById('clock-black');

/** @type {'menu'|'local-pvp'|'local-ai'|'online'} */
let mode = 'menu';
/** @type {import('chess.js').Chess | null} */
let chess = null;
/** @type {'w'|'b'|'spectator'|null} */
let myColor = null;
let socket = null;
let onlineGameId = null;
let aiThinking = false;
let gameOver = false;

let whiteMs = TIME_PRESETS['5+0'].baseMs;
let blackMs = TIME_PRESETS['5+0'].baseMs;
let incrementMs = 0;
let clocksRunning = false;
let lastTickAt = null;
let timedOut = null;
/** @type {{ whiteMs: number, blackMs: number }[]} */
let clockHistory = [];

let onlineWhiteMs = whiteMs;
let onlineBlackMs = blackMs;
let onlineClocksRunning = false;
let onlineLastSyncAt = null;
let onlineTurn = 'w';

let previewBoard = null;
let previewChess = null;

const board = new ChessBoard(boardEl, { onMove: handleBoardMove });

// Board color theme (gameplay). App always opens on classic brown;
// homepage preview stays classic via CSS. User can change themes in-game.
themeSelect.value = 'classic';
document.body.dataset.theme = 'classic';
themeSelect.addEventListener('change', () => {
  document.body.dataset.theme = themeSelect.value;
  localStorage.setItem('chess-theme', themeSelect.value);
});

// Background theme (gameplay)
const savedBg = localStorage.getItem('chess-bg') || 'light';
bgSelect.value = savedBg;
document.body.dataset.bg = savedBg;
bgSelect.addEventListener('change', () => {
  document.body.dataset.bg = bgSelect.value;
  localStorage.setItem('chess-bg', bgSelect.value);
});

timerSelect.addEventListener('change', () => {
  const tc = timerSelect.value;
  if (mode === 'local-pvp' || mode === 'local-ai') {
    applyLocalPreset(tc, true);
    return;
  }
  if (mode === 'online' && myColor === 'w' && lobbyPanel && !lobbyPanel.hidden) {
    socket?.emit('setTimeControl', { timeControl: tc }, (res) => {
      if (!res?.ok) showError(gameError, res?.error || 'Could not update timer');
      else if (res.state) applyOnlineClocks(res.state);
    });
  }
});

document.querySelectorAll('[data-mode]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const m = btn.getAttribute('data-mode');
    if (m === 'local-pvp') startLocal('local-pvp');
    if (m === 'local-ai') startLocal('local-ai');
    if (m === 'online-create') createOnlineGame();
  });
});

btnHome.addEventListener('click', goHome);
btnUndo.addEventListener('click', undoLocal);
btnReset.addEventListener('click', resetLocal);
btnCopy.addEventListener('click', copyShareLink);

const pathMatch = window.location.pathname.match(/^\/g\/([a-z0-9]+)$/i);
if (pathMatch) {
  joinOnlineGame(pathMatch[1].toLowerCase());
} else {
  // Hard guarantee: landing page only — never show gameplay chrome
  showHome();
}

startClockLoop();

function setView(view) {
  document.body.classList.toggle('view-home', view === 'home');
  document.body.classList.toggle('view-game', view === 'game');
}

function showError(el, msg) {
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

function showGame() {
  stopHomePreview();
  setView('game');
  menuEl.hidden = true;
  gameEl.hidden = false;
}

function showHome() {
  mode = 'menu';
  setView('home');
  gameEl.hidden = true;
  menuEl.hidden = false;
  // Homepage preview always uses classic brown
  document.body.dataset.theme = 'classic';
  themeSelect.value = 'classic';
  // Never leave gameplay chrome visible on the landing page
  lobbyPanel.hidden = true;
  roomBadge.hidden = true;
  playControls.hidden = true;
  startHomePreview();
}

function formatTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function applyLocalPreset(tc, resetHistory) {
  const preset = TIME_PRESETS[tc] || TIME_PRESETS['5+0'];
  whiteMs = preset.baseMs;
  blackMs = preset.baseMs;
  incrementMs = preset.incrementMs;
  timedOut = null;
  gameOver = false;
  clocksRunning = true;
  lastTickAt = Date.now();
  if (resetHistory) clockHistory = [];
  renderClocks();
}

function settleLocalClocks(now = Date.now()) {
  if (!clocksRunning || timedOut || !lastTickAt || !chess) return;
  if (chess.isGameOver()) return;

  // Single Player: only human (White) clock; pause while waiting for reply
  if (mode === 'local-ai') {
    if (aiThinking || chess.turn() !== 'w') {
      lastTickAt = now;
      return;
    }
    const elapsed = Math.max(0, now - lastTickAt);
    whiteMs = Math.max(0, whiteMs - elapsed);
    lastTickAt = now;
    if (whiteMs <= 0) {
      timedOut = 'w';
      clocksRunning = false;
      gameOver = true;
      board.setInteractive(false);
      statusEl.textContent = 'Black wins on time';
      clockWhiteEl.classList.add('flagged');
    }
    return;
  }

  const elapsed = Math.max(0, now - lastTickAt);
  const turn = chess.turn();
  if (turn === 'w') {
    whiteMs = Math.max(0, whiteMs - elapsed);
    if (whiteMs <= 0) timedOut = 'w';
  } else {
    blackMs = Math.max(0, blackMs - elapsed);
    if (blackMs <= 0) timedOut = 'b';
  }
  lastTickAt = now;

  if (timedOut) {
    clocksRunning = false;
    gameOver = true;
    board.setInteractive(false);
    statusEl.textContent = timedOut === 'w' ? 'Black wins on time' : 'White wins on time';
    clockWhiteEl.classList.toggle('flagged', timedOut === 'w');
    clockBlackEl.classList.toggle('flagged', timedOut === 'b');
  }
}

function pushClockSnapshot() {
  clockHistory.push({ whiteMs, blackMs });
}

function renderClocks() {
  let w = whiteMs;
  let b = blackMs;
  let turn = chess ? chess.turn() : 'w';
  let running = clocksRunning;

  if (mode === 'online') {
    const now = Date.now();
    w = onlineWhiteMs;
    b = onlineBlackMs;
    turn = onlineTurn;
    running = onlineClocksRunning;
    if (running && onlineLastSyncAt && !timedOut) {
      const elapsed = Math.max(0, now - onlineLastSyncAt);
      if (turn === 'w') w = Math.max(0, w - elapsed);
      else b = Math.max(0, b - elapsed);
    }
  }

  timeWhiteEl.textContent = formatTime(w);
  timeBlackEl.textContent = formatTime(b);

  if (mode === 'local-ai') {
    clockWhiteEl.classList.toggle('active', running && turn === 'w' && !aiThinking && !gameOver);
    clockBlackEl.classList.remove('active');
    clockWhiteEl.classList.toggle('flagged', timedOut === 'w');
    clockBlackEl.classList.remove('flagged');
  } else {
    clockWhiteEl.classList.toggle('active', running && turn === 'w' && !gameOver);
    clockBlackEl.classList.toggle('active', running && turn === 'b' && !gameOver);
    clockWhiteEl.classList.toggle('flagged', timedOut === 'w');
    clockBlackEl.classList.toggle('flagged', timedOut === 'b');
  }
}

function startClockLoop() {
  const tick = () => {
    if (mode === 'local-pvp' || mode === 'local-ai') settleLocalClocks();
    if (mode !== 'menu') renderClocks();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function updateModeUI({ onlineLobby = false, onlinePlaying = false } = {}) {
  const local = mode === 'local-pvp' || mode === 'local-ai';
  const single = mode === 'local-ai';

  playControls.hidden = !local;
  lobbyPanel.hidden = !(mode === 'online' && onlineLobby);
  roomBadge.hidden = !(mode === 'online' && onlinePlaying);
  timerField.hidden = false;

  clocksEl.classList.toggle('single-clock', single);
  clockWhiteEl.querySelector('.clock-label').textContent = single ? 'You' : 'White';

  if (mode === 'online') {
    timerSelect.disabled = !(myColor === 'w' && onlineLobby);
  } else {
    timerSelect.disabled = false;
  }
}

function goHome() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  mode = 'menu';
  chess = null;
  myColor = null;
  onlineGameId = null;
  aiThinking = false;
  gameOver = false;
  timedOut = null;
  clocksRunning = false;
  lastTickAt = null;
  clockHistory = [];
  youAreEl.textContent = '';
  lobbyPanel.hidden = true;
  roomBadge.hidden = true;
  playControls.hidden = true;
  clocksEl.classList.remove('single-clock');
  showError(gameError, null);
  showError(menuError, null);
  if (window.location.pathname.startsWith('/g/')) {
    window.history.pushState({}, '', '/');
  }
  showHome();
}

function startHomePreview() {
  if (!previewEl) return;
  stopHomePreview();
  previewChess = new Chess();
  previewBoard = new ChessBoard(previewEl, { onMove: () => {} });
  previewBoard.setInteractive(false);
  previewBoard.setGame(previewChess);
  // Continuous CSS float + slow decorative demo moves (homepage only)
  previewBoard.startIdleAnimation(true);
}

function stopHomePreview() {
  if (previewBoard) {
    previewBoard.stopIdleAnimation();
    previewBoard = null;
  }
  previewChess = null;
}

function startLocal(selectedMode) {
  mode = selectedMode;
  chess = new Chess();
  myColor = 'w';
  gameOver = false;
  timedOut = null;
  aiThinking = false;
  board.setGame(chess);
  board.setOrientation('w');
  board.setInteractive(true);
  modeLabelEl.textContent = selectedMode === 'local-ai' ? 'Single Player' : 'Two Player';
  youAreEl.textContent = '';
  showError(gameError, null);
  lobbyPanel.hidden = true;
  roomBadge.hidden = true;
  applyLocalPreset(timerSelect.value, true);
  updateModeUI();
  updateStatus();
  showGame();
}

function restoreClockSnapshot() {
  const snap = clockHistory.pop();
  if (!snap) return;
  whiteMs = snap.whiteMs;
  blackMs = snap.blackMs;
}

function undoLocal() {
  if (mode !== 'local-pvp' && mode !== 'local-ai') return;
  if (!chess) return;

  const undone = chess.undo();
  if (!undone) return;
  restoreClockSnapshot();

  if (mode === 'local-ai') {
    if (chess.undo()) restoreClockSnapshot();
  }

  timedOut = null;
  gameOver = false;
  aiThinking = false;
  clocksRunning = true;
  lastTickAt = Date.now();
  board.setGame(chess);
  board.setInteractive(true);
  updateStatus();
  renderClocks();
}

function resetLocal() {
  if (mode !== 'local-pvp' && mode !== 'local-ai') return;
  chess.reset();
  aiThinking = false;
  board.setGame(chess);
  board.setInteractive(true);
  applyLocalPreset(timerSelect.value, true);
  updateStatus();
}

function updateStatus() {
  if (!chess) return;
  if (timedOut) {
    statusEl.textContent = timedOut === 'w' ? 'Black wins on time' : 'White wins on time';
    board.setInteractive(false);
    gameOver = true;
    return;
  }
  if (chess.isCheckmate()) {
    statusEl.textContent = chess.turn() === 'w' ? 'Black wins by checkmate' : 'White wins by checkmate';
    board.setInteractive(false);
    clocksRunning = false;
    gameOver = true;
    return;
  }
  if (chess.isDraw()) {
    statusEl.textContent = 'Draw';
    board.setInteractive(false);
    clocksRunning = false;
    gameOver = true;
    return;
  }

  if (mode === 'local-ai') {
    statusEl.textContent = (aiThinking || chess.turn() === 'b')
      ? 'Waiting…'
      : (chess.isCheck() ? 'Your turn (check)' : 'Your turn');
    return;
  }

  const side = chess.turn() === 'w' ? 'White' : 'Black';
  statusEl.textContent = chess.isCheck() ? `${side} to move (check)` : `${side} to move`;
}

async function handleBoardMove({ from, to }) {
  showError(gameError, null);
  if (gameOver) {
    board.render();
    return;
  }

  if (mode === 'local-pvp' || mode === 'local-ai') {
    settleLocalClocks();
    if (timedOut) {
      updateStatus();
      return;
    }

    pushClockSnapshot();
    const move = chess.move({ from, to, promotion: 'q' });
    if (!move) {
      clockHistory.pop();
      board.render();
      return;
    }

    if (move.color === 'w') whiteMs += incrementMs;
    else blackMs += incrementMs;
    lastTickAt = Date.now();

    board.setGame(chess);
    updateStatus();
    renderClocks();

    if (mode === 'local-ai' && !chess.isGameOver() && !timedOut) {
      await runAiTurn();
    }
    return;
  }

  if (mode === 'online') {
    if (myColor !== 'w' && myColor !== 'b') {
      showError(gameError, 'Spectators cannot move.');
      board.render();
      return;
    }
    if (chess.turn() !== myColor) {
      showError(gameError, 'Not your turn.');
      board.render();
      return;
    }
    socket.emit('makeMove', { from, to, promotion: 'q' }, (res) => {
      if (!res.ok) {
        showError(gameError, res.error);
        if (res.state) applyOnlineState(res.state);
        else board.setGame(chess);
        return;
      }
      chess.load(res.state.fen);
      board.setGame(chess);
      applyOnlineState(res.state);
    });
  }
}

function runAiTurn() {
  aiThinking = true;
  board.setInteractive(false);
  statusEl.textContent = 'Waiting…';
  lastTickAt = Date.now();
  renderClocks();

  return new Promise((resolve) => {
    setTimeout(() => {
      if (timedOut || chess.isGameOver()) {
        aiThinking = false;
        updateStatus();
        resolve();
        return;
      }
      const move = findAiMove(chess);
      if (move) {
        pushClockSnapshot();
        chess.move(move);
        if (move.color === 'b') blackMs += incrementMs;
        else whiteMs += incrementMs;
      }
      lastTickAt = Date.now();
      aiThinking = false;
      board.setGame(chess);
      updateStatus();
      renderClocks();
      if (!chess.isGameOver() && !timedOut) board.setInteractive(true);
      resolve();
    }, 350);
  });
}

function ensureSocket() {
  if (socket && socket.connected) return socket;
  socket = io();
  socket.on('moveMade', ({ state }) => {
    if (!chess) chess = new Chess();
    chess.load(state.fen);
    board.setGame(chess);
    applyOnlineState(state);
  });
  socket.on('playerUpdate', (state) => {
    applyOnlineState(state);
  });
  return socket;
}

function createOnlineGame() {
  showError(menuError, null);
  const s = ensureSocket();
  s.emit('createGame', { timeControl: timerSelect.value }, (res) => {
    if (!res.ok) {
      showError(menuError, res.error);
      return;
    }
    enterOnline(res.gameId, res.color, res.state);
    window.history.pushState({}, '', res.sharePath);
  });
}

function joinOnlineGame(gameId) {
  showError(menuError, null);
  const s = ensureSocket();
  s.emit('joinGame', { gameId }, (res) => {
    if (!res.ok) {
      showError(menuError, res.error);
      showHome();
      return;
    }
    enterOnline(res.gameId, res.color, res.state);
    if (res.note) showError(gameError, res.note);
  });
}

function enterOnline(gameId, color, state) {
  mode = 'online';
  onlineGameId = gameId;
  myColor = color;
  gameOver = false;
  timedOut = state.timedOut || null;
  chess = new Chess(state.fen);
  board.setGame(chess);
  board.setOrientation(color === 'b' ? 'b' : 'w');
  modeLabelEl.textContent = 'Online';

  if (state.timeControl) timerSelect.value = state.timeControl;

  shareLinkEl.textContent = `${window.location.origin}/g/${gameId}`;
  roomCodeEl.textContent = gameId.toUpperCase();
  roomBadge.textContent = `Room: ${gameId.toUpperCase()}`;

  if (color === 'w') youAreEl.textContent = 'You are White';
  else if (color === 'b') youAreEl.textContent = 'You are Black';
  else youAreEl.textContent = 'Spectating';

  waitMsg.textContent = 'Waiting for opponent…';
  playControls.hidden = true;
  applyOnlineState(state);
  showGame();
}

function applyOnlineClocks(state) {
  onlineWhiteMs = state.whiteMs ?? onlineWhiteMs;
  onlineBlackMs = state.blackMs ?? onlineBlackMs;
  onlineClocksRunning = !!state.clocksRunning;
  onlineTurn = state.turn || 'w';
  onlineLastSyncAt = Date.now();
  timedOut = state.timedOut || null;
  if (state.timeControl) timerSelect.value = state.timeControl;
  renderClocks();
}

function applyOnlineState(state) {
  if (!state) return;

  if (state.fen && chess && chess.fen() !== state.fen) {
    chess.load(state.fen);
    board.setGame(chess);
  }

  applyOnlineClocks(state);

  const both = state.whiteConnected && state.blackConnected;
  updateModeUI({ onlineLobby: !both, onlinePlaying: both });

  if (!both) {
    waitMsg.textContent = !state.blackConnected
      ? 'Waiting for opponent…'
      : 'Waiting for White to reconnect…';
  }

  if (state.timedOut) {
    gameOver = true;
    statusEl.textContent = state.timedOut === 'w' ? 'Black wins on time' : 'White wins on time';
    board.setInteractive(false);
    return;
  }

  if (state.isCheckmate) {
    gameOver = true;
    statusEl.textContent = state.turn === 'w' ? 'Black wins by checkmate' : 'White wins by checkmate';
    board.setInteractive(false);
  } else if (state.isDraw || (state.isGameOver && !state.timedOut)) {
    gameOver = true;
    statusEl.textContent = 'Draw';
    board.setInteractive(false);
  } else {
    gameOver = false;
    const side = state.turn === 'w' ? 'White' : 'Black';
    const yours = myColor === state.turn;
    statusEl.textContent = yours ? `Your turn (${side})` : `Opponent's turn (${side})`;
    const canMove = (myColor === 'w' || myColor === 'b') && myColor === state.turn && both;
    board.setInteractive(canMove);
  }
}

async function copyShareLink() {
  try {
    await navigator.clipboard.writeText(shareLinkEl.textContent);
    btnCopy.textContent = 'Copied!';
    setTimeout(() => { btnCopy.textContent = 'Copy link'; }, 1200);
  } catch {
    showError(gameError, 'Could not copy — select the link manually.');
  }
}
