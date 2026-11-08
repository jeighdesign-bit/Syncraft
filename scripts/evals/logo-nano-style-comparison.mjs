// Four bounded experimental Nano 2.1 Text-to-Image calls. Reuse the exact saved
// Recraft prompts/settings; never alter live routing, prices or project jobs.
// No Syncraft credit deduction. Provider usage is recorded separately.
import { registerHooks } from 'node:module';
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { createFalClient } from '@fal-ai/client';
import sharp from 'sharp';

const endpoint = 'google/nano-banana-2.1';
const styles = ['mascot', 'retro', 'icon', 'cartoon'];
const baseline = JSON.parse(readFileSync(resolve('outputs/logo-all-styles-review/manifest.json'), 'utf8'));
const folder = resolve('outputs/logo-nano-style-comparison'); mkdirSync(folder, { recursive:true });
const path = resolve(folder,'manifest.json');
const sha = value => createHash('sha256').update(value).digest('hex');
const protectedPaths = [...Object.keys(baseline.sourceHashes), 'src/lib/logoStudioServer.js', 'src/lib/logoNanoTextServer.mjs', 'src/app/components/PricingSection.js'];
const sourceHashes = () => Object.fromEntries(protectedPaths.map(path=>[path,sha(readFileSync(path))]));
const state = existsSync(path) ? JSON.parse(readFileSync(path,'utf8')) : {
  createdAt:new Date().toISOString(), endpoint, maxNewImageCalls:4, syncraftCreditDeduction:0, sourceHashes:sourceHashes(),
  samples:styles.map(style=>{
    const prior=baseline.samples.find(sample=>sample.style===style);
    if(prior?.status!=='succeeded' || prior.model!=='recraftv4_1' || !existsSync(prior.nativeFile)) throw Error(`Missing baseline: ${style}`);
    return { style, comparisonId:randomUUID(), baselineProjectId:prior.projectId, baselineJobId:prior.jobId,
      originalPrompt:prior.prompt, enhancedPrompt:prior.enhancedPrompt, brand:prior.brand, designSettings:prior.appliedSettings,
      seed:prior.appliedSeed, baselineFile:prior.nativeFile, baselineSha256:sha(readFileSync(prior.nativeFile)), status:'not-started' };
  }),
};
const save = ()=>writeFileSync(path,JSON.stringify(state,null,2));
if(JSON.stringify(state.sourceHashes)!==JSON.stringify(sourceHashes())) throw Error('Production sources changed; preserve this comparison.');
if(state.samples.length!==4 || state.endpoint!==endpoint || state.samples.some(sample=>!styles.includes(sample.style))) throw Error('Comparison scope changed.');
config({path:'.env.local',quiet:true}); config({path:'.env',quiet:true});
registerHooks({resolve(specifier,context,next){
  if(context.parentURL?.includes('/node_modules/')) return next(specifier,context);
  let target=specifier.startsWith('@/')?pathToFileURL(resolve('src',specifier.slice(2))).href:specifier;
  if(target.startsWith('file:')||target.startsWith('.')){
    const url=new URL(target,context.parentURL);
    if(!/\.[a-z]+$/i.test(url.pathname)&&existsSync(new URL(url.href+'.js'))) target=url.href+'.js';
  }
  return next(target,context);
}});
const {adminSupabase:db}=await import('../../src/lib/supabase.js');
const {ownedLogoProject}=await import('../../src/lib/logoStudioServer.js');
const {recordProviderUsage}=await import('../../src/lib/creditLedger.js');
const {data:owner,error:ownerError}=await db.from('projects').select('user_id').eq('id',state.samples[0].baselineProjectId).single();
if(ownerError||!owner?.user_id) throw Error('Could not verify comparison ownership.');
const userId=owner.user_id;
const balance=async()=>{const {data,error}=await db.from('profiles').select('credits').eq('id',userId).single();if(error)throw error;return data.credits;};
for(const sample of state.samples){
  const project=await ownedLogoProject(userId,sample.baselineProjectId);
  const job=project.canvas_data.jobs.find(job=>job.id===sample.baselineJobId);
  if(job?.status!=='succeeded'||job.model!=='recraftv4_1'||!job.compiledPrompt) throw Error('Expected a saved Recraft Text baseline.');
  if(job.visualGuideResult?.referenceCount) throw Error('A guided baseline needs matching reference treatment before comparison.');
  const promptSha256=sha(job.compiledPrompt);
  if(sample.promptSha256&&sample.promptSha256!==promptSha256) throw Error('Saved baseline prompt changed.');
  if(JSON.stringify(sample.designSettings)!==JSON.stringify(job.designSettings)||sample.brand!==job.brand||sample.seed!==job.seed) throw Error('Saved baseline settings changed.');
  sample.promptSha256=promptSha256;
  sample.input={prompt:job.compiledPrompt,aspect_ratio:'1:1',resolution:'1K',num_images:1,output_format:'png',limit_generations:true,enable_web_search:false,thinking_level:'medium',seed:job.seed};
  const baselinePath=resolve(folder,`recraft-${sample.style}.png`);
  if(!existsSync(baselinePath)) copyFileSync(sample.baselineFile,baselinePath);
  if(sha(readFileSync(baselinePath))!==sample.baselineSha256) throw Error('Baseline PNG changed.');
}
save();
if(!process.argv.includes('--run-paid')){
  console.log(JSON.stringify({newImageCalls:4,endpoint,resolution:'1K',frozenPrompts:true,syncraftCredits:0,routingChanges:0}));process.exit(0);
}
if(!process.env.FAL_KEY) throw Error('Nano Banana credentials are unavailable.');
const client=createFalClient({credentials:process.env.FAL_KEY,retry:{maxRetries:0}});
state.balanceBefore??=await balance();save();
for(const sample of state.samples){
  if(sample.status==='not-started'){
    sample.status='submitting';sample.startedAt=new Date().toISOString();save();
    try{
      const result=await client.queue.submit(endpoint,{input:sample.input,abortSignal:AbortSignal.timeout(30_000)});
      if(!result.request_id) throw Error('Provider returned no request ID.');
      sample.providerRequestId=result.request_id;sample.status='queued';save();
    }catch(error){sample.status='failed-or-unknown';sample.error=`Submission failed (${error.status||error.name}). No automatic retry.`;save();}
  }
  if(sample.status==='submitting'&&!sample.providerRequestId) throw Error('An interrupted submission has unknown billing state. Do not repeat the paid POST.');
  if(sample.providerRequestId&&!sample.outputUrl&&sample.status!=='failed-or-unknown'){
    for(let attempt=0;attempt<90;attempt++){
      let status;
      try{status=await client.queue.status(endpoint,{requestId:sample.providerRequestId,logs:false,abortSignal:AbortSignal.timeout(20_000)});}
      catch(error){if([400,404,422].includes(error.status)){sample.status='failed';sample.error=`Provider result failed (${error.status}).`;save();break;}await new Promise(r=>setTimeout(r,2000));continue;}
      if(status.status==='COMPLETED'){
        try{
          const result=await client.queue.result(endpoint,{requestId:sample.providerRequestId,abortSignal:AbortSignal.timeout(30_000)});
          const image=result.data?.images?.[0];
          if(!image?.url?.startsWith('https://')||result.data.images.length!==1) throw Error('Expected one generated image.');
          sample.outputUrl=image.url;sample.status='generated';sample.elapsedMs=Date.now()-Date.parse(sample.startedAt);
          sample.reportedUsage=result.data?.usage||null;
          sample.actualReportedCostUsd=Number.isFinite(result.data?.usage?.cost)?result.data.usage.cost:null;
          sample.inferenceTimeSeconds=status.metrics?.inference_time??null;save();
        }catch(error){sample.status='failed';sample.error=`Provider result could not be read (${error.status||error.name}).`;save();}
        break;
      }
      sample.status=status.status==='IN_PROGRESS'?'running':'queued';save();
      await new Promise(r=>setTimeout(r,2000));
    }
  }
  if(!sample.usageLogged&&['generated','succeeded','failed','failed-or-unknown'].includes(sample.status)){
    sample.usageLogged=await recordProviderUsage({userId,projectId:sample.baselineProjectId,provider:'fal',endpoint,providerRequestId:sample.providerRequestId,
      requestStatus:sample.outputUrl?'succeeded':'failed',estimatedCostUsd:sample.actualReportedCostUsd??null,
      metadata:{feature:'logo_nano_style_comparison',comparisonId:sample.comparisonId,style:sample.style,imageCalls:1,standaloneComparison:true,promptSha256:sample.promptSha256,baselineJobId:sample.baselineJobId,seed:sample.seed,elapsedMs:sample.elapsedMs}});save();
  }
  if(sample.outputUrl){
    const file=resolve(folder,`nano-${sample.style}.png`);
    if(!existsSync(file)){
      const response=await fetch(sample.outputUrl,{signal:AbortSignal.timeout(30_000)});
      if(!response.ok) throw Error('Output download failed; resume to download without generating again.');
      const buffer=Buffer.from(await response.arrayBuffer());
      const metadata=await sharp(buffer).metadata();
      if(metadata.width!==metadata.height) throw Error('Expected a square image.');
      sample.width=metadata.width;sample.height=metadata.height;writeFileSync(file,buffer);
    }
    sample.nativeFile=file;sample.status='succeeded';save();
  }
  console.log(JSON.stringify({style:sample.style,status:sample.status,endpoint,dimensions:sample.width?`${sample.width}x${sample.height}`:null,elapsedMs:sample.elapsedMs,actualReportedCostUsd:sample.actualReportedCostUsd??null}));
}
state.balanceAfter=await balance();state.sourceHashesAfter=sourceHashes();state.finishedAt=new Date().toISOString();save();
if(JSON.stringify(state.sourceHashes)!==JSON.stringify(state.sourceHashesAfter)) throw Error('Production sources changed.');
console.log(JSON.stringify({completed:state.samples.filter(sample=>sample.status==='succeeded').length,newImageCalls:4,syncraftBalanceBefore:state.balanceBefore,syncraftBalanceAfter:state.balanceAfter,productionSourcesUnchanged:true}));
