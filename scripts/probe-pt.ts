import { createWorldPlan } from '../src/world/world-plan';
import { buildRoadLayout } from '../src/world/road-layout';
import { createWorldTerrainSampler } from '../src/world/world-terrain';
import { createTerrainSampler } from '../src/world/terrain-height';
import { homeCityAnchor } from '../src/world/city-content';
import { terrainConfigForTier } from '../src/config/terrain';

const [seedStr, xStr, zStr] = process.argv.slice(2, 5);
const seed = Number(seedStr);
const X = Number(xStr), Z = Number(zStr);
const plan = createWorldPlan(seed);
const layout = buildRoadLayout(plan);
const anchor = homeCityAnchor(plan);
const terrainConfig = {
  ...terrainConfigForTier('C', 0),
  volcano: { position: [plan.volcano.x, plan.volcano.z] as [number, number], heightMeters: plan.volcano.heightMeters, radiusMeters: plan.volcano.radiusMeters },
};
const sampler = createWorldTerrainSampler(terrainConfig, layout.config);
const net = sampler.roadNetwork;
const natural = createTerrainSampler({ ...terrainConfig, elevationFadeCenter: [anchor.x, anchor.z] });

console.log(`point (${X},${Z}) seed ${seed}`);
console.log('  heightAt   :', sampler.heightAt(X, Z).toFixed(3));
console.log('  natural    :', natural.heightAt(X, Z).toFixed(3));
const s = net.sample(X, Z);
console.log('  sample     :', s && { d: s.distance.toFixed(2), elev: s.elevation.toFixed(3), edge: s.edgeId, cls: s.roadClass, hw: s.halfWidthMeters });
const all = net.sampleAll(X, Z).sort((a,b)=>b.elevation-a.elevation);
for (const c of all.slice(0, 6)) console.log('  cand:', c.edgeId, c.roadClass, 'd', c.distance.toFixed(2), 'elev', c.elevation.toFixed(3), 'hw', c.halfWidthMeters, 'sh', c.shoulderMeters, 'bridge', c.onBridge);
for (const g of net.garages) {
  const d = Math.hypot(g.x - X, g.z - Z);
  if (d < 250) console.log('  garage near:', g.id, `@(${g.x.toFixed(0)},${g.z.toFixed(0)})`, `d=${d.toFixed(0)}`, 'pit floor', g.pit.floorY.toFixed(2));
}
