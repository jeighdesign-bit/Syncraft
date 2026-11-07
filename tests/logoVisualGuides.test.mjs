import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { logoVisualDirection, hasLogoVisualDirection } from '../src/lib/logoVisualDirection.mjs';
import { prepareLogoVisualGuides } from '../src/lib/logoVisualGuidesServer.mjs';
import { validateLogoOperation, buildLogoPrompt } from '../src/lib/logoStudio.mjs';
import { recraftLogoPlan } from '../src/lib/logoRecraft.mjs';
import { generateRecraftLogo } from '../src/lib/logoRecraftServer.js';
import { TEXT_STYLE_GRAMMAR } from '../src/lib/logoTextDirection.mjs';
import { logoDesignFields } from '../src/lib/logoDesignSettings.mjs';

const request = changes => validateLogoOperation({ requestId:crypto.randomUUID(),mode:'text',operation:'generate',style:'line',prompt:'A heron standing on one leg.',brand:'',palette:[],...changes });
const guided = changes => { const input=request(changes); return { ...input,visualGuidance:logoVisualDirection(input,'all') }; };

test('visual rollout is server-owned, Text-only and independently controllable per style', async () => {
  const input=request();
  assert.equal(logoVisualDirection(input),null);
  assert.equal(logoVisualDirection(input,'monogram'),null);
  assert.ok(logoVisualDirection(input,'line,monogram'));
  const forged=validateLogoOperation({ ...input,visualGuidance:{version:'logo-visual-guides-1',style:'line',match:'flexible'},style_reference_urls:['https://evil.test/image.png'] });
  assert.equal(forged.visualGuidance,undefined);
  assert.equal(forged.style_reference_urls,undefined);
  for(const mode of ['image','sketch']) assert.equal(logoVisualDirection({ ...input,mode },'all'),null);
  for(const operation of ['edit','variations','removeBg','vectorize']) assert.equal(logoVisualDirection({ ...input,operation },'all'),null);
  assert.equal(logoVisualDirection({ ...input,style:'streetwear-lettering' },'all'),null);
  assert.deepEqual(await prepareLogoVisualGuides(input),{references:[],metadata:null});
});

test('all twelve default styles have real, local PNG guides; typography uses the requested wording', async () => {
  for(const style of Object.keys(TEXT_STYLE_GRAMMAR)) {
    const input=guided({style,brand:['wordmark','monogram'].includes(style)?'ARC VALE':'',designSettings:style==='monogram'?{monogramLetters:'AV'}:{}});
    const guide=await prepareLogoVisualGuides(input);
    assert.equal(guide.references.length,1,style);
    assert.match(guide.references[0],/^data:image\/png;base64,/);
    const info=await sharp(Buffer.from(guide.references[0].split(',')[1],'base64')).metadata();
    assert.equal(info.width,512);assert.equal(info.height,512);
    assert.match(guide.metadata.sha256,/^[0-9a-f]{64}$/);
    const plan=recraftLogoPlan(input,{styleReferences:guide.references});
    assert.equal(plan.body.model,'recraftv4_1');
    assert.equal(plan.body.style_match,'flexible');
    assert.equal(plan.body.image_url,undefined);
    assert.equal(plan.body.n,1);
    assert.equal(plan.cost,.04);
    assert.equal(plan.body.style,undefined);assert.equal(plan.body.controls?.no_text,undefined);
    assert.ok(plan.body.prompt.includes(input.prompt));
    if(style==='monogram') assert.match(plan.body.prompt,/Main letters: "AV"/);
  }
});

test('sans and serif references actually differ; exact case and script choices survive without system fonts', async () => {
  const hashes=[];
  for(const family of ['sans','serif','script','gothic']) {
    const result=await prepareLogoVisualGuides(guided({style:'monogram',brand:'Arc Vale',designSettings:{monogramLetters:'AV',monogramFont:family}}));
    assert.equal(result.metadata.family,family);
    hashes.push(result.metadata.sha256);
  }
  assert.equal(new Set(hashes).size,4);
  const lower=await prepareLogoVisualGuides(guided({style:'monogram',brand:'Arc Vale',designSettings:{monogramLetters:'AV',monogramFont:'sans',capitalization:'lowercase'}}));
  assert.notEqual(lower.metadata.sha256,hashes[0]);
  const run=await prepareLogoVisualGuides(guided({style:'wordmark',brand:'Arc Vale',designSettings:{letterType:'cursive'}}));
  assert.equal(run.metadata.family,'cursive');
  const unsupported=await prepareLogoVisualGuides(guided({style:'monogram',designSettings:{monogramLetters:'山水'}}));
  assert.equal(unsupported.references.length,0);
  assert.equal(unsupported.metadata.omitted,'unsupported-glyphs');
});

test('line weight, contour geometry, viewpoint, enclosure and stipple settings change the visual control, not just its label', async () => {
  const cases=[
    ['line','lineThickness',['thin','thick']],['line','lineStructure',['geometric','curved']],
    ['icon','viewpoint',['front','three-quarter','high-angle']],['badge','badgeShape',['circle','shield','hexagon','square']],
    ['engraved','engravingTechnique',['line','stipple','crosshatch']],['abstract','structure',['organic','geometric']],
  ];
  for(const [style,key,values] of cases) {
    const hashes=[];
    for(const value of values) hashes.push((await prepareLogoVisualGuides(guided({style,designSettings:{[key]:value}}))).metadata.sha256);
    assert.equal(new Set(hashes).size,values.length,`${style}/${key}`);
  }
  const thin=await prepareLogoVisualGuides(guided({style:'line',designSettings:{lineThickness:'thin'}}));
  const thick=await prepareLogoVisualGuides(guided({style:'line',designSettings:{lineThickness:'thick'}}));
  const ink=async guide=>{const {data,info}=await sharp(Buffer.from(guide.references[0].split(',')[1],'base64')).removeAlpha().raw().toBuffer({resolveWithObject:true});let count=0;for(let i=0;i<data.length;i+=info.channels) if(data[i]<128)count++;return count;};
  assert.ok(await ink(thick)>await ink(thin)*2);
});

test('a default example cannot contradict explicit character controls or a requested palette', async () => {
  for(const style of ['mascot','cartoon','retro']) {
    const result=await prepareLogoVisualGuides(guided({style,designSettings:{outlineThickness:'none'}}));
    assert.equal(result.references.length,0);
    assert.match(result.metadata.omitted,/explicit-character-controls/);
  }
  const colored=await prepareLogoVisualGuides(guided({style:'pictorial'}));
  const palette=await prepareLogoVisualGuides(guided({style:'pictorial',palette:['#FF0000','#FFFFFF']}));
  assert.notEqual(palette.metadata.sha256,colored.metadata.sha256);
  assert.deepEqual(recraftLogoPlan(guided({style:'pictorial',palette:['#FF0000','#FFFFFF']}),{styleReferences:palette.references}).body.controls.colors,[{rgb:[255,0,0]},{rgb:[255,255,255]}]);
});

test('every existing Text control remains valid with visual guidance and stays inside Recraft prompt limits', async () => {
  for(const style of Object.keys(TEXT_STYLE_GRAMMAR)) for(const [key,field] of logoDesignFields(style,{mode:'text'})) {
    const id=field.type==='initials'?'AV':field.options.at(-1).id;
    const input=guided({style,brand:'Arc Vale',designSettings:{[key]:id}});
    const guides=await prepareLogoVisualGuides(input);
    const plan=recraftLogoPlan(input,{styleReferences:guides.references});
    assert.ok(plan.body.prompt.includes(buildLogoPrompt(input)));
    assert.ok(plan.body.prompt.length<=10000);
    assert.equal(input.designSettings[key],id);
  }
});

test('provider adapter posts actual style images once and records native style ID and composite cost', async () => {
  const previous=process.env.RECRAFT_API_TOKEN;process.env.RECRAFT_API_TOKEN='test-only';
  let calls=0;
  try {
    const input=guided({style:'monogram',brand:'Arc Vale',designSettings:{monogramLetters:'AV',monogramFont:'sans'}});
    const result=await generateRecraftLogo(input,undefined,undefined,{request:async (url,options)=>{
      calls++;assert.equal(url,'https://external.api.recraft.ai/v1/images/generations');
      const body=JSON.parse(options.body);
      assert.equal(body.style_match,'flexible');assert.equal(body.style_reference_urls.length,1);
      assert.ok(body.style_reference_urls[0].length>1000);
      assert.match(body.prompt,/required font anatomy/);assert.match(body.prompt,/"AV"/);
      return {ok:true,headers:new Headers(),json:async()=>({style_id:'mock-style',credits:40,data:[{url:'https://img.recraft.ai/mock.png',image_id:'mock-image'}]})};
    }});
    assert.equal(calls,1);assert.equal(result.cost,.04);assert.equal(result.visualGuideResult.styleId,'mock-style');
    assert.match(result.visualGuideResult.promptSha256,/^[0-9a-f]{64}$/);
    assert.equal(result.visualGuideResult.family,'sans');
    calls=0;
    await assert.rejects(generateRecraftLogo(input,undefined,undefined,{request:async()=>{calls++;return {ok:false,status:429};}}),/429/);
    assert.equal(calls,1);
  } finally { if(previous===undefined) delete process.env.RECRAFT_API_TOKEN;else process.env.RECRAFT_API_TOKEN=previous; }
});

test('style references never enter protected operations, and untrusted URLs are rejected for the internal guide route', () => {
  const ref='data:image/png;base64,cG5n';
  const marked=guided();
  for(const changes of [{mode:'image'},{mode:'sketch'},{operation:'edit'},{operation:'variations'},{style:'streetwear-lettering',brand:'FORMA'}]) {
    const input={...marked,...changes};
    assert.equal(hasLogoVisualDirection(input),false);
    if (input.operation === 'edit') {
      assert.throws(()=>recraftLogoPlan(input,{image:'source',styleReferences:[ref]}),/Nano Banana 2/);
      continue;
    }
    const plan=recraftLogoPlan(input,{image:'source',styleReferences:[ref]});
    assert.equal(plan.body.style_reference_urls,undefined);
    assert.equal(plan.body.style_match,undefined);
  }
  assert.throws(()=>recraftLogoPlan(marked,{styleReferences:['https://evil.test/img.png']}),/internal logo style guide/);
});

test('the asset manifest records original sources, font licenses and immutable hashes', async () => {
  const manifest=JSON.parse(await readFile(new URL('../src/assets/logo-guides/manifest.json',import.meta.url),'utf8'));
  assert.equal(manifest.sources.length,10);assert.equal(manifest.fonts.length,8);
  for(const source of manifest.sources) {
    assert.match(source.source,/^public\/images\/logo-(examples\/studio-original-|styles\/badge-signature)/);
    assert.doesNotMatch(source.source,/diffusion|streetwear|darkmen/i);
    assert.match(source.sourceSha256,/^[0-9a-f]{64}$/);
  }
  for(const font of manifest.fonts) assert.ok((await readFile(new URL('../src/assets/logo-guides/fonts/'+font.licenseFile,import.meta.url),'utf8')).length>1000);
});
