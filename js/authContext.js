/**
 * ─────────────────────────────────────────────
 * SYNCRAFT  –  Global Authentication Context
 * ─────────────────────────────────────────────
 *
 * Implements a global state manager (AuthContext) and custom hook (useAuth)
 * equivalent in Vanilla JS to track and react to user login/logout states.
 */

import authService from './authService.js?v=2.0.5';

class VanillaAuthContext {
  constructor() {
    this.listeners = new Set();
    
    // Listen to Supabase/Local simulated auth change events
    document.addEventListener('syncraft:authChange', () => {
      this.notifyListeners();
    });
  }

  /**
   * Check if a user is authenticated
   * @returns {boolean}
   */
  isAuthenticated() {
    return authService.isAuthenticated();
  }

  /**
   * Get the current logged-in user
   * @returns {Object|null}
   */
  getCurrentUser() {
    return authService.getCurrentUser();
  }

  /**
   * Log out the current user
   */
  async logout() {
    return await authService.logout();
  }

  /**
   * Subscribe to auth state updates
   * @param {Function} callback - Callback function receiving current state
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback);
    // Immediately trigger with current state
    callback({
      isAuthenticated: this.isAuthenticated(),
      user: this.getCurrentUser()
    });
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all registered subscribers of the state change
   */
  notifyListeners() {
    const state = {
      isAuthenticated: this.isAuthenticated(),
      user: this.getCurrentUser()
    };
    this.listeners.forEach(listener => {
      try {
        listener(state);
      } catch (err) {
        console.error('Error in AuthContext subscriber:', err);
      }
    });
  }
}

export const AuthContext = new VanillaAuthContext();

/**
 * useAuth equivalent for Vanilla JS
 * @param {Function} [callback] - Optional callback to reactively track changes
 * @returns {Object} Current state and action helpers (or unsubscribe function if callback is provided)
 */
export function useAuth(callback) {
  if (callback) {
    return AuthContext.subscribe(callback);
  }
  return {
    isAuthenticated: AuthContext.isAuthenticated(),
    user: AuthContext.getCurrentUser(),
    logout: () => AuthContext.logout()
  };
}
