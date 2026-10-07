// Run: npm i --no-save @mapbox/vector-tile@1 pbf@3 && node scripts/build-place-index.mjs
// Writes places-in.json; copy it to public/data/. Re-run to refresh the list.
// Builds an instant-search place list from OpenFreeMap vector tiles (OpenStreetMap data):
// India cities/towns (z7), Telangana towns+villages (z10), Hyderabad neighbourhoods + landmarks (z14).
import { VectorTile } from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import fs from 'node:fs';
const TPL = 'https://tiles.openfreemap.org/planet/20261004_113936_pt/{z}/{x}/{y}.pbf';
const lon2x=(lon,z)=>Math.floor((lon+180)/360*2**z), lat2y=(lat,z)=>Math.floor((1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2*2**z);
const jobs=[]; const add=(z,s,w,n,e,layers)=>{for(let x=lon2x(w,z);x<=lon2x(e,z);x++)for(let y=lat2y(n,z);y<=lat2y(s,z);y++)jobs.push({z,x,y,layers});};
add(7, 6.5,68,35.5,97.5,['place']);
add(10, 15.8,77.2,19.95,81.4,['place']);
add(14, 17.20,78.15,17.70,78.80,['place','poi','aerodrome_label']);
console.log('tiles', jobs.length);
const POI_CLASSES=new Set(['college','school','shop','railway','bus','park','attraction','cinema','hospital','stadium','sports','place_of_worship','town_hall','library','museum','zoo','theatre','lodging','entertainment','fast_food','restaurant','cafe','bar','ice_cream','grocery','clothing_store']);
const MALL_SUB=new Set(['mall','department_store']);
const out=new Map(); let done=0, bytes=0;
async function run(j){ const url=TPL.replace('{z}',j.z).replace('{x}',j.x).replace('{y}',j.y);
  for(let a=0;a<3;a++){ try{ const r=await fetch(url,{headers:{'User-Agent':'Halfway place-list builder (+https://halfway-liard.vercel.app)'}}); if(r.status===204||r.status===404) return; const buf=Buffer.from(await r.arrayBuffer()); bytes+=buf.length;
    const t=new VectorTile(new Protobuf(buf));
    for(const L of j.layers){ const layer=t.layers[L]; if(!layer) continue;
      for(let i=0;i<layer.length;i++){ const f=layer.feature(i); const p=f.properties; const name=p['name:en']||p.name_en||p['name:latin']||p.name; if(!name) continue;
        let kind;
        if(L==='place') kind=p.class; else if(L==='aerodrome_label') kind='airport';
        else { if(p.class==='shop' && !MALL_SUB.has(p.subclass)) continue; if(!POI_CLASSES.has(p.class)) continue;
          if(['fast_food','restaurant','cafe','bar','ice_cream','grocery','clothing_store','school','place_of_worship','lodging'].includes(p.class) && (p.rank||99)>20) continue;
          kind = p.class==='shop'?'mall':p.class==='railway'?(p.subclass==='subway'||/metro/i.test(name)?'metro':'station'):p.class; }
        if(['isolated_dwelling','continent','country','state','province','island'].includes(kind)) continue;
        const g=f.toGeoJSON(j.x,j.y,j.z).geometry; if(g.type!=='Point') continue; const [lng,lat]=g.coordinates;
        const key=name.toLowerCase()+'|'+lat.toFixed(2)+'|'+lng.toFixed(2); if(out.has(key)) continue;
        out.set(key,[name,+lat.toFixed(5),+lng.toFixed(5),kind]); } }
    return; }catch(e){ await new Promise(r=>setTimeout(r,1000)); } } }
let idx=0; await Promise.all(Array.from({length:8},async()=>{while(idx<jobs.length){const j=jobs[idx++];await run(j);if(++done%200===0)console.log(done,'/',jobs.length,(bytes/1e6).toFixed(0)+'MB',out.size,'names');}}));
const rows=[...out.values()];
const kinds={}; rows.forEach(r=>kinds[r[3]]=(kinds[r[3]]||0)+1);
console.log('total',rows.length, JSON.stringify(kinds));
fs.writeFileSync('places-in.json', JSON.stringify(rows));
for (const q of ['nizampet','madhapur','kphb','kukatpally','hitec','inorbit','jntu','miyapur metro','vijayawada','bengaluru']) console.log(q, JSON.stringify(rows.filter(r=>r[0].toLowerCase().startsWith(q)).slice(0,3)));
