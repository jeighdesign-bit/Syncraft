import { registerHooks } from 'node:module';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.includes('/node_modules/')) return next(specifier, context);
  let target = specifier.startsWith('@/') ? pathToFileURL(resolve('src', specifier.slice(2))).href : specifier;
  if (target.startsWith('file:') || target.startsWith('.')) {
    const url = new URL(target, context.parentURL);
    if (!/\.[a-z]+$/i.test(url.pathname) && existsSync(new URL(url.href + '.js'))) target = url.href + '.js';
  }
  return next(target, context);
} });
if (!process.argv.includes('--run-paid')) {
  throw new Error('This script creates saved projects and may spend provider credits. Review its configuration, then pass --run-paid explicitly.');
}

const { adminSupabase: db } = await import('../src/lib/supabase.js');
const { createLogoState, startLogoTextBatch, refreshLogoJob, ownedLogoProject } = await import('../src/lib/logoStudioServer.js');
const { validateLogoOperation } = await import('../src/lib/logoStudio.mjs');

const dir='outputs/darkmen-marketing-seven'; mkdirSync(dir,{recursive:true});
const variants=[
 ['emerald-champagne','Emerald / Champagne','gothic','arched','layered','beveled','#DCE6C7','#5D8A71','#C6A66B','#102C26'],
 ['burgundy-ivory','Burgundy / Ivory','script','straight','layered','extruded','#FFF0D7','#982C49','#DDB36B','#32151F'],
 ['cobalt-silver','Cobalt / Silver','spiked-display','arched','single','beveled','#DDE8F5','#305DAD','#528FFF','#101C38'],
 ['copper-petrol','Copper / Petrol','flared-serif','straight','layered','extruded','#F0AB75','#9A573E','#63C7CB','#102D34'],
 ['rose-plum','Rose / Plum','racing-script','straight','layered','beveled','#FFC1CB','#A65782','#D6AAFA','#28162F'],
 ['lemon-graphite','Lemon / Graphite','gothic','arched','single','flat','#F2EE92','#8E955C','#F5F3C5','#20272A'],
 ['porcelain-navy','Porcelain / Navy','retro-swash','straight','single','flat','#173954','#56758E','#A68B5D','#F3EDDF'],
];
const file=dir+'/manifest.json'; let state=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{variants:[],createdAt:new Date().toISOString()};
const save=()=>writeFileSync(file,JSON.stringify(state,null,2));
const {data:source,error:sourceError}=await db.from('projects').select('user_id').eq('id','08ca512d-051e-4d54-b3ae-6230e60841c8').single(); if(sourceError)throw sourceError;
const userId=source.user_id;
const grantAction='User authorized 56 marketing credits for seven DARKMEN logos 2026-11-05';
const grantFile=dir+'/credit-grant.json';
const {data:grants,error:grantSearchError}=await db.from('credit_logs').select('id,amount').eq('user_id',userId).eq('action',grantAction);if(grantSearchError)throw grantSearchError;
if(!grants.length){
 if(existsSync(grantFile))throw Error('Prior grant attempt exists; reconcile before granting again.');
 writeFileSync(grantFile,JSON.stringify({status:'starting',amount:56,action:grantAction}));
 const {error:grantError}=await db.rpc('increment_credits',{user_id:userId,amount:56});if(grantError)throw grantError;
 writeFileSync(grantFile,JSON.stringify({status:'applied',amount:56,action:grantAction}));
 const {error:logError}=await db.from('credit_logs').insert({user_id:userId,action:grantAction,amount:56});if(logError)throw logError;
 writeFileSync(grantFile,JSON.stringify({status:'logged',amount:56,action:grantAction}));
 console.log('Added 56 authorized marketing credits.');
}else console.log('Authorized grant already exists; not adding twice.');

async function make(v){const [key,title,letters,layout,outline,depth,primary,secondary,keyline,bg]=v;
 let entry=state.variants.find(x=>x.key===key);
 if(!entry){entry={key,title,projectId:randomUUID(),requestId:randomUUID(),settings:{streetwearLetters:letters,streetwearLayout:layout,streetwearOutline:outline,streetwearDepth:depth,primaryColor:primary,secondaryColor:secondary,outlineColor:keyline,backgroundColor:bg}};state.variants.push(entry);save();}
 if(entry.status==='succeeded')return;
 let {data:project,error}=await db.from('projects').select('*').eq('id',entry.projectId).maybeSingle();if(error)throw error;
 if(!project){const result=await db.from('projects').insert({id:entry.projectId,user_id:userId,name:'DARKMEN Marketing 2 — '+title,trace_type:'logo',canvas_data:createLogoState(userId,entry.projectId)}).select('*').single();if(result.error)throw result.error;project=result.data;}
 const input=validateLogoOperation({requestId:entry.requestId,operation:'generate',mode:'text',style:'streetwear-lettering',brand:'DARKMEN',tagline:'ENTERPRISE',prompt:'Create a premium apparel lettering logo with strong coordinated letter anatomy and a clean custom word silhouette. Follow the selected lettering genre and layout exactly. Keep DARKMEN fully readable and ENTERPRISE in a contrasting light or dark ink directly below. No symbols, mockup, texture, or extra wording.',palette:[],designSettings:entry.settings});
 project=await startLogoTextBatch(userId,project,input,1);
 const job=project.canvas_data.jobs[0];Object.assign(entry,{status:job.status,jobId:job.id,url:job.url,error:job.error,model:job.model,provider:job.provider,isOwnerTest:job.isOwnerTest,creditCost:job.creditCost,studioUrl:'http://localhost:3000/logo-studio/'+entry.projectId,prompt:job.compiledPrompt});save();
 if(job.status!=='succeeded')throw Error(title+': '+job.status+' '+(job.error||''));
 const r=await fetch(job.url);if(!r.ok)throw Error('Download failed');writeFileSync(dir+'/'+key+'.png',Buffer.from(await r.arrayBuffer()));console.log(title+': saved ('+job.model+', owner test: '+job.isOwnerTest+')');
}
for(let i=0;i<variants.length;i+=2){const results=await Promise.allSettled(variants.slice(i,i+2).map(make));for(const r of results)if(r.status==='rejected')console.log('FAILED: '+r.reason.message);}
console.log(JSON.stringify({saved:state.variants.filter(v=>v.status==='succeeded').length,total:variants.length}));
