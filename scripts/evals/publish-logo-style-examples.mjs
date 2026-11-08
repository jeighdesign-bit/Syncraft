// Publish user-approved existing outputs as local previews and concise presets.
// No generation calls, model changes, credit deductions or source-image edits.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

const styleTests=JSON.parse(readFileSync(resolve('outputs/logo-all-styles-review/manifest.json'),'utf8'));
const nanoTests=JSON.parse(readFileSync(resolve('outputs/logo-nano-style-comparison/manifest.json'),'utf8'));
const titles={minimalist:'Heron — Minimalist',mascot:'PINEWATCH — Mascot',retro:'ZESTDAY — Retro Mascot',badge:'RIDGE — Badge',monogram:'FENWICK — Monogram',wordmark:'HAVEN — Wordmark','streetwear-lettering':'VOLTAGE — Streetwear Lettering',line:'Heron — Line Art',abstract:'Interlocking loops — Abstract',pictorial:'Diving swift — Pictorial',engraved:'Barn owl — Engraved',icon:'Watering can — Icon',cartoon:'PEBBLEPOP — Cartoon'};
const examples=[];
for(const [model,samples] of [['nano',nanoTests.samples],['recraft',styleTests.samples]]){
  for(const sample of samples){
    if(sample.status!=='succeeded'||!existsSync(sample.nativeFile)) throw Error(`Missing approved output: ${model}/${sample.style}`);
    const id=`style-test-${model}-${sample.style}`;
    const asset=`studio-${id}.webp`;
    const buffer=await sharp(sample.nativeFile).resize(640,640,{fit:'inside',withoutEnlargement:true}).webp({lossless:true,effort:5}).toBuffer();
    writeFileSync(resolve('public/images/logo-examples',asset),buffer);
    const hash=createHash('sha256').update(buffer).digest('hex').slice(0,12);
    examples.push({id,title:`${titles[sample.style]}${model==='nano'?' · Nano Banana 2.1':''}`,mode:'text',style:sample.style,
      brand:sample.brand||'',tagline:'',prompt:model==='nano'?sample.originalPrompt:sample.prompt,palette:[],
      designSettings:sample.appliedSettings||sample.designSettings,generationOptions:{conceptMode:'faithful',seed:sample.appliedSeed??sample.seed},
      sourceModel:model==='nano'?'nano-banana-2.1':'recraftv4_1',image:`/images/logo-examples/${asset}?v=${hash}`});
  }
}
if(examples.length!==17) throw Error('Expected thirteen Recraft and four Nano examples.');
writeFileSync(resolve('src/lib/logoApprovedStyleExamples.mjs'),`// User-approved style tests: 13 Recraft outputs and 4 Nano comparison outputs.\n// Source model is preview provenance only; it never overrides generation routing.\n// Keep visible ideas short; names, colors and controls stay in separate fields.\nexport const LOGO_APPROVED_STYLE_EXAMPLES = ${JSON.stringify(examples,null,2)};\n`);
console.log(JSON.stringify({examples:examples.length,nano:examples.filter(x=>x.sourceModel==='nano-banana-2.1').length,previewSize:640,generationCalls:0}));
