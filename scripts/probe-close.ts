import { createWorldPlan } from '../src/world/world-plan';
import { buildRoadLayout } from '../src/world/road-layout';
import { createWorldTerrainSampler } from '../src/world/world-terrain';
import { terrainConfigForTier } from '../src/config/terrain';

const seed = 777;
const plan = createWorldPlan(seed);
const layout = buildRoadLayout(plan);
const terrainConfig = {
  ...terrainConfigForTier('C', plan.seed !== undefined ? 0 : 0),
  volcano: { position: [plan.volcano.x, plan.volcano.z] as [number, number], heightMeters: plan.volcano.heightMeters, radiusMeters: plan.volcano.radiusMeters },
};
const sampler = createWorldTerrainSampler(terrainConfig, layout.config);
const net = sampler.roadNetwork;
const edges = [...net.edges];

function interior(pts: {x:number;z:number}[]): number[] {
  const n = pts.length; const cum=[0];
  for (let i=1;i<n;i++){const a=pts[i-1],b=pts[i];cum.push(cum[i-1]+Math.hypot(b.x-a.x,b.z-a.z));}
  const total=cum[n-1];
  const out:number[]=[];
  for(let i=0;i<n;i++) if(cum[i]>30 && total-cum[i]>30) out.push(i);
  return out;
}
const rep: {d:number; a:string; b:string; clsA:string; clsB:string; px:number; pz:number}[] = [];
for (let i=0;i<edges.length;i++){
  const e1=edges[i]; const ia=interior(e1.points);
  for (let j=i+1;j<edges.length;j++){
    const e2=edges[j];
    if (e1.from===e2.from||e1.from===e2.to||e1.to===e2.from||e1.to===e2.to) continue;
    const ib=interior(e2.points);
    let md=Infinity, px=0, pz=0;
    for (const a of ia){const p=e1.points[a];
      for (const b of ib){const q=e2.points[b];
        const d=Math.hypot(p.x-q.x,p.z-q.z);
        if(d<md){md=d;px=p.x;pz=p.z;}
      }}
    if (md>0.01 && md < e1.halfWidthMeters+e2.halfWidthMeters) rep.push({d:md,a:e1.id,b:e2.id,clsA:e1.roadClass,clsB:e2.roadClass,px,pz});
  }
}
rep.sort((x,y)=>x.d-y.d);
for (const r of rep.slice(0,15)) console.log(r.d.toFixed(2), r.clsA.padEnd(14), r.clsB.padEnd(14), r.a, '||', r.b, `@(${r.px.toFixed(0)},${r.pz.toFixed(0)})`);
console.log('total', rep.length);
