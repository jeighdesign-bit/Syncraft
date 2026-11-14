import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import sharp from 'sharp';
import {CREDIT_COST} from '../src/lib/pricing.js';
import {ARTWORK_EDIT_COST,ARTWORK_EDIT_MODEL} from '../src/lib/artworkEditPolicy.mjs';
import * as aspect from '../src/lib/aspectRatio.js';
import {universalUnavailableResponse} from '../src/lib/universalAvailability.mjs';

async function source(route){return (await readFile(new URL(`../src/app/api/${route}/route.js`,import.meta.url),'utf8')).replace(/^import[\s\S]*?;\r?\n/gm,'').replace(/export /g,'').replace("const sharp = (await import('sharp')).default;",'');}

test('AI Edit invokes verified billing with exactly four credits',async()=>{
  const charges=[];
  const context={process:{env:{SUPABASE_SERVICE_ROLE_KEY:'isolated-test'}},createArtworkEditService:deps=>deps,ARTWORK_EDIT_COST,ARTWORK_EDIT_MODEL,
    chargeCreditsVerified:async input=>{charges.push(input);return {transactionId:'test-charge'};}};
  const service=vm.runInNewContext(await source('artwork-edit')+'\nserviceFor("owner")',context);
  await service.charge({actorId:'owner',projectId:'test-project',requestId:'test-request'});
  assert.equal(charges.length,1);assert.equal(charges[0].amount,4);assert.equal(charges[0].feature,'artwork_edit');
  assert.equal(charges[0].idempotencyKey,'artwork-edit:test-project:test-request');
});

for(const [route,amount,feature] of [['remove-bg',2,'background_removal'],['extend-design',6,'extend_design']]){
  test(`${route} invokes verified billing with exactly ${amount} credits after validation`,async()=>{
    const charges=[];let providers=0;
    const project={id:'test-project',user_id:'owner',trace_type:'mockup',original_image_url:'https://storage.test/source.png',generated_image_url:'https://storage.test/flat.png'};
    const raster=await sharp({create:{width:256,height:256,channels:3,background:'#7724ab'}}).png().toBuffer();
    const context={...aspect,sharp,Buffer,Response,Request,AbortSignal,URL,CREDIT_COST,universalUnavailableResponse,NextResponse:Response,
      console:{log(){},error(){},warn(){}},PROJECT_ACCESS:{EDIT:'edit'},
      adminSupabase:{auth:{getUser:async()=>({data:{user:{id:'owner'}}})}},
      getProjectAccess:async()=>({project}),enforceRateLimit:async()=>({success:true}),isOwnedStorageUrl:()=>true,
      validateUrlForSSRF:async()=>true,getAllowedStorageHosts:()=>['storage.test'],DEFAULT_MAX_IMAGE_BYTES:10e6,
      fetchWithSSRFProtection:async()=>({response:{ok:true},buffer:raster}),
      chargeCreditsVerified:async input=>{charges.push(input);throw Object.assign(new Error('Isolated billing boundary'),{code:'INSUFFICIENT_CREDITS'});},
      fal:{subscribe:async()=>{providers++;throw new Error('No provider calls permitted');}},
    };
    const post=vm.runInNewContext(await source(route)+'\nPOST',context);
    const response=await post(new Request(`https://app.test/api/${route}`,{method:'POST',headers:{authorization:'Bearer isolated-test','content-type':'application/json'},body:JSON.stringify({projectId:project.id,pads:{left:0,right:32,top:0,bottom:0}})}));
    assert.equal(response.status,403);assert.equal(charges.length,1);assert.equal(charges[0].amount,amount);assert.equal(charges[0].feature,feature);assert.equal(providers,0);
  });
}
