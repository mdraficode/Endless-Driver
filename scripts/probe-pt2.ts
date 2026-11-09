import { createWorldPlan } from '../src/world/world-plan';
import { buildRoadLayout } from '../src/world/road-layout';
import { createWorldTerrainSampler } from '../src/world/world-terrain';
import { createTerrainSampler } from '../src/world/terrain-height';
import { homeCityAnchor } from '../src/world/city-content';
import { terrainConfigForTier } from '../src/config/terrain';

const [seedStr, xStr, zStr, idStr] = process.argv.slice(2, 6);
const seed = Number(seedStr);
const X = Number(xStr),
  Z = Number(zStr);
const plan = createWorldPlan(seed);
const layout = buildRoadLayout(plan);
const anchor = homeCityAnchor(plan);
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
const natural = createTerrainSampler({
  ...terrainConfig,
  elevationFadeCenter: [anchor.x, anchor.z],
});

console.log('MARK0');
const e = net.edges.find((x) => x.id === idStr);
let best: { x: number; z: number; y: number } | null = null;
if (e) {
  let bd = Infinity;
  for (const p of e.points) {
    const d = Math.hypot(p.x - X, p.z - Z);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
}
console.log('MARK1');
console.log(
  'edge point:',
  best && `${best.x.toFixed(1)},${best.z.toFixed(1)} y=${best.y.toFixed(2)}`,
);
const px = best ? best.x : X,
  pz = best ? best.z : Z;
console.log(
  'heightAt:',
  sampler.heightAt(px, pz).toFixed(3),
  ' natural:',
  natural.heightAt(px, pz).toFixed(3),
);
const all = net.sampleAll(px, pz).sort((a, b) => a.distance - b.distance);
for (const c of all.slice(0, 4))
  console.log(
    '  cand:',
    c.edgeId,
    c.roadClass,
    'd',
    c.distance.toFixed(2),
    'elev',
    c.elevation.toFixed(2),
    'hw',
    c.halfWidthMeters,
  );
for (const g of net.garages) {
  const d = Math.hypot(g.x - px, g.z - pz);
  if (d < 300)
    console.log(
      '  garage:',
      g.id,
      `@(${g.x.toFixed(0)},${g.z.toFixed(0)}) d=${d.toFixed(0)}`,
      'pit',
      `@(${g.pit.x.toFixed(0)},${g.pit.z.toFixed(0)})`,
      'floorY',
      g.pit.floorY.toFixed(2),
      'hw',
      g.pit.halfWidth,
      'hd',
      g.pit.halfDepth,
    );
}
