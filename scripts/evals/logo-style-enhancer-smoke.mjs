// Three bounded, opt-in text-only probes. No image calls, project writes or
// Syncraft credit changes. A started request is never retried by this script.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { buildLogoEnhancerInput, parseLogoEnhancedPrompt } from '../../src/lib/logoPromptEnhancer.mjs';
import { LOGO_STYLE_LANGUAGE_VERSION } from '../../src/lib/logoStyleLanguage.mjs';

const folder = resolve('outputs/logo-gallery-review');
mkdirSync(folder, { recursive: true });
const path = resolve(folder, 'enhancer-probes.json');
const state = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {
  guidanceVersion: LOGO_STYLE_LANGUAGE_VERSION,
  samples: [
    { style: 'monogram', prompt: 'A fox formed within an F, no extra symbols.', designSettings: { monogramLetters: 'F', monogramFont: 'sans', monogramTreatment: 'geometric', detail: 'minimal' } },
    { style: 'wordmark', prompt: 'A house suggested through a roof-shaped letter detail. No separate icon.', designSettings: { fontFamily: 'sans', composition: 'horizontal', detail: 'minimal' }, hasBrand: true },
    { style: 'engraved', prompt: 'A barn owl facing left with one raised wing, no frame.', designSettings: { engravingTechnique: 'stipple', detail: 'detailed' } },
  ].map(sample => ({ ...sample, status: 'not-started' })),
};
if (state.guidanceVersion !== LOGO_STYLE_LANGUAGE_VERSION) throw new Error('Preserve the existing evaluation; guidance has changed.');
const save = () => writeFileSync(path, JSON.stringify(state, null, 2));
save();
if (!process.argv.includes('--run-paid')) {
  console.log(JSON.stringify({ textCalls: 3, maxOutputTokensEach: 600, imageCalls: 0, model: 'openai/gpt-6-luna', callsStarted: 0 }));
  process.exit(0);
}
config({ path: '.env.local', quiet: true }); config({ path: '.env', quiet: true });
if (!process.env.FAL_KEY) throw new Error('Prompt enhancer credentials are unavailable.');
for (const sample of state.samples) {
  if (sample.status !== 'not-started') continue;
  sample.status = 'started'; save();
  const start = Date.now();
  try {
    const payload = buildLogoEnhancerInput({ ...sample, mode: 'text', palette: [] });
    const response = await fetch('https://fal.run/openrouter/router', { method: 'POST', signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`Provider returned ${response.status}.`);
    const output = await response.json();
    sample.enhancedPrompt = parseLogoEnhancedPrompt(output, sample.prompt);
    sample.elapsedMs = Date.now() - start;
    sample.reportedCostUsd = output.usage?.cost ?? null;
    sample.tokens = { input: output.usage?.prompt_tokens, output: output.usage?.completion_tokens };
    sample.status = 'succeeded';
  } catch (error) { sample.status = 'failed'; sample.error = error.message; }
  save();
  console.log(JSON.stringify(sample));
}
