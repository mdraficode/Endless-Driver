import { createWorldPlan } from '../src/world/world-plan';
import { buildRoadLayout } from '../src/world/road-layout';
import { createWorldTerrainSampler } from '../src/world/world-terrain';
import { roadInfluence } from '../src/world/road-network';
import { terrainConfigForTier } from '../src/config/terrain';

const plan = createWorldPlan(20261013);
const layout = buildRoadLayout(plan);
const terrainConfig = {
  ...terrainConfigForTier('C', 0),
  volcano: {
    position: [plan.volcano.x, plan.volcano.z] as [number, number],
    heightMeters: plan.volcano.heightMeters,
    radiusMeters: plan.volcano.radiusMeters,
  },
};
const sampler = createWorldTerrainSampler(terrainConfig, layout.config);
const net = sampler.roadNetwork;
const cfg = net.config;

const e = net.edges.find((x) => x.id === 'i-2--1->i-1-0')!;
// the point the audit reported: nearest profile point to (-5045,-907)
let best = e.points[0]!,
  bd = Infinity;
for (const p of e.points) {
  const d = Math.hypot(p.x + 5045, p.z + 907);
  if (d < bd) {
    bd = d;
    best = p;
  }
}
console.log(
  'profile point:',
  best.x.toFixed(3),
  best.z.toFixed(3),
  'y',
  best.y.toFixed(3),
  `(audit dist ${bd.toFixed(2)})`,
);
const all = net.sampleAll(best.x, best.z).sort((a, b) => b.elevation - a.elevation);
console.log('sampleAll at exact profile point:');
for (const c of all.slice(0, 8))
  console.log('  d', c.distance.toFixed(2), 'elev', c.elevation.toFixed(3), c.edgeId, c.roadClass);
const prim = net.sampleAll(best.x, best.z).sort((a, b) => a.distance - b.distance)[0]!;
const w = roadInfluence(cfg, prim.distance, prim.halfWidthMeters, prim.shoulderMeters);
console.log('primary d', prim.distance.toFixed(3), 'influence', w.toFixed(4));
console.log('heightAt at exact point:', sampler.heightAt(best.x, best.z).toFixed(3));
console.log('heightAt at (−5045,−907):', sampler.heightAt(-5045, -907).toFixed(3));
