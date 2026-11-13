/**
 * board.js — board rendering, click/drag input and move animations
 */

const PIECE_SETS = {
  kosal: (key) => `/pieces/kosal/${key}.svg`,
  classic: (key) => `/pieces/${CLASSIC_FILES[key]}.png`,
};

const CLASSIC_FILES = {
  wP: 'wp', wR: 'wR', wN: 'wN', wB: 'wB', wQ: 'wQ', wK: 'wK',
  bP: 'bp', bR: 'bR', bN: 'bN', bB: 'bB', bQ: 'bQ', bK: 'bK',
};

let pieceSet = 'kosal';

const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

/** Switch every board to another piece set ('kosal' or 'classic'). */
function setPieceSet(name) {
  if (PIECE_SETS[name]) pieceSet = name;
}

function pieceUrl(key) {
  return PIECE_SETS[pieceSet](key);
}

class ChessBoard {
  #idleTimer = null;
  /** Drag in progress: { square, img, ghost, moved, ... } */
  #drag = null;
  /** Number of moves in the last rendered position, to spot a new move. */
  #renderedPly = null;
  /** Set when a move was dropped by drag, which needs no slide. */
  #skipSlide = false;

  /**
   * @param {HTMLElement} root
   * @param {{ onMove: Function }} options
   */
  constructor(root, options = {}) {
    this.root = root;
    this.onMove = options.onMove || (() => {});
    this.onStuck = options.onStuck || (() => {}); // a piece with no legal moves was picked
    this.onRender = options.onRender || null;
    this.chess = null;
    this.orientation = 'w';
    this.selected = null;
    this.legalTargets = [];
    this.interactive = true;

    this.root.addEventListener('pointerdown', (e) => this.#onPointerDown(e));
  }

  setGame(chess) {
    this.chess = chess;
    this.selected = null;
    this.legalTargets = [];
    this.hint = null;
    this.render();
  }

  /** Highlight a suggested move until the position changes. */
  showHint(from, to) {
    this.hint = { from, to };
    this.render();
  }

  setOrientation(color) {
    this.orientation = color === 'b' ? 'b' : 'w';
    this.render();
  }

  setInteractive(on) {
    this.interactive = !!on;
  }

  render() {
    if (!this.chess) return;
    const matrix = this.chess.board();
    const history = this.chess.history({ verbose: true });
    const last = history[history.length - 1];
    const checkedKing = this.chess.inCheck() ? this.#kingSquare(this.chess.turn()) : null;
    const mated = this.chess.isCheckmate();

    // Exactly one new move since the last render? Then animate it.
    const ply = history.length;
    const isNewMove = this.#renderedPly !== null && ply === this.#renderedPly + 1;
    this.#renderedPly = ply;
    const frag = document.createDocumentFragment();
    this.root.classList.toggle('flipped', this.orientation === 'b');

    const rows = this.orientation === 'w'
      ? [0, 1, 2, 3, 4, 5, 6, 7]
      : [7, 6, 5, 4, 3, 2, 1, 0];

    for (const r of rows) {
      const cols = this.orientation === 'w'
        ? [0, 1, 2, 3, 4, 5, 6, 7]
        : [7, 6, 5, 4, 3, 2, 1, 0];

      for (const c of cols) {
        const square = this.#coordsToSquare(r, c);
        const piece = matrix[r][c];
        const el = document.createElement('div');
        el.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
        el.dataset.square = square;
        el.setAttribute('role', 'gridcell');
        el.setAttribute('aria-label', piece
          ? `${square}, ${piece.color === 'w' ? 'white' : 'black'} ${PIECE_NAMES[piece.type]}`
          : `${square}, empty`);

        if (last && (square === last.from || square === last.to)) el.classList.add('last-move');
        if (square === checkedKing) {
          el.classList.add('in-check');
          if (isNewMove) el.classList.add('check-pulse');
          if (mated) el.classList.add(isNewMove ? 'king-falls' : 'king-down');
        }
        if (this.hint && (square === this.hint.from || square === this.hint.to)) el.classList.add('hint');
        if (this.selected === square) el.classList.add('selected');
        if (this.legalTargets.includes(square)) {
          el.classList.add('legal');
          if (piece) el.classList.add('capture');
        }

        // Coordinates on the edge squares, like a real board
        if (c === cols[0]) el.appendChild(this.#coord('rank', square[1]));
        if (r === rows[7]) el.appendChild(this.#coord('file', square[0]));

        if (piece) {
          const key = piece.color + piece.type.toUpperCase();
          const img = document.createElement('img');
          img.src = pieceUrl(key);
          img.alt = '';
          img.draggable = false;
          el.appendChild(img);
        }

        frag.appendChild(el);
      }
    }

    this.root.replaceChildren(frag);

    if (isNewMove && last && !this.#skipSlide) this.#slide(last.from, last.to);
    this.#skipSlide = false;

    this.onRender?.(this.chess);
  }

  /** Animate the piece now on `to` from where it came from (about 150ms). */
  #slide(from, to) {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const fromEl = this.root.querySelector(`[data-square="${from}"]`);
    const toEl = this.root.querySelector(`[data-square="${to}"]`);
    const img = toEl?.querySelector('img');
    if (!fromEl || !img) return;
    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();
    toEl.classList.add('sliding'); // lets the piece show outside its square
    img.style.transition = 'none';
    img.style.transform = `translate(${a.left - b.left}px, ${a.top - b.top}px)`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        img.style.transition = 'transform 150ms ease-out';
        img.style.transform = '';
      });
    });
    img.addEventListener('transitionend', () => {
      img.style.transition = '';
      toEl.classList.remove('sliding');
    }, { once: true });
  }

  #kingSquare(color) {
    for (const row of this.chess.board()) {
      for (const p of row) {
        if (p && p.type === 'k' && p.color === color) return p.square;
      }
    }
    return null;
  }

  #coord(kind, text) {
    const span = document.createElement('span');
    span.className = `coord coord-${kind}`;
    span.textContent = text;
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  #coordsToSquare(r, c) {
    return 'abcdefgh'[c] + String(8 - r);
  }

  /*
   * Moving pieces works two ways, both starting from pointerdown:
   *  - click a piece, then click a highlighted square
   *  - drag a piece and drop it on a highlighted square
   * Pointer events cover mouse, touch and pen.
   */
  #onPointerDown(e) {
    if (!this.interactive || !this.chess || e.button !== 0) return;
    const sqEl = e.target.closest('.square');
    if (!sqEl) return;
    const square = sqEl.dataset.square;
    const piece = this.chess.get(square);

    // Second click of click-to-move
    if (this.selected && this.legalTargets.includes(square)) {
      const from = this.selected;
      this.#clearSelection();
      this.onMove({ from, to: square });
      return;
    }

    if (piece && piece.color === this.chess.turn()) {
      const wasSelected = this.selected === square;
      if (!wasSelected) this.#select(square);
      this.#startDrag(e, square, wasSelected);
      return;
    }

    if (this.selected) this.#clearSelection();
  }

  #startDrag(e, square, wasSelected) {
    const img = this.root.querySelector(`[data-square="${square}"] img`);
    if (!img) return;
    e.preventDefault();
    this.#drag = {
      square,
      wasSelected,
      img,
      ghost: null,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      size: img.getBoundingClientRect().width,
    };

    const onMove = (ev) => this.#onDragMove(ev);
    const onEnd = (ev) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      this.#onDragEnd(ev);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  }

  #onDragMove(ev) {
    const d = this.#drag;
    if (!d) return;
    if (!d.moved) {
      // Ignore tiny movements so a normal click doesn't become a drag.
      if (Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < 5) return;
      d.moved = true;
      d.ghost = d.img.cloneNode(true);
      d.ghost.className = 'drag-ghost';
      d.ghost.style.width = `${d.size}px`;
      d.ghost.style.height = `${d.size}px`;
      document.body.appendChild(d.ghost);
      d.img.classList.add('drag-source');
    }
    d.ghost.style.transform = `translate(${ev.clientX - d.size / 2}px, ${ev.clientY - d.size / 2}px) scale(1.12)`;
  }

  #onDragEnd(ev) {
    const d = this.#drag;
    this.#drag = null;
    if (!d) return;
    d.ghost?.remove();
    d.img.classList.remove('drag-source');

    if (!d.moved) {
      // A plain click on an already selected piece deselects it.
      if (d.wasSelected) this.#clearSelection();
      return;
    }

    const under = ev.type === 'pointerup' ? document.elementFromPoint(ev.clientX, ev.clientY) : null;
    const sqEl = under && this.root.contains(under) ? under.closest('.square') : null;
    const to = sqEl?.dataset.square;
    if (to && this.legalTargets.includes(to)) {
      this.#clearSelection();
      this.#skipSlide = true; // already dropped where it belongs
      this.onMove({ from: d.square, to });
    } else {
      this.render(); // dropped elsewhere: piece goes back, stays selected
    }
  }

  #clearSelection() {
    this.selected = null;
    this.legalTargets = [];
    this.render();
  }

  #select(square) {
    this.selected = square;
    const moves = this.chess.moves({ square, verbose: true });
    this.legalTargets = moves.map((m) => m.to);
    this.render();
    if (moves.length === 0) this.onStuck(square);
  }
}

window.ChessBoard = ChessBoard;
window.setPieceSet = setPieceSet;
window.pieceUrl = pieceUrl;
