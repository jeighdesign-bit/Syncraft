export const LOGO_MAX_SEED = 4294967295;

export function logoGenerationOptionsFromDraft(value = {}) {
  const { seed, ...rest } = value;
  if (seed === '' || seed == null) return normalizeLogoGenerationOptions(rest);
  if (typeof seed === 'string' && !/^\d+$/.test(seed)) throw new Error('Use digits only for the seed, or leave it blank.');
  return normalizeLogoGenerationOptions({ ...rest, seed: Number(seed) });
}

export function normalizeLogoGenerationOptions(value) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['conceptMode', 'seed', 'styleMatch'].includes(key))) throw new Error('Choose supported logo generation options.');
  const result = {};
  if (value.conceptMode !== undefined) {
    if (!['explore', 'faithful'].includes(value.conceptMode)) throw new Error('Choose Explore or Follow brief.');
    result.conceptMode = value.conceptMode;
  }
  if (value.styleMatch !== undefined) {
    if (!['flexible', 'precise'].includes(value.styleMatch)) throw new Error('Choose Flexible or Precise style matching.');
    result.styleMatch = value.styleMatch;
  }
  if (value.seed !== undefined) {
    if (!Number.isInteger(value.seed) || value.seed < 0 || value.seed > LOGO_MAX_SEED) throw new Error('Use a whole-number seed from 0 to 4294967295, or leave it blank.');
    result.seed = value.seed;
  }
  return result;
}
