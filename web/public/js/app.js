/**
 * app.js — homepage vs game UI, clocks, themes, online play
 */

import { Chess } from '/lib/chess.js';
import { EngineClient } from '/js/engine/client.js';
import { DEFAULT_LEVEL } from '/js/engine/levels.js';
import { MATE } from '/js/engine/search.js';
import { playMoveSound, setSoundEnabled } from '/js/sound.js';

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
const waitText = document.getElementById('wait-text');
const youAreEl = document.getElementById('you-are');
const menuError = document.getElementById('menu-error');
const gameError = document.getElementById('game-error');
const playControls = document.getElementById('play-controls');
const clocksEl = document.getElementById('game');
const boardAreaEl = document.querySelector('.board-area');
const btnUndo = document.getElementById('btn-undo');
const btnReset = document.getElementById('btn-reset');
const btnCopy = document.getElementById('btn-copy');
const btnHome = document.getElementById('btn-home');
const themeSelect = document.getElementById('theme-select');
const bgSelect = document.getElementById('bg-select');
const pieceSelect = document.getElementById('piece-select');
const timerSelect = document.getElementById('timer-select');
const timerField = document.getElementById('timer-field');
const levelField = document.getElementById('level-field');
const colorField = document.getElementById('color-field');
const colorSelect = document.getElementById('color-select');
const settingsBtn = document.getElementById('btn-settings');
const engineCard = document.getElementById('engine-card');
const moveListEl = document.getElementById('move-list');
const gameOverEl = document.getElementById('game-over');
const gameOverTitleEl = document.getElementById('game-over-title');
const gameOverDetailEl = document.getElementById('game-over-detail');
const playAgainBtn = document.getElementById('btn-play-again');
const promotionEl = document.getElementById('promotion');
const promotionChoicesEl = promotionEl.querySelector('.promotion-choices');
const capturedByWhiteEl = document.getElementById('captured-by-white');
const capturedByBlackEl = document.getElementById('captured-by-black');
const moveListEmptyEl = document.getElementById('move-list-empty');
const evalBarEl = document.getElementById('eval-bar');
const engineEvalEl = document.getElementById('engine-eval');
const engineDepthEl = document.getElementById('engine-depth');
const engineNodesEl = document.getElementById('engine-nodes');
const engineTimeEl = document.getElementById('engine-time');
const engineLineEl = document.getElementById('engine-line');
const settingsMenu = document.getElementById('settings-menu');
const levelSelect = document.getElementById('level-select');
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
/** Bumped whenever a pending engine reply should be ignored (undo, reset, home). */
let aiToken = 0;
let engineLevel = ['easy', 'medium', 'hard'].includes(localStorage.getItem('chess-level'))
  ? localStorage.getItem('chess-level')
  : DEFAULT_LEVEL;
const engine = new EngineClient();
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

// Home page self-play (see startHomePreview)
const OPENING_MOVES = {
  first: ['e4', 'd4', 'c4', 'Nf3'],
  reply: { e4: ['e5', 'c5', 'e6', 'c6'], d4: ['d5', 'Nf6', 'e6'], c4: ['e5', 'Nf6', 'c5'], Nf3: ['d5', 'Nf6', 'c5'] },
};
const PREVIEW_MOVE_MS = 1100;
const PREVIEW_RESTART_MS = 3000;
const PREVIEW_MAX_PLIES = 80;
const previewEngine = new EngineClient();
let previewTimer = null;
let previewRun = 0; // bumped on stop, so stale engine replies are ignored

const pick = (list) => list[Math.floor(Math.random() * list.length)];

const board = new ChessBoard(boardEl, {
  onMove: handleBoardMove,
  onRender: (game) => {
    // Any live update (a new move, undo, reset) ends move review.
    if (game === chess && reviewPly !== null) {
      reviewPly = null;
      if (reviewSavedInteractive !== null) board.setInteractive(reviewSavedInteractive);
      reviewSavedInteractive = null;
    }
    renderMoveList(chess ?? game);
    renderCaptured(game);
    if (game === chess) soundForNewMove(game);
  },
});

// Sound for each new move in the live game (not when undoing or reviewing)
let soundedPly = 0;
function soundForNewMove(game) {
  const history = game.history({ verbose: true });
  if (history.length === soundedPly + 1) {
    playMoveSound(history[history.length - 1], { gameOver: game.isGameOver() });
  }
  soundedPly = history.length;
}

/*
 * Move review: Left/Right arrows (or clicking a move) step through the
 * game without changing it. The board is read-only until you return to
 * the latest move.
 */
let reviewPly = null; // null = showing the live position
let reviewSavedInteractive = null;

function showPly(ply) {
  if (!chess || mode === 'menu') return;
  const history = chess.history({ verbose: true });
  const target = Math.max(0, Math.min(ply, history.length));
  if (target === history.length) {
    board.setGame(chess); // back to live; onRender restores interactivity
    return;
  }
  if (reviewPly === null) reviewSavedInteractive = board.interactive;
  const replay = new Chess();
  for (let i = 0; i < target; i++) replay.move(history[i]);
  board.setGame(replay);
  reviewPly = target;
  board.setInteractive(false);
  renderMoveList(chess);
}

document.addEventListener('keydown', (e) => {
  if (mode === 'menu' || !chess) return;
  if (e.target.closest('select, input, textarea')) return;
  const live = chess.history().length;
  const current = reviewPly ?? live;
  if (e.key === 'ArrowLeft') showPly(current - 1);
  else if (e.key === 'ArrowRight') showPly(current + 1);
  else if (e.key === 'Home') showPly(0);
  else if (e.key === 'End') showPly(live);
  else return;
  e.preventDefault();
});

// Board colors (the homepage preview always uses classic brown via CSS).
const savedTheme = localStorage.getItem('chess-theme') || 'classic';
themeSelect.value = savedTheme;
document.body.dataset.theme = themeSelect.value || 'classic';
themeSelect.addEventListener('change', () => {
  document.body.dataset.theme = themeSelect.value;
  localStorage.setItem('chess-theme', themeSelect.value);
});

// Sound on/off
const soundToggle = document.getElementById('sound-toggle');
soundToggle.checked = localStorage.getItem('chess-sound') !== 'off';
setSoundEnabled(soundToggle.checked);
soundToggle.addEventListener('change', () => {
  setSoundEnabled(soundToggle.checked);
  localStorage.setItem('chess-sound', soundToggle.checked ? 'on' : 'off');
});

// Piece set (Kosal by default)
const savedPieces = localStorage.getItem('chess-pieces') || 'kosal';
pieceSelect.value = savedPieces;
window.setPieceSet(savedPieces);
pieceSelect.addEventListener('change', () => {
  window.setPieceSet(pieceSelect.value);
  localStorage.setItem('chess-pieces', pieceSelect.value);
  board.render();
});

// Background theme (gameplay)
const savedBg = localStorage.getItem('chess-bg') || 'dark';
bgSelect.value = savedBg;
document.body.dataset.bg = savedBg;
bgSelect.addEventListener('change', () => {
  document.body.dataset.bg = bgSelect.value;
  localStorage.setItem('chess-bg', bgSelect.value);
});

moveListEl.addEventListener('click', (e) => {
  const ply = e.target.closest('.move-san')?.dataset.ply;
  if (ply) showPly(Number(ply));
});

function setSettingsOpen(open) {
  settingsMenu.hidden = !open;
  settingsBtn.setAttribute('aria-expanded', String(open));
}
settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  setSettingsOpen(settingsMenu.hidden);
});
document.addEventListener('click', (e) => {
  if (!settingsMenu.hidden && !settingsMenu.contains(e.target)) setSettingsOpen(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setSettingsOpen(false);
});

levelSelect.value = engineLevel;
levelSelect.addEventListener('change', () => {
  // Takes effect from the engine's next move.
  engineLevel = levelSelect.value;
  localStorage.setItem('chess-level', engineLevel);
});

// Which side the player takes against the engine
let playerColor = localStorage.getItem('chess-color') === 'b' ? 'b' : 'w';
colorSelect.value = playerColor;
colorSelect.addEventListener('change', () => {
  playerColor = colorSelect.value;
  localStorage.setItem('chess-color', playerColor);
  if (mode === 'local-ai') resetLocal(); // switching sides starts a new game
});

// Hint: a separate engine worker so it never interferes with the engine's own move
const hintEngine = new EngineClient();
const hintBtn = document.getElementById('btn-hint');
hintBtn.addEventListener('click', async () => {
  if (mode !== 'local-ai' || gameOver || aiThinking || reviewPly !== null) return;
  if (chess.turn() !== myColor) return;
  const fen = chess.fen();
  hintBtn.disabled = true;
  hintBtn.textContent = 'Thinking…';
  try {
    const result = await hintEngine.think(fen, 'hard', 1200, movesOf(chess));
    if (result.move && chess.fen() === fen) {
      board.showHint(result.move.from, result.move.to);
      const san = new Chess(fen).move(result.move).san;
      statusEl.textContent = `Hint: ${san}`;
    }
  } catch {
    // ignore: the game moved on
  } finally {
    hintBtn.disabled = false;
    hintBtn.textContent = 'Hint';
  }
});

document.getElementById('btn-flip').addEventListener('click', () => {
  setBoardOrientation(board.orientation === 'w' ? 'b' : 'w');
});

const savedTimer = localStorage.getItem('chess-timer');
if (savedTimer && TIME_PRESETS[savedTimer]) timerSelect.value = savedTimer;

timerSelect.addEventListener('change', () => {
  const tc = timerSelect.value;
  localStorage.setItem('chess-timer', tc);
  if (mode === 'local-pvp' || mode === 'local-ai') {
    // A new time control mid-game would refill both clocks, so it starts a new game.
    if (chess && chess.history().length > 0) resetLocal();
    else applyLocalPreset(tc, true);
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
    document.getElementById('link-notice').hidden = true;
  });
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
playAgainBtn.addEventListener('click', resetLocal);
document.getElementById('btn-view-board').addEventListener('click', () => {
  gameOverEl.hidden = true;
});
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
  // Like on chess sites, no clock runs until White's first move.
  clocksRunning = !!chess && chess.history().length > 0;
  lastTickAt = Date.now();
  if (resetHistory) clockHistory = [];
  renderClocks();
}

/** Start the clocks with the game's first move (it starts the opponent's clock). */
function startClocksIfFirstMove() {
  if (clocksRunning || gameOver || timedOut) return;
  clocksRunning = true;
  lastTickAt = Date.now();
}

function settleLocalClocks(now = Date.now()) {
  if (!clocksRunning || timedOut || !lastTickAt || !chess) return;
  if (chess.isGameOver()) return;

  // Both sides' clocks run, including the engine's while it thinks.
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
    showResult(timedOut === 'w' ? 'b' : 'w', 'time');
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

  clockWhiteEl.classList.toggle('active', running && turn === 'w' && !gameOver);
  clockBlackEl.classList.toggle('active', running && turn === 'b' && !gameOver);
  clockWhiteEl.classList.toggle('flagged', timedOut === 'w');
  clockBlackEl.classList.toggle('flagged', timedOut === 'b');

  // Pulsing dots next to the engine's name while it searches
  const thinkingSide = mode === 'local-ai' && aiThinking ? (myColor === 'w' ? 'b' : 'w') : null;
  clockWhiteEl.querySelector('.thinking').hidden = thinkingSide !== 'w';
  clockBlackEl.querySelector('.thinking').hidden = thinkingSide !== 'b';
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
  levelField.hidden = !single;
  engineCard.hidden = !single;
  evalBarEl.hidden = !single;

  clocksEl.classList.toggle('single-clock', single);
  const label = (color, fallback) => (single ? (color === myColor ? 'You' : 'Engine') : fallback);
  clockWhiteEl.querySelector('.clock-label').textContent = label('w', 'White');
  clockBlackEl.querySelector('.clock-label').textContent = label('b', 'Black');
  colorField.hidden = !single;
  hintBtn.hidden = !single;

  if (mode === 'online') {
    timerSelect.disabled = !(myColor === 'w' && onlineLobby);
  } else {
    timerSelect.disabled = false;
  }
}

/** Move list in pairs: 1. e4 e5  2. Nf3 Nc6 ... with the latest move marked. */
function renderMoveList(game) {
  const sans = game.history();
  const items = [];
  for (let i = 0; i < sans.length; i += 2) {
    const li = document.createElement('li');
    const num = document.createElement('span');
    num.className = 'move-num';
    num.textContent = `${i / 2 + 1}.`;
    li.appendChild(num);
    for (const j of [i, i + 1]) {
      const span = document.createElement('span');
      span.className = 'move-san';
      span.textContent = sans[j] ?? '';
      if (sans[j]) span.dataset.ply = String(j + 1); // position after this move
      if (j === sans.length - 1) span.classList.add('latest');
      if (reviewPly !== null && j === reviewPly - 1) span.classList.add('viewing');
      li.appendChild(span);
    }
    items.push(li);
  }
  moveListEl.replaceChildren(...items);
  moveListEl.classList.toggle('reviewing', reviewPly !== null);
  moveListEmptyEl.hidden = sans.length > 0;
  moveListEl.scrollTop = moveListEl.scrollHeight;
}

const START_COUNT = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const POINTS = { p: 1, n: 3, b: 3, r: 5, q: 9 };

/**
 * Captured pieces next to each player, plus "+N" for whoever is ahead in
 * material (pawn 1, knight/bishop 3, rook 5, queen 9).
 */
function renderCaptured(game) {
  const count = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  let material = 0; // White minus Black
  for (const row of game.board()) {
    for (const p of row) {
      if (!p || p.type === 'k') continue;
      count[p.color][p.type]++;
      material += (p.color === 'w' ? 1 : -1) * POINTS[p.type];
    }
  }
  const fill = (el, victimColor, lead) => {
    const imgs = [];
    for (const type of ['q', 'r', 'b', 'n', 'p']) {
      const missing = Math.max(0, START_COUNT[type] - count[victimColor][type]);
      for (let i = 0; i < missing; i++) {
        const img = document.createElement('img');
        img.src = window.pieceUrl(victimColor + type.toUpperCase());
        img.alt = '';
        imgs.push(img);
      }
    }
    if (lead > 0) {
      const adv = document.createElement('span');
      adv.className = 'material-lead';
      adv.textContent = `+${lead}`;
      imgs.push(adv);
    }
    el.replaceChildren(...imgs);
  };
  fill(capturedByWhiteEl, 'b', material);
  fill(capturedByBlackEl, 'w', -material);
}

let resultShown = false;

/**
 * Game-over card over the board. winner is 'w', 'b' or null for a draw;
 * reason is 'checkmate', 'time', or a draw reason.
 */
function showResult(winner, reason) {
  if (resultShown) return;
  resultShown = true;

  const titles = {
    checkmate: 'Checkmate',
    time: "Time's up",
    stalemate: 'Stalemate',
    repetition: 'Draw by repetition',
    material: 'Draw: not enough material',
    fifty: 'Draw: 50-move rule',
    draw: 'Draw',
  };
  gameOverTitleEl.textContent = titles[reason] || 'Game over';

  const moves = chess ? Math.ceil(chess.history().length / 2) : 0;
  const inMoves = moves ? ` in ${moves} move${moves === 1 ? '' : 's'}` : '';
  const name = (c) => (c === 'w' ? 'White' : 'Black');
  let detail;
  if (!winner) detail = 'Nobody wins this one.';
  else if (mode === 'local-ai') detail = winner === myColor ? `You beat the engine${inMoves}.` : `The engine wins${inMoves}.`;
  else if (mode === 'online') detail = winner === myColor ? `You win${inMoves}.` : `${name(winner)} wins${inMoves}.`;
  else detail = `${name(winner)} wins${inMoves}.`;
  gameOverDetailEl.textContent = detail;

  playAgainBtn.hidden = mode === 'online';
  gameOverEl.hidden = false;
}

function hideResult() {
  resultShown = false;
  gameOverEl.hidden = true;
}

function drawReason(game) {
  if (game.isStalemate()) return 'stalemate';
  if (game.isThreefoldRepetition()) return 'repetition';
  if (game.isInsufficientMaterial()) return 'material';
  return 'fifty';
}

/** Bring the local copy of an online game up to date, keeping its move history. */
function syncOnlineGame(state) {
  if (state.pgn !== undefined) {
    try {
      chess.loadPgn(state.pgn);
      if (chess.fen() === state.fen) return;
    } catch {
      // fall through to the position-only update
    }
  }
  chess.load(state.fen);
}

/** The game's moves as plain objects, for the engine worker. */
function movesOf(game) {
  return game.history({ verbose: true }).map(({ from, to, promotion }) => ({ from, to, promotion }));
}

/** Engine score (centipawns, White's view) as "+0.4", "-1.2" or "M3". */
function formatScore(score) {
  if (Math.abs(score) > MATE - 1000) {
    const movesToMate = Math.ceil((MATE - Math.abs(score)) / 2);
    return `${score > 0 ? '' : '-'}M${movesToMate}`;
  }
  const pawns = score / 100;
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
}

/**
 * Eval bar: White's share of the bar. Squashed with a logistic curve so a
 * pawn or two is clearly visible but the bar only fills up for big leads.
 */
function setEvalBar(score) {
  let white;
  if (Math.abs(score) > MATE - 1000) white = score > 0 ? 100 : 0;
  else white = 100 / (1 + Math.exp(-score / 250));
  evalBarEl.style.setProperty('--white', `${white.toFixed(1)}%`);
  evalBarEl.setAttribute('aria-label', `Evaluation ${formatScore(score)}`);
  // The number sits at the end of whoever is ahead, like on chess sites
  const label = evalBarEl.querySelector('.eval-label');
  label.textContent = formatScore(score).replace('+', '').replace('-', '');
  evalBarEl.classList.toggle('black-ahead', score < 0);
}

/** Show what the engine found: evaluation, depth, work done and its plan. */
function showEngineInfo(result, fenBefore) {
  setEvalBar(result ? result.score : 0);
  if (!result) {
    engineEvalEl.textContent = '0.0';
    engineDepthEl.textContent = '–';
    engineNodesEl.textContent = '–';
    engineTimeEl.textContent = '–';
    engineLineEl.textContent = '–';
    return;
  }
  engineEvalEl.textContent = formatScore(result.score);
  engineDepthEl.textContent = String(result.depth);
  engineNodesEl.textContent = result.nodes.toLocaleString('en-US');
  engineTimeEl.textContent = `${(result.timeMs / 1000).toFixed(2)}s`;

  if (result.mistake) {
    engineLineEl.textContent = 'Played a looser move on purpose (Easy)';
    return;
  }
  const replay = new Chess(fenBefore);
  const san = [];
  for (const move of result.line) {
    try {
      san.push(replay.move(move).san);
    } catch {
      break;
    }
  }
  engineLineEl.textContent = san.join(' ') || '–';
}

/** Flip the board and keep the player at the bottom, the opponent on top. */
function setBoardOrientation(color) {
  board.setOrientation(color);
  boardAreaEl.classList.toggle('flipped', color === 'b');
}

function cancelEngine() {
  if (!aiThinking) return;
  aiToken++;
  engine.cancel();
  aiThinking = false;
}

function goHome() {
  document.getElementById('link-notice').hidden = true;
  cancelEngine();
  hideResult();
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

/*
 * Home page: the engine plays itself on the preview board. The first two
 * moves are picked at random from common openings so every visit shows a
 * different game; after that both sides use the engine (Medium, 0.25s).
 */

function startHomePreview() {
  if (!previewEl) return;
  stopHomePreview();
  const run = ++previewRun;
  previewChess = new Chess();
  previewBoard = new ChessBoard(previewEl, { onMove: () => {} });
  previewBoard.setInteractive(false);
  previewBoard.setGame(previewChess);
  previewEl.classList.add('preview-board');

  const step = async () => {
    if (run !== previewRun) return;
    const game = previewChess;
    if (game.isGameOver() || game.history().length >= PREVIEW_MAX_PLIES) {
      previewTimer = setTimeout(() => {
        if (run !== previewRun) return;
        game.reset();
        previewBoard.setGame(game);
        previewTimer = setTimeout(step, PREVIEW_MOVE_MS);
      }, PREVIEW_RESTART_MS);
      return;
    }

    const ply = game.history().length;
    if (ply === 0) game.move(pick(OPENING_MOVES.first));
    else if (ply === 1) game.move(pick(OPENING_MOVES.reply[game.history()[0]]));
    else {
      let result;
      try {
        result = await previewEngine.think(game.fen(), 'medium', 250, movesOf(game));
      } catch {
        return; // stopped
      }
      if (run !== previewRun || !result.move) return;
      game.move(result.move);
    }
    previewBoard.render();
    previewTimer = setTimeout(step, PREVIEW_MOVE_MS);
  };
  previewTimer = setTimeout(step, 900);
}

function stopHomePreview() {
  previewRun++;
  clearTimeout(previewTimer);
  previewEngine.cancel();
  previewBoard = null;
  previewChess = null;
}

function startLocal(selectedMode) {
  mode = selectedMode;
  hideResult();
  showEngineInfo(null);
  chess = new Chess();
  myColor = selectedMode === 'local-ai' ? playerColor : 'w';
  gameOver = false;
  timedOut = null;
  aiThinking = false;
  board.setGame(chess);
  setBoardOrientation(myColor);
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
  startEngineIfItsTurn();
}

/** Against the engine as Black, the engine opens; after undo it may be its move. */
function startEngineIfItsTurn() {
  if (mode === 'local-ai' && !gameOver && !aiThinking && chess.turn() !== myColor) runAiTurn();
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

  // Playing Black, the engine's opening move alone can't be taken back.
  if (mode === 'local-ai' && myColor === 'b' && chess.history().length <= 1) return;

  // If the engine is still thinking, only the player's last move needs undoing.
  const engineWasThinking = aiThinking;
  cancelEngine();
  hideResult();

  const undone = chess.undo();
  if (!undone) return;
  restoreClockSnapshot();

  if (mode === 'local-ai' && !engineWasThinking) {
    if (chess.undo()) restoreClockSnapshot();
  }

  timedOut = null;
  gameOver = false;
  aiThinking = false;
  clocksRunning = chess.history().length > 0; // undoing back to the start stops the clocks
  lastTickAt = Date.now();
  board.setGame(chess);
  board.setInteractive(true);
  updateStatus();
  renderClocks();
  startEngineIfItsTurn();
}

function resetLocal() {
  if (mode !== 'local-pvp' && mode !== 'local-ai') return;
  cancelEngine();
  hideResult();
  showEngineInfo(null);
  chess.reset();
  aiThinking = false;
  gameOver = false;
  timedOut = null;
  if (mode === 'local-ai') {
    myColor = playerColor;
    setBoardOrientation(myColor);
    updateModeUI();
  }
  board.setGame(chess);
  board.setInteractive(true);
  applyLocalPreset(timerSelect.value, true);
  updateStatus();
  startEngineIfItsTurn();
}

function updateStatus() {
  if (!chess) return;
  if (timedOut) {
    statusEl.textContent = timedOut === 'w' ? 'Black wins on time' : 'White wins on time';
    board.setInteractive(false);
    gameOver = true;
    showResult(timedOut === 'w' ? 'b' : 'w', 'time');
    return;
  }
  if (chess.isCheckmate()) {
    statusEl.textContent = chess.turn() === 'w' ? 'Black wins by checkmate' : 'White wins by checkmate';
    board.setInteractive(false);
    clocksRunning = false;
    gameOver = true;
    showResult(chess.turn() === 'w' ? 'b' : 'w', 'checkmate');
    return;
  }
  if (chess.isDraw()) {
    statusEl.textContent = 'Draw';
    board.setInteractive(false);
    clocksRunning = false;
    gameOver = true;
    showResult(null, drawReason(chess));
    return;
  }

  if (mode === 'local-ai') {
    statusEl.textContent = (aiThinking || chess.turn() !== myColor)
      ? 'Waiting…'
      : (chess.isCheck() ? 'Your turn (check)' : 'Your turn');
    return;
  }

  const side = chess.turn() === 'w' ? 'White' : 'Black';
  statusEl.textContent = chess.isCheck() ? `${side} to move (check)` : `${side} to move`;
}

/** True if moving from -> to is a pawn reaching the last rank. */
function isPromotion(from, to) {
  return chess.moves({ square: from, verbose: true }).some((m) => m.to === to && m.promotion);
}

/**
 * Ask which piece to promote to. Resolves with 'q', 'r', 'b' or 'n', or
 * null if the player cancels (Escape or clicking outside the box).
 */
function choosePromotion(color) {
  return new Promise((resolve) => {
    const finish = (piece) => {
      promotionEl.hidden = true;
      promotionEl.onclick = null;
      document.removeEventListener('keydown', onKey);
      resolve(piece);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') finish(null);
    };
    const buttons = ['q', 'r', 'b', 'n'].map((type) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'promotion-choice';
      btn.setAttribute('aria-label', { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[type]);
      const img = document.createElement('img');
      img.src = window.pieceUrl(color + type.toUpperCase());
      img.alt = '';
      btn.appendChild(img);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        finish(type);
      });
      return btn;
    });
    promotionChoicesEl.replaceChildren(...buttons);
    promotionEl.onclick = () => finish(null);
    document.addEventListener('keydown', onKey);
    promotionEl.hidden = false;
    buttons[0].focus();
  });
}

async function handleBoardMove({ from, to }) {
  showError(gameError, null);
  if (gameOver) {
    board.render();
    return;
  }

  let promotion;
  if (isPromotion(from, to)) {
    promotion = await choosePromotion(chess.turn());
    if (!promotion) {
      board.render();
      return;
    }
  }

  if (mode === 'local-pvp' || mode === 'local-ai') {
    settleLocalClocks();
    if (timedOut) {
      updateStatus();
      return;
    }

    pushClockSnapshot();
    const move = chess.move({ from, to, promotion });
    if (!move) {
      clockHistory.pop();
      board.render();
      return;
    }
    startClocksIfFirstMove();

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
    socket.emit('makeMove', { from, to, promotion }, (res) => {
      if (!res.ok) {
        showError(gameError, res.error);
        if (res.state) applyOnlineState(res.state);
        else board.setGame(chess);
        return;
      }
      syncOnlineGame(res.state);
      board.setGame(chess);
      applyOnlineState(res.state);
    });
  }
}

const MIN_ENGINE_DELAY_MS = 350; // instant replies feel jarring

async function runAiTurn() {
  aiThinking = true;
  const token = ++aiToken;
  board.setInteractive(false);
  statusEl.textContent = 'Engine is thinking…';
  lastTickAt = Date.now();
  renderClocks();

  const startedAt = Date.now();
  const fenBefore = chess.fen();
  let result;
  try {
    // Never spend more than ~1/30 of the remaining time on one move.
    const engineMs = myColor === 'w' ? blackMs : whiteMs;
    const budgetMs = Math.max(100, Math.floor(engineMs / 30));
    result = await engine.think(fenBefore, engineLevel, budgetMs, movesOf(chess));
  } catch {
    return; // cancelled by undo, reset or leaving the game
  }
  const wait = MIN_ENGINE_DELAY_MS - (Date.now() - startedAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  if (token !== aiToken || mode !== 'local-ai') return;

  aiThinking = false;
  if (timedOut || chess.isGameOver()) {
    updateStatus();
    return;
  }
  showEngineInfo(result, fenBefore);
  if (result.move) {
    pushClockSnapshot();
    const move = chess.move(result.move);
    startClocksIfFirstMove();
    if (move.color === 'b') blackMs += incrementMs;
    else whiteMs += incrementMs;
  }
  lastTickAt = Date.now();
  board.setGame(chess);
  updateStatus();
  renderClocks();
  if (!chess.isGameOver() && !timedOut) board.setInteractive(true);
}

function ensureSocket() {
  if (socket && socket.connected) return socket;
  socket = io();
  socket.on('moveMade', ({ state }) => {
    if (!chess) chess = new Chess();
    syncOnlineGame(state);
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
      // Dead or mistyped link: explain it on the home page and drop /g/... from the URL
      document.getElementById('link-notice').hidden = false;
      window.history.replaceState({}, '', '/');
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
  chess = new Chess();
  syncOnlineGame(state); // keeps the move list when rejoining a game in progress
  board.setGame(chess);
  setBoardOrientation(color === 'b' ? 'b' : 'w');
  modeLabelEl.textContent = 'Online';

  if (state.timeControl) timerSelect.value = state.timeControl;

  shareLinkEl.textContent = `${window.location.origin}/g/${gameId}`;
  roomCodeEl.textContent = gameId.toUpperCase();
  roomBadge.textContent = `Room: ${gameId.toUpperCase()}`;

  if (color === 'w') youAreEl.textContent = 'You are White';
  else if (color === 'b') youAreEl.textContent = 'You are Black';
  else youAreEl.textContent = 'Spectating';

  waitText.textContent = 'Waiting for your friend to join';
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
    syncOnlineGame(state);
    board.setGame(chess);
  }

  applyOnlineClocks(state);

  const both = state.whiteConnected && state.blackConnected;
  updateModeUI({ onlineLobby: !both, onlinePlaying: both });

  const started = !!chess && chess.history().length > 0;
  const spectating = myColor !== 'w' && myColor !== 'b';
  const missing = !state.whiteConnected ? 'White' : 'Black';
  if (!both) {
    if (!started) waitText.textContent = 'Waiting for your friend to join';
    else if (spectating) waitText.textContent = `${missing} left · waiting for them to come back`;
    else waitText.textContent = 'Your friend left · clocks paused until they come back';
  }

  if (state.timedOut) {
    gameOver = true;
    statusEl.textContent = state.timedOut === 'w' ? 'Black wins on time' : 'White wins on time';
    board.setInteractive(false);
    showResult(state.timedOut === 'w' ? 'b' : 'w', 'time');
    return;
  }

  if (state.isCheckmate) {
    gameOver = true;
    statusEl.textContent = state.turn === 'w' ? 'Black wins by checkmate' : 'White wins by checkmate';
    board.setInteractive(false);
    showResult(state.turn === 'w' ? 'b' : 'w', 'checkmate');
  } else if (state.isDraw || (state.isGameOver && !state.timedOut)) {
    gameOver = true;
    statusEl.textContent = 'Draw';
    board.setInteractive(false);
    showResult(null, chess ? drawReason(chess) : 'draw');
  } else {
    gameOver = false;
    const side = state.turn === 'w' ? 'White' : 'Black';
    const yours = myColor === state.turn;
    if (spectating) statusEl.textContent = `Watching · ${side} to move`;
    else if (!both && started) statusEl.textContent = 'Your friend disconnected · clocks paused';
    else statusEl.textContent = yours ? `Your turn (${side})` : `Opponent's turn (${side})`;
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
