/**
 * client.js — the page's handle on the engine worker.
 *
 *   const engine = new EngineClient();
 *   const result = await engine.think(chess.fen(), 'medium', 2000);
 *   chess.move(result.move);
 */

export class EngineClient {
  #worker = null;
  #nextId = 1;
  #pending = new Map();

  #ensureWorker() {
    if (this.#worker) return this.#worker;
    this.#worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.#worker.onmessage = (event) => {
      const { id, error, ...result } = event.data;
      const pending = this.#pending.get(id);
      if (!pending) return; // cancelled
      this.#pending.delete(id);
      if (error) pending.reject(new Error(error));
      else pending.resolve(result);
    };
    this.#worker.onerror = (event) => {
      for (const { reject } of this.#pending.values()) reject(new Error(event.message));
      this.#pending.clear();
    };
    return this.#worker;
  }

  /**
   * Ask the engine for a move. Resolves with the search result.
   * maxTimeMs (optional) caps the level's thinking time, e.g. when low on clock.
   * moves (optional) is the game so far, so the engine can avoid repetitions.
   */
  think(fen, level, maxTimeMs, moves) {
    const id = this.#nextId++;
    const worker = this.#ensureWorker();
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      worker.postMessage({ id, fen, level, maxTimeMs, moves });
    });
  }

  /**
   * Stop the current search (e.g. the player pressed Undo or Home).
   * The worker is restarted, so any pending think() is rejected.
   */
  cancel() {
    if (!this.#worker) return;
    this.#worker.terminate();
    this.#worker = null;
    for (const { reject } of this.#pending.values()) reject(new Error('cancelled'));
    this.#pending.clear();
  }
}
