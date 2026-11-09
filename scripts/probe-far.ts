import { createWorldPlan, terrainSeedFor } from '../src/world/world-plan';
import { buildRoadLayout } from '../src/world/road-layout';
import { createWorldTerrainSampler } from '../src/world/world-terrain';
import { terrainConfigForTier } from '../src/config/terrain';

const seed = Number(process.argv[2]);
const plan = createWorldPlan(seed);
const layout = buildRoadLayout(plan);
const terrainConfig = {
  ...terrainConfigForTier('C', terrainSeedFor(seed)),
  volcano: {
    position: [plan.volcano.x, plan.volcano.z] as [number, number],
    heightMeters: plan.volcano.heightMeters,
    radiusMeters: plan.volcano.radiusMeters,
  },
};
const sampler = createWorldTerrainSampler(terrainConfig, layout.config);
const net = sampler.roadNetwork;
for (const g of net.garages) {
  console.log(
    `garage ${g.id} @(${g.x.toFixed(0)},${g.z.toFixed(0)}) floor ${g.pit.floorY.toFixed(2)} pit @(${g.pit.x.toFixed(0)},${g.pit.z.toFixed(0)}) yaw ${g.pit.yaw.toFixed(3)}`,
  );
}
const far = net.edges.filter((e) => e.id.includes('-far'));
for (const e of far) {
  console.log('FAR', e.id, e.roadClass, e.from, '->', e.to, 'pts', e.points.length);
  for (let i = 0; i < e.points.length; i += 4) {
    const p = e.points[i]!;
    const ground = sampler.heightAt(p.x, p.z);
    console.log(
      `  [${i}] (${p.x.toFixed(0)},${p.z.toFixed(0)}) y ${p.y.toFixed(2)} ground ${ground.toFixed(2)}`,
    );
  }
}
const near = net.edges.find((e) => e.id === 'g-1-1-4-0->g-1-1-5-0');
if (near) {
  console.log('NEAR', near.id, near.roadClass, near.from, '->', near.to, 'pts', near.points.length);
  for (const p of near.points)
    console.log(`  (${p.x.toFixed(1)},${p.z.toFixed(1)}) y ${p.y.toFixed(2)}`);
}
for (const n of net.nodes) {
  if (n.id.startsWith('g2-pit'))
    console.log('RIM', n.id, `(${n.x.toFixed(1)},${n.z.toFixed(1)}) y ${n.y.toFixed(2)}`);
}
const tgt = 'g-1-1-5-0';
for (const e of net.edges) {
  if (e.from === tgt || e.to === tgt)
    console.log(
      'REF',
      e.id,
      e.from,
      '->',
      e.to,
      'pts',
      e.points.length,
      'first',
      `(${e.points[0]!.x.toFixed(0)},${e.points[0]!.z.toFixed(0)})`,
      'last',
      `(${e.points[e.points.length - 1]!.x.toFixed(0)},${e.points[e.points.length - 1]!.z.toFixed(0)})`,
    );
}
