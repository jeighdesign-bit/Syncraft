import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { LOGO_STYLES, validateLogoOperation } from '../src/lib/logoStudio.mjs';
import { logoUsesNano, LOGO_NANO_TEXT_STYLES } from '../src/lib/logoModelRouting.mjs';
import { nanoLogoPlan } from '../src/lib/logoFal.mjs';
import { recraftLogoPlan } from '../src/lib/logoRecraft.mjs';
import { prepareNanoLogoStyleReference } from '../src/lib/logoNanoTextServer.mjs';

test('every style has an explicit provider rule for creation, variations, edits and utilities', () => {
  assert.deepEqual([...LOGO_NANO_TEXT_STYLES].sort(), ['cartoon', 'icon', 'mascot', 'retro']);
  for (const { id: style } of LOGO_STYLES) {
    for (const operation of ['generate', 'variations', 'edit', 'removeBg', 'vectorize']) {
      for (const mode of ['text', 'image', 'sketch']) {
        assert.equal(logoUsesNano({ operation, mode, style }),
          operation === 'generate' && mode === 'text' ? ['cartoon', 'icon', 'mascot', 'retro'].includes(style)
            : !['removeBg', 'vectorize'].includes(operation) && style !== 'streetwear-lettering', `${style}/${operation}/${mode}`);
      }
    }
  }
});

test('Nano style inspiration is converted from validated bytes to a bounded PNG without an example artboard', async () => {
  for (const [width, height] of [[2048, 1024], [320, 160]]) {
    const input = validateLogoOperation({ requestId: crypto.randomUUID(), style: 'retro', prompt: 'A bee with angel wings', styleReferenceUrl: 'https://storage.test/style.png' });
    const source = await sharp({ create: { width, height, channels: 3, background: '#AABBCC' } }).webp().toBuffer();
    const reference = await prepareNanoLogoStyleReference(source);
    const bytes = Buffer.from(reference.split(',')[1], 'base64');
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, 'png'); assert.equal(metadata.width, Math.min(width, 1024));
    assert.equal(metadata.width / metadata.height, 2);
    const plan = nanoLogoPlan(input, reference);
    assert.equal(plan.endpoint, 'google/nano-banana-2.1/edit');
    assert.deepEqual(plan.input.image_urls, [reference]);
    assert.match(plan.input.prompt, /A bee with angel wings/);
    assert.equal(plan.input.style_reference_urls, undefined);
  }
});

test('Streetwear edits use the accepted image and exact instruction on Recraft without generation guides', () => {
  const input = validateLogoOperation({ requestId: crypto.randomUUID(), operation: 'edit', style: 'streetwear-lettering',
    sourceId: crypto.randomUUID(), prompt: 'Make the lettering blue' });
  const plan = recraftLogoPlan(input, { image: 'accepted-logo', styleReferences: ['ignored-guide'] });
  assert.equal(plan.endpoint, 'images/imageToImage'); assert.equal(plan.model, 'recraftv4_1');
  assert.equal(plan.body.image_url, 'accepted-logo'); assert.equal(plan.body.strength, .3);
  assert.match(plan.body.prompt, /Make the lettering blue/);
  assert.equal(plan.body.style_reference_urls, undefined); assert.equal(plan.body.controls, undefined);
  assert.throws(() => recraftLogoPlan(input), /source image/);
  assert.throws(() => nanoLogoPlan(input, 'accepted-logo'), /Streetwear Lettering uses Recraft/);
});
