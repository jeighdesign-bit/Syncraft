import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { inspectStripExterior } from '../src/lib/recoveryStripBounds.mjs';

const options = { category: 'lanyard', mode: 'UNIVERSAL_KEEP_ARTWORK', method: 'image_edit', analysis: { presentation_type: 'physical_surface' } };
async function strip({ width=120, height=480, start=0, end=40, background=[255,255,255], horizontal=false } = {}) {
  const pixels=Buffer.alloc(width*height*3);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const minor=horizontal?y:x, major=horizontal?x:y;
    const ink=minor>=start && minor<end;
    const color=ink ? ((major+minor)%31<14?[225,170,25]:[5,8,10]) : background;
    const offset=(y*width+x)*3;
    for(let c=0;c<3;c++) pixels[offset+c]=color[c];
  }
  return sharp(pixels,{raw:{width,height,channels:3}}).png().toBuffer();
}

test('a white/lightgray field covering most of a physical ribbon canvas is advisory, without changing bytes', async () => {
  for(const background of [[255,255,255],[225,225,225]]) {
    const buffer=await strip({background});
    const before=Buffer.from(buffer);
    const result=await inspectStripExterior(buffer,options);
    assert.equal(result.suspected_exterior,true);
    assert.ok(result.blank_side_fraction>0.6);
    assert.equal(result.edge_fields.axis,'left_right');
    assert.equal(result.advisory_only,true);
    assert.ok(buffer.equals(before));
    assert.equal(result.crop,undefined);
  }
});

test('large black side fields around a gold/black printed band are detected', async () => {
  const buffer=await strip({width:200,height:600,start:60,end:140,background:[0,0,0]});
  const result=await inspectStripExterior(buffer,options);
  assert.equal(result.suspected_exterior,true);
  assert.equal(result.blank_side_fraction,0.6);
  assert.equal(result.edge_fields.start_pixels,60);
  assert.equal(result.edge_fields.end_pixels,60);
});

test('already-digital artwork and known source-pixel outputs preserve intentional blank printed margins', async () => {
  const buffer=await strip();
  assert.equal(await inspectStripExterior(buffer,{...options,analysis:{presentation_type:'digital_artwork'}}),null);
  assert.equal(await inspectStripExterior(buffer,{...options,analysis:{already_flat:true}}),null);
  assert.equal(await inspectStripExterior(buffer,{...options,method:'source_pixels'}),null);
});

test('a whole solid canvas has no distinct ink band and belongs to collapse review', async () => {
  for(const background of [[255,255,255],[0,0,0],[222,170,20]]) {
    const buffer=await strip({start:0,end:0,background});
    const result=await inspectStripExterior(buffer,options);
    assert.equal(result.suspected_exterior,false);
    assert.equal(result.detailed_columns,0);
  }
});

test('normal full-width dark artwork, colored design fields, and small blank margins are preserved', async () => {
  for(const buffer of [await strip({start:0,end:120}), await strip({background:[10,30,180]}), await strip({end:100})]) {
    const result=await inspectStripExterior(buffer,options);
    assert.equal(result.suspected_exterior,false);
  }
});

test('horizontal ribbon exterior is measured along the top/bottom sides', async () => {
  const buffer=await strip({width:480,height:120,horizontal:true,start:0,end:40,background:[0,0,0]});
  const result=await inspectStripExterior(buffer,options);
  assert.equal(result.orientation,'horizontal');
  assert.equal(result.edge_fields.axis,'top_bottom');
  assert.equal(result.suspected_exterior,true);
  assert.ok(result.blank_side_fraction>0.6);
});

test('background mode, other categories, or unverified planar presentation do not trigger the guard', async () => {
  const buffer=await strip();
  for(const patch of [{mode:'UNIVERSAL_BACKGROUND_ONLY'},{category:'poster'},{method:'unknown'},
    {method:'planar_rectification',analysis:{presentation_type:'unknown'}}]) {
    assert.equal(await inspectStripExterior(buffer,{...options,...patch}),null);
  }
  const result=await inspectStripExterior(buffer,{...options,method:'planar_rectification'});
  assert.equal(result.suspected_exterior,true);
});
