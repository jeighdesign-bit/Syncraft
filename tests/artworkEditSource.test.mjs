import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  prepareArtworkEditSource,
  uploadArtworkEditSource,
} from '../src/lib/artworkEditSource.mjs';
import { artworkEditInput } from '../src/lib/artworkEditService.mjs';

test('reference preparation returns decodable PNG bytes instead of an inaccessible storage URL', async () => {
  const buffer = await sharp({
    create: {
      width: 200,
      height: 360,
      channels: 4,
      background: { r: 255, g: 128, b: 0, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  const reference = await prepareArtworkEditSource(buffer);
  const embedded = reference;
  const metadata = await sharp(embedded).metadata();
  assert.equal(metadata.width, 200);
  assert.equal(metadata.height, 360);
  assert.equal(metadata.hasAlpha, true);
});

test('large references keep their aspect ratio and smaller references are never enlarged', async () => {
  const buffer = await sharp({
    create: { width: 4500, height: 900, channels: 3, background: 'white' },
  })
    .jpeg()
    .toBuffer();
  const reference = await prepareArtworkEditSource(buffer);
  const metadata = await sharp(reference).metadata();
  assert.equal(metadata.width, 4096);
  assert.equal(metadata.height, 819);
  assert.equal(metadata.format, 'png');
});

test('non-image downloads are rejected before a provider submission', async () => {
  await assert.rejects(prepareArtworkEditSource(Buffer.from('<html>Access denied</html>')));
});

test('hosted references retain all decoded pixels and keep the queue request small', async () => {
  const source = await sharp({
    create: {
      width: 300,
      height: 500,
      channels: 4,
      background: { r: 255, g: 128, b: 0, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  let uploaded;
  const url = await uploadArtworkEditSource(source, {
    uploadFile: async (file) => {
      assert.equal(file.type, 'image/png');
      uploaded = Buffer.from(await file.arrayBuffer());
      return 'https://v3.fal.media/files/test/source.png';
    },
  });
  assert.deepEqual(await sharp(uploaded).raw().toBuffer(), await sharp(source).raw().toBuffer());
  assert.ok(Buffer.byteLength(JSON.stringify(artworkEditInput(url, 'Remove logo'))) < 1500);
  await assert.rejects(
    uploadArtworkEditSource(source, { uploadFile: async () => '' }),
    /secure file URL/,
  );
});
