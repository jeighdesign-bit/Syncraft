/**
 * ─────────────────────────────────────────────
 * SYNCRAFT  –  Data Types  (JSDoc)
 * ─────────────────────────────────────────────
 *
 * This file defines the canonical data shapes used throughout the app.
 * Because we are writing vanilla ES-module JavaScript (not TypeScript),
 * we use JSDoc @typedef blocks so editors can still provide type hints
 * and IDE intellisense without a build step.
 */

/**
 * Snapshot of the canvas at a given point in time.
 *
 * @typedef {Object} CanvasData
 * @property {string}  svgContent  - Raw SVG markup string currently on canvas.
 * @property {string}  prompt      - The last prompt that produced this canvas state.
 * @property {number}  zoomLevel   - Current zoom multiplier (e.g. 1.0 = 100 %).
 * @property {string}  activeTool  - Title of the active sidebar tool (e.g. "Select").
 * @property {string}  vectorKey   - Key into the vectors registry (e.g. "studio lighting").
 * @property {Array<{id: string, text: string, x: number, y: number, width?: number, height?: number}>} annotations - Callout labels and selection boxes added to canvas.
 * @property {boolean} bgRemoved   - True if background has been removed.
 * @property {string}  referenceImage - Base64 DataURL representing the reference image uploaded.
 */

/**
 * A single Syncraft project.
 *
 * @typedef {Object} Project
 * @property {string}     id           - UUID v4, unique identifier.
 * @property {string}     name         - User-editable project name.
 * @property {string}     createdAt    - ISO 8601 timestamp of creation.
 * @property {string}     lastModified - ISO 8601 timestamp of last save.
 * @property {CanvasData} canvasData   - Current canvas state.
 * @property {string}     thumbnail    - Inline SVG or data-URI used for previews.
 */

/**
 * The shape of the global application state managed by ProjectStore.
 *
 * @typedef {Object} AppState
 * @property {Project|null} currentProject  - The project open in the editor.
 * @property {Project[]}    recentProjects  - Ordered list (newest first), max 10.
 * @property {boolean}      isDirty         - True when unsaved changes exist.
 * @property {boolean}      isAutoSaving    - True during an in-flight autosave.
 * @property {string|null}  lastSavedAt     - ISO timestamp of last successful save.
 */

// ─────────────────────────────────────────────
// Factory helpers
// ─────────────────────────────────────────────

/**
 * Create a blank CanvasData object.
 * @returns {CanvasData}
 */
export function makeCanvasData() {
  return {
    svgContent: '',
    prompt:     '',
    zoomLevel:  1.0,
    activeTool: 'Select',
    vectorKey:  '',
    annotations: [],
    bgRemoved: false,
    referenceImage: '',
    canvasWidth: 1024,
    canvasHeight: 1024,
    canvasUnit: 'px',
    canvasPreset: 'Square',
    exportDpi: 300,
  };
}

/**
 * Generate a UUID v4. Uses crypto.randomUUID() when available (secure context),
 * otherwise falls back to Math.random() so makeProject never throws.
 * @returns {string}
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: RFC 4122 v4 UUID via Math.random
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Create a new Project with a unique id and current timestamps.
 * @param {string} [name='Untitled Project'] - Initial project name.
 * @returns {Project}
 */
export function makeProject(name = 'Untitled Project') {
  const now = new Date().toISOString();
  return {
    id:           generateUUID(),
    name,
    createdAt:    now,
    lastModified: now,
    canvasData:   makeCanvasData(),
    thumbnail:    '',
  };
}

/**
 * Return a shallow copy of a Project with lastModified updated to now.
 * @param {Project} project
 * @param {Partial<Project>} [patch={}]
 * @returns {Project}
 */
export function patchProject(project, patch = {}) {
  return {
    ...project,
    ...patch,
    lastModified: new Date().toISOString(),
  };
}
