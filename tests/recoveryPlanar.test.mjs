import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { normalizedPrintQuad, canUsePlanarRecovery, canPreserveFlatArtwork, rectifyPrintPlane, recoverSourcePixels } from '../src/lib/recoveryPlanar.mjs';
const quad = [[100,100],[900,100],[900,900],[100,900]];
const planar = { presentation_type: 'physical_surface', single_surface: true, surface_geometry: 'planar',
  confidence: 90, geometry_confidence: 95, print_quad: quad, curvature: 'none', folds: 'none', reflections: 'none',
  occlusion: 'none', perspective: 'low', layout_strategy: 'packaging_panels' };
test('print plane requires convex clockwise corners with meaningful area', () => {
  assert.deepEqual(normalizedPrintQuad(quad), quad);
  for (const bad of [null, [[0,0],[900,900],[900,0],[0,900]], [[0,0],[1,0],[1,1],[0,1]], [[-1,0],[1000,0],[1000,1000],[0,1000]]]) assert.equal(normalizedPrintQuad(bad), null);
});
test('curved, folded, uncertain and background-only references cannot bypass generation', () => {
  const analysis = planar;
  assert.equal(canUsePlanarRecovery(analysis, 'UNIVERSAL_KEEP_ARTWORK'), true);
  for (const patch of [{ curvature: 'medium' }, { folds: 'low' }, { confidence: 70 }, { geometry_confidence: 89 },
    { single_surface: false }, { reflections: 'high' }, { occlusion: 'low' }, { presentation_type: 'unknown' },
    { layout_strategy: 'parallel_strips' }, { surface_geometry: 'unknown' }]) assert.equal(canUsePlanarRecovery({ ...analysis, ...patch }, 'UNIVERSAL_KEEP_ARTWORK'), false);
  assert.equal(canUsePlanarRecovery(analysis, 'UNIVERSAL_BACKGROUND_ONLY'), false);
  assert.equal(canUsePlanarRecovery({ ...analysis, layout_strategy: 'long_strip' }, 'UNIVERSAL_KEEP_ARTWORK'), true);
});
test('planar rectification maps the original corner pixels without generating art', async () => {
  const pixels = Buffer.alloc(100 * 100 * 3);
  for (let y=0;y<100;y++) for(let x=0;x<100;x++){let i=(y*100+x)*3; pixels[i]=x*2; pixels[i+1]=y*2; pixels[i+2]=80;}
  const input=await sharp(pixels,{raw:{width:100,height:100,channels:3}}).png().toBuffer();
  const output=await rectifyPrintPlane(input,quad);
  const {data,info}=await sharp(output).raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,80); assert.equal(info.height,80);
  assert.ok(Math.abs(data[0]-20)<=1); assert.ok(Math.abs(data[1]-20)<=1);
  const last=(info.width*info.height-1)*4;
  assert.ok(Math.abs(data[last]-178)<=1); assert.ok(Math.abs(data[last+1]-178)<=1); assert.equal(data[last+2],80);
});

test('full-frame identity rectification preserves all pixel samples and dimensions', async () => {
  const width = 17, height = 93;
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = i % 251; pixels[i+1] = (i*7) % 241; pixels[i+2] = (i*13) % 239; pixels[i+3] = 255;
  }
  const source = await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const output = await rectifyPrintPlane(source, [[0,0],[1000,0],[1000,1000],[0,1000]]);
  const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, width); assert.equal(info.height, height);
  assert.deepEqual(data, pixels);
});

test('straight narrow ribbon is rectified from source pixels without white scene or invented fills', async () => {
  const width = 160, height = 240;
  const pixels = Buffer.alloc(width * height * 3, 255);
  const colors = [[210,20,30], [25,180,60], [30,70,215]];
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
    const v = (y+0.5-20)/180;
    const u = (x+0.5-20-54*v)/40;
    if (u>=0 && u<=1 && v>=0 && v<=1) {
      const color = u>0.46 && u<0.54 ? [0,0,0] : colors[Math.min(2, Math.floor(v*3))];
      const offset = (y*width+x)*3;
      pixels[offset]=color[0]; pixels[offset+1]=color[1]; pixels[offset+2]=color[2];
    }
  }
  const source = await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
  const print_quad = [[20,20],[60,20],[114,200],[74,200]].map(([x,y])=>[x/width*1000,y/height*1000]);
  const result = await recoverSourcePixels(source, { ...planar, layout_strategy: 'long_strip', print_quad }, 'UNIVERSAL_KEEP_ARTWORK');
  assert.equal(result.method, 'planar_rectification');
  assert.equal(result.provenance.pixels_regenerated, false);
  assert.equal(result.provenance.physical_dimensions_known, false);
  assert.equal(result.validation.pass, false);
  const { data, info } = await sharp(result.buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 40);
  for (let i=0;i<3;i++) {
    const y=Math.floor(info.height*(i+0.5)/3), x=Math.floor(info.width*0.25);
    const offset=(y*info.width+x)*3;
    assert.deepEqual([...data.subarray(offset,offset+3)],colors[i]);
  }
});

test('explicit already-flat digital artwork preserves lettering samples and original narrow canvas', async () => {
  const width=11, height=167;
  const pixels=Buffer.alloc(width*height*4);
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
    const offset=(y*width+x)*4;
    const ink=(x*3+y*5)%11<4;
    pixels[offset]=ink?2:210; pixels[offset+1]=ink?5:205; pixels[offset+2]=ink?8:170; pixels[offset+3]=255;
  }
  const source=await sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer();
  const analysis={...planar,presentation_type:'digital_artwork',already_flat:true,perspective:'none',missing_areas:[],print_quad:null};
  assert.equal(canPreserveFlatArtwork(analysis,'UNIVERSAL_KEEP_ARTWORK'),true);
  const result=await recoverSourcePixels(source,analysis,'UNIVERSAL_KEEP_ARTWORK');
  assert.equal(result.method,'source_pixels');
  assert.equal(result.provenance.resampled,false);
  assert.deepEqual(result.provenance.output_dimensions,{width,height});
  assert.deepEqual(await sharp(result.buffer).raw().toBuffer(),pixels);
  for (const patch of [{geometry_confidence:94},{geometry_confidence:undefined},{confidence:undefined},
    {presentation_type:'physical_surface'},{single_surface:false},{already_flat:false},{perspective:'low'},
    {occlusion:'unknown'},{missing_areas:['hidden end']},{print_quad:quad}]) {
    assert.equal(canPreserveFlatArtwork({...analysis,...patch},'UNIVERSAL_KEEP_ARTWORK'),false);
  }
  assert.equal(await recoverSourcePixels(source,analysis,'UNIVERSAL_BACKGROUND_ONLY'),null);
});

test('thin supported surfaces are accepted but invalid or collapsed quadrilaterals remain rejected', () => {
  const thin=[[490,100],[495,100],[495,900],[490,900]];
  assert.deepEqual(normalizedPrintQuad(thin),thin);
  assert.equal(normalizedPrintQuad([[0,0],[0.2,0],[0.2,1000],[0,1000]]),null);
});
