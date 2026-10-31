import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { prepareRecoveryStrip, restoreRecoveryStrip, buildStripRecoveryInput, matchRecoveryStripProportions } from '../src/lib/recoveryStrip.mjs';
import { recoveryModeInstructions } from '../src/lib/recoveryVision.mjs';

for (const vertical of [true, false]) test(`section carrier preserves ${vertical ? 'vertical' : 'horizontal'} artwork order and original proportions`, async () => {
  const width = vertical ? 40 : 400, height = vertical ? 400 : 40;
  const colors = [[255,0,0],[0,255,0],[0,0,255],[255,255,0]];
  const pixels = Buffer.alloc(width * height * 3);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const color=colors[Math.floor((vertical ? y : x)/100)];
    for(let c=0;c<3;c++) pixels[(y*width+x)*3+c]=color[c];
  }
  const source=await sharp(pixels,{raw:{width,height,channels:3}}).png().toBuffer();
  const strip=await prepareRecoveryStrip(source);
  const output=await restoreRecoveryStrip(strip.buffer,strip);
  const {data,info}=await sharp(output).removeAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width/info.height,width/height);
  for(let i=0;i<4;i++) {
    const x=vertical?Math.floor(info.width/2):Math.floor(info.width*(i+0.5)/4);
    const y=vertical?Math.floor(info.height*(i+0.5)/4):Math.floor(info.height/2);
    assert.deepEqual([...data.subarray((y*info.width+x)*3,(y*info.width+x)*3+3)],colors[i]);
  }
});
test('normal photo proportions do not need a section carrier', async () => {
  const source=await sharp({create:{width:200,height:400,channels:3,background:'#123456'}}).png().toBuffer();
  assert.equal(await prepareRecoveryStrip(source),null);
});
test('pattern mode preserves integrated illustrations and prevents all-over pattern replacement', () => {
  const prompt=recoveryModeInstructions('UNIVERSAL_BACKGROUND_ONLY');
  assert.match(prompt,/retain integrated design illustrations/);
  assert.match(prompt,/Never extend a small visible motif/);
  const input=buildStripRecoveryInput({image_urls:['reference']},{count:4,vertical:true},'UNIVERSAL_BACKGROUND_ONLY');
  assert.match(input.prompt,/Gray gutters/); assert.match(input.prompt,/original top-to-bottom order/);
});
test('provider ratio changes cannot widen a narrow crop in the saved output or 4x upscale', async () => {
  const providerImage=await sharp({create:{width:128,height:512,channels:3,background:'#456'}}).png().toBuffer();
  const restored=await matchRecoveryStripProportions(providerImage,44,565);
  const meta=await sharp(restored).metadata();
  assert.equal(meta.width,132); assert.equal(meta.height,1695);
  assert.equal(meta.width*565,meta.height*44);
  const hd=await sharp(restored).resize(meta.width*4,meta.height*4).png().toBuffer();
  const hdMeta=await sharp(hd).metadata();
  assert.equal(hdMeta.width*565,hdMeta.height*44);
});
