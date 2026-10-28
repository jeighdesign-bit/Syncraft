// Produces an offline pilot manifest. It never calls a provider or spends credits.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizeLogoBrief, fallbackLogoDirections } from '../../src/lib/logoDesignBrief.mjs';
import { compileLogoDirection } from '../../src/lib/logoPromptCompiler.mjs';
import { buildLogoPrompt } from '../../src/lib/logoStudio.mjs';
const cases = [
  ['wordmark', 'TIP YOUR BARBER', 'Fresh Cuts', 'Cracked piggy bank and spilling coins integrated into readable lettering. Vintage playful treatment.'],
  ['wordmark', 'TIDELINE', '', 'Coastal bakery with a wave integrated into the lettering. Calm and welcoming.'],
  ['minimalist', 'Northline', '', 'Mountain and rising sun sharing one contour. Black and white.'],
  ['minimalist', 'Seed', '', 'One seed becoming a leaf, using negative space. Green.'],
  ['retro', 'Brew Buddy', '', 'Friendly waving coffee cup, cream and orange.'],
  ['retro', 'Night Shift', '', 'Expressive owl carrying a lantern, warm spot inks.'],
];
const rows = [];
for (const [index, [style, brand, tagline, prompt]] of cases.entries()) {
  const input = { operation: 'generate', mode: 'text', style, brand, tagline, prompt, palette: [] };
  const brief = normalizeLogoBrief(input);
  for (const repetition of [0, 1]) for (const pipeline of ['baseline', 'new-fallback']) rows.push({
    caseId: index + 1, repetition, pipeline, input, seed: 2000 + index * 10 + repetition,
    compiledPrompt: pipeline === 'baseline' ? buildLogoPrompt(input) : compileLogoDirection(brief, fallbackLogoDirections(brief, 1)[0]),
    review: { typography: null, motifs: null, style: null, distinctiveness: null, smallSize: null, preferred: null },
  });
}
const folder = resolve('outputs/logo-quality-pilot');
await mkdir(folder, { recursive: true });
await writeFile(resolve(folder, 'dry-run.json'), JSON.stringify({ dryRun: true, providerCalls: 0, note: 'Fallback compiler pilot only. AI planner must be evaluated separately after configuration.', rows }, null, 2));
console.log(`Wrote ${rows.length} offline evaluation entries. No paid calls.`);
