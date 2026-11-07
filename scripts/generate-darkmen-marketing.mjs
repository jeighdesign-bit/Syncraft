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

const dir='outputs/darkmen-marketing'; mkdirSync(dir,{recursive:true});
const variants=[
 ['silver-teal','Silver / Teal Gothic','gothic','arched','layered','beveled','#E6E9EA','#777E85','#26C6BD','#141618'],
 ['gold-script','Gold Chicano Script','script','straight','layered','extruded','#FFD477','#9A541D','#FFF0BB','#18130E'],
 ['crimson-spiked','Crimson Spiked Display','spiked-display','arched','single','flat','#ED3E55','#7E172D','#FFD8DF','#130E14'],
 ['violet-racing','Violet Racing Script','racing-script','straight','layered','beveled','#D4B6FF','#6F3CA9','#F3E8FF','#17111F'],
 ['copper-serif','Copper Flared Serif','flared-serif','arched','single','extruded','#EEA16B','#97502E','#F9DEBB','#171514'],
 ['ice-retro','Ice Blue Retro Swash','retro-swash','straight','layered','flat','#9AEAF7','#3E92BA','#F1FBFF','#0F1C27'],
];
const file=dir+'/manifest.json'; let state=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{variants:[],createdAt:new Date().toISOString()};
const save=()=>writeFileSync(file,JSON.stringify(state,null,2));
const {data:source,error:sourceError}=await db.from('projects').select('user_id').eq('id','08ca512d-051e-4d54-b3ae-6230e60841c8').single(); if(sourceError)throw sourceError;
const userId=source.user_id;
async function make(v){const [key,title,letters,layout,outline,depth,primary,secondary,keyline,bg]=v;
 let entry=state.variants.find(x=>x.key===key);
 if(!entry){entry={key,title,projectId:randomUUID(),requestId:randomUUID(),settings:{streetwearLetters:letters,streetwearLayout:layout,streetwearOutline:outline,streetwearDepth:depth,primaryColor:primary,secondaryColor:secondary,outlineColor:keyline,backgroundColor:bg}};state.variants.push(entry);save();}
 if(entry.status==='succeeded')return;
 let {data:project,error}=await db.from('projects').select('*').eq('id',entry.projectId).maybeSingle();if(error)throw error;
 if(!project){const result=await db.from('projects').insert({id:entry.projectId,user_id:userId,name:'DARKMEN Marketing — '+title,trace_type:'logo',canvas_data:createLogoState(userId,entry.projectId)}).select('*').single();if(result.error)throw result.error;project=result.data;}
 const input=validateLogoOperation({requestId:entry.requestId,operation:'generate',mode:'text',style:'streetwear-lettering',brand:'DARKMEN',tagline:'ENTERPRISE',prompt:'',palette:[],designSettings:entry.settings});
 project=await startLogoTextBatch(userId,project,input,1);
 const job=project.canvas_data.jobs[0];Object.assign(entry,{status:job.status,jobId:job.id,url:job.url,error:job.error,model:job.model,provider:job.provider,isOwnerTest:job.isOwnerTest,creditCost:job.creditCost,studioUrl:'http://localhost:3000/logo-studio/'+entry.projectId,prompt:job.compiledPrompt});save();
 if(job.status!=='succeeded')throw Error(title+': '+job.status+' '+(job.error||''));
 const r=await fetch(job.url);if(!r.ok)throw Error('Download failed');writeFileSync(dir+'/'+key+'.png',Buffer.from(await r.arrayBuffer()));console.log(title+': saved ('+job.model+', owner test: '+job.isOwnerTest+')');
}
for(let i=0;i<variants.length;i+=2){const results=await Promise.allSettled(variants.slice(i,i+2).map(make));for(const r of results)if(r.status==='rejected')console.log('FAILED: '+r.reason.message);}
console.log(JSON.stringify({saved:state.variants.filter(v=>v.status==='succeeded').length,total:variants.length}));
