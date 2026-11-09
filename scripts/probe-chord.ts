import { createWorldPlan } from '../src/world/world-plan';
import { buildRoadLayout } from '../src/world/road-layout';
import { createWorldTerrainSampler } from '../src/world/world-terrain';
import { terrainConfigForTier } from '../src/config/terrain';

const plan = createWorldPlan(777);
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

const e = net.edges.find((x) => x.id === 'g1-1-2-2->i0-0');
const f = net.edges.find((x) => x.id === 'sp1-1-v0-0-1->sp1-1-v0-1-1');
console.log('chord edge:', e?.id, 'hw', e?.halfWidthMeters, 'pts', e?.points.length);
if (e)
  for (const p of e.points) console.log('  ', p.x.toFixed(1), p.z.toFixed(1), 'y', p.y.toFixed(2));
console.log('street edge:', f?.id, 'hw', f?.halfWidthMeters, 'pts', f?.points.length);
if (f)
  for (const p of f.points) console.log('  ', p.x.toFixed(1), p.z.toFixed(1), 'y', p.y.toFixed(2));
// nodes near the crossing @(3015,2979)
for (const n of net.nodes) {
  const d = Math.hypot(n.x - 3015, n.z - 2979);
  if (d < 60)
    console.log(
      'node',
      n.id,
      n.x.toFixed(1),
      n.z.toFixed(1),
      'y',
      n.y.toFixed(2),
      `d=${d.toFixed(1)}`,
    );
}
