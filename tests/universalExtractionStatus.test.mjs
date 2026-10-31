import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { TRACE_REQUEST_TIMEOUT_MS, traceTimeoutMessage, traceConnectionMessage } from '../src/lib/traceRequestPolicy.mjs';

function element() {
  return { children: [], textContent: '', appendChild(child) { this.children.push(child); },
    set innerHTML(_value) { this.children=[]; }, get scrollHeight() { return this.children.length; } };
}
function visibleText(node) {
  return [node.textContent,...node.children.map(visibleText)].filter(Boolean).join(' ');
}
async function harness(traceType='universal') {
  const states=[],requests=[],container=element();
  let prepareEntered,generateEntered,finishPrepare,finishGenerate;
  const preparing=new Promise(resolve=>{prepareEntered=resolve;});
  const generating=new Promise(resolve=>{generateEntered=resolve;});
  const source=(await readFile(new URL('../src/app/workspace/[id]/hooks/useTraceExecution.js',import.meta.url),'utf8'))
    .replace(/^import[\s\S]*?;\r?\n/gm,'').replace(/export /g,'');
  const context=vm.createContext({
    AbortController,AbortSignal,Response,setTimeout,clearTimeout,TRACE_REQUEST_TIMEOUT_MS,traceTimeoutMessage,traceConnectionMessage,
    CREDIT_COST:{trace:12,universal:24},console,document:{createElement:element},
    useState(initial){const index=states.push(initial)-1;return [initial,value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},
    useRef:initial=>({current:initial}),useCallback:callback=>callback,useEffect(){},
    trackGenerationStart(){},trackGenerationSuccess(){},trackGenerationFailure(){},
    waitForTraceUpscale:async()=>null,
    fetch:async(url)=>{
      requests.push(url);
      if(url==='/api/recovery/analyze') {
        prepareEntered();return new Promise(resolve=>{finishPrepare=()=>resolve(Response.json({success:true,analysis:{state:'partial'}}));});
      }
      if(url==='/api/recovery/generate' || url==='/api/trace') {
        generateEntered();return new Promise(resolve=>{finishGenerate=()=>resolve(Response.json({success:true,alreadySaved:true,fileUrl:'https://storage.test/flat.png'}));});
      }
      throw new Error('Unexpected request: '+url);
    },
  });
  const useTraceExecution=vm.runInContext(source+'\nuseTraceExecution',context);
  let project={id:'project',trace_type:traceType};
  const hook=useTraceExecution({project,userCredits:100,setUserCredits(){},setProject:update=>{project=update(project);},
    supabase:{auth:{getSession:async()=>({data:{session:{access_token:'session'}}})}},
  });
  hook.consoleRef.current=container;
  return {hook,states,requests,preparing,generating,finishPrepare:()=>finishPrepare(),finishGenerate:()=>finishGenerate(),text:()=>visibleText(container)};
}

test('Universal preparation and pending generation show selected-crop extraction without analysis/detection language',async()=>{
  const h=await harness();
  const preparation=h.hook.analyzeRecovery();
  await h.preparing;
  assert.equal(h.states[0],'step1');
  assert.doesNotMatch(h.text(),/analy[sz]ing|detecting|SyncraftVision/i);
  h.finishPrepare();await preparation;
  const generation=h.hook.handleExecuteTrace();
  await h.generating;
  assert.equal(h.states[0],'step1');
  assert.match(h.text(),/Extracting selected crop\.\.\./);
  assert.doesNotMatch(h.text(),/analy[sz]ing|detecting|SyncraftVision/i);
  assert.deepEqual(h.requests,['/api/recovery/analyze','/api/recovery/generate']);
  h.finishGenerate();await generation;
});

test('garment extraction retains its existing analysis log',async()=>{
  const h=await harness('mockup');
  const generation=h.hook.handleExecuteTrace();
  await h.generating;
  assert.match(h.text(),/Analyzing Image with SyncraftVision/);
  assert.doesNotMatch(h.text(),/Extracting selected crop/);
  assert.deepEqual(h.requests,['/api/trace']);
  h.finishGenerate();await generation;
});
