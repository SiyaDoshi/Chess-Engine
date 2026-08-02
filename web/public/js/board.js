/**
 * board.js — board rendering + homepage Queen's Gambit preview
 * Preview animation / confetti do not affect gameplay boards.
 */

const PIECE_FILES = {
  wP: 'wp', wR: 'wR', wN: 'wN', wB: 'wB', wQ: 'wQ', wK: 'wK',
  bP: 'bp', bR: 'bR', bN: 'bN', bB: 'bB', bQ: 'bQ', bK: 'bK',
};

class ChessBoard {
  #idleTimer = null;
  #animating = false;

  /**
   * @param {HTMLElement} root
   * @param {{ onMove: Function }} options
   */
  constructor(root, options = {}) {
    this.root = root;
    this.onMove = options.onMove || (() => {});
    this.chess = null;
    this.orientation = 'w';
    this.selected = null;
    this.legalTargets = [];
    this.interactive = true;

    this.root.addEventListener('click', (e) => this.#onClick(e));
  }

  setGame(chess) {
    this.chess = chess;
    this.selected = null;
    this.legalTargets = [];
    this.render();
  }

  setOrientation(color) {
    this.orientation = color === 'b' ? 'b' : 'w';
    this.render();
  }

  setInteractive(on) {
    this.interactive = !!on;
  }

  /**
   * Homepage-only loop:
   * Queen's Gambit Declined lines → red/white confetti → reset → repeat
   */
  startIdleAnimation(demoMoves = true) {
    this.stopIdleAnimation();
    this.root.classList.add('preview-board');
    if (!demoMoves || !this.chess) return;
    this.#runQueensGambitLoop();
  }

  stopIdleAnimation() {
    if (this.#idleTimer) {
      clearTimeout(this.#idleTimer);
      this.#idleTimer = null;
    }
    this.#animating = false;
    this.root.querySelectorAll('.preview-flyer').forEach((el) => el.remove());
    this.#clearConfetti();
  }

  #runQueensGambitLoop() {
    // 1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Bg5 Be7 5.e3
    const demo = [
      ['d2', 'd4'],
      ['d7', 'd5'],
      ['c2', 'c4'],
      ['e7', 'e6'],
      ['b1', 'c3'],
      ['g8', 'f6'],
      ['c1', 'g5'],
      ['f8', 'e7'],
      ['e2', 'e3'],
    ];
    const PAUSE_AFTER_MOVE_MS = 900;
    const SLIDE_MS = 560;
    const CONFETTI_MS = 5000;
    const RESTART_MS = 650;
    let step = 0;

    const schedule = (fn, ms) => {
      this.#idleTimer = setTimeout(fn, ms);
    };

    const tick = async () => {
      if (!this.chess) return;

      if (step < demo.length) {
        const [from, to] = demo[step++];
        try {
          await this.#animatePreviewMove(from, to, SLIDE_MS);
        } catch {
          this.chess.reset();
          this.render();
          step = 0;
        }
        schedule(tick, PAUSE_AFTER_MOVE_MS);
        return;
      }

      this.#burstConfetti();
      schedule(() => {
        this.#clearConfetti();
        if (!this.chess) return;
        this.chess.reset();
        this.render();
        step = 0;
        schedule(tick, RESTART_MS);
      }, CONFETTI_MS);
    };

    schedule(tick, 500);
  }

  #setPreviewGlow(from, to) {
    this.root.querySelectorAll('.preview-glow').forEach((el) => {
      el.classList.remove('preview-glow');
    });
    const fromEl = this.root.querySelector(`[data-square="${from}"]`);
    const toEl = this.root.querySelector(`[data-square="${to}"]`);
    fromEl?.classList.add('preview-glow');
    toEl?.classList.add('preview-glow');
  }

  #fadePreviewGlow() {
    const glowing = [...this.root.querySelectorAll('.preview-glow')];
    glowing.forEach((el) => {
      el.style.transition = 'opacity 0.45s ease, box-shadow 0.45s ease';
      el.classList.remove('preview-glow');
    });
  }

  /**
   * Smooth slide for homepage preview only, then apply the move.
   */
  #animatePreviewMove(from, to, durationMs) {
    return new Promise((resolve) => {
      if (!this.chess) {
        resolve();
        return;
      }

      this.#setPreviewGlow(from, to);

      const fromEl = this.root.querySelector(`[data-square="${from}"]`);
      const toEl = this.root.querySelector(`[data-square="${to}"]`);
      const pieceImg = fromEl?.querySelector('img');

      const apply = () => {
        try {
          this.chess.move({ from, to, promotion: 'q' });
        } catch {
          /* ignore — caller may reset */
        }
        this.render();
        // Re-apply destination glow briefly after render, then fade
        const dest = this.root.querySelector(`[data-square="${to}"]`);
        const origin = this.root.querySelector(`[data-square="${from}"]`);
        dest?.classList.add('preview-glow');
        origin?.classList.add('preview-glow');
        setTimeout(() => this.#fadePreviewGlow(), 420);
        resolve();
      };

      if (!fromEl || !toEl || !pieceImg || this.#animating) {
        apply();
        return;
      }

      this.#animating = true;
      const boardRect = this.root.getBoundingClientRect();
      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();

      const flyer = pieceImg.cloneNode(true);
      flyer.className = 'preview-flyer';
      flyer.style.width = `${fromRect.width * 0.8}px`;
      flyer.style.height = `${fromRect.height * 0.8}px`;
      flyer.style.left = `${fromRect.left - boardRect.left + fromRect.width * 0.1}px`;
      flyer.style.top = `${fromRect.top - boardRect.top + fromRect.height * 0.1}px`;

      pieceImg.style.opacity = '0';
      this.root.appendChild(flyer);

      const dx = (toRect.left - fromRect.left);
      const dy = (toRect.top - fromRect.top);

      requestAnimationFrame(() => {
        flyer.style.transition = `transform ${durationMs}ms ease-in-out`;
        flyer.style.transform = `translate(${dx}px, ${dy}px)`;
      });

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        flyer.remove();
        this.#animating = false;
        apply();
      };

      flyer.addEventListener('transitionend', finish, { once: true });
      setTimeout(finish, durationMs + 80);
    });
  }

  #confettiHost() {
    return this.root.parentElement?.querySelector('.preview-confetti')
      || document.getElementById('preview-confetti');
  }

  #burstConfetti() {
    const host = this.#confettiHost();
    if (!host) return;
    host.innerHTML = '';
    host.classList.add('is-active');

    // Dense red / white / gold — still see-through enough for the board
    const colors = ['#ffffff', '#ef4444', '#dc2626', '#d4af37', '#f5e6a8', '#fff', '#f87171'];
    const count = 130;
    const boardH = host.clientHeight || 600;

    for (let i = 0; i < count; i++) {
      const bit = document.createElement('span');
      bit.className = 'confetti-bit';
      bit.style.left = `${4 + Math.random() * 92}%`;
      bit.style.top = `${-18 - Math.random() * 50}px`;
      bit.style.background = colors[i % colors.length];
      bit.style.animationDelay = `${Math.random() * 1.1}s`;
      bit.style.animationDuration = `${3.6 + Math.random() * 1.2}s`;
      bit.style.width = `${5 + Math.random() * 8}px`;
      bit.style.height = `${7 + Math.random() * 12}px`;
      bit.style.borderRadius = Math.random() > 0.55 ? '50%' : '1px';
      bit.style.setProperty('--drift', `${(Math.random() - 0.5) * 100}px`);
      bit.style.setProperty('--fall', `${boardH + 40}px`);
      bit.style.setProperty('--spin', `${360 + Math.random() * 520}deg`);
      host.appendChild(bit);
    }
  }

  #clearConfetti() {
    const host = this.#confettiHost();
    if (!host) return;
    host.classList.remove('is-active');
    host.innerHTML = '';
  }

  render() {
    if (!this.chess) return;
    const matrix = this.chess.board();
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

        if (this.selected === square) el.classList.add('selected');
        if (this.legalTargets.includes(square)) {
          el.classList.add('legal');
          if (piece) el.classList.add('capture');
        }

        if (piece) {
          const key = piece.color + piece.type.toUpperCase();
          const img = document.createElement('img');
          img.src = `/pieces/${PIECE_FILES[key]}.png`;
          img.alt = key;
          img.draggable = false;
          el.appendChild(img);
        }

        frag.appendChild(el);
      }
    }

    this.root.replaceChildren(frag);
  }

  #coordsToSquare(r, c) {
    return 'abcdefgh'[c] + String(8 - r);
  }

  #onClick(e) {
    if (!this.interactive || !this.chess) return;
    const sqEl = e.target.closest('.square');
    if (!sqEl) return;
    const square = sqEl.dataset.square;
    const piece = this.chess.get(square);

    if (this.selected) {
      if (square === this.selected) {
        this.selected = null;
        this.legalTargets = [];
        this.render();
        return;
      }

      if (this.legalTargets.includes(square)) {
        const from = this.selected;
        const to = square;
        this.selected = null;
        this.legalTargets = [];
        this.onMove({ from, to });
        return;
      }

      if (piece && piece.color === this.chess.turn()) {
        this.#select(square);
        return;
      }

      this.selected = null;
      this.legalTargets = [];
      this.render();
      return;
    }

    if (piece && piece.color === this.chess.turn()) {
      this.#select(square);
    }
  }

  #select(square) {
    this.selected = square;
    const moves = this.chess.moves({ square, verbose: true });
    this.legalTargets = moves.map((m) => m.to);
    this.render();
  }
}

window.ChessBoard = ChessBoard;
