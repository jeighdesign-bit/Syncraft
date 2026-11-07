import { registerHooks } from 'node:module';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { validateLogoOperation } from '../../src/lib/logoStudio.mjs';
import { logoVisualDirection } from '../../src/lib/logoVisualDirection.mjs';
import { prepareLogoVisualGuides } from '../../src/lib/logoVisualGuidesServer.mjs';
import { recraftLogoPlan } from '../../src/lib/logoRecraft.mjs';

const root=resolve('outputs/text-logo-visual-control/pilot');
mkdirSync(root,{recursive:true});
const planPath=resolve(root,'plan.json');
const cases=[
  {style:'monogram',brand:'Arc Vale',prompt:'An AV monogram for a design studio.',designSettings:{monogramLetters:'AV',monogramFont:'sans',monogramTreatment:'geometric'},criteria:['AV only, fully readable','Sans-serif terminals, no serif feet','Coherent geometric letter construction','No extra words or enclosing tile']},
  {style:'line',brand:'',prompt:'A heron standing on one leg.',designSettings:{},criteria:['One recognizable heron standing on one leg','Contour-based drawing','No HRN or other letters, numbers, labels or signatures','No leaf/fish guide motifs copied into the result']},
];
if(!existsSync(planPath)) {
  const samples=[];
  for(const {criteria,...fields} of cases) {
    const input=validateLogoOperation({requestId:randomUUID(),mode:'text',operation:'generate',tagline:'',palette:[],...fields});
    const marked={...input,visualGuidance:logoVisualDirection(input,'line,monogram')};
    const guides=await prepareLogoVisualGuides(marked);
    writeFileSync(resolve(root,`${input.style}-guide.png`),Buffer.from(guides.references[0].split(',')[1],'base64'));
    const body=recraftLogoPlan(marked,{styleReferences:guides.references}).body;
    samples.push({projectId:randomUUID(),input,criteria,guide:guides.metadata,requestPreview:{...body,style_reference_urls:['[local PNG guide; hash recorded above]']}});
  }
  writeFileSync(planPath,JSON.stringify({reviewId:randomUUID(),outputs:2,appCreditBudget:16,additionalCreditsRequested:16,samples},null,2));
}
const plan=JSON.parse(readFileSync(planPath,'utf8'));
if(plan.outputs!==2||plan.appCreditBudget!==16||plan.samples.length!==2||plan.samples.some(sample=>!['line','monogram'].includes(sample.input.style))) throw Error('Unexpected pilot scope.');
for(const sample of plan.samples) {
  const marked={...sample.input,visualGuidance:logoVisualDirection(sample.input,'line,monogram')};
  const guide=await prepareLogoVisualGuides(marked);
  const body=recraftLogoPlan(marked,{styleReferences:guide.references}).body;
  if(guide.metadata.sha256!==sample.guide.sha256||body.prompt!==sample.requestPreview.prompt) throw Error('Prepared pilot changed; review it before another run.');
}
if(!process.argv.includes('--run-authorized')) {
  console.log(JSON.stringify({outputs:2,appCreditBudget:16,creditsAdded:0,generationStarted:false,plan:planPath}));
  process.exit(0);
}
config({path:'.env',override:true,quiet:true});
// This flag applies only to this pilot process. Regular localhost stays off
// until the actual outputs have been inspected and the pilot has passed.
process.env.LOGO_TEXT_VISUAL_STYLES='line,monogram';
registerHooks({resolve(specifier,context,next){
  if(context.parentURL?.includes('/node_modules/')) return next(specifier,context);
  let target=specifier.startsWith('@/')?pathToFileURL(resolve('src',specifier.slice(2))).href:specifier;
  if(target.startsWith('file:')||target.startsWith('.')) {
    const url=new URL(target,context.parentURL);
    if(!/\.[a-z]+$/i.test(url.pathname)&&existsSync(new URL(url.href+'.js'))) target=url.href+'.js';
  }
  return next(target,context);
}});
const {adminSupabase:db}=await import('../../src/lib/supabase.js');
const {createLogoState,startLogoTextBatch,refreshLogoJob}=await import('../../src/lib/logoStudioServer.js');
const userId='08bafd26-e228-4a97-9efa-84a930c90098';
const balance=async()=>{const {data,error}=await db.from('profiles').select('credits').eq('id',userId).single();if(error)throw error;return Number(data.credits);};
if(process.argv.includes('--grant-16-authorized')) {
  const action=`Authorized visual-control pilot: ${plan.reviewId}`;
  const receiptPath=resolve(root,'credit-grant.json');
  const {data:prior,error}=await db.from('credit_logs').select('amount').eq('user_id',userId).eq('action',action);
  if(error)throw error;
  if(!prior.length) {
    let receipt=existsSync(receiptPath)?JSON.parse(readFileSync(receiptPath,'utf8')):null;
    if(receipt?.status==='starting')throw Error('Reconcile the prior grant attempt before retrying.');
    if(!receipt) {
      receipt={status:'starting',amount:16,action,balanceBefore:await balance()};
      writeFileSync(receiptPath,JSON.stringify(receipt,null,2));
      const grant=await db.rpc('increment_credits',{user_id:userId,amount:16});if(grant.error)throw grant.error;
      receipt.status='applied';writeFileSync(receiptPath,JSON.stringify(receipt,null,2));
    }
    const log=await db.from('credit_logs').insert({user_id:userId,action,amount:16});if(log.error)throw log.error;
    receipt.status='logged';receipt.balanceAfter=await balance();writeFileSync(receiptPath,JSON.stringify(receipt,null,2));
  } else if(prior.length!==1||Number(prior[0].amount)!==16)throw Error('Unexpected pilot grant history.');
}
for(const sample of plan.samples) {
  const dir=resolve(root,sample.input.style);mkdirSync(dir,{recursive:true});
  let {data:project,error}=await db.from('projects').select('*').eq('id',sample.projectId).maybeSingle();if(error)throw error;
  if(!project) {
    if(await balance()<8)throw Error('Insufficient pilot credits. No automatic grant or retry.');
    const inserted=await db.from('projects').insert({id:sample.projectId,user_id:userId,name:`Visual Control Pilot — ${sample.input.style}`,trace_type:'logo',canvas_data:createLogoState(userId,sample.projectId)}).select('*').single();if(inserted.error)throw inserted.error;project=inserted.data;
  }
  if(project.user_id!==userId)throw Error('Pilot owner mismatch.');
  const existing=project.canvas_data.jobs.find(job=>job.batchId===sample.input.requestId);
  project=existing?await refreshLogoJob(userId,project,existing.id):await startLogoTextBatch(userId,project,sample.input,1);
  const job=project.canvas_data.jobs.find(job=>job.batchId===sample.input.requestId);
  if(!job)throw Error('Missing pilot job.');
  const result={projectId:project.id,jobId:job.id,input:sample.input,status:job.status,error:job.error,model:job.model,seed:job.seed,url:job.url,visualGuidance:job.visualGuidance,visualGuideResult:job.visualGuideResult,compiledPrompt:job.compiledPrompt,estimatedCostUsd:job.estimatedCostUsd,appCreditsUsed:job.creditCost,remainingCredits:await balance(),criteria:sample.criteria,accepted:false,studioUrl:`http://localhost:3000/logo-studio/${project.id}`};
  writeFileSync(resolve(dir,'result.json'),JSON.stringify(result,null,2));
  if(job.status!=='succeeded')throw Error(`Pilot ${sample.input.style} did not complete.`);
  if(!job.visualGuideResult?.sha256)throw Error('The actual job did not attach its prepared visual guide.');
  const response=await fetch(job.url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Could not download pilot output.');
  writeFileSync(resolve(dir,'result.png'),Buffer.from(await response.arrayBuffer()));
  console.log(JSON.stringify({style:sample.input.style,status:job.status,visualGuideAttached:true,appCreditsUsed:job.creditCost,remainingCredits:result.remainingCredits}));
}
