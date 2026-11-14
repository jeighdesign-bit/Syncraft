import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as resolutionPolicy from '../src/lib/extractionResolution.mjs';
import ts from 'typescript';
import { CREDIT_COST } from '../src/lib/pricing.js';
import * as availability from '../src/lib/universalAvailability.mjs';
import { REFERENCE_CATEGORIES, normalizeReferenceCategory } from '../src/lib/referenceCategories.mjs';
import { canResumeTraceUpscale } from '../src/lib/traceRequestPolicy.mjs';
import { finalArtworkRaster, artworkExportName } from '../src/lib/artworkExport.mjs';

const CreditAmount=({amount,unit='credits'})=>react.createElement('span',{'data-credit-amount':''},amount,unit || 'credits');
const react={createElement:(type,props,...children)=>type===CreditAmount?CreditAmount(props):({type,props:{...props,children}})};
const nodes=tree=>!tree || typeof tree!=='object'?[]:[tree,...(tree.props?.children||[]).flat(Infinity).flatMap(nodes)];
const text=tree=>Array.isArray(tree)?tree.map(text).join(' '):typeof tree==='object' && tree?text(tree.props?.children||[]):String(tree??'');
const project={id:'p',trace_type:'universal',name:'Saved design',original_image_url:'https://storage.test/crop.png',generated_image_url:'https://storage.test/flat.png'};
async function compiled(relative,name) {
  const source=(await readFile(new URL(relative,import.meta.url),'utf8')).replace(/^import[\s\S]*?;\r?\n/gm,'')
    .replace(/export default function /g,'function ').replace(/^export default \w+;?\r?\n?/gm,'');
  return {source,code:ts.transpileModule(source,{fileName:'component.jsx',compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText+'\n'+name};
}
async function panel(props={}) {
  const {code}=await compiled('../src/app/workspace/[id]/components/PropertiesPanel.js','PropertiesPanel');
  const events=[];
  const callbacks=Object.fromEntries(['onExecuteTrace','onRetryVector','onResumeUpscale','onReferenceCategoryChange','onVectorColorsChange',
    'onOpenAiEdit','onOpenRemoveBg','onOpenErase','onOpenCrop','onEnterExtend','onProceedExtend','onCancelExtend',
    'onDownloadSvg','onDownloadPsd','onDownloadRaster','onDownloadAll','onOpenCompare','onOpenTopUp'].map(name=>[name,()=>{events.push(name);} ]));
  const context=vm.createContext({...resolutionPolicy,...availability,UNIVERSAL_AVAILABLE:props.universalAvailable ?? availability.UNIVERSAL_AVAILABLE,CreditAmount,styles:{generationBar:'generation-bar',generateButton:'generate-action',compareBar:'compare-bar'},Select:'select',React:react,memo:fn=>fn,useRef:current=>({current}),useState:value=>[value,()=>{}],CREDIT_COST,
    REFERENCE_CATEGORIES,normalizeReferenceCategory,canResumeTraceUpscale,finalArtworkRaster,
    ...Object.fromEntries(['Download','Columns2','ChevronDown','FolderDown','Loader2','X','ImageMinus','Eraser','Scissors','Expand','WandSparkles','ArrowUp','Zap'].map(name=>[name,name])),
  });
  const component=vm.runInContext(code,context);
  return {events,tree:component({project,traceState:'idle',userCredits:100,vectorColors:'auto',readOnly:false,...callbacks,...props})};
}
test('disabled Universal buttons and category handlers cannot start generation or edits even if directly invoked',async()=>{
  const h=await panel();
  assert.match(text(h.tree),/Temporarily Unavailable/);
  assert.match(text(h.tree),/still view and download saved files/);
  const controls=nodes(h.tree).filter(node=>node.type==='button' && /AI Edit|Remove BG|Erase Noise|Crop Region|Extend Design|Temporarily Unavailable/.test(node.props['aria-label'] || text(node)));
  assert.equal(controls.length,6);
  for(const control of controls) {assert.equal(control.props.disabled,true);await control.props.onClick();}
  const select=nodes(h.tree).find(node=>node.type==='select');
  assert.equal(select.props.disabled,true);select.props.onChange({target:{value:'packaging'}});
  assert.deepEqual(h.events,[]);
  const activeExtend=await panel({extendMode:true,extendCanProceed:true});
  const proceed=nodes(activeExtend.tree).find(node=>node.type==='button' && text(node).includes('Extend Design'));
  assert.equal(proceed.props.disabled,true);proceed.props.onClick();assert.deepEqual(activeExtend.events,[]);
});
test('availability does not change owner exports or saved before/after comparison',async()=>{
  const h=await panel({project:{...project,upscaled_image_url:'saved-hd',svg_url:'saved-svg'}});
  for(const label of ['Export as SVG','Export as PSD','Export as PNG','Export as JPEG','Download all files (ZIP)','Compare before & after']) {
    const button=nodes(h.tree).find(node=>node.type==='button' && text(node).includes(label));
    assert.equal(button.props.disabled,false,label);await button.props.onClick();
  }
  assert.deepEqual(h.events,['onDownloadSvg','onDownloadPsd','onDownloadRaster','onDownloadRaster','onDownloadAll','onOpenCompare']);
  const viewOnly=await panel({readOnly:true,project:{...project,svg_url:'saved-svg'}});
  assert.equal(nodes(viewOnly.tree).find(node=>node.type==='button' && text(node).includes('Export as SVG')).props.disabled,true);
});
async function workspace(traceType='universal') {
  const {source,code}=await compiled('../src/app/workspace/[id]/page.js','Workspace');
  const stateNames=[...source.matchAll(/const\s*\[(\w+),[^\]]+\]\s*=\s*useState/g)].map(match=>match[1]);
  const states={},events={generate:0,prepare:0,fetch:0},seed={project:{...project,trace_type:traceType},projectAccess:'owner',userCredits:100};
  let stateIndex=0,hookProps;
  const componentNames=['BackToWorkspace','Eye','Pencil','CheckCircle2','Share2','SplitViewCanvas','PropertiesPanel','UpscalePropertiesPanel',
    'CropModal','EraseModal','ArtworkEditModal','RemoveBgModal','CompareModal','NoCreditsModal','TopUpModal','AccountCreditMenu','ShortcutsModal','ShareProjectModal'];
  const context=vm.createContext({...resolutionPolicy,...availability,normalizeReferenceCategory,artworkExportName,React:react,
    useState:initial=>{const name=stateNames[stateIndex++];states[name]=name in seed?seed[name]:initial;return [states[name],value=>{states[name]=typeof value==='function'?value(states[name]):value;}];},
    useCallback:fn=>fn,useEffect(){},useMemo:fn=>fn(),useRef:initial=>({current:initial}),
    useParams:()=>({id:'p'}),useRouter:()=>({push(){}}),createClient:()=>({}),
    useTraceExecution:props=>{hookProps=props;return {traceState:'idle',nodeErrors:{},consoleRef:{current:null},logToConsole(){},
      handleExecuteTrace:async()=>{events.generate++;return {success:false};},analyzeRecovery:async()=>{events.prepare++;},
      handleResumeFromStep2(){},handleRetryVector(){}};},
    evaluateExtendIntent:()=>({ok:true}),CREDIT_COST:{trace:12,universal:24},Date,console,
    trackExport(){},trackGenerationStart(){},trackGenerationSuccess(){},trackGenerationFailure(){},
    fetch:async()=>{events.fetch++;throw new Error('Disabled editing must not request an API');},
    ...Object.fromEntries(componentNames.map(name=>[name,name])),
  });
  const Component=vm.runInContext(code,context),tree=Component();
  return {tree,states,events,hookProps};
}
test('existing Universal workspace blocks direct handlers and auto-resume without changing export permissions',async()=>{
  const h=await workspace();
  assert.equal(h.hookProps.canEditProject,false);
  const properties=nodes(h.tree).find(node=>node.type==='PropertiesPanel');
  assert.equal(properties.props.readOnly,false);
  assert.equal(properties.props.onRetryVector,undefined);assert.equal(properties.props.onResumeUpscale,undefined);
  await properties.props.onExecuteTrace('auto');
  await properties.props.onReferenceCategoryChange('poster');
  properties.props.onOpenCrop();properties.props.onOpenErase();properties.props.onOpenRemoveBg();properties.props.onOpenAiEdit();
  properties.props.onEnterExtend();await properties.props.onProceedExtend();
  assert.deepEqual(h.events,{generate:0,prepare:0,fetch:0});
  assert.equal(h.states.showCropModal,false);assert.equal(h.states.showEraseModal,false);assert.equal(h.states.showAiEdit,false);
  assert.equal(nodes(h.tree).find(node=>node.type==='CropModal').props.show,false);
  const canvas=nodes(h.tree).find(node=>node.type==='SplitViewCanvas');
  const title=nodes(canvas.props.leftControls).find(node=>node.type==='button');
  assert.equal(title.props.disabled,true);title.props.onClick();assert.equal(h.states.isEditingTitle,false);
});
test('garment workspace and its Generate action remain available to owners',async()=>{
  const h=await workspace('mockup');
  assert.equal(h.hookProps.canEditProject,true);
  const properties=nodes(h.tree).find(node=>node.type==='PropertiesPanel');
  assert.equal(properties.props.readOnly,false);
  await properties.props.onExecuteTrace('auto');
  assert.deepEqual(h.events,{generate:1,prepare:0,fetch:0});
  const garmentPanel=await panel({project:{...project,trace_type:'mockup',generated_image_url:null}});
  const generate=nodes(garmentPanel.tree).find(node=>node.type==='button' && node.props['aria-label']?.startsWith('Generate now'));
  assert.equal(generate.props.disabled,false);
});

test('garment and logo selectors update the Generate Now price immediately across 12, 16 and 24 credits', async () => {
  for (const trace_type of ['mockup', 'logo']) {
    const props = { project: { ...project, trace_type, generated_image_url: null } };
    let selected = '1K';
    const first = await panel({ ...props, onExtractionResolutionChange: value => { selected = value; } });
    const selector = nodes(first.tree).find(node => node.type === 'select' && node.props['aria-label'] === 'Extraction resolution');
    assert.equal(selector.props.value, '1K'); assert.match(text(selector.props.displayLabel), /Syncraft V1/);
    assert.equal(selector.props.compact, true); assert.equal(selector.props.portal, true);
    assert.match(text(first.tree), /12\s+credits/);
    selector.props.onChange({ target: { value: '2K' } });
    const twoK = await panel({ ...props, extractionResolution: selected });
    const twoKAction = nodes(twoK.tree).find(node => node.type === 'button' && node.props['aria-label']?.startsWith('Generate now'));
    assert.equal(twoKAction.props['aria-label'], 'Generate now with Syncraft V2 at 2K for 16 credits');
    assert.match(text(twoK.tree), /16\s+credits/);
    selector.props.onChange({ target: { value: '4K' } });
    const next = await panel({ ...props, extractionResolution: selected });
    const generate = nodes(next.tree).find(node => node.type === 'button' && node.props['aria-label']?.startsWith('Generate now'));
    assert.equal(generate.props['aria-label'], 'Generate now with Syncraft V3 at 4K for 24 credits');
    assert.match(text(next.tree), /24\s+credits/);
    assert.match(text(nodes(next.tree).find(node => node.props?.['aria-label'] === 'Extraction resolution').props.displayLabel), /Syncraft V3/);
    assert.equal(nodes(generate).some(node => node.type === 'ArrowUp'), true);
  }
});

test('paid artwork actions disclose their existing costs and local edits remain unpriced', async () => {
  const h = await panel({ project: { ...project, trace_type: 'mockup', svg_url: 'saved.svg' } });
  for (const [name, cost, icon] of [['AI Edit', CREDIT_COST.artworkEdit, 'WandSparkles'], ['Remove BG', CREDIT_COST.removeBg, 'ImageMinus'], ['Extend Design', CREDIT_COST.extend, 'Expand']]) {
    const action = nodes(h.tree).find(node => node.type === 'button' && text(node).includes(name));
    const price = nodes(action).find(node => node.props?.['data-credit-amount'] === '');
    assert.equal(text(price).trim(), `${cost} credits`);
    assert.ok(nodes(action).some(node => node.type === icon));
  }
  for (const name of ['Erase Noise', 'Crop Region']) {
    const action = nodes(h.tree).find(node => node.type === 'button' && text(node).includes(name));
    assert.equal(nodes(action).some(node => node.props?.['data-credit-amount'] === ''), false);
  }
  const fresh = await panel({ project: { ...project, trace_type: 'mockup', generated_image_url: null } });
  const selector = nodes(fresh.tree).find(node => node.props?.['aria-label'] === 'Extraction resolution');
  for (const tier of resolutionPolicy.EXTRACTION_RESOLUTIONS) {
    const option = nodes(selector).find(node => node.type === 'option' && node.props.value === tier.value);
    assert.match(text(option), new RegExp(`${tier.credits}\\s+credits`));
    assert.equal(nodes(option).some(node => node.props?.['data-credit-amount'] === ''), false);
  }
});

test('resolution selection is locked during a run and hidden while resuming saved artwork', async () => {
  let changes = 0;
  const busy = await panel({ project: { ...project, trace_type: 'mockup', generated_image_url: null }, traceState: 'step1', onExtractionResolutionChange: () => { changes++; } });
  const selector = nodes(busy.tree).find(node => node.props?.['aria-label'] === 'Extraction resolution');
  assert.equal(selector.props.disabled, true);
  selector.props.onChange({ target: { value: '4K' } });
  assert.equal(changes, 0);
  const universal = await panel({ extractionResolution: '4K' });
  assert.equal(nodes(universal.tree).some(node => node.props?.['aria-label'] === 'Extraction resolution'), false);
});

test('Universal displays its 12/16/24-credit V1/V2/V3 selector and preserves the availability lock', async () => {
  const props={project:{...project,generated_image_url:null}};
  const enabled=await panel({...props,universalAvailable:true});
  const selector=nodes(enabled.tree).find(node=>node.props?.['aria-label']==='Extraction resolution');
  assert.equal(selector.props.disabled,false);
  assert.match(text(selector),/Syncraft V2.*16\s+credits/);
  assert.match(text(selector),/Syncraft V3.*24\s+credits/);
  const fourK=await panel({...props,universalAvailable:true,extractionResolution:'4K'});
  const action=nodes(fourK.tree).find(node=>node.props?.className==='generate-action');
  assert.equal(action.props['aria-label'],'Generate now with Syncraft V3 at 4K for 24 credits');
  const disabled=await panel({...props,universalAvailable:false});
  assert.equal(nodes(disabled.tree).find(node=>node.props?.['aria-label']==='Extraction resolution').props.disabled,true);
});

test('fresh garment, logo and Universal projects share the ready state and accessible activity log',async()=>{
  for(const trace_type of ['mockup','logo','universal']) {
    const h=await panel({project:{...project,trace_type,generated_image_url:null},universalAvailable:true});
    assert.match(text(h.tree),/Ready when you are/);
    assert.match(text(h.tree),/Choose 1K, 2K or 4K, then tap ↑ to start/);
    assert.match(text(h.tree),/Progress will appear here/);
    const log=nodes(h.tree).find(node=>node.props?.role==='log');
    assert.equal(log.props['aria-label'],'Generation activity');
    assert.equal(log.props['aria-live'],'polite');
  }
});

test('garment, logo and Universal share the rounded Generate and arrow-free Compare controls', async () => {
  for (const trace_type of ['mockup', 'logo', 'universal']) {
    const props = { project: { ...project, trace_type, generated_image_url: null }, universalAvailable: true };
    const h = await panel(props);
    const bar = nodes(h.tree).find(node => node.props?.className === 'generation-bar');
    assert.ok(bar);
    assert.equal(nodes(bar).some(node => node.type === 'ArrowUp'), true);
    assert.match(text(bar), trace_type === 'universal' ? /24\s+credits/ : /12\s+credits/);
    const action = nodes(bar).find(node => node.props?.className === 'generate-action');
    assert.equal(action.props.disabled, false);
    action.props.onClick();
    assert.deepEqual(h.events, ['onExecuteTrace']);
    const done = await panel({ ...props, project: { ...props.project, svg_url: 'saved-vector' } });
    const compare = nodes(done.tree).find(node => node.type === 'button' && text(node).includes('Compare before & after'));
    assert.equal(compare.props.className, 'generation-bar compare-bar');
    assert.equal(nodes(compare).some(node => node.type === 'Columns2'), true);
    assert.equal(nodes(compare).some(node => node.type === 'ArrowUp'), false);
    compare.props.onClick();
    assert.deepEqual(done.events, ['onOpenCompare']);
  }
});

test('free resume and retry use the shared bar for all extraction tools, without a duplicate Processing label', async () => {
  for (const trace_type of ['mockup', 'logo', 'universal']) {
    for (const retry of [false, true]) {
      const props = { project: { ...project, trace_type, upscaled_image_url: retry ? 'saved-hd' : null }, universalAvailable: true };
      const h = await panel(props);
      const bar = nodes(h.tree).find(node => node.props?.className === 'generation-bar');
      assert.match(text(bar), retry ? /Syncraft Vector/ : /Syncraft Upscale/);
      if (retry) assert.doesNotMatch(text(bar), /Free/);
      else assert.match(text(bar), /Free/);
      assert.doesNotMatch(text(bar), /\d+\s+credits/);
      const action = nodes(bar).find(node => node.props?.className === 'generate-action');
      action.props.onClick();
      assert.deepEqual(h.events, [retry ? 'onRetryVector' : 'onResumeUpscale']);
      const busy = await panel({ ...props, traceState: 'step2' });
      assert.equal(nodes(busy.tree).find(node => node.props?.className === 'generate-action').props.disabled, true);
      assert.doesNotMatch(text(busy.tree), /Processing\.\.\./);
    }
  }
});
