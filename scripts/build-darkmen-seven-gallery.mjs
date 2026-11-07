import {readFileSync,writeFileSync} from 'node:fs';
import sharp from 'sharp';
const dir='outputs/darkmen-marketing-seven/';
const m=JSON.parse(readFileSync(dir+'manifest.json'));
const entries=m.variants.filter(v=>v.status==='succeeded');
if(entries.length!==7)throw Error('Expected seven finished outputs');
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const labels=['<rect width="1200" height="2720" fill="#15171B"/>','<text x="24" y="37" fill="#F4ECDD" font-size="25" font-weight="bold">DARKMEN / ENTERPRISE — SEVEN NEW COLORWAYS</text>'];
const layers=[];
for(let i=0;i<entries.length;i++){
 const v=entries[i],x=(i%2)*600,y=65+Math.floor(i/2)*655;
 const meta=await sharp(dir+v.key+'.png').metadata();if(meta.width!==1024||meta.height!==1024)throw Error('Unexpected output size');
 labels.push('<text x="'+(x+20)+'" y="'+(y+25)+'" fill="#F4ECDD" font-size="19">'+(i+1)+'. '+esc(v.title)+'</text>');
 layers.push({input:await sharp(dir+v.key+'.png').resize(580,580).png().toBuffer(),left:x+10,top:y+45});
}
labels.push('<text x="650" y="2180" fill="#F4ECDD" font-size="28">DARKMEN</text><text x="650" y="2215" fill="#BEB7AC" font-size="18">ENTERPRISE</text><text x="650" y="2280" fill="#BEB7AC" font-size="17">7 lettering and color combinations</text><text x="650" y="2310" fill="#BEB7AC" font-size="17">Generated in Syncraft Logo Studio</text>');
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="2720"><g font-family="Arial,sans-serif">'+labels.join('')+'</g></svg>');
await sharp(svg).composite(layers).png().toFile(dir+'preview.png');
const cards=entries.map((v,i)=>'<section><h2>'+String(i+1).padStart(2,'0')+' / '+esc(v.title)+'</h2><img src="data:image/png;base64,'+readFileSync(dir+v.key+'.png').toString('base64')+'" alt="DARKMEN ENTERPRISE '+esc(v.title)+'"><p>'+esc([v.settings.streetwearLetters,v.settings.streetwearLayout,v.settings.streetwearOutline,v.settings.streetwearDepth].join(' · '))+'</p><div>'+['primaryColor','secondaryColor','outlineColor','backgroundColor'].map(k=>'<span class="swatch" style="background:'+v.settings[k]+'" title="'+k+': '+v.settings[k]+'"></span>').join('')+'</div><p><a href="'+v.studioUrl+'">Open saved Logo Studio project</a> · <a href="'+v.key+'.png" download>Download PNG</a></p></section>').join('');
writeFileSync(dir+'gallery.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>DARKMEN — Seven Colorways</title><style>*{box-sizing:border-box}body{margin:0;background:#15171b;color:#f4ecdd;font:16px/1.5 system-ui}main{max-width:1160px;padding:40px 20px;margin:auto}h1{font-size:48px;line-height:1.1;letter-spacing:-.04em}header p{color:#beb7ac}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}section{background:#202329;border:1px solid #363a42;border-radius:16px;padding:18px}h2{font-size:19px}img{width:100%;height:auto;border-radius:8px}a{color:#c4dfdf}.swatch{display:inline-block;width:28px;height:28px;border-radius:50%;border:1px solid #999;margin-right:8px}@media(max-width:650px){.grid{grid-template-columns:1fr}h1{font-size:38px}}</style><main><header><p>SYNCraft / LOGO STUDIO / MARKETING COLLECTION</p><h1>DARKMEN<br>ENTERPRISE</h1><p>Seven new palettes and lettering combinations. Each design is saved in its own Logo Studio project. Original PNGs are included.</p></header><div class="grid">'+cards+'</div></main></html>');
writeFileSync(dir+'settings.json',JSON.stringify(entries.map(v=>({name:v.title,brand:'DARKMEN',tagline:'ENTERPRISE',settings:v.settings,studioUrl:v.studioUrl})),null,2));
console.log('Saved preview, gallery and settings for seven verified PNG outputs.');
