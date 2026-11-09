import { createWorldPlan } from '../src/world/world-plan';
import { buildRoadLayout } from '../src/world/road-layout';
import { createWorldTerrainSampler } from '../src/world/world-terrain';
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

const e = net.edges.find((x) => x.id === 'aohara-boulevard-east->aohara-south-center');
if (!e) {
  console.log('edge not found');
  process.exit(0);
}
// find the point nearest (-591,422)
let best = e.points[0],
  bd = Infinity;
for (const p of e.points) {
  const d = Math.hypot(p.x + 591, p.z - 422);
  if (d < bd) {
    bd = d;
    best = p;
  }
}
console.log('edge point:', best.x.toFixed(1), best.z.toFixed(1), 'y', best.y.toFixed(3));
console.log('heightAt:', sampler.heightAt(best.x, best.z).toFixed(3));
const s = net.sample(best.x, best.z);
console.log(
  'sample:',
  s && {
    d: s.distance.toFixed(3),
    elev: s.elevation.toFixed(3),
    edge: s.edgeId,
    cls: s.roadClass,
    hw: s.halfWidthMeters,
    onBridge: s.onBridge,
  },
);
const all = net.sampleAll(best.x, best.z);
for (const c of all)
  console.log(
    '  cand:',
    c.edgeId,
    c.roadClass,
    'd',
    c.distance.toFixed(2),
    'elev',
    c.elevation.toFixed(3),
    'hw',
    c.halfWidthMeters,
    'bridge',
    c.onBridge,
  );
