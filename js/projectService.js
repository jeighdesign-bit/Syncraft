/**
 * ─────────────────────────────────────────────
 * SYNCRAFT  –  Project Service  (Local-First Architecture)
 * ─────────────────────────────────────────────
 *
 * All mutations (create, save, rename, delete) write to localStorage
 * FIRST (instant, no network) then sync to Supabase in the background.
 * This means the UI is NEVER blocked waiting for a network response.
 */

import store          from './projectStore.js';
import { makeProject, patchProject } from './types.js';
import { supabaseClient } from './supabaseConfig.js';
import { resizeImage } from './utils.js';

const LS_RECENT_KEY   = 'syncraft_recent_projects';
const LS_PROJECT_KEY  = 'syncraft_project_';
const MAX_RECENT      = 10;
const AUTOSAVE_DELAY  = 2000;

// ─────────────────────────────────────────────
// IndexedDB & Cache Architecture (5MB limit bypass)
// ─────────────────────────────────────────────

const DB_NAME = 'syncraft_db';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_METADATA = 'metadata';

let useIndexedDB = true;
const _projectsCache = new Map();
let _recentProjectsCache = [];
let _bootstrapPromise = null;

function openDB() {
  if (!useIndexedDB) {
    return Promise.reject(new Error('IndexedDB disabled or unavailable'));
  }
  return new Promise((resolve, reject) => {
    try {
      if (!window.indexedDB) {
        useIndexedDB = false;
        return reject(new Error('IndexedDB not supported'));
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
          db.createObjectStore(STORE_PROJECTS);
        }
        if (!db.objectStoreNames.contains(STORE_METADATA)) {
          db.createObjectStore(STORE_METADATA);
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => {
        useIndexedDB = false;
        reject(e.target.error);
      };
    } catch (err) {
      useIndexedDB = false;
      reject(err);
    }
  });
}

function dbGet(storeName, key) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

function dbPut(storeName, key, value) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}

function dbDelete(storeName, key) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}

// ─────────────────────────────────────────────
// Migration from localStorage -> IndexedDB
// ─────────────────────────────────────────────

async function migrateToIndexedDB() {
  const userId = localStorage.getItem('syncraft_current_user_id') || localStorage.getItem('syncraft_current_user');
  const migrationFlag = userId ? `syncraft_db_migrated_${userId}` : `syncraft_db_migrated_anon`;

  if (localStorage.getItem(migrationFlag)) return;

  console.log('[ProjectService] Migrating projects from localStorage to IndexedDB...');

  try {
    const recentKey = getRecentKey();
    const localRecentsStr = localStorage.getItem(recentKey);
    if (localRecentsStr) {
      const localRecents = JSON.parse(localRecentsStr);
      await dbPut(STORE_METADATA, recentKey, localRecents);

      for (const item of localRecents) {
        const projKey = getProjectKey(item.id);
        const projDataStr = localStorage.getItem(projKey);
        if (projDataStr) {
          try {
            const projData = JSON.parse(projDataStr);
            await dbPut(STORE_PROJECTS, projKey, projData);
            // Delete from localStorage to free up space
            localStorage.removeItem(projKey);
          } catch (e) {
            console.error('[ProjectService] Failed to migrate project data for id:', item.id, e);
          }
        }
      }
      // Delete recents from localStorage
      localStorage.removeItem(recentKey);
    }
    localStorage.setItem(migrationFlag, '1');
    console.log('[ProjectService] Migration to IndexedDB completed successfully.');
  } catch (err) {
    console.error('[ProjectService] Migration to IndexedDB failed:', err);
  }
}

// ─────────────────────────────────────────────
// cache helpers
// ─────────────────────────────────────────────

function getRecentKey() {
  const userId = localStorage.getItem('syncraft_current_user_id') || localStorage.getItem('syncraft_current_user');
  if (userId) {
    return `${LS_RECENT_KEY}_${userId}`;
  }
  return LS_RECENT_KEY;
}

function getProjectKey(id) {
  const userId = localStorage.getItem('syncraft_current_user_id') || localStorage.getItem('syncraft_current_user');
  if (userId) {
    return `${LS_PROJECT_KEY}${userId}_${id}`;
  }
  return LS_PROJECT_KEY + id;
}

function readRecentCache() {
  return _recentProjectsCache;
}

function writeRecentCache(list) {
  _recentProjectsCache = list;
  const key = getRecentKey();
  if (useIndexedDB) {
    dbPut(STORE_METADATA, key, list).catch(err => {
      console.warn('[ProjectService] Failed to write recents to IndexedDB, falling back to localStorage:', err);
      try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) { console.error(e); }
    });
  } else {
    try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) { console.error(e); }
  }
}

function readProjectCache(id) {
  return _projectsCache.get(id) || null;
}

function writeProjectCache(project) {
  _projectsCache.set(project.id, project);
  const key = getProjectKey(project.id);
  if (useIndexedDB) {
    dbPut(STORE_PROJECTS, key, project).catch(err => {
      console.warn('[ProjectService] Failed to write project to IndexedDB, falling back to localStorage:', err);
      writeProjectToLocalStorage(key, project);
    });
  } else {
    writeProjectToLocalStorage(key, project);
  }
}

function writeProjectToLocalStorage(key, project) {
  try {
    localStorage.setItem(key, JSON.stringify(project));
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      console.warn('[ProjectService] localStorage quota exceeded — saving stripped project without SVG blobs.');
      try {
        const stripped = stripProjectForLocalStorage(project);
        localStorage.setItem(key, JSON.stringify(stripped));
      } catch (e2) {
        console.error('[ProjectService] Failed to save even stripped project:', e2);
      }
    } else {
      console.error('[ProjectService] Failed to save project:', e);
    }
  }
}

function stripProjectForLocalStorage(project) {
  return {
    ...project,
    canvasData: {
      ...project.canvasData,
      canvases: (project.canvasData?.canvases || []).map(c => ({
        ...c,
        svgContent: c.svgContent && c.svgContent.length > 50000 ? '' : (c.svgContent || ''),
      })),
      svgContent: (project.canvasData?.svgContent || '').length > 50000 ? '' : (project.canvasData?.svgContent || ''),
      thumbnail: '',
    },
    thumbnail: '',
  };
}

// ─────────────────────────────────────────────
// localStorage compatible synchronous wrappers
// ─────────────────────────────────────────────

function readRecents() {
  return readRecentCache();
}
function writeRecents(list) {
  writeRecentCache(list);
}
function readProject(id) {
  return readProjectCache(id);
}
function writeProject(project) {
  writeProjectCache(project);
}
function upsertRecent(project) {
  const recents = readRecents().filter(p => p.id !== project.id);
  const meta = {
    id:           project.id,
    name:         project.name,
    createdAt:    project.createdAt,
    lastModified: project.lastModified,
    thumbnail:    project.thumbnail,
  };
  const updated = [meta, ...recents].slice(0, MAX_RECENT);
  writeRecents(updated);
  return updated;
}

/**
 * Merge local projects with remote projects from Supabase.
 * Keeps local changes and unsynced projects, while pulling new remote ones.
 */
function mergeProjects(localList, remoteList) {
  const mergedMap = new Map();
  
  (localList || []).forEach(p => {
    if (p && p.id) {
      mergedMap.set(p.id, p);
    }
  });
  
  (remoteList || []).forEach(rp => {
    if (!rp || !rp.id) return;
    const lp = mergedMap.get(rp.id);
    if (!lp) {
      mergedMap.set(rp.id, rp);
    } else {
      const localTime = new Date(lp.lastModified || lp.createdAt || 0).getTime();
      const remoteTime = new Date(rp.lastModified || rp.createdAt || 0).getTime();
      if (remoteTime > localTime) {
        mergedMap.set(rp.id, rp);
      }
    }
  });
  
  return Array.from(mergedMap.values()).sort((a, b) => {
    const timeA = new Date(a.lastModified || a.createdAt || 0).getTime();
    const timeB = new Date(b.lastModified || b.createdAt || 0).getTime();
    return timeB - timeA;
  }).slice(0, MAX_RECENT);
}

// ─────────────────────────────────────────────
// Supabase background helpers  (non-blocking)
// ─────────────────────────────────────────────

/**
 * Get the current Supabase user WITHOUT blocking.
 * Returns null instead of throwing or hanging.
 */
async function getSessionUser() {
  if (!supabaseClient) return null;
  try {
    const sessionPromise = supabaseClient.auth.getSession();
    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 3000));
    const result = await Promise.race([sessionPromise, timeoutPromise]);
    if (result && result.data?.session?.user) {
      return result.data.session.user;
    }
  } catch (err) {
    console.warn('[ProjectService] getSessionUser error:', err);
  }

  // Fallback: use localStorage session info if Supabase SDK fails to respond in time
  const userId = localStorage.getItem('syncraft_current_user_id');
  const userEmail = localStorage.getItem('syncraft_current_user');
  if (userId) {
    return { id: userId, email: userEmail || '' };
  }
  return null;
}

/** Fire-and-forget: insert a new project row into Supabase */
function syncCreateToSupabase(project) {
  if (!supabaseClient) return;
  getSessionUser().then(user => {
    if (!user) return;
    supabaseClient.from('projects').insert({
      id:            project.id,
      user_id:       user.id,
      name:          project.name,
      thumbnail:     project.thumbnail,
      canvas_data:   project.canvasData,
      last_modified: project.lastModified,
    }).then(({ error }) => {
      if (error) {
        console.warn('Background Supabase create failed:', error.message);
        document.dispatchEvent(new CustomEvent('syncraft:syncError', { detail: error }));
      }
    });
  }).catch(() => {});
}

/** Fire-and-forget: upsert a project row in Supabase */
function syncUpdateToSupabase(project) {
  if (!supabaseClient) return;
  getSessionUser().then(user => {
    if (!user) {
      console.warn('[ProjectService] Cannot sync to Supabase — no authenticated user');
      return;
    }
    const payload = {
      id:            project.id,
      user_id:       user.id,
      name:          project.name,
      thumbnail:     project.thumbnail,
      canvas_data:   project.canvasData,
      last_modified: project.lastModified,
    };
    const payloadSize = JSON.stringify(payload).length;
    if (payloadSize > 800000) {
      console.warn(`[ProjectService] Supabase payload is large (${Math.round(payloadSize/1024)}KB). May fail if Postgres row limit exceeded.`);
    }
    supabaseClient.from('projects').upsert(payload)
      .then(({ error }) => {
        if (error) {
          console.error('[ProjectService] Supabase upsert failed:', error.code, error.message);
          document.dispatchEvent(new CustomEvent('syncraft:syncError', { detail: error }));
        } else {
          console.log('[ProjectService] Supabase sync OK (upsert) for project:', project.id, `(${Math.round(payloadSize/1024)}KB)`);
        }
      });
  }).catch(err => console.error('[ProjectService] getSessionUser error:', err));
}

/** Fire-and-forget: rename a project in Supabase */
function syncRenameToSupabase(project) {
  if (!supabaseClient) return;
  getSessionUser().then(user => {
    if (!user) return;
    supabaseClient.from('projects').update({
      name:          project.name,
      last_modified: project.lastModified,
    }).eq('id', project.id).eq('user_id', user.id)
      .then(({ error }) => {
        if (error) console.warn('Background Supabase rename failed:', error.message);
      });
  }).catch(() => {});
}

/** Fire-and-forget: delete a project row in Supabase */
function syncDeleteToSupabase(id) {
  if (!supabaseClient) return;
  supabaseClient.from('projects').delete().eq('id', id)
    .then(({ error }) => {
      if (error) console.warn('Background Supabase delete failed:', error.message);
    });
}

// ─────────────────────────────────────────────
// Autosave (timer-based, background)
// ─────────────────────────────────────────────

let _autosaveTimer = null;

function scheduleAutosave(project) {
  clearTimeout(_autosaveTimer);
  store.setState({ isDirty: true });
  _autosaveTimer = setTimeout(() => {
    store.setState({ isAutoSaving: true });
    // Persist locally
    const saved = patchProject(project);
    writeProject(saved);
    const recents = upsertRecent(saved);
    store.setState({
      currentProject: saved,
      recentProjects: recents,
      isDirty:        false,
      isAutoSaving:   false,
      lastSavedAt:    saved.lastModified,
    });
    document.dispatchEvent(new CustomEvent('syncraft:autosaved', { detail: saved }));
    // Background Supabase sync
    syncUpdateToSupabase(saved);
  }, AUTOSAVE_DELAY);
}

function migrateOldProjects() {
  const userId = localStorage.getItem('syncraft_current_user_id') || localStorage.getItem('syncraft_current_user');
  if (!userId) return; // No user logged in, nothing to migrate

  const migrationFlag = `syncraft_migrated_${userId}`;
  if (localStorage.getItem(migrationFlag)) return; // Already migrated

  // Read old global recents list
  let oldRecents = [];
  try { oldRecents = JSON.parse(localStorage.getItem(LS_RECENT_KEY) || '[]'); }
  catch { /* ignore */ }

  if (oldRecents.length === 0) {
    localStorage.setItem(migrationFlag, '1');
    return;
  }

  // Read current user-scoped recents (may already have some)
  const scopedRecents = readRecents();
  const scopedIds = new Set(scopedRecents.map(p => p.id));

  // Merge old projects that don't already exist in scoped storage
  const toMerge = oldRecents.filter(p => !scopedIds.has(p.id));

  if (toMerge.length > 0) {
    const merged = [...scopedRecents, ...toMerge].slice(0, MAX_RECENT);
    writeRecents(merged);

    // Also migrate individual project data
    toMerge.forEach(p => {
      const oldKey = LS_PROJECT_KEY + p.id;
      const oldData = localStorage.getItem(oldKey);
      if (oldData) {
        localStorage.setItem(getProjectKey(p.id), oldData);
      }
    });

    console.log(`Migrated ${toMerge.length} project(s) to user-scoped storage`);
  }

  localStorage.setItem(migrationFlag, '1');
}

async function migrateAnonymousProjects() {
  const userId = localStorage.getItem('syncraft_current_user_id') || localStorage.getItem('syncraft_current_user');
  if (!userId) return; // No logged-in user, nothing to migrate

  let anonRecents = [];
  let foundKey = null;
  let isFromIndexedDB = false;

  try {
    if (useIndexedDB) {
      anonRecents = await dbGet(STORE_METADATA, LS_RECENT_KEY) || [];
      if (anonRecents.length > 0) {
        foundKey = LS_RECENT_KEY;
        isFromIndexedDB = true;
      }
    }
    if (anonRecents.length === 0) {
      const lsVal = localStorage.getItem(LS_RECENT_KEY);
      if (lsVal) {
        anonRecents = JSON.parse(lsVal) || [];
        foundKey = LS_RECENT_KEY;
        isFromIndexedDB = false;
      }
    }
  } catch (err) {
    console.warn('[ProjectService] Failed to read anonymous recents:', err);
    return;
  }

  if (anonRecents.length === 0) return; // No guest projects found

  console.log(`[ProjectService] Found ${anonRecents.length} guest project(s). Migrating to user: ${userId}`);

  let userRecents = [];
  try {
    const userRecentsKey = `${LS_RECENT_KEY}_${userId}`;
    if (useIndexedDB) {
      userRecents = await dbGet(STORE_METADATA, userRecentsKey) || [];
    } else {
      userRecents = JSON.parse(localStorage.getItem(userRecentsKey) || '[]');
    }
  } catch (e) {
    userRecents = [];
  }

  const userRecentIds = new Set(userRecents.map(p => p.id));

  for (const item of anonRecents) {
    const anonProjKey = LS_PROJECT_KEY + item.id;
    let projectData = null;
    let projFromIndexedDB = false;
    try {
      if (useIndexedDB) {
        projectData = await dbGet(STORE_PROJECTS, anonProjKey);
        if (projectData) projFromIndexedDB = true;
      }
      if (!projectData) {
        const lsProj = localStorage.getItem(anonProjKey);
        if (lsProj) {
          projectData = JSON.parse(lsProj);
          projFromIndexedDB = false;
        }
      }
    } catch (err) {
      console.warn(`[ProjectService] Failed to read guest project ${item.id}:`, err);
    }

    if (projectData) {
      const userProjKey = `${LS_PROJECT_KEY}${userId}_${item.id}`;
      try {
        if (useIndexedDB) {
          await dbPut(STORE_PROJECTS, userProjKey, projectData);
          if (projFromIndexedDB) {
            await dbDelete(STORE_PROJECTS, anonProjKey);
          } else {
            localStorage.removeItem(anonProjKey);
          }
        } else {
          localStorage.setItem(userProjKey, JSON.stringify(projectData));
          localStorage.removeItem(anonProjKey);
        }
        
        syncCreateToSupabase(projectData);
      } catch (err) {
        console.error(`[ProjectService] Error migrating project ${item.id}:`, err);
      }

      if (!userRecentIds.has(item.id)) {
        userRecents.push({
          id:           item.id,
          name:         item.name,
          createdAt:    item.createdAt,
          lastModified: item.lastModified,
          thumbnail:    item.thumbnail,
        });
      }
    }
  }

  const userRecentsKey = `${LS_RECENT_KEY}_${userId}`;
  try {
    if (useIndexedDB) {
      await dbPut(STORE_METADATA, userRecentsKey, userRecents);
      if (isFromIndexedDB) {
        await dbDelete(STORE_METADATA, LS_RECENT_KEY);
      } else {
        localStorage.removeItem(LS_RECENT_KEY);
      }
    } else {
      localStorage.setItem(userRecentsKey, JSON.stringify(userRecents));
      localStorage.removeItem(LS_RECENT_KEY);
    }
  } catch (err) {
    console.error('[ProjectService] Failed to save merged recents list:', err);
  }

  console.log('[ProjectService] Guest projects successfully migrated and merged!');
}

async function migrateEmailScopedProjects() {
  const userId = localStorage.getItem('syncraft_current_user_id');
  const email = localStorage.getItem('syncraft_current_user');
  
  if (!userId || !email || userId === email) return;

  const oldRecentsKey = `${LS_RECENT_KEY}_${email}`;
  const oldRecentsKeyLower = `${LS_RECENT_KEY}_${email.toLowerCase()}`;

  let oldRecents = [];
  let foundKey = null;
  let isFromIndexedDB = false;

  try {
    if (useIndexedDB) {
      oldRecents = await dbGet(STORE_METADATA, oldRecentsKey) || [];
      if (oldRecents.length > 0) {
        foundKey = oldRecentsKey;
        isFromIndexedDB = true;
      } else {
        oldRecents = await dbGet(STORE_METADATA, oldRecentsKeyLower) || [];
        if (oldRecents.length > 0) {
          foundKey = oldRecentsKeyLower;
          isFromIndexedDB = true;
        }
      }
    }
    
    if (oldRecents.length === 0) {
      const lsVal = localStorage.getItem(oldRecentsKey);
      if (lsVal) {
        oldRecents = JSON.parse(lsVal) || [];
        foundKey = oldRecentsKey;
        isFromIndexedDB = false;
      } else {
        const lsValLower = localStorage.getItem(oldRecentsKeyLower);
        if (lsValLower) {
          oldRecents = JSON.parse(lsValLower) || [];
          foundKey = oldRecentsKeyLower;
          isFromIndexedDB = false;
        }
      }
    }
  } catch (err) {
    console.warn('[ProjectService] Failed to check email-scoped recents:', err);
  }

  if (oldRecents.length === 0 || !foundKey) return;

  console.log(`[ProjectService] Migrating ${oldRecents.length} project(s) from email-scope (${email}) to UUID-scope (${userId})...`);

  let userRecents = [];
  try {
    const userRecentsKey = `${LS_RECENT_KEY}_${userId}`;
    if (useIndexedDB) {
      userRecents = await dbGet(STORE_METADATA, userRecentsKey) || [];
    } else {
      userRecents = JSON.parse(localStorage.getItem(userRecentsKey) || '[]');
    }
  } catch (e) {
    userRecents = [];
  }

  const userRecentIds = new Set(userRecents.map(p => p.id));

  for (const item of oldRecents) {
    const emailProjKey1 = `${LS_PROJECT_KEY}${email}_${item.id}`;
    const emailProjKey2 = `${LS_PROJECT_KEY}${email.toLowerCase()}_${item.id}`;
    let projectData = null;
    let foundProjKey = null;
    let projFromIndexedDB = false;

    try {
      if (useIndexedDB) {
        projectData = await dbGet(STORE_PROJECTS, emailProjKey1);
        if (projectData) {
          foundProjKey = emailProjKey1;
          projFromIndexedDB = true;
        } else {
          projectData = await dbGet(STORE_PROJECTS, emailProjKey2);
          if (projectData) {
            foundProjKey = emailProjKey2;
            projFromIndexedDB = true;
          }
        }
      }
      
      if (!projectData) {
        const lsProj = localStorage.getItem(emailProjKey1);
        if (lsProj) {
          projectData = JSON.parse(lsProj);
          foundProjKey = emailProjKey1;
          projFromIndexedDB = false;
        } else {
          const lsProj2 = localStorage.getItem(emailProjKey2);
          if (lsProj2) {
            projectData = JSON.parse(lsProj2);
            foundProjKey = emailProjKey2;
            projFromIndexedDB = false;
          }
        }
      }
    } catch (err) {
      console.warn(`[ProjectService] Failed to read email-scoped project ${item.id}:`, err);
    }

    if (projectData && foundProjKey) {
      const userProjKey = `${LS_PROJECT_KEY}${userId}_${item.id}`;
      try {
        if (useIndexedDB) {
          await dbPut(STORE_PROJECTS, userProjKey, projectData);
          if (projFromIndexedDB) {
            await dbDelete(STORE_PROJECTS, foundProjKey);
          } else {
            localStorage.removeItem(foundProjKey);
          }
        } else {
          localStorage.setItem(userProjKey, JSON.stringify(projectData));
          localStorage.removeItem(foundProjKey);
        }
        
        syncCreateToSupabase(projectData);
      } catch (err) {
        console.error(`[ProjectService] Error migrating project ${item.id} to UUID-scope:`, err);
      }

      if (!userRecentIds.has(item.id)) {
        userRecents.push({
          id:           item.id,
          name:         item.name,
          createdAt:    item.createdAt,
          lastModified: item.lastModified,
          thumbnail:    item.thumbnail,
        });
      }
    }
  }

  const userRecentsKey = `${LS_RECENT_KEY}_${userId}`;
  try {
    if (useIndexedDB) {
      await dbPut(STORE_METADATA, userRecentsKey, userRecents);
      if (isFromIndexedDB) {
        await dbDelete(STORE_METADATA, foundKey);
      } else {
        localStorage.removeItem(foundKey);
      }
    } else {
      localStorage.setItem(userRecentsKey, JSON.stringify(userRecents));
      localStorage.removeItem(foundKey);
    }
  } catch (err) {
    console.error('[ProjectService] Failed to save merged recents list:', err);
  }

  console.log('[ProjectService] Email-scoped projects successfully migrated to UUID-scope!');
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

const ProjectService = {

  async bootstrap(force = false) {
    if (force) {
      _bootstrapPromise = null;
    }
    if (_bootstrapPromise) return _bootstrapPromise;

    _bootstrapPromise = (async () => {
      console.log('[ProjectService Debug] bootstrap starting...');
      console.log('[ProjectService Debug] current user id:', localStorage.getItem('syncraft_current_user_id'));
      console.log('[ProjectService Debug] current user (email):', localStorage.getItem('syncraft_current_user'));
      
      const lsKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.includes('syncraft')) {
          lsKeys.push(k);
        }
      }
      console.log('[ProjectService Debug] localStorage syncraft keys:', lsKeys);

      // 1. Run one-time migration from old global keys to user-scoped keys in localStorage
      migrateOldProjects();

      // 2. Open IndexedDB and fallback if disabled/blocked
      try {
        await openDB();
      } catch (err) {
        console.warn('[ProjectService] Failed to initialize IndexedDB, falling back to localStorage:', err);
        useIndexedDB = false;
      }

      if (useIndexedDB) {
        try {
          const db = await openDB();
          const getKeys = (storeName) => new Promise(resolve => {
            const tx = db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).getAllKeys();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve([]);
          });
          const metadataKeys = await getKeys(STORE_METADATA);
          const projectsKeys = await getKeys(STORE_PROJECTS);
          console.log('[ProjectService Debug] IndexedDB metadata keys:', metadataKeys);
          console.log('[ProjectService Debug] IndexedDB projects keys:', projectsKeys);
        } catch (e) {
          console.warn('[ProjectService Debug] Failed to list IndexedDB keys:', e);
        }
      }

      // 3. Migrate from localStorage to IndexedDB if available
      if (useIndexedDB) {
        await migrateToIndexedDB();
      }

      // 4. Migrate any anonymous/guest projects to the logged-in user
      await migrateAnonymousProjects();

      // 5. Migrate any older email-scoped projects to the UUID-scoped key
      await migrateEmailScopedProjects();

      // 4. Load recent projects list
      let cachedRecents = [];
      if (useIndexedDB) {
        try {
          cachedRecents = await dbGet(STORE_METADATA, getRecentKey()) || [];
        } catch (err) {
          console.error('[ProjectService] Failed to load recents from IndexedDB:', err);
        }
      } else {
        try {
          cachedRecents = JSON.parse(localStorage.getItem(getRecentKey()) || '[]');
        } catch {
          cachedRecents = [];
        }
      }

      _recentProjectsCache = cachedRecents;
      _projectsCache.clear();

      // 5. Load full projects for recent metadata items into memory cache
      for (const item of cachedRecents) {
        try {
          let fullProj = null;
          if (useIndexedDB) {
            fullProj = await dbGet(STORE_PROJECTS, getProjectKey(item.id));
          } else {
            fullProj = JSON.parse(localStorage.getItem(getProjectKey(item.id)) || 'null');
          }

          if (fullProj) {
            _projectsCache.set(item.id, fullProj);
          }
        } catch (err) {
          console.error('[ProjectService] Failed to preload project during bootstrap:', item.id, err);
        }
      }

      // 6. Update the store and notify the UI
      store.setState({ recentProjects: cachedRecents });
      document.dispatchEvent(new CustomEvent('syncraft:projectsLoaded', { detail: cachedRecents }));

      // 7. Restore last active project into store so workspace never starts blank
      if (cachedRecents.length > 0) {
        const lastMeta = cachedRecents[0];
        const lastFull = _projectsCache.get(lastMeta.id);
        if (lastFull) {
          store.setState({
            currentProject: lastFull,
            lastSavedAt:    lastFull.lastModified,
          });
        }
      }

      // 8. Background: silently refresh from Supabase
      if (supabaseClient) {
        getSessionUser().then(user => {
          if (!user) return;
          supabaseClient
            .from('projects')
            .select('id, name, last_modified, thumbnail')
            .eq('user_id', user.id)
            .order('last_modified', { ascending: false })
            .then(({ data, error }) => {
              if (error || !data) return;
              const projects = data.map(p => ({
                id:           p.id,
                name:         p.name,
                createdAt:    p.last_modified,
                lastModified: p.last_modified,
                thumbnail:    p.thumbnail,
              }));
              
              const localRecents = readRecents();
              const merged = mergeProjects(localRecents, projects);

              writeRecents(merged);
              store.setState({ recentProjects: merged });
              document.dispatchEvent(new CustomEvent('syncraft:projectsLoaded', { detail: merged }));
            });
        }).catch(() => {});
      }

      return cachedRecents;
    })();

    return _bootstrapPromise;
  },

  // ── Get last used project (full data from in-memory cache) ──
  getLastProject() {
    const recents = readRecents();
    if (recents.length === 0) return null;
    return readProject(recents[0].id) || null;
  },

  // ── Create ─────────────────────────────────────
  createProject(name) {
    const project = makeProject(name);

    // Save to cache (which writes to IndexedDB/localStorage asynchronously)
    writeProject(project);
    const recents = upsertRecent(project);

    store.setState({
      currentProject: project,
      recentProjects: recents,
      isDirty:        false,
      isAutoSaving:   false,
      lastSavedAt:    project.createdAt,
    });

    document.dispatchEvent(new CustomEvent('syncraft:projectCreated', { detail: project }));

    // Sync to Supabase in the background
    syncCreateToSupabase(project);

    return project;
  },

  // ── Open ───────────────────────────────────────
  async openProject(id) {
    // 1. Try in-memory cache first
    let project = readProject(id);

    // 2. Try IndexedDB next
    if (!project && useIndexedDB) {
      try {
        project = await dbGet(STORE_PROJECTS, getProjectKey(id));
        if (project) {
          _projectsCache.set(id, project);
        }
      } catch (err) {
        console.warn('[ProjectService] IndexedDB read failed on open:', err);
      }
    }

    // 3. Try localStorage as last resort
    if (!project) {
      try {
        project = JSON.parse(localStorage.getItem(getProjectKey(id)) || 'null');
        if (project) {
          _projectsCache.set(id, project);
        }
      } catch {
        project = null;
      }
    }

    if (project) {
      const localHasSvg = project.canvasData?.svgContent ||
                          project.canvasData?.canvases?.some(c => c.svgContent);

      if (localHasSvg) {
        const recents = upsertRecent(project);
        store.setState({
          currentProject: project,
          recentProjects: recents,
          isDirty:        false,
          lastSavedAt:    project.lastModified,
        });
        document.dispatchEvent(new CustomEvent('syncraft:projectOpened', { detail: project }));

        if (supabaseClient) {
          supabaseClient.from('projects').select('*').eq('id', id).single()
            .then(({ data, error }) => {
              if (!error && data && data.canvas_data) {
                const hasRemoteSvg = data.canvas_data?.svgContent ||
                                     data.canvas_data?.canvases?.some(c => c.svgContent);
                const localProject = store.getState().currentProject;
                const remoteIsNewer = data.last_modified > (localProject?.lastModified || '');

                if (hasRemoteSvg && remoteIsNewer) {
                  const fresh = {
                    id:           data.id,
                    name:         data.name,
                    thumbnail:    data.thumbnail,
                    canvasData:   data.canvas_data,
                    createdAt:    data.last_modified,
                    lastModified: data.last_modified,
                  };
                  writeProject(fresh);
                  if (store.getState().currentProject?.id === id) {
                    store.setState({ currentProject: fresh });
                    if (document.getElementById('workspace-view') && !document.getElementById('workspace-view').classList.contains('hidden')) {
                      document.dispatchEvent(new CustomEvent('syncraft:projectOpened', { detail: fresh }));
                    }
                  }
                } else if (!hasRemoteSvg) {
                  if (store.getState().currentProject?.id === id) {
                    store.setState(s => ({
                      currentProject: s.currentProject ? { ...s.currentProject, name: data.name } : s.currentProject
                    }));
                  }
                }
              }
            }).catch(() => {});
        }

        return project;
      } else {
        console.log('[ProjectService] Local project has no SVG — opening immediately, fetching from Supabase in background...');
        // Open the local project instantly so the user sees the workspace immediately
        const recents = upsertRecent(project);
        store.setState({ currentProject: project, recentProjects: recents, isDirty: false, lastSavedAt: project.lastModified });
        document.dispatchEvent(new CustomEvent('syncraft:projectOpened', { detail: project }));

        // Background-fetch the remote version and hot-swap if newer
        if (supabaseClient) {
          supabaseClient
            .from('projects').select('*').eq('id', id).single()
            .then(({ data, error }) => {
              if (error || !data || !data.canvas_data) return;
              const fresh = {
                id:           data.id,
                name:         data.name,
                thumbnail:    data.thumbnail,
                canvasData:   data.canvas_data,
                createdAt:    data.last_modified,
                lastModified: data.last_modified,
              };
              writeProject(fresh);
              if (store.getState().currentProject?.id === id) {
                store.setState({ currentProject: fresh });
                document.dispatchEvent(new CustomEvent('syncraft:projectOpened', { detail: fresh }));
              }
            }).catch(() => {});
        }
        return project;
      }
    }

    if (supabaseClient) {
      const fetchPromise = supabaseClient
        .from('projects').select('*').eq('id', id).single()
        .then(({ data, error }) => {
          if (error || !data) return null;
          const p = {
            id:           data.id,
            name:         data.name,
            thumbnail:    data.thumbnail,
            canvasData:   data.canvas_data,
            createdAt:    data.last_modified,
            lastModified: data.last_modified,
          };
          writeProject(p);
          const recents = upsertRecent(p);
          store.setState({
            currentProject: p,
            recentProjects: recents,
            isDirty:        false,
            lastSavedAt:    p.lastModified,
          });
          document.dispatchEvent(new CustomEvent('syncraft:projectOpened', { detail: p }));
          return p;
        });

      const timeout = new Promise(resolve => setTimeout(() => resolve(null), 2000));
      return Promise.race([fetchPromise, timeout]);
    }

    return null;
  },

  // ── Save (immediate) ───────────────────────────
  async saveNow() {
    clearTimeout(_autosaveTimer);
    const { currentProject } = store.getState();
    if (!currentProject) return null;

    const saved = patchProject(currentProject);

    writeProject(saved);
    const recents = upsertRecent(saved);
    store.setState({
      currentProject: saved,
      recentProjects: recents,
      isDirty:        false,
      isAutoSaving:   false,
      lastSavedAt:    saved.lastModified,
    });

    document.dispatchEvent(new CustomEvent('syncraft:autosaved', { detail: saved }));

    syncUpdateToSupabase(saved);

    return saved;
  },

  // ── Canvas data update (triggers autosave) ────────────
  updateCanvasData(patch) {
    const { currentProject } = store.getState();
    if (!currentProject) return;

    const safePatch = { ...patch };
    if (safePatch.canvases) {
      safePatch.canvases = safePatch.canvases.map(c => {
        const { isGenerating, progress, statusText, ...rest } = c;
        return rest;
      });
    }

    const updated = patchProject(currentProject, {
      canvasData: { ...currentProject.canvasData, ...safePatch },
    });
    store.setState({ currentProject: updated, isDirty: true });
    scheduleAutosave(updated);
  },

  // ── Rename ─────────────────────────────────────
  async renameProject(idOrName, optionalName) {
    let id, newName;
    if (optionalName !== undefined) {
      id = idOrName;
      newName = optionalName;
    } else {
      const { currentProject } = store.getState();
      if (!currentProject) return;
      id = currentProject.id;
      newName = idOrName;
    }

    const trimmed = newName.trim() || 'Untitled Project';
    let p = readProject(id);
    if (!p) {
      const recents = readRecents();
      const meta = recents.find(r => r.id === id);
      if (meta) {
        p = { ...meta, canvasData: {} };
      }
    }
    if (!p) return;

    const updated = patchProject(p, { name: trimmed });

    writeProject(updated);
    const recents = upsertRecent(updated);
    
    const { currentProject } = store.getState();
    if (currentProject && currentProject.id === id) {
      store.setState({
        currentProject: { ...currentProject, name: trimmed, lastModified: updated.lastModified },
        recentProjects: recents,
        lastSavedAt:    updated.lastModified,
      });
    } else {
      store.setState({
        recentProjects: recents
      });
    }

    document.dispatchEvent(new CustomEvent('syncraft:projectRenamed', { detail: updated }));

    // Background Supabase sync
    syncRenameToSupabase(updated);
  },

  async deleteProject(id) {
    const key = getProjectKey(id);
    _projectsCache.delete(id);
    _recentProjectsCache = _recentProjectsCache.filter(p => p.id !== id);

    if (useIndexedDB) {
      dbDelete(STORE_PROJECTS, key).catch(() => {});
      dbPut(STORE_METADATA, getRecentKey(), _recentProjectsCache).catch(() => {});
    }
    
    // Always clean up localStorage just in case it was stored there
    localStorage.removeItem(key);
    try {
      localStorage.setItem(getRecentKey(), JSON.stringify(_recentProjectsCache));
    } catch {}

    store.setState(s => ({
      recentProjects: _recentProjectsCache,
      currentProject: s.currentProject?.id === id ? null : s.currentProject,
    }));

    document.dispatchEvent(new CustomEvent('syncraft:projectDeleted', { detail: { id } }));

    // Background Supabase sync
    syncDeleteToSupabase(id);
  },

  // ── Update thumbnail ───────────────────────────
  async updateThumbnail(svgString) {
    const { currentProject } = store.getState();
    if (!currentProject) return;

    let optimizedSvg = svgString;
    if (svgString && svgString.includes('data:image/') && svgString.length > 50000) {
      optimizedSvg = await optimizeSvgThumbnail(svgString);
    }

    const updated = patchProject(currentProject, { thumbnail: optimizedSvg });
    store.setState({ currentProject: updated });
    scheduleAutosave(updated);
  },

  // ── Queries ────────────────────────────────────
  getRecentProjects() { return store.getState().recentProjects; },
  getCurrentProject() { return store.getState().currentProject; },
  hasUnsavedChanges() { return store.getState().isDirty; },
};

// Helper to resize and compress any large base64 raster images embedded in the SVG thumbnail
async function optimizeSvgThumbnail(svgString) {
  if (!svgString) return '';
  if (!svgString.includes('data:image/') || svgString.length < 50000) {
    return svgString;
  }
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const images = doc.querySelectorAll('image');
    let modified = false;

    for (const img of images) {
      const href = img.getAttribute('href') || img.getAttribute('xlink:href') || '';
      if (href.startsWith('data:image/') && href.length > 50000) {
        try {
          const resized = await resizeImage(href, 160, 0.6);
          img.setAttribute('href', resized);
          img.removeAttribute('xlink:href'); // standardise to href
          modified = true;
        } catch (e) {
          console.warn('Failed to resize embedded image in thumbnail:', e);
        }
      }
    }
    if (modified) {
      const serializer = new XMLSerializer();
      return serializer.serializeToString(doc);
    }
  } catch (err) {
    console.warn('Error optimizing SVG thumbnail:', err);
  }
  return svgString;
}

// Listen for auth changes to re-bootstrap projects dynamically
// IMPORTANT: Only clear project state on SIGNED_OUT.
// INITIAL_SESSION / TOKEN_REFRESHED / SIGNED_IN fire on every page load when
// Supabase restores the persisted session — wiping currentProject here would
// destroy the project the workspace just restored from localStorage.
document.addEventListener('syncraft:authChange', (e) => {
  const event = e?.detail?.event;

  if (event === 'SIGNED_OUT') {
    // User explicitly logged out — clear everything for the next user
    store.setState({ recentProjects: [], currentProject: null });
    document.dispatchEvent(new CustomEvent('syncraft:projectsLoaded', { detail: [] }));
  }

  // Always re-bootstrap to refresh the projects list and restore last project
  // if it wasn't already in the store (handles the async auth case).
  ProjectService.bootstrap(true);
});

export default ProjectService;
