import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { proposeOutputPrintPlane, verifyOutputPrintPlane } from '../src/lib/recoveryOutputPlane.mjs';
const analysis={reference_category:'banner',presentation_type:'physical_surface',surface_geometry:'planar',single_surface:true,already_flat:false};
const keep='UNIVERSAL_KEEP_ARTWORK';
const tilted=[[20,12],[223,35],[210,178],[30,188]];
const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
async function canvas({polygons=[tilted],background=[255,255,255],circle=false}={}) {
  const width=240,height=200,pixels=Buffer.alloc(width*height*3);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const p=[x+0.5,y+0.5];
    const inside=circle?Math.hypot(x-120,y-100)<80:polygons.some(poly=>poly.every((point,i)=>cross(point,poly[(i+1)%poly.length],p)>=0));
    const ink=inside && x>70 && x<170 && y>75 && y<105 && (x%14<6);
    const color=inside?(ink?[10,15,20]:[245,110+(y%13),12]):background;
    const offset=(y*width+x)*3;for(let c=0;c<3;c++)pixels[offset+c]=color[c];
  }
  return sharp(pixels,{raw:{width,height,channels:3}}).png().toBuffer();
}
test('one bounded trapezoid on neutral exterior proposes rectification without generation',async()=>{
  const source=await canvas(), saved=Buffer.from(source);
  const result=await proposeOutputPrintPlane(source,analysis,keep);
  assert.ok(result);assert.ok(source.equals(saved));
  assert.ok(result.diagnostics.hull_fit_fraction>=0.95);
  assert.equal(result.diagnostics.foreground_contained,true);
  assert.equal(result.diagnostics.foreground_checked_at_original_resolution,true);
  assert.equal(result.diagnostics.pixels_regenerated,false);
  assert.equal(result.diagnostics.requires_source_validation,true);
  const meta=await sharp(result.buffer).metadata();assert.ok(meta.width>150 && meta.height>120);
  result.quad.forEach((p,i)=>p.forEach((v,axis)=>assert.ok(Math.abs(v-tilted[i][axis]/(axis?200:240)*1000)<18)));
});
test('black neutral exterior can be bounded without replacing the artwork',async()=>{
  const result=await proposeOutputPrintPlane(await canvas({background:[0,0,0]}),analysis,keep);
  assert.ok(result);assert.deepEqual(result.diagnostics.background_rgb,[0,0,0]);
});
test('a tiny original-resolution mark outside the fitted preview is not silently cropped away',async()=>{
  const large=await sharp(await canvas()).resize(1920,1600,{kernel:'nearest'}).png().toBuffer();
  assert.ok(await proposeOutputPrintPlane(large,analysis,keep));
  const mark=await sharp({create:{width:1,height:1,channels:3,background:{r:195,g:195,b:195}}}).png().toBuffer();
  const withMark=await sharp(large).composite([{input:mark,left:960,top:4}]).png().toBuffer();
  assert.equal(await proposeOutputPrintPlane(withMark,analysis,keep),null);
});
test('curved outline and separated independent objects are refused',async()=>{
  assert.equal(await proposeOutputPrintPlane(await canvas({circle:true}),analysis,keep),null);
  const polygons=[[[15,25],[100,25],[100,175],[15,175]],[[140,25],[225,25],[225,175],[140,175]]];
  assert.equal(await proposeOutputPrintPlane(await canvas({polygons}),analysis,keep),null);
});
test('flat padding, colored scenery and already-flat/uncertain surfaces do not receive a plane proposal',async()=>{
  const flat=await canvas({polygons:[[[20,20],[220,20],[220,180],[20,180]]]});
  assert.equal(await proposeOutputPrintPlane(flat,analysis,keep),null);
  assert.equal(await proposeOutputPrintPlane(await canvas({background:[10,30,160]}),analysis,keep),null);
  const source=await canvas();
  for(const patch of [{already_flat:true},{presentation_type:'digital_artwork'},{surface_geometry:'curved'},{single_surface:false},{reference_category:'lanyard'}])
    assert.equal(await proposeOutputPrintPlane(source,{...analysis,...patch},keep),null);
  assert.equal(await proposeOutputPrintPlane(source,analysis,'UNIVERSAL_BACKGROUND_ONLY'),null);
});

const validation={pass:true,failures:[],visual_validation:true,checks:{geometry:'pass',content:'pass',lettering:'unverifiable'}};
test('verified rectification compares generated input to unchanged proposal and requires positive detail checks',async()=>{
  const buffer=await canvas();let inspected=false;
  const result=await verifyOutputPrintPlane({buffer,analysis,mode:keep,check:async options=>{
    inspected=true;assert.ok(options.sourceBuffer.equals(buffer));assert.equal(options.allowCrop,false);assert.equal(options.method,'image_edit');
    return {buffer:options.outputBuffer,cropped:false,calls:1,validation};
  }});
  assert.equal(inspected,true);assert.equal(result.status,'accepted');assert.equal(result.buffer,result.proposal.buffer);
  assert.equal(result.validation.output_plane_accepted,true);assert.equal(result.calls,1);
});
test('explicit local geometry mode accepts proven pixel transform without claiming content fidelity or calling review',async()=>{
  const buffer=await canvas();let calls=0;
  const result=await verifyOutputPrintPlane({buffer,analysis,mode:keep,allowLocalEvidence:true,check:async()=>{calls++;throw new Error('Must not call provider');}});
  assert.equal(result.status,'accepted_local_geometry');assert.equal(result.buffer,result.proposal.buffer);
  assert.equal(result.calls,0);assert.equal(calls,0);
  assert.equal(result.validation.pass,false);assert.equal(result.validation.advisory_only,true);
  assert.equal(result.validation.local_geometry_validation,true);
  assert.deepEqual(result.validation.checks,{geometry:'pass',content:'unverifiable',lettering:'unverifiable'});
  assert.equal(result.proposal.diagnostics.original_foreground_outside,0);
});
test('local geometry mode still refuses unsupported surfaces and independent objects without calling review',async()=>{
  let calls=0;const check=async()=>{calls++;};
  const source=await canvas();
  const unknown=await verifyOutputPrintPlane({buffer:source,analysis:{...analysis,surface_geometry:'unknown'},mode:keep,allowLocalEvidence:true,check});
  assert.equal(unknown.status,'not_proposed');assert.equal(unknown.buffer,source);
  const separated=await canvas({polygons:[[[15,25],[100,25],[100,175],[15,175]],[[140,25],[225,25],[225,175],[140,175]]]});
  const multiple=await verifyOutputPrintPlane({buffer:separated,analysis,mode:keep,allowLocalEvidence:true,check});
  assert.equal(multiple.status,'not_proposed');assert.equal(multiple.buffer,separated);assert.equal(calls,0);
});
test('rejected or unavailable rectification keeps exact generated input and candidate evidence',async()=>{
  const buffer=await canvas();
  const unavailable=await verifyOutputPrintPlane({buffer,analysis,mode:keep,check:async()=>{throw new Error('Timeout');}});
  assert.equal(unavailable.status,'unavailable');assert.equal(unavailable.buffer,buffer);assert.ok(unavailable.proposal);assert.equal(unavailable.calls,1);
  for(const checks of [{geometry:'pass',content:'fail',lettering:'pass'},{geometry:'unverifiable',content:'pass',lettering:'pass'},{geometry:'pass',content:'pass',lettering:'fail'}]) {
    const result=await verifyOutputPrintPlane({buffer,analysis,mode:keep,check:async ({outputBuffer})=>({buffer:outputBuffer,cropped:false,calls:1,validation:{...validation,checks}})});
    assert.equal(result.status,'rejected');assert.equal(result.buffer,buffer);assert.ok(result.proposal);
  }
  const changed=await verifyOutputPrintPlane({buffer,analysis,mode:keep,check:async ({outputBuffer})=>{outputBuffer[outputBuffer.length-1]^=1;return {buffer:outputBuffer,cropped:false,calls:1,validation};}});
  assert.equal(changed.status,'rejected');assert.equal(changed.buffer,buffer);assert.equal(changed.validation.output_plane_rejection_reason,'review_changed_proposal');
});
test('no safe plane proposal and invalid input do not invoke any review',async()=>{
  let reviews=0;const check=async()=>{reviews++;};
  const buffer=await canvas({circle:true});
  const result=await verifyOutputPrintPlane({buffer,analysis,mode:keep,check});
  assert.equal(result.status,'not_proposed');assert.equal(result.buffer,buffer);assert.equal(result.calls,0);
  const invalid=Buffer.from('invalid');
  const error=await verifyOutputPrintPlane({buffer:invalid,analysis,mode:keep,check});
  assert.equal(error.status,'geometry_error');assert.equal(error.buffer,invalid);assert.equal(reviews,0);
});
