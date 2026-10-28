// Standalone paid provider check. Does not read or change Syncraft projects or credits.
// Usage: node scripts/evals/logo-image-direction-live.mjs <source.png> <style> <output.png> [brand] [mainLetters]
import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { config } from 'dotenv';
import { fal } from '@fal-ai/client';
import { validateLogoOperation } from '../../src/lib/logoStudio.mjs';
import { nanoLogoPlan } from '../../src/lib/logoFal.mjs';

const [sourcePath, style, outputPath, brand = '', monogramLetters = ''] = process.argv.slice(2);
if (!sourcePath || !style || !outputPath) throw new Error('Provide a source image, style, and output PNG path. This call incurs a provider charge.');
config({ path: '.env', quiet: true });
config({ path: '.env.local', quiet: true, override: true });
if (!process.env.FAL_KEY) throw new Error('FAL_KEY is unavailable.');

const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[extname(sourcePath).toLowerCase()];
if (!mime) throw new Error('Use a PNG, JPG, or WebP source.');
const source = `data:${mime};base64,${(await readFile(sourcePath)).toString('base64')}`;
const request = validateLogoOperation({ requestId: crypto.randomUUID(), operation: 'generate', mode: 'image', style, prompt: '', brand,
  designSettings: monogramLetters ? { monogramLetters } : {}, sourceUrl: source });
const plan = nanoLogoPlan(request, source);
const result = await fal.subscribe(plan.endpoint, { input: plan.input });
const imageUrl = result.data?.images?.[0]?.url;
if (!imageUrl) throw new Error('Provider returned no image.');
const imageResponse = await fetch(imageUrl);
if (!imageResponse.ok) throw new Error(`Unable to download provider image (${imageResponse.status}).`);
await writeFile(outputPath, Buffer.from(await imageResponse.arrayBuffer()));
console.log(JSON.stringify({ outputPath, style, model: plan.model, providerCostEstimateUsd: plan.cost, requestId: result.requestId }));
