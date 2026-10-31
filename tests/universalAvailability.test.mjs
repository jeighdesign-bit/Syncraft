import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as availability from '../src/lib/universalAvailability.mjs';
import * as aspect from '../src/lib/aspectRatio.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const sourceUrl = `https://storage.test/projects/${projectId}/source.png`;

async function harness(route, { traceType = 'universal', method = 'POST', owner = false } = {}) {
  const calls = { writes:0, uploads:0, charges:0, refunds:0, providers:0, downloads:0, start:0, status:0, save:0, balance:0 };
  const user = { id:'owner', ...(owner ? {role:'admin',is_owner:true} : {}) };
  const project = {id:projectId,user_id:user.id,trace_type:traceType,original_image_url:sourceUrl,generated_image_url:sourceUrl,
    upscaled_image_url:sourceUrl,canvas_data:{universal_recovery:{status:'analyzed',mode:'UNIVERSAL_KEEP_ARTWORK',analysis:{state:'partial'}}}};
  const query = () => {
    const builder = {
      select(){return this;},eq(){return this;},neq(){return this;},or(){return this;},is(){return this;},in(){return this;},order(){return this;},limit(){return this;},
      insert(){calls.writes++;return this;},update(){calls.writes++;return this;},delete(){calls.writes++;return this;},
      async single(){return {data:project,error:null};},async maybeSingle(){return {data:project,error:null};},
      then(resolve){resolve({data:[project],error:null});},
    };
    return builder;
  };
  const download = async () => {calls.downloads++;return {buffer:Buffer.from('saved-image'),finalUrl:sourceUrl,response:new Response('saved-image',{headers:{'content-type':'image/png'}})};};
  const provider = async () => {calls.providers++;throw new Error('Unexpected provider request');};
  const source = (await readFile(new URL(`../src/app/api/${route}/route.js`,import.meta.url),'utf8'))
    .replace(/^import[\s\S]*?;\r?\n/gm,'').replace(/export /g,'');
  const context = vm.createContext({
    ...availability,...aspect,Response,Request,Headers,URL,Buffer,File,FormData,Blob,AbortSignal,setTimeout,
    process:{env:{FAL_KEY:'test-key',SUPABASE_SERVICE_ROLE_KEY:'test-signing-key'}},
    console:{log(){},warn(){},error(){},info(){}},
    NextResponse:{json:(body,options)=>Response.json(body,options)},
    PROJECT_ACCESS:{EDIT:'edit',VIEW:'view'},
    adminSupabase:{auth:{getUser:async()=>({data:{user},error:null})},from:query},
    authenticateRequest:async()=>({user}),getProjectAccess:async(_userId,_projectId,options={})=>({
      // Honour the real access helper's selection contract: omitting trace_type
      // from a restricted select must not silently pass these availability tests.
      project:options.select && options.select!=='*'
        ? Object.fromEntries(options.select.split(',').map(field=>field.trim()).map(field=>[field,project[field]])) : project,
      access:'edit',
    }),projectExpiresAt:()=>null,
    enforceRateLimit:async()=>({success:true}),
    isAllowedStorageUrl:()=>true,isOwnedStorageUrl:()=>true,validateUrlForSSRF:async()=>true,normalizeUserImageUrl:value=>value,
    getAllowedStorageHosts:()=>['storage.test'],getAllowedProviderHosts:()=>['provider.test'],
    DEFAULT_MAX_IMAGE_BYTES:10e6,DEFAULT_MAX_UPSCALED_IMAGE_BYTES:100e6,DEFAULT_MAX_SVG_BYTES:10e6,
    fetchStoredAsset:download,fetchWithSSRFProtection:download,fetch:provider,
    uploadToR2:async()=>{calls.uploads++;return sourceUrl;},getUploadUrl:async()=>{calls.uploads++;return {uploadUrl:sourceUrl,publicUrl:sourceUrl};},
    chargeCreditsVerified:async()=>{calls.charges++;throw Object.assign(new Error('Balance boundary'),{code:'INSUFFICIENT_CREDITS'});},
    refundCreditVerified:async()=>{calls.refunds++;return {refunded:true};},findLatestProjectCharge:async()=>null,
    markCreditTransaction:async()=>{calls.writes++;},recordProviderUsage:async()=>{calls.writes++;},
    CREDIT_COST:{trace:24,universal:24,extend:12,bgRemove:5},
    startTraceUpscale:async()=>{calls.start++;return {success:true,status:'queued'};},
    getTraceUpscaleStatus:async()=>{calls.status++;return {success:true,status:'running'};},
    saveTraceUpscale:async()=>{calls.save++;return {success:true,status:'succeeded',fileUrl:sourceUrl};},
    isReferenceCategory:value=>['auto','poster','lanyard'].includes(value),
    getBearerToken:request=>request.headers.get('authorization')?.replace('Bearer ',''),
    isAllowedImageContentType:()=>true,MAX_DIRECT_UPLOAD_BYTES:4.5e6,sanitizeUploadFileName:name=>name,
    fal:{subscribe:provider,storage:{upload:provider}},createFalClient:()=>({storage:{upload:provider}}),
    createArtworkEditService:()=>({generate:async()=>{calls.start++;return {pending:true};},read:async()=>{calls.status++;return {pending:false};},change:async()=>{calls.save++;return {pending:false};}}),
    ARTWORK_EDIT_COST:8,ARTWORK_EDIT_MODEL:'test-model',verifyArtworkEditState:()=>true,
    buildGarmentExtractionPrompt:()=> 'garment prompt',buildGarmentExtractionSystemPrompt:()=> 'garment system prompt',
    validateApiKey:async()=>({isValid:true,company:{id:'company',name:'Company'},wallet:{},apiKeyId:'key'}),
    checkBalance:async()=>{calls.balance++;return {hasBalance:false,error:'INSUFFICIENT_CREDITS'};},
    deductAndLog:async()=>{calls.writes++;},
  });
  const handler = vm.runInContext(`${source}\n${method}`,context);
  const run = async (body = {}) => {
    const request = new Request(`https://app.test/api/${route}${method==='GET'?`?projectId=${projectId}&id=${projectId}`:''}`,{
      method,headers:{authorization:'Bearer test',...(body instanceof FormData?{}:{'content-type':'application/json'})},
      ...(method==='GET'?{}:{body:body instanceof FormData?body:JSON.stringify(body)}),
    });
    const response = await handler(request);
    return {response,body:await response.json()};
  };
  return {calls,project,run};
}

function assertNoWork(calls) {
  for (const name of ['writes','uploads','charges','refunds','providers','downloads','start']) assert.equal(calls[name],0,`${name} must not start while Universal is unavailable`);
}
function assertUnavailable(result) {
  assert.equal(result.response.status,503);
  assert.equal(result.body.code,'UNIVERSAL_UNAVAILABLE');
  assert.equal(result.body.temporarilyUnavailable,true);
  assert.match(result.body.message,/temporarily unavailable/i);
}

test('all Universal aliases are unavailable without an owner bypass',async()=>{
  assert.equal(availability.UNIVERSAL_AVAILABLE,false);
  for(const value of ['universal','universal_preserve','universal_erase','UNIVERSAL','universal_future_mode']) {
    const response=availability.universalUnavailableResponse(value);
    assert.equal(response.status,503);
  }
  for(const value of ['mockup','mockup_preserve','logo','upscale','bg_remover']) assert.equal(availability.universalUnavailableResponse(value),null);
  for(const value of [undefined,null,'',false,{},[],'unknown_tool']) assert.equal(availability.universalUnavailableResponse(value),null);
  assert.equal(availability.universalUnavailableResponse().status,503);
});

test('Universal creation aliases stop before project insertion',async()=>{
  for(const traceType of ['universal','universal_preserve','universal_erase','UNIVERSAL','universal_other']) {
    const h=await harness('upload');
    assertUnavailable(await h.run({imageUrl:sourceUrl,traceType,projectName:'Example'}));
    assertNoWork(h.calls);
  }
});

test('other tools, including default Logo uploads, can still create projects',async()=>{
  for(const traceType of [undefined,'logo','mockup_preserve','mockup_erase','bg_remover','upscale']) {
    const h=await harness('upload');
    const result=await h.run({imageUrl:sourceUrl,traceType,projectName:'Example'});
    assert.equal(result.response.status,200,`upload ${traceType || 'default'}`);
    assert.equal(result.body.success,true);
    assert.equal(h.calls.writes,1);
    assert.equal(h.calls.charges,0);
    assert.equal(h.calls.providers,0);
  }
});

test('generic image uploads remain available for the other tools',async()=>{
  const direct=await harness('upload-direct');
  const form=new FormData();form.set('file',new File(['image'],'example.png',{type:'image/png'}));
  assert.equal((await direct.run(form)).response.status,200);
  assert.equal(direct.calls.uploads,1);
  const signed=await harness('upload-url');
  assert.equal((await signed.run({fileName:'example.png',contentType:'image/png'})).response.status,200);
  assert.equal(signed.calls.uploads,1);
});

test('Universal recovery endpoints stop before writes, charges or model calls for every user',async()=>{
  for(const [route,method] of [['recovery/generate','POST'],['recovery/analyze','POST'],['recovery/category','PATCH']]) {
    for(const owner of [false,true]) {
      const h=await harness(route,{method,owner});
      assertUnavailable(await h.run({projectId,referenceCategory:'poster'}));
      assertNoWork(h.calls);
    }
  }
});

test('generic extraction, vectorization, editing and crop APIs cannot restart Universal processing',async()=>{
  const operations=[
    ['trace',{projectId,step:1}],['trace',{projectId,step:2}],['trace-step3',{projectId}],
    ['crop',{projectId,croppedImageUrl:sourceUrl}],['remove-bg',{projectId}],
    ['extend-design',{projectId,pads:{left:10,right:0,top:0,bottom:0}}],['artwork-edit',{projectId,prompt:'Edit it'}],
  ];
  for(const [route,body] of operations) {
    const h=await harness(route,{owner:true});
    assertUnavailable(await h.run({...body,traceType:'mockup',trace_type:'logo'}));
    assertNoWork(h.calls);
  }
});

test('Universal cannot start new upscales but existing status and save actions remain available',async()=>{
  const start=await harness('trace-upscale');
  assertUnavailable(await start.run({projectId,action:'start'}));assertNoWork(start.calls);
  for(const action of ['status','save']) {
    const h=await harness('trace-upscale');
    const result=await h.run({projectId,action});
    assert.equal(result.response.status,action==='save'?200:202);
    assert.equal(h.calls[action],1);
    assert.equal(h.calls.start,0);
    assert.equal(h.calls.charges,0);
  }
});

test('other project types retain upscale starts and normal crop writes',async()=>{
  for(const traceType of ['mockup','logo']) {
    const upscale=await harness('trace-upscale',{traceType});
    assert.equal((await upscale.run({projectId,action:'start'})).response.status,202);
    assert.equal(upscale.calls.start,1);
    const crop=await harness('crop',{traceType});
    assert.equal((await crop.run({projectId,croppedImageUrl:sourceUrl})).response.status,200);
    assert.equal(crop.calls.writes,1);
  }
});

test('other extraction and background-removal requests still reach their normal billing boundary',async()=>{
  for(const [route,body,traceType] of [['trace',{projectId,step:1},'mockup'],['remove-bg',{projectId},'bg_remover']]) {
    const h=await harness(route,{traceType});
    const result=await h.run(body);
    assert.equal(result.response.status,403);
    assert.equal(h.calls.charges,1);
    assert.notEqual(result.body.code,'UNIVERSAL_UNAVAILABLE');
    assert.equal(h.calls.providers,0);
  }
});

test('existing Universal AI Edit jobs can be read and changed while new starts stay blocked',async()=>{
  for(const [method,call] of [['GET','status'],['PATCH','save']]) {
    const h=await harness('artwork-edit',{method});
    assert.equal((await h.run({projectId})).response.status,200);
    assert.equal(h.calls[call],1);
    assert.equal(h.calls.start,0);
  }
  const other=await harness('artwork-edit',{traceType:'mockup'});
  assert.equal((await other.run({projectId,prompt:'Edit it'})).response.status,202);
  assert.equal(other.calls.start,1);
});

test('public API Universal aliases stop before balance checks, billing logs and providers',async()=>{
  for(const mode of ['universal','universal_preserve','UNIVERSAL_BACKGROUND_ONLY']) {
    const h=await harness('v1/generate');
    assertUnavailable(await h.run({image_url:sourceUrl,mode}));
    assertNoWork(h.calls);assert.equal(h.calls.balance,0);
  }
  const other=await harness('v1/generate');
  assert.equal((await other.run({image_url:sourceUrl,mode:'keep_artwork'})).response.status,402);
  assert.equal(other.calls.balance,1);
});

test('existing Universal workspaces remain readable',async()=>{
  const h=await harness('workspace-project',{method:'GET'});
  const result=await h.run();
  assert.equal(result.response.status,200);
  assert.equal(result.body.project.trace_type,'universal');
  assert.equal(result.body.project.generated_image_url,sourceUrl);
  assertNoWork(h.calls);
});
