import { ALLOWED_ASPECT_RATIOS } from './aspectRatio.js';

export const RECOVERY_LAYOUTS = [
  'flat_rectangle', 'long_strip', 'parallel_strips', 'cylindrical_label',
  'sticker_decal', 'packaging_panels', 'large_format_rectangle', 'unknown',
];
export const RECOVERY_STATES = ['safe', 'partial', 'insufficient'];
const severity = value => ['none', 'low', 'medium', 'high'].includes(value) ? value : 'unknown';
const percentage = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Number(value))) : 0;

// Share exactly the same evidence normalization between the live route and evals.
// Missing evidence stays unknown; absent booleans cannot enable pixel recovery.
export function normalizeRecoveryAnalysis(raw = {}, fallbackAspectRatio = '1:1') {
  raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const quad = raw.print_quad;
  const validPoints = Array.isArray(quad) && quad.length === 4
    && quad.every(point => Array.isArray(point) && point.length === 2
      && point.every(value => Number.isFinite(value) && value >= 0 && value <= 1000));
  return {
    state: RECOVERY_STATES.includes(raw.state) ? raw.state : 'insufficient',
    quality: ['good', 'fair', 'poor'].includes(raw.quality) ? raw.quality : 'poor',
    confidence: percentage(raw.confidence),
    visible_coverage: percentage(raw.visible_coverage),
    layout_strategy: RECOVERY_LAYOUTS.includes(raw.layout_strategy) ? raw.layout_strategy : 'unknown',
    aspect_ratio: raw.aspect_ratio === 'auto' || ALLOWED_ASPECT_RATIOS.includes(raw.aspect_ratio) ? raw.aspect_ratio : fallbackAspectRatio,
    perspective: severity(raw.perspective), curvature: severity(raw.curvature),
    folds: severity(raw.folds), reflections: severity(raw.reflections), occlusion: severity(raw.occlusion),
    missing_areas: Array.isArray(raw.missing_areas) ? raw.missing_areas.slice(0, 8).map(value => String(value).slice(0, 200)) : [],
    expected_result: String(raw.expected_result || 'Recovered visible artwork in a clean flat layout.').slice(0, 300),
    reason: String(raw.reason || '').slice(0, 300),
    surface_description: String(raw.surface_description || '').slice(0, 1200),
    surface_geometry: ['planar', 'curved', 'folded'].includes(raw.surface_geometry) ? raw.surface_geometry : 'unknown',
    print_quad: validPoints ? quad.map(point => [...point]) : null,
    presentation_type: ['digital_artwork', 'physical_surface'].includes(raw.presentation_type) ? raw.presentation_type : 'unknown',
    already_flat: raw.already_flat === true,
    single_surface: raw.single_surface === true,
    geometry_confidence: percentage(raw.geometry_confidence),
    readable_text: Array.isArray(raw.readable_text) ? raw.readable_text.filter(value => typeof value === 'string').slice(0, 12).map(value => value.trim().slice(0, 160)).filter(Boolean) : [],
  };
}
