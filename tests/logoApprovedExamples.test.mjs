import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import sharp from 'sharp';
import {LOGO_APPROVED_STYLE_EXAMPLES} from '../src/lib/logoApprovedStyleExamples.mjs';
import {LOGO_EXAMPLES} from '../src/lib/logoExamples.mjs';
import {LOGO_PROMPT_EXAMPLES,LOGO_STUDIO_EXAMPLES} from '../src/lib/logoStudioExamples.mjs';
import {LOGO_STYLES,validateLogoOperation} from '../src/lib/logoStudio.mjs';
import {recraftLogoPlan} from '../src/lib/logoRecraft.mjs';
import {nanoLogoPlan} from '../src/lib/logoFal.mjs';
import {logoUsesNano} from '../src/lib/logoModelRouting.mjs';
import {LOGO_MASCOT_EXAMPLES} from '../src/lib/logoMascotExamples.mjs';
import {LOGO_BADGE_REFERENCE_EXAMPLES} from '../src/lib/logoBadgeReferenceExamples.mjs';

test('the approved collection has thirteen Recraft styles and four Nano samples with short ideas and valid separate presets',()=>{
  assert.equal(LOGO_APPROVED_STYLE_EXAMPLES.length,17);
  const recraft=LOGO_APPROVED_STYLE_EXAMPLES.filter(x=>x.sourceModel==='recraftv4_1');
  const nano=LOGO_APPROVED_STYLE_EXAMPLES.filter(x=>x.sourceModel==='nano-banana-2.1');
  assert.deepEqual(recraft.map(x=>x.style).sort(),LOGO_STYLES.map(x=>x.id).sort());
  assert.deepEqual(nano.map(x=>x.style).sort(),['cartoon','icon','mascot','retro']);
  for(const item of LOGO_APPROVED_STYLE_EXAMPLES){
    assert.ok(item.prompt.length>0&&item.prompt.length<150);
    assert.doesNotMatch(item.prompt,/lettering (?:below|beneath)|text (?:below|beneath)|brand named|spelling exactly/i);
    assert.equal(item.compiledPrompt,undefined);assert.equal(item.promptEnhancement,undefined);
    const input=validateLogoOperation({...item,requestId:crypto.randomUUID(),operation:'generate'});
    assert.equal(input.brand,item.brand);assert.equal(input.prompt,item.prompt);
    assert.deepEqual(input.designSettings,item.designSettings);
    assert.deepEqual(input.generationOptions,{conceptMode:'faithful',seed:27641});
    // Preview provenance is not a client-controlled model override.
    const usesNano=['mascot','retro','icon','cartoon'].includes(item.style);
    assert.equal(logoUsesNano(input),usesNano);
    const plan=usesNano?nanoLogoPlan(input):recraftLogoPlan(input);
    assert.equal(plan.model,usesNano?'nano-banana-2.1':'recraftv4_1');
    assert.equal(logoUsesNano({...input,sourceModel:'arbitrary-client-model'}),usesNano);
  }
  for(const item of nano){
    const paired=recraft.find(x=>x.style===item.style);
    assert.equal(item.prompt,paired.prompt);assert.equal(item.brand,paired.brand);
    assert.deepEqual(item.designSettings,paired.designSettings);
    assert.deepEqual(item.generationOptions,paired.generationOptions);
  }
});

test('approved previews are actual local WebP files with correct cache hashes and dimensions',async()=>{
  await Promise.all(LOGO_APPROVED_STYLE_EXAMPLES.map(async item=>{
    const [path,query]=item.image.split('?');
    assert.equal(path,`/images/logo-examples/studio-${item.id}.webp`);
    const bytes=await readFile(new URL(`../public${path}`,import.meta.url));
    assert.equal(new URLSearchParams(query).get('v'),createHash('sha256').update(bytes).digest('hex').slice(0,12));
    const metadata=await sharp(bytes).metadata();
    assert.equal(metadata.format,'webp');assert.equal(metadata.width,640);assert.equal(metadata.height,640);
  }));
});

test('preferred Mascot and Badge examples lead both Studio collections while all choices and the homepage stay intact',()=>{
  assert.equal(LOGO_EXAMPLES.length,37);
  assert.equal(LOGO_PROMPT_EXAMPLES.length,54);
  assert.equal(LOGO_STUDIO_EXAMPLES.length,47);
  const preferred=[...LOGO_MASCOT_EXAMPLES,...LOGO_BADGE_REFERENCE_EXAMPLES];
  for(const collection of [LOGO_PROMPT_EXAMPLES,LOGO_STUDIO_EXAMPLES]){
    assert.equal(new Set(collection.map(x=>x.id)).size,collection.length);
    assert.deepEqual(collection.slice(0,preferred.length),preferred);
    assert.deepEqual(collection.slice(preferred.length,preferred.length+17),LOGO_APPROVED_STYLE_EXAMPLES);
    assert.equal(new Set(collection.map(x=>x.style)).size,13);
  }
  for(const example of LOGO_EXAMPLES) assert.ok(LOGO_PROMPT_EXAMPLES.includes(example));
  assert.ok(LOGO_EXAMPLES.every(example=>!example.id.startsWith('style-test-')));
  for(const collection of [LOGO_PROMPT_EXAMPLES,LOGO_STUDIO_EXAMPLES]) assert.ok(collection.every(x=>!['SABRYN','BURROWAY','PIPPARCEL','NESTZIP','BRIARHORN','BOPBOLT','SWIFTORA','VYNTARA','LUMIPOD','MINTWHEEL'].includes(x.brand)));
});

test('the actual prompt gallery renders all seventeen additions, all style filters and Nano provenance',async()=>{
  const require=createRequire(import.meta.url);
  const source=(await readFile(new URL('../src/app/logo-studio/ExamplePrompts.js',import.meta.url),'utf8')).replace("useState('all')","useState(__filter)");
  const code=ts.transpileModule(source,{fileName:'ExamplePrompts.jsx',compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  const render=filter=>{
    const module={exports:{}};
    const deps={
      '@/lib/logoStudioExamples.mjs':{LOGO_PROMPT_EXAMPLES},'@/lib/logoStudio.mjs':{LOGO_STYLES},
      '@/components/Select':{__esModule:true,default:props=>React.createElement('select',{'aria-label':props['aria-label'],value:props.value,onChange:props.onChange},props.children)},
      './examplePrompts.module.css':{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})},
    };
    vm.runInNewContext(code,{module,exports:module.exports,__filter:filter,require:name=>Object.hasOwn(deps,name)?deps[name]:require(name)});
    return renderToStaticMarkup(React.createElement(module.exports.default,{onSelect(){}}));
  };
  const all=render('all');
  assert.equal([...all.matchAll(/aria-label="Use [^"]+ prompt"/g)].length,54);
  assert.equal([...all.matchAll(/Nano Banana 2.1 sample<\/small>/g)].length,4);
  for(const style of LOGO_STYLES) assert.ok(all.includes(`value="${style.id}"`));
  for(const item of LOGO_APPROVED_STYLE_EXAMPLES) assert.ok(all.includes(item.image));
  const mascot=render('mascot');
  assert.ok(mascot.includes('studio-style-test-nano-mascot.webp'));
  assert.ok(mascot.includes('studio-style-test-recraft-mascot.webp'));
  assert.ok(!mascot.includes('studio-style-test-nano-retro.webp'));
});
