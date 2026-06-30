/**
 * ─────────────────────────────────────────────
 * SYNCRAFT  –  Authentication & Subscription Service
 * ─────────────────────────────────────────────
 *
 * Links user authentication, sessions, and credit quotas directly to Supabase.
 * If Supabase is not configured yet, it gracefully falls back to LocalStorage simulation.
 */

import { supabaseClient } from './supabaseConfig.js';

const USERS_KEY = 'syncraft_users';
const SESSION_KEY = 'syncraft_current_user';
const CREDITS_BACKUP_KEY = 'syncraft_credits_backup';

const PLAN_LIMITS = {
  'Starter': 30,
  'Professional': 400,
  'Enterprise': 1800
};

class AuthService {
  constructor() {
    this.currentUserCache = null;
    this.bootstrap();
  }

  async bootstrap() {
    if (!localStorage.getItem(USERS_KEY)) {
      // Create a default fallback demo user
      const demoUser = {
        email: 'demo@syncraft.ai',
        password: 'password123',
        plan: 'Starter',
        creditsUsed: 2,
        creditsMax: PLAN_LIMITS['Starter'],
        history: [
          { date: new Date(Date.now() - 3600000 * 2).toISOString(), type: 'Generation', desc: 'Studio Lighting vector' },
          { date: new Date(Date.now() - 3600000).toISOString(), type: 'Export', desc: 'Studio Lighting SVG export' }
        ]
      };
      localStorage.setItem(USERS_KEY, JSON.stringify([demoUser]));
    }

    if (supabaseClient) {
      supabaseClient.auth.onAuthStateChange(async (event, session) => {
        console.log('Supabase Auth Event:', event);
        if (session) {
          localStorage.setItem(SESSION_KEY, session.user.email);
          localStorage.setItem('syncraft_current_user_id', session.user.id);
          
          if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || !this.currentUserCache) {
            console.log('[AuthService] Syncing profile on event:', event);
            await this.syncProfile(session.user);
          } else {
            console.log('[AuthService] Skipping profile sync for event:', event);
          }
        } else {
          localStorage.removeItem(SESSION_KEY);
          localStorage.removeItem('syncraft_current_user_id');
          this.currentUserCache = null;
        }
        document.dispatchEvent(new CustomEvent('syncraft:authChange', { detail: { event, session } }));
      });
    }
  }

  async syncProfile(supabaseUser) {
    try {
      if (!supabaseClient || !supabaseUser) return;
      
      // Fetch profile from public.profiles
      let { data: profile, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', supabaseUser.id)
      .single();

    if (error) {
      console.warn('Profile not found or sync failed, checking error code:', error);
      
      // ONLY create/upsert a fallback profile if the error is PGRST116 (meaning the profile row doesn't exist yet)
      if (error.code === 'PGRST116') {
        const fallbackProfile = {
          id: supabaseUser.id,
          plan: 'Starter',
          credits_used: 0,
          credits_max: PLAN_LIMITS['Starter'],
          history: []
        };

        const { data: insertedProfile, error: insertError } = await supabaseClient
          .from('profiles')
          .upsert(fallbackProfile)
          .select()
          .single();

        if (insertError) {
          console.error('Failed to create user profile on the fly:', insertError);
          return;
        }
        profile = insertedProfile;
      } else {
        // It's a temporary connection or database error, don't overwrite!
        console.error('[AuthService] Supabase profile read failed with database error. Using local fallback cache, won\'t overwrite DB:', error.message);
        return;
      }
    }

    // Ensure new/stale Starter accounts get the correct default tokens limit (e.g. 30)
    if (profile && profile.plan === 'Starter' && (!profile.credits_max || profile.credits_max < PLAN_LIMITS['Starter'])) {
      console.log(`[AuthService] Aligning Starter account credits_max from ${profile.credits_max || 0} to ${PLAN_LIMITS['Starter']}`);
      profile.credits_max = PLAN_LIMITS['Starter'];
      
      supabaseClient
        .from('profiles')
        .update({ credits_max: PLAN_LIMITS['Starter'] })
        .eq('id', supabaseUser.id)
        .then(({ error }) => {
          if (error) console.warn('[AuthService] Aligning credits_max failed:', error.message);
        });
    }

    console.log('[AuthService] Supabase User metadata:', supabaseUser.user_metadata);
    const avatarUrl = supabaseUser.user_metadata?.avatar_url || supabaseUser.user_metadata?.picture || null;
    console.log('[AuthService] Resolved avatar URL:', avatarUrl);

    this.currentUserCache = {
      id: supabaseUser.id,
      email: supabaseUser.email,
      plan: profile.plan,
      creditsUsed: profile.credits_used,
      creditsMax: profile.credits_max,
      avatarUrl: avatarUrl,
      history: profile.history || []
    };

    // Reconcile with localStorage backup: if a local backup has higher
    // creditsUsed, Supabase writes likely failed previously — use the
    // local value so tokens don't appear to "reset" to 0.
    const backup = this._getCreditsBackup(supabaseUser.id);
    if (backup && backup.creditsUsed > this.currentUserCache.creditsUsed) {
      console.warn(`[AuthService] Local credit backup (${backup.creditsUsed}) is higher than Supabase (${this.currentUserCache.creditsUsed}). Using local value and re-syncing.`);
      this.currentUserCache.creditsUsed = backup.creditsUsed;

      // Attempt to re-sync the correct value back to Supabase
      supabaseClient
        .from('profiles')
        .update({ credits_used: backup.creditsUsed })
        .eq('id', supabaseUser.id)
        .then(({ error }) => {
          if (error) console.warn('[AuthService] Re-sync credits to Supabase failed:', error.message);
          else console.log('[AuthService] Successfully re-synced credits to Supabase.');
        });
    }
  } catch (err) {
    console.error('[AuthService] Error in syncProfile:', err);
  }
}

  getUsers() {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  }

  saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  getCurrentUser() {
    if (supabaseClient && this.currentUserCache) {
      if (this.currentUserCache.email && this.currentUserCache.email.toLowerCase() === 'jeighdesign@gmail.com') {
        this.currentUserCache.plan = 'Enterprise Unlimited';
        this.currentUserCache.creditsMax = 99999;
        this.currentUserCache.creditsUsed = 0;
      }
      return this.currentUserCache;
    }
    
    const email = localStorage.getItem(SESSION_KEY);
    if (!email) return null;
    
    const users = this.getUsers();
    let localUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    const userId = localStorage.getItem('syncraft_current_user_id');
    
    if (!localUser) {
      // Create local fallback representation
      localUser = {
        id: userId || 'supabase-fallback-' + email,
        email: email,
        plan: 'Starter',
        creditsUsed: 0,
        creditsMax: PLAN_LIMITS['Starter'],
        avatarUrl: null,
        history: []
      };
      // Save it so it can be retrieved next time
      users.push(localUser);
      this.saveUsers(users);
    } else if (userId && !localUser.id) {
      // If we got the user ID now, update the local user ID
      localUser.id = userId;
      const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
      if (idx !== -1) {
        users[idx] = localUser;
        this.saveUsers(users);
      }
    }
    
    if (localUser && localUser.email && localUser.email.toLowerCase() === 'jeighdesign@gmail.com') {
      localUser.plan = 'Enterprise Unlimited';
      localUser.creditsMax = 99999;
      localUser.creditsUsed = 0;
    }
    
    return localUser;
  }

  async saveCurrentUserState(user) {
    console.log('[AuthService] saveCurrentUserState started');
    
    // Sanitize user history to strip any heavy receipt image data that was cached locally
    if (user && Array.isArray(user.history)) {
      user.history.forEach(h => {
        if (h.receiptImage) {
          console.log('[AuthService] Stripped receiptImage from user history log entry');
          delete h.receiptImage;
        }
      });
    }

    this.currentUserCache = user;
    
    try {
      this._saveCreditsBackup(user);
    } catch (e) {
      console.warn('[AuthService] Backup save failed:', e);
    }

    // Sync to local storage users list as well to ensure page-load consistency
    try {
      const users = this.getUsers();
      const idx = users.findIndex(u => u.email && u.email.toLowerCase() === user.email.toLowerCase());
      if (idx !== -1) {
        users[idx] = user;
        this.saveUsers(users);
      } else {
        users.push(user);
        this.saveUsers(users);
      }
      console.log('[AuthService] Local users sync complete');
    } catch (err) {
      console.warn('[AuthService] Local users sync failed (possibly QuotaExceededError):', err);
    }

    if (supabaseClient && user.id) {
      console.log('[AuthService] Writing profile to Supabase...');
      const { error } = await supabaseClient
        .from('profiles')
        .update({
          plan: user.plan,
          credits_used: user.creditsUsed,
          credits_max: user.creditsMax,
          history: user.history
        })
        .eq('id', user.id);

      if (error) {
        console.error('[AuthService] Supabase profile update failed:', error.message);
        throw new Error(error.message);
      } else {
        console.log('[AuthService] Successfully updated profile in Supabase. Used:', user.creditsUsed, 'Max:', user.creditsMax);
      }
    } else {
      console.log('[AuthService] Supabase sync skipped (no client or no user.id)');
    }
  }

  /**
   * Saves a lightweight credit snapshot to localStorage so that
   * token counts survive page reloads even when Supabase writes fail.
   */
  _saveCreditsBackup(user) {
    if (!user || !user.id) return;
    try {
      const backup = {
        id: user.id,
        creditsUsed: user.creditsUsed,
        creditsMax: user.creditsMax,
        updatedAt: Date.now()
      };
      localStorage.setItem(CREDITS_BACKUP_KEY, JSON.stringify(backup));
    } catch (e) {
      // localStorage full — non-critical
    }
  }

  /**
   * Returns the localStorage credit backup if it belongs to the given user
   * and is more recent than the Supabase profile data.
   */
  _getCreditsBackup(userId) {
    try {
      const raw = localStorage.getItem(CREDITS_BACKUP_KEY);
      if (!raw) return null;
      const backup = JSON.parse(raw);
      if (backup.id === userId) return backup;
    } catch (e) { /* ignore */ }
    return null;
  }

  isAuthenticated() {
    return !!localStorage.getItem(SESSION_KEY);
  }

  async login(email, password) {
    if (supabaseClient) {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email.trim(),
        password: password
      });
      if (error) throw error;
      
      localStorage.setItem(SESSION_KEY, data.user.email);
      await this.syncProfile(data.user);
      return this.getCurrentUser();
    } else {
      const users = this.getUsers();
      const user = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password);
      if (!user) {
        throw new Error('Invalid email or password');
      }
      localStorage.setItem(SESSION_KEY, user.email);
      document.dispatchEvent(new CustomEvent('syncraft:authChange', { detail: { event: 'SIGNED_IN', session: { user } } }));
      return user;
    }
  }

  async loginWithGoogle() {
    if (supabaseClient) {
      const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
      return data;
    } else {
      throw new Error('Supabase is not configured. Google Sign-In requires a live Supabase link.');
    }
  }

  async signUp(email, password) {
    if (!email || !email.includes('@')) {
      throw new Error('Please enter a valid email address');
    }
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    if (supabaseClient) {
      const { data, error } = await supabaseClient.auth.signUp({
        email: email.trim(),
        password: password
      });
      if (error) throw error;
      if (!data.user) throw new Error('SignUp failed');

      localStorage.setItem(SESSION_KEY, data.user.email);
      
      // Delay briefly to allow public.profiles trigger execution on Supabase backend
      await new Promise(resolve => setTimeout(resolve, 800));
      await this.syncProfile(data.user);
      return this.getCurrentUser();
    } else {
      const users = this.getUsers();
      const exists = users.some(u => u.email.toLowerCase() === email.trim().toLowerCase());
      if (exists) {
        throw new Error('An account with this email already exists');
      }

      const newUser = {
        email: email.trim(),
        password: password,
        plan: 'Starter',
        creditsUsed: 0,
        creditsMax: PLAN_LIMITS['Starter'],
        history: []
      };

      users.push(newUser);
      this.saveUsers(users);
      localStorage.setItem(SESSION_KEY, newUser.email);
      document.dispatchEvent(new CustomEvent('syncraft:authChange', { detail: { event: 'SIGNED_IN', session: { user: newUser } } }));
      return newUser;
    }
  }

  async logout() {
    // 1. Explicitly clear authentication tokens and session keys from LocalStorage
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('syncraft_current_user_id');
    localStorage.removeItem(CREDITS_BACKUP_KEY);
    this.currentUserCache = null;

    // 2. Clear all Supabase auth storage items
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('sb-') || key.includes('supabase.auth.token'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    // 3. Perform Supabase signOut if active
    if (supabaseClient) {
      try {
        await supabaseClient.auth.signOut();
      } catch (err) {
        console.warn('Supabase signOut failed or already signed out:', err);
      }
    }

    // 4. Trigger event-driven state update globally to force headers to re-render and route
    document.dispatchEvent(new CustomEvent('syncraft:authChange', { detail: { event: 'SIGNED_OUT', session: null } }));
  }

  async recoverPassword(email) {
    if (supabaseClient) {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email.trim());
      if (error) throw error;
      return true;
    } else {
      const users = this.getUsers();
      const exists = users.some(u => u.email.toLowerCase() === email.trim().toLowerCase());
      if (!exists) {
        throw new Error('No account found with this email address');
      }
      return true;
    }
  }

  hasCredits() {
    const user = this.getCurrentUser();
    if (!user) return false;
    return user.creditsUsed < user.creditsMax;
  }

  hasEnoughCredits(cost = 1) {
    const user = this.getCurrentUser();
    if (!user) return false;
    return (user.creditsMax - user.creditsUsed) >= cost;
  }

  async consumeCredit(type, desc, cost = 1) {
    console.log('[AuthService] consumeCredit called. Type:', type, 'Desc:', desc, 'Cost:', cost);
    const user = this.getCurrentUser();
    if (!user) throw new Error('No active user session');

    if (user.email && user.email.toLowerCase() === 'jeighdesign@gmail.com') {
      // Skip actual consumption for testing account, just log history
      user.history.unshift({
        date: new Date().toISOString(),
        type: type,
        desc: desc + ' (Unlimited Testing)',
        cost: 0
      });
      await this.saveCurrentUserState(user);
      document.dispatchEvent(new CustomEvent('syncraft:authChange', { detail: { event: 'CREDIT_CONSUMED', session: null } }));
      return user;
    }

    if (user.creditsUsed + cost > user.creditsMax) {
      throw new Error(`Quota exceeded. This operation requires ${cost} tokens, but you only have ${user.creditsMax - user.creditsUsed} left.`);
    }

    user.creditsUsed += cost;
    user.history.unshift({
      date: new Date().toISOString(),
      type: type,
      desc: desc,
      cost: cost
    });

    try {
      await this.saveCurrentUserState(user);
    } catch (saveErr) {
      console.warn('[AuthService] consumeCredit: save failed but credits are tracked locally:', saveErr);
    } finally {
      // ALWAYS fire the UI update event, even if Supabase write failed.
      document.dispatchEvent(new CustomEvent('syncraft:authChange', { detail: { event: 'CREDIT_CONSUMED', session: null } }));
    }
    return user;
  }

  async upgradeSubscription(planName, chosenCreditsMax = null) {
    const user = this.getCurrentUser();
    if (!user) throw new Error('No active user session');

    if (!PLAN_LIMITS[planName]) {
      throw new Error('Invalid plan selection');
    }

    user.plan = planName;
    user.creditsMax = (planName === 'Professional' && chosenCreditsMax !== null)
      ? chosenCreditsMax
      : PLAN_LIMITS[planName];

    user.history.unshift({
      date: new Date().toISOString(),
      type: 'Billing',
      desc: `Upgraded subscription to ${planName} (limit: ${user.creditsMax} tokens)`
    });

    await this.saveCurrentUserState(user);
    document.dispatchEvent(new CustomEvent('syncraft:authChange', { detail: { event: 'SUBSCRIPTION_UPGRADED', session: null } }));
    return user;
  }

  getUserMetadata() {
    const user = this.getCurrentUser();
    if (!user) return { name: '', username: '' };
    const entry = user.history.find(h => h.type === 'USER_METADATA_STORE');
    if (entry && entry.metadata) {
      return entry.metadata;
    }
    const emailPrefix = user.email ? user.email.split('@')[0] : 'User';
    return { name: emailPrefix, username: emailPrefix };
  }

  async updateUserMetadata(name, username) {
    const user = this.getCurrentUser();
    if (!user) throw new Error('No active user session');

    let idx = user.history.findIndex(h => h.type === 'USER_METADATA_STORE');
    const metadata = { name, username };

    if (idx !== -1) {
      user.history[idx] = {
        date: new Date().toISOString(),
        type: 'USER_METADATA_STORE',
        desc: 'Updated profile metadata',
        metadata
      };
    } else {
      user.history.push({
        date: new Date().toISOString(),
        type: 'USER_METADATA_STORE',
        desc: 'Created profile metadata',
        metadata
      });
    }

    await this.saveCurrentUserState(user);
    return user;
  }

  getDeveloperKeys() {
    const user = this.getCurrentUser();
    if (!user) return [];
    const entry = user.history.find(h => h.type === 'USER_API_KEYS_STORE');
    return entry && Array.isArray(entry.keys) ? entry.keys : [];
  }

  async createDeveloperKey(name) {
    const user = this.getCurrentUser();
    if (!user) throw new Error('No active user session');

    const randBytes = Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const fullKey = 'sc_live_' + randBytes;

    let entryIdx = user.history.findIndex(h => h.type === 'USER_API_KEYS_STORE');
    let keys = [];
    if (entryIdx !== -1 && Array.isArray(user.history[entryIdx].keys)) {
      keys = user.history[entryIdx].keys;
    }

    const newKeyObj = {
      id: 'sc_key_' + Math.random().toString(36).substr(2, 9),
      name: name || 'Developer Key',
      key: fullKey,
      created: new Date().toISOString()
    };

    keys.push(newKeyObj);

    const keysStoreObj = {
      date: new Date().toISOString(),
      type: 'USER_API_KEYS_STORE',
      desc: 'Updated developer API keys',
      keys: keys
    };

    if (entryIdx !== -1) {
      user.history[entryIdx] = keysStoreObj;
    } else {
      user.history.push(keysStoreObj);
    }

    user.history.unshift({
      date: new Date().toISOString(),
      type: 'API',
      desc: `Generated API Key: ${name || 'Developer Key'}`
    });

    await this.saveCurrentUserState(user);
    return newKeyObj;
  }

  async revokeDeveloperKey(id) {
    const user = this.getCurrentUser();
    if (!user) throw new Error('No active user session');

    let entryIdx = user.history.findIndex(h => h.type === 'USER_API_KEYS_STORE');
    if (entryIdx === -1 || !Array.isArray(user.history[entryIdx].keys)) {
      return [];
    }

    let keys = user.history[entryIdx].keys;
    const keyToDelete = keys.find(k => k.id === id);
    const keyName = keyToDelete ? keyToDelete.name : 'Unknown';

    keys = keys.filter(k => k.id !== id);

    user.history[entryIdx] = {
      date: new Date().toISOString(),
      type: 'USER_API_KEYS_STORE',
      desc: 'Updated developer API keys',
      keys: keys
    };

    user.history.unshift({
      date: new Date().toISOString(),
      type: 'API',
      desc: `Revoked API Key: ${keyName}`
    });

    await this.saveCurrentUserState(user);
    return keys;
  }

  async deleteAccount() {
    const user = this.getCurrentUser();
    if (!user) return;

    if (supabaseClient && user.id) {
      const { error: projErr } = await supabaseClient
        .from('projects')
        .delete()
        .eq('user_id', user.id);
      if (projErr) console.warn('Supabase projects deletion failed:', projErr);

      const { error: profErr } = await supabaseClient
        .from('profiles')
        .delete()
        .eq('id', user.id);
      if (profErr) console.warn('Supabase profile deletion failed:', profErr);
    } else {
      const users = this.getUsers();
      const updated = users.filter(u => u.email.toLowerCase() !== user.email.toLowerCase());
      this.saveUsers(updated);
    }

    await this.logout();
  }
}

const authService = new AuthService();
export default authService;
