import { createWorldPlan } from '../src/world/world-plan';
import { buildRoadLayout } from '../src/world/road-layout';
import { createWorldTerrainSampler } from '../src/world/world-terrain';
import { terrainConfigForTier } from '../src/config/terrain';

for (const seed of [20261102, 4242, 777, 20261013, 424242]) {
  const plan = createWorldPlan(seed);
  const layout = buildRoadLayout(plan);
  const terrainConfig = {
    ...terrainConfigForTier('C', 0),
    volcano: { position: [plan.volcano.x, plan.volcano.z] as [number, number], heightMeters: plan.volcano.heightMeters, radiusMeters: plan.volcano.radiusMeters },
  };
  const sampler = createWorldTerrainSampler(terrainConfig, layout.config);
  const net = sampler.roadNetwork;
  const spans = net.tunnelSpans.map((s) => {
    const a = s.points[0]!; const b = s.points[s.points.length - 1]!;
    return { id: s.edgeId, depthA: a.baseY - a.y, depthB: b.baseY - b.y };
  });
  const cliffs = spans.filter((s) => s.depthA > 12 && s.depthB > 12).length;
  console.log(seed, 'tunnels', spans.length, 'cliffs>12/12', cliffs, JSON.stringify(spans.map((s) => [s.id, +s.depthA.toFixed(1), +s.depthB.toFixed(1)])));
}
