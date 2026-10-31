import sharp from 'sharp';
import { normalizedPrintQuad, rectifyPrintPlane } from './recoveryPlanar.mjs';
import { checkRecoveryCandidate } from './recoveryCandidate.mjs';

const cross = (o, a, b) => (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
const distance = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1]);
function hull(points) {
  points.sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
  const lower=[], upper=[];
  for(const p of points) { while(lower.length>1 && cross(lower.at(-2),lower.at(-1),p)<=0) lower.pop(); lower.push(p); }
  for(const p of [...points].reverse()) { while(upper.length>1 && cross(upper.at(-2),upper.at(-1),p)<=0) upper.pop(); upper.push(p); }
  return lower.slice(0,-1).concat(upper.slice(0,-1));
}
function dominantFraction(mask, width, height, count) {
  const visited=new Uint8Array(mask.length), queue=new Int32Array(mask.length);
  let largest=0;
  for(let start=0;start<mask.length;start++) {
    if(!mask[start] || visited[start]) continue;
    let read=0, write=1; queue[0]=start; visited[start]=1;
    while(read<write) {
      const index=queue[read++], x=index%width, y=Math.floor(index/width);
      for(const next of [x>0?index-1:-1,x+1<width?index+1:-1,y>0?index-width:-1,y+1<height?index+width:-1]) {
        if(next>=0 && mask[next] && !visited[next]) {visited[next]=1;queue[write++]=next;}
      }
    }
    largest=Math.max(largest,write);
  }
  return largest/count;
}
function enclosingQuad(polygon) {
  const corners=polygon.map(p=>[...p]);
  while(corners.length>4) {
    let best=0, area=Infinity;
    for(let i=0;i<corners.length;i++) {
      const previous=corners[(i+corners.length-1)%corners.length], next=corners[(i+1)%corners.length];
      const score=Math.abs(cross(previous,corners[i],next))/Math.max(1e-9,distance(previous,next));
      if(score<area) {area=score;best=i;}
    }
    corners.splice(best,1);
  }
  if(corners.length!==4) return null;
  const lines=corners.map((p,i)=>{
    const next=corners[(i+1)%4], length=distance(p,next);
    if(length<1) return null;
    const normal=[-(next[1]-p[1])/length,(next[0]-p[0])/length];
    // Include every foreground pixel's entire square, not merely its center.
    const offset=Math.min(...polygon.map(point=>normal[0]*point[0]+normal[1]*point[1]))-(Math.abs(normal[0])+Math.abs(normal[1]))*0.5;
    return {normal,offset};
  });
  if(lines.some(line=>!line)) return null;
  const quad=lines.map((line,i)=>{
    const previous=lines[(i+3)%4], [a,b]=previous.normal, [c,d]=line.normal;
    const determinant=a*d-b*c;
    return Math.abs(determinant)<1e-6 ? null : [(previous.offset*d-b*line.offset)/determinant,(a*line.offset-previous.offset*c)/determinant];
  });
  if(quad.some(point=>!point || point.some(value=>!Number.isFinite(value)))) return null;
  return {quad,lines};
}
function uprightCorners(quad) {
  for(let offset=0;offset<4;offset++) {
    const q=quad.map((_,i)=>quad[(i+offset)%4]);
    const top=[q[1][0]-q[0][0],q[1][1]-q[0][1]], right=[q[2][0]-q[1][0],q[2][1]-q[1][1]];
    const bottom=[q[3][0]-q[2][0],q[3][1]-q[2][1]], left=[q[0][0]-q[3][0],q[0][1]-q[3][1]];
    if(top[0]>0 && right[1]>0 && bottom[0]<0 && left[1]<0
      && Math.max(Math.abs(top[1]/top[0]),Math.abs(bottom[1]/bottom[0]),Math.abs(right[0]/right[1]),Math.abs(left[0]/left[1]))<0.7) return q;
  }
  return null;
}

// Propose a geometric correction of an existing generated image, never a new
// design. The caller must independently validate it against the original target.
export async function proposeOutputPrintPlane(buffer, analysis, mode) {
  if(mode!=='UNIVERSAL_KEEP_ARTWORK' || !['banner','poster','packaging'].includes(analysis?.reference_category)
    || analysis.presentation_type!=='physical_surface' || analysis.surface_geometry!=='planar'
    || analysis.single_surface!==true || analysis.already_flat===true) return null;
  const {data,info}=await sharp(buffer).rotate().resize(1024,1024,{fit:'inside',withoutEnlargement:true})
    .flatten({background:'#ffffff'}).toColourspace('srgb').removeAlpha().raw().toBuffer({resolveWithObject:true});
  const width=info.width, height=info.height, patch=Math.max(1,Math.min(6,Math.floor(Math.min(width,height)*0.01)));
  const corners=[[0,0],[width-patch,0],[width-patch,height-patch],[0,height-patch]], samples=[];
  for(const [left,top] of corners) for(let y=top;y<top+patch;y++) for(let x=left;x<left+patch;x++) {
    const offset=(y*width+x)*3; samples.push([data[offset],data[offset+1],data[offset+2]]);
  }
  const background=[0,1,2].map(c=>samples.reduce((sum,p)=>sum+p[c],0)/samples.length);
  if(Math.max(...background)-Math.min(...background)>12 || !(Math.min(...background)>=210 || Math.max(...background)<=45)
    || samples.some(p=>p.some((value,c)=>Math.abs(value-background[c])>12))) return null;
  const mask=new Uint8Array(width*height), points=[];
  let foreground=0;
  for(let y=0;y<height;y++) {
    let first=width, last=-1;
    for(let x=0;x<width;x++) {
      const index=y*width+x, offset=index*3;
      if(background.some((value,c)=>Math.abs(data[offset+c]-value)>25)) {mask[index]=1;foreground++;first=Math.min(first,x);last=x;}
    }
    if(last>=0) points.push([first+0.5,y+0.5],[last+0.5,y+0.5]);
  }
  if(foreground<width*height*0.15 || foreground>width*height*0.95 || points.length<8) return null;
  const connected=dominantFraction(mask,width,height,foreground);
  if(connected<0.6) return null;
  const polygon=hull(points), fitted=enclosingQuad(polygon);
  if(!fitted) return null;
  const q=uprightCorners(fitted.quad);
  if(!q || q.some(point=>point[0]<0 || point[0]>width || point[1]<0 || point[1]>height)) return null;
  const tolerance=Math.max(1.5,Math.min(width,height)*0.005);
  let perimeterSamples=0, matched=0;
  for(let i=0;i<polygon.length;i++) {
    const p=polygon[i], next=polygon[(i+1)%polygon.length], count=Math.max(1,Math.ceil(distance(p,next)/2));
    for(let step=0;step<count;step++) {
      const point=[p[0]+(next[0]-p[0])*step/count,p[1]+(next[1]-p[1])*step/count];
      const error=Math.min(...fitted.lines.map(({normal,offset})=>Math.abs(normal[0]*point[0]+normal[1]*point[1]-offset)));
      perimeterSamples++;if(error<=tolerance)matched++;
    }
  }
  const fit=matched/perimeterSamples;
  if(fit<0.95 || polygon.some(point=>fitted.lines.some(({normal,offset})=>normal[0]*point[0]+normal[1]*point[1]<offset-1e-6))) return null;
  let outside=0, uniformOutside=0;
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    if(fitted.lines.some(({normal,offset})=>normal[0]*(x+0.5)+normal[1]*(y+0.5)<offset)) {
      outside++;
      const pixel=(y*width+x)*3;
      if(background.every((value,c)=>Math.abs(data[pixel+c]-value)<=18)) uniformOutside++;
    }
  }
  if(outside<width*height*0.03 || uniformOutside/outside<0.995) return null;
  const top=distance(q[0],q[1]), bottom=distance(q[3],q[2]), left=distance(q[0],q[3]), right=distance(q[1],q[2]);
  const tilt=Math.max(Math.abs((q[1][1]-q[0][1])/(q[1][0]-q[0][0])),Math.abs((q[2][1]-q[3][1])/(q[2][0]-q[3][0])),
    Math.abs((q[3][0]-q[0][0])/(q[3][1]-q[0][1])),Math.abs((q[2][0]-q[1][0])/(q[2][1]-q[1][1])));
  const keystone=Math.max(Math.abs(top-bottom)/Math.max(top,bottom),Math.abs(left-right)/Math.max(left,right));
  if(tilt<0.015 && keystone<0.03) return null;
  const quad=q.map(([x,y])=>[x/width*1000,y/height*1000]);
  if(!normalizedPrintQuad(quad)) return null;
  // The fit uses a reduced preview, but tiny original-resolution marks outside
  // its proposed plane must not silently disappear in that downsampling.
  const original=await sharp(buffer).rotate().flatten({background:'#ffffff'}).toColourspace('srgb').removeAlpha().raw().toBuffer({resolveWithObject:true});
  let originalForegroundOutside=0;
  for(let y=0;y<original.info.height;y++) for(let x=0;x<original.info.width;x++) {
    const px=(x+0.5)/original.info.width*width, py=(y+0.5)/original.info.height*height;
    if(fitted.lines.some(({normal,offset})=>normal[0]*px+normal[1]*py<offset)) {
      const pixel=(y*original.info.width+x)*3;
      if(background.some((value,c)=>Math.abs(original.data[pixel+c]-value)>25)) originalForegroundOutside++;
    }
  }
  if(originalForegroundOutside) return null;
  return {buffer:await rectifyPrintPlane(buffer,quad),quad,diagnostics:{method:'generated_output_plane',
    hull_fit_fraction:fit,foreground_fraction:foreground/(width*height),dominant_component_fraction:connected,
    foreground_contained:true,foreground_checked_at_original_resolution:true,original_foreground_outside:originalForegroundOutside,
    uniform_exterior_fraction:uniformOutside/outside,background_rgb:background.map(Math.round),
    sampled_dimensions:{width,height},pixels_regenerated:false,resampled:true,physical_dimensions_known:false,
    requires_source_validation:true}};
}

// This review verifies that straightening has not added any further losses to
// the generated image. It does not certify that generation matched the source.
export async function verifyOutputPrintPlane({ buffer, analysis, mode, check = checkRecoveryCandidate, onUsage = async () => {}, allowLocalEvidence = false }) {
  let proposal;
  try { proposal=await proposeOutputPrintPlane(buffer,analysis,mode); }
  catch { return {buffer,proposal:null,validation:null,calls:0,status:'geometry_error'}; }
  if(!proposal) return {buffer,proposal:null,validation:null,calls:0,status:'not_proposed'};
  const proof=proposal.diagnostics;
  // Explicitly scoped to an already-generated output. These checks establish a
  // bounded pixel transform, never fidelity to the user's original reference.
  // Source-image recovery still requires its separate visual verification.
  if(allowLocalEvidence===true && proof?.foreground_contained===true
    && proof.foreground_checked_at_original_resolution===true && proof.original_foreground_outside===0
    && proof.hull_fit_fraction>=0.95 && proof.uniform_exterior_fraction>=0.995
    && proof.pixels_regenerated===false) {
    return {buffer:proposal.buffer,proposal,calls:0,status:'accepted_local_geometry',validation:{
      pass:false,usable_partial:true,advisory_only:true,local_geometry_validation:true,output_plane_accepted:true,
      failures:[],checks:{geometry:'pass',content:'unverifiable',lettering:'unverifiable'},
      correction:'Geometry corrected from existing generated pixels. Original artwork fidelity still requires review.',
    }};
  }
  const expected=Buffer.from(proposal.buffer);
  let checked;
  try { checked=await check({sourceBuffer:Buffer.from(buffer),outputBuffer:Buffer.from(expected),analysis,mode,method:'image_edit',allowCrop:false,onUsage}); }
  catch { return {buffer,proposal,validation:null,calls:1,status:'unavailable'}; }
  const calls=Number.isInteger(checked?.calls) && checked.calls>0 ? checked.calls : 1;
  const validation=checked?.validation && typeof checked.validation==='object' && !Array.isArray(checked.validation) ? checked.validation : null;
  const unchanged=checked?.cropped!==true && validation?.crop_attempted!==true
    && Buffer.isBuffer(checked?.buffer) && checked.buffer.equals(expected) && proposal.buffer.equals(expected);
  const positive=validation?.pass===true && validation.visual_validation===true
    && validation.checks?.geometry==='pass' && validation.checks?.content==='pass'
    && ['pass','unverifiable'].includes(validation.checks?.lettering)
    && Array.isArray(validation.failures) && validation.failures.length===0;
  if(!unchanged || !positive) return {buffer,proposal,validation:validation?{...validation,output_plane_accepted:false,
    output_plane_rejection_reason:unchanged?'review_did_not_verify_proposal':'review_changed_proposal'}:null,calls,status:'rejected'};
  return {buffer:proposal.buffer,proposal,validation:{...validation,output_plane_accepted:true},calls,status:'accepted'};
}
