import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as availability from '../src/lib/universalAvailability.mjs';
import { REFERENCE_CATEGORIES, normalizeReferenceCategory } from '../src/lib/referenceCategories.mjs';
import { canResumeTraceUpscale } from '../src/lib/traceRequestPolicy.mjs';

const react={createElement:(type,props,...children)=>({type,props:{...props,children}})};
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
  const context=vm.createContext({...availability,React:react,memo:fn=>fn,useState:value=>[value,()=>{}],CREDIT_COST:{universal:24,trace:12,extend:3},
    REFERENCE_CATEGORIES,normalizeReferenceCategory,canResumeTraceUpscale,
    ...Object.fromEntries(['Download','Monitor','ChevronDown','FolderDown','Loader2','X','ImageMinus','Eraser','Scissors','Expand','WandSparkles'].map(name=>[name,name])),
  });
  const component=vm.runInContext(code,context);
  return {events,tree:component({project,traceState:'idle',userCredits:100,vectorColors:'auto',readOnly:false,...callbacks,...props})};
}
test('disabled Universal buttons and category handlers cannot start generation or edits even if directly invoked',async()=>{
  const h=await panel();
  assert.match(text(h.tree),/Temporarily Unavailable/);
  assert.match(text(h.tree),/still view and download saved files/);
  const controls=nodes(h.tree).filter(node=>node.type==='button' && /AI Edit|Remove BG|Erase Noise|Crop Region|Extend Design|Temporarily Unavailable/.test(text(node)));
  assert.equal(controls.length,6);
  for(const control of controls) {assert.equal(control.props.disabled,true);await control.props.onClick();}
  const select=nodes(h.tree).find(node=>node.type==='select');
  assert.equal(select.props.disabled,true);select.props.onChange({target:{value:'packaging'}});
  assert.deepEqual(h.events,[]);
  const activeExtend=await panel({extendMode:true,extendCanProceed:true});
  const proceed=nodes(activeExtend.tree).find(node=>node.type==='button' && text(node).includes('Extend Design ('));
  assert.equal(proceed.props.disabled,true);proceed.props.onClick();assert.deepEqual(activeExtend.events,[]);
});
test('availability does not change owner exports or saved before/after comparison',async()=>{
  const h=await panel({project:{...project,upscaled_image_url:'saved-hd',svg_url:'saved-svg'}});
  for(const label of ['Export as SVG','Export as PSD','Export as PNG','Download All (ZIP)','Before / After Compare']) {
    const button=nodes(h.tree).find(node=>node.type==='button' && text(node).includes(label));
    assert.equal(button.props.disabled,false,label);await button.props.onClick();
  }
  assert.deepEqual(h.events,['onDownloadSvg','onDownloadPsd','onDownloadRaster','onDownloadAll','onOpenCompare']);
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
  const context=vm.createContext({...availability,normalizeReferenceCategory,React:react,
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
  const generate=nodes(garmentPanel.tree).find(node=>node.type==='button' && text(node).includes('GENERATE NOW'));
  assert.equal(generate.props.disabled,false);
});
