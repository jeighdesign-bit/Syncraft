import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { verifySourceRecovery } from '../src/lib/recoverySourceCandidate.mjs';

const keep = 'UNIVERSAL_KEEP_ARTWORK';
const analysis = { state: 'safe', presentation_type: 'digital_artwork', already_flat: true, single_surface: true,
  surface_geometry: 'planar', confidence: 100, geometry_confidence: 100, print_quad: null,
  perspective: 'none', curvature: 'none', folds: 'none', reflections: 'none', occlusion: 'none',
  missing_areas: [], layout_strategy: 'long_strip' };
const verdict = (patch = {}) => ({ pass: true, failures: [], visual_validation: true,
  checks: { geometry: 'pass', content: 'pass', lettering: 'pass' }, ...patch });
async function reference() {
  const width=40, height=180, pixels=Buffer.alloc(width*height*3);
  for (let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const offset=(y*width+x)*3;
    // Distinct ink shapes span the full face, including near its right edge.
    pixels[offset]=(x*7+y*3)%256; pixels[offset+1]=(x*11+y*2)%256; pixels[offset+2]=(x+y*5)%256;
  }
  return sharp(pixels,{raw:{width,height,channels:3}}).png().toBuffer();
}
const reviewer = validation => async ({ outputBuffer }) => ({ buffer: outputBuffer, cropped: false, validation, calls: 1 });

test('a confident narrow but incorrect source crop is rejected when comparison finds missing artwork', async () => {
  const sourceBuffer=await reference();
  let reviewedWidth;
  const result=await verifySourceRecovery({ sourceBuffer, mode: keep,
    analysis: { ...analysis, already_flat: false, print_quad:[[0,0],[300,0],[300,1000],[0,1000]] },
    check: async ({sourceBuffer: original, outputBuffer, allowCrop}) => {
      assert.equal(allowCrop,false); assert.ok(original.equals(sourceBuffer));
      reviewedWidth=(await sharp(outputBuffer).metadata()).width;
      return {buffer:outputBuffer,cropped:false,calls:1,validation:verdict({pass:false,failures:['missing_visible_artwork'],checks:{geometry:'pass',content:'fail',lettering:'fail'}})};
    } });
  assert.equal(reviewedWidth,12);
  assert.equal(result.status,'rejected'); assert.equal(result.recovery,null);
  assert.ok(result.candidate.buffer.length); assert.equal(result.calls,1);
  assert.deepEqual(result.validation.failures,['missing_visible_artwork']);
});

test('geometry approval cannot override failed, missing, or unverifiable content checks', async () => {
  const sourceBuffer=await reference();
  for (const checks of [{geometry:'pass',content:'fail',lettering:'pass'},
    {geometry:'pass',content:'unverifiable',lettering:'pass'},
    {geometry:'unverifiable',content:'pass',lettering:'pass'},
    {geometry:'pass',content:'pass',lettering:'fail'},
    {geometry:'pass',content:'pass'}]) {
    const result=await verifySourceRecovery({sourceBuffer,analysis,mode:keep,check:reviewer(verdict({checks}))});
    assert.equal(result.status,'rejected'); assert.equal(result.recovery,null);
  }
  const result=await verifySourceRecovery({sourceBuffer,analysis,mode:keep,check:reviewer(verdict({visual_validation:false}))});
  assert.equal(result.status,'rejected'); assert.equal(result.recovery,null);
});

test('review outage preserves candidate evidence and permits the normal image-edit fallback', async () => {
  const result=await verifySourceRecovery({sourceBuffer:await reference(),analysis,mode:keep,check:async()=>{throw new Error('Timeout');}});
  assert.equal(result.status,'unavailable'); assert.equal(result.recovery,null);
  assert.ok(result.candidate.buffer.length); assert.equal(result.validation,null); assert.equal(result.calls,1);
});

test('positive geometry/content with unverifiable fine lettering can accept unchanged original pixels', async () => {
  const sourceBuffer=await reference();
  let usageHandler;
  const onUsage=async()=>{};
  const result=await verifySourceRecovery({sourceBuffer,analysis,mode:keep,onUsage,check:async options=>{
    usageHandler=options.onUsage;
    return reviewer(verdict({checks:{geometry:'pass',content:'pass',lettering:'unverifiable'}}))(options);
  }});
  assert.equal(result.status,'accepted'); assert.ok(result.recovery);
  assert.equal(result.recovery,result.candidate); assert.equal(result.calls,1);
  assert.equal(result.validation.checks.lettering,'unverifiable'); assert.equal(result.validation.source_candidate_accepted,true);
  assert.equal(usageHandler,onUsage);
  assert.deepEqual(await sharp(result.recovery.buffer).removeAlpha().raw().toBuffer(),await sharp(sourceBuffer).removeAlpha().raw().toBuffer());
});

test('background-only or uncertain references do not trigger source recovery or its review', async () => {
  let calls=0;
  const sourceBuffer=await reference();
  const check=async()=>{calls++;throw new Error('Should not inspect');};
  for(const options of [{analysis,mode:'UNIVERSAL_BACKGROUND_ONLY'},{analysis:{...analysis,geometry_confidence:20},mode:keep}]) {
    const result=await verifySourceRecovery({sourceBuffer,...options,check});
    assert.equal(result.status,'not_eligible'); assert.equal(result.recovery,null); assert.equal(result.candidate,null); assert.equal(result.calls,0);
  }
  assert.equal(calls,0);
});

test('a crop, rewritten byte stream or in-place mutation from review cannot replace the source proposal', async () => {
  const sourceBuffer=await reference();
  const checks=[
    async ({outputBuffer})=>({buffer:outputBuffer,cropped:true,calls:2,validation:verdict()}),
    async ({outputBuffer})=>({buffer:await sharp(outputBuffer).extract({left:0,top:0,width:10,height:20}).png().toBuffer(),cropped:false,calls:1,validation:verdict()}),
    async ({outputBuffer})=>{outputBuffer[outputBuffer.length-1]^=1;return {buffer:outputBuffer,cropped:false,calls:1,validation:verdict()};},
    async ({outputBuffer})=>({buffer:outputBuffer,cropped:false,calls:1,validation:verdict({crop_attempted:true})}),
  ];
  for(const check of checks) {
    const result=await verifySourceRecovery({sourceBuffer,analysis,mode:keep,check});
    assert.equal(result.status,'rejected'); assert.equal(result.recovery,null);
    assert.equal(result.validation.source_candidate_rejection_reason,'review_changed_candidate');
    assert.deepEqual(await sharp(result.candidate.buffer).removeAlpha().raw().toBuffer(),await sharp(sourceBuffer).removeAlpha().raw().toBuffer());
  }
});

test('invalid source bytes fail safely without invoking review', async () => {
  let calls=0;
  const result=await verifySourceRecovery({sourceBuffer:Buffer.from('not an image'),analysis,mode:keep,check:async()=>{calls++;}});
  assert.equal(result.status,'geometry_error'); assert.equal(result.recovery,null); assert.equal(result.candidate,null); assert.equal(result.calls,0); assert.equal(calls,0);
});
