/**
 * ─────────────────────────────────────────────
 * SYNCRAFT  –  Project Store
 * ─────────────────────────────────────────────
 *
 * A lightweight observable state container inspired by Zustand.
 * No external dependencies — pure vanilla ES-module.
 *
 * Usage:
 *   import store from './projectStore.js';
 *   const state = store.getState();
 *   const unsub = store.subscribe(state => console.log(state));
 *   store.setState({ isDirty: true });
 */

/** @import { AppState, Project } from './types.js' */

// ─────────────────────────────────────────────
// Initial state
// ─────────────────────────────────────────────

/** @type {AppState} */
const INITIAL_STATE = {
  currentProject: null,
  recentProjects: [],
  isDirty:        false,
  isAutoSaving:   false,
  lastSavedAt:    null,
};

// ─────────────────────────────────────────────
// Store class
// ─────────────────────────────────────────────

class ProjectStore {
  constructor(initialState) {
    /** @type {AppState} */
    this._state = { ...initialState };

    /**
     * Listener callbacks — invoked synchronously after every setState.
     * @type {Set<function(AppState): void>}
     */
    this._listeners = new Set();
  }

  // ── Read ─────────────────────────────────────

  /**
   * Return a shallow copy of the current state.
   * @returns {AppState}
   */
  getState() {
    return { ...this._state };
  }

  // ── Write ────────────────────────────────────

  /**
   * Merge a partial state update and notify all subscribers.
   *
   * @param {Partial<AppState>|function(AppState): Partial<AppState>} partialOrFn
   *   Either a plain object to merge, or a function that receives the
   *   current state and returns the partial update.
   */
  setState(partialOrFn) {
    const patch =
      typeof partialOrFn === 'function'
        ? partialOrFn(this._state)
        : partialOrFn;

    this._state = { ...this._state, ...patch };
    this._notify();
  }

  // ── Subscribe ────────────────────────────────

  /**
   * Register a callback that fires whenever state changes.
   * Returns an unsubscribe function.
   *
   * @param {function(AppState): void} listener
   * @returns {function(): void} unsubscribe
   */
  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /**
   * Subscribe to a derived slice of state.
   * The callback only fires when the selected value actually changes.
   *
   * @template T
   * @param {function(AppState): T} selector
   * @param {function(T, T): void} callback  (newValue, prevValue)
   * @returns {function(): void} unsubscribe
   */
  subscribeSlice(selector, callback) {
    let prev = selector(this._state);
    return this.subscribe((state) => {
      const next = selector(state);
      if (next !== prev) {
        callback(next, prev);
        prev = next;
      }
    });
  }

  // ── Internal ─────────────────────────────────

  _notify() {
    const snapshot = this.getState();
    this._listeners.forEach((fn) => fn(snapshot));
  }
}

// ─────────────────────────────────────────────
// Singleton export
// ─────────────────────────────────────────────
const store = new ProjectStore(INITIAL_STATE);
export default store;
