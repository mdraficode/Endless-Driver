/**
 * scripts/audit-worldgen11.ts — Phase 11 worldgen audit (geometry integrity + terrain follow).
 *
 *   npx tsx scripts/audit-worldgen11.ts [seed1 seed2 ...]
 *
 * Runs the full world build headlessly and reports the Phase 11 metrics:
 *   components — network connectivity (must be 1)
 *   garages    — planned underground garages (Phase 10.4)
 *   kinks      — interior direction reversals > 60° (11.1d; must be 0)
 *   D1         — worst embankment: solved road y above the CARVED ground (spans excluded)
 *   D2         — worst cut: carved ground below solved road y (spans excluded)
 *   D3         — worst |carved ground − road y| at the ribbon centre (spans excluded):
 *                the carve is a union, so at a road's centre the ground must equal
 *                max(natural, road y) — any gap is a missing ribbon
 *   countryFill — worst road y above NATURAL ground on non-span points (embankment material)
 *   inSpan     — worst span height: bridge deck above base, or tunnel base above floor
 *   closePairs — two edges from different nodes closer than their combined widths (11.1b)
 *   nearParallel — two nearly-parallel edges within 15 m (11.1d lattice check)
 *   grade over — arc-length fraction above maxGrade*1.05 (must be ~0)
 *   spans      — tunnel / overpass / bridge counts
 */
import { createWorldPlan } from '../src/world/world-plan';
import { buildRoadLayout } from '../src/world/road-layout';
import { createWorldTerrainSampler } from '../src/world/world-terrain';
import { createTerrainSampler } from '../src/world/terrain-height';
import { homeCityAnchor } from '../src/world/city-content';
import { terrainSeedFor } from '../src/world/world-plan';
import { terrainConfigForTier } from '../src/config/terrain';
import type { RoadNetwork } from '../src/world/road-network';

const seeds = process.argv.slice(2);
if (seeds.length === 0) {
  console.error('usage: npx tsx scripts/audit-worldgen11.ts <seed1> [seed2 ...]');
  process.exit(1);
}


/** Interior sample indices: > 30 m from both endpoints (junction-zone pairs are normal
 * geometry — a T-junction's end street legitimately terminates inside the corridor of the
 * street it meets — so the separation checks only test the open stretches). */
function interiorIndices(pts: readonly { x: number; z: number }[]): number[] {
  const n = pts.length;
  const cum: number[] = [0];
  for (let i = 1; i < n; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    cum.push(cum[i - 1]! + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const total = cum[n - 1]!;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (cum[i]! > 30 && total - cum[i]! > 30) out.push(i);
  }
  return out;
}

const key = (x: number, z: number): string => `${Math.round(x * 10)}:${Math.round(z * 10)}`;

for (const seed of seeds) {
  const t0 = performance.now();
  const plan = createWorldPlan(seed);
  const anchor = homeCityAnchor(plan);
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
  const network: RoadNetwork = sampler.roadNetwork;
  const tBuild = performance.now() - t0;

  // Natural ground (carve-free) for the embankment-material measurement.
  const natural = createTerrainSampler({
    ...terrainConfig,
    elevationFadeCenter: [anchor.x, anchor.z],
  });

  const edges = [...network.edges];
  const nodes = [...network.nodes];
  // The hand-authored Aohara kit is the baseline (its own geometry — incl. grade-
  // separated streets over nodes — is out of Phase 11 scope): metrics are scoped to
  // the generated regions.
  const genEdges = edges.filter((e) => !e.id.startsWith('aohara-'));

  // Span-covered stations (bridge decks / tunnel floors): excluded from D1-D3.
  const spanStations = new Set<string>();
  let inSpan = 0;
  for (const span of network.bridgeSpans) {
    for (const p of span.points) {
      spanStations.add(key(p.x, p.z));
      if (p.y - p.baseY > inSpan) inSpan = p.y - p.baseY;
    }
  }
  for (const span of network.tunnelSpans) {
    for (const p of span.points) {
      spanStations.add(key(p.x, p.z));
      if (p.baseY - p.y > inSpan) inSpan = p.baseY - p.y;
    }
  }

  // Kinks: interior direction reversal > 60°.
  let kinkCount = 0;
  let worstKink = 0;
  for (const edge of genEdges) {
    const pts = edge.points;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const c = pts[i + 1]!;
      const v1x = b.x - a.x;
      const v1z = b.z - a.z;
      const v2x = c.x - b.x;
      const v2z = c.z - b.z;
      const len1 = Math.hypot(v1x, v1z);
      const len2 = Math.hypot(v2x, v2z);
      if (len1 < 1 || len2 < 1) continue;
      const dot = (v1x * v2x + v1z * v2z) / (len1 * len2);
      const angleDeg = (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
      if (angleDeg > 60) {
        kinkCount += 1;
        if (angleDeg > worstKink) worstKink = angleDeg;
      }
    }
  }

  // D1/D2/D3/countryFill over all non-span profile stations.
  let d1 = 0;
  let d1At = '';
  let d2 = 0;
  let d2At = '';
  let d3 = 0;
  let d3At = '';
  let countryFill = 0;
  let countryFillAt = '';
  for (const edge of genEdges) {
    const pts = edge.points;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      const spanned = spanStations.has(key(p.x, p.z));
      const g = sampler.heightAt(p.x, p.z);
      const nat = natural.heightAt(p.x, p.z);
      const overNatural = p.y - nat;
      if (!spanned && overNatural > countryFill) {
        countryFill = overNatural;
        countryFillAt = `${edge.id} @(${p.x.toFixed(0)},${p.z.toFixed(0)})`;
      }
      if (spanned) continue;
      const emb = p.y - g;
      if (emb > d1) {
        d1 = emb;
        d1At = `${edge.id} @(${p.x.toFixed(0)},${p.z.toFixed(0)})`;
      }
      const cut = g - p.y;
      if (cut > d2) {
        d2 = cut;
        d2At = `${edge.id} @(${p.x.toFixed(0)},${p.z.toFixed(0)})`;
      }
      if (Math.abs(emb) > d3) {
        d3 = Math.abs(emb);
        d3At = `${edge.id} @(${p.x.toFixed(0)},${p.z.toFixed(0)})`;
      }
    }
  }

  // closePairs: two edges from different nodes, closer than combined widths (11.1b).
  let closePairs = 0;
  for (let i = 0; i < edges.length; i++) {
    const e1 = edges[i]!;
    for (let j = i + 1; j < edges.length; j++) {
      const e2 = edges[j]!;
      if (
        e1.from === e2.from ||
        e1.from === e2.to ||
        e1.to === e2.from ||
        e1.to === e2.to
      ) {
        continue;
      }
      const ia = interiorIndices(e1.points);
      const ib = interiorIndices(e2.points);
      let minDist = Infinity;
      for (const a of ia) {
        const p = e1.points[a]!;
        for (const b of ib) {
          const q = e2.points[b]!;
          const d = Math.hypot(p.x - q.x, p.z - q.z);
          if (d < minDist) minDist = d;
        }
      }
      if (minDist > 0.01 && minDist < e1.halfWidthMeters + e2.halfWidthMeters) closePairs += 1;
    }
  }

  // nearParallel: two edges with aligned directions within 15 m (11.1d lattice check).
  let nearParallel = 0;
  for (let i = 0; i < genEdges.length; i++) {
    const e1 = genEdges[i]!;
    const p1a = e1.points[0]!;
    const p1b = e1.points[e1.points.length - 1]!;
    const d1x = p1b.x - p1a.x;
    const d1z = p1b.z - p1a.z;
    const l1 = Math.hypot(d1x, d1z);
    if (l1 < 30) continue;
    for (let j = i + 1; j < genEdges.length; j++) {
      const e2 = genEdges[j]!;
      if (
        e1.from === e2.from ||
        e1.from === e2.to ||
        e1.to === e2.from ||
        e1.to === e2.to
      ) {
        continue;
      }
      const p2a = e2.points[0]!;
      const p2b = e2.points[e2.points.length - 1]!;
      const d2x = p2b.x - p2a.x;
      const d2z = p2b.z - p2a.z;
      const l2 = Math.hypot(d2x, d2z);
      if (l2 < 30) continue;
      const dot = (d1x * d2x + d1z * d2z) / (l1 * l2);
      if (dot < 0.99 && dot > -0.99) continue;
      const ia = interiorIndices(e1.points);
      const ib = interiorIndices(e2.points);
      let minDist = Infinity;
      for (let k = 0; k < ia.length; k += 3) {
        const p = e1.points[ia[k]!]!;
        for (let k2 = 0; k2 < ib.length; k2 += 3) {
          const q = e2.points[ib[k2]!]!;
          const d = Math.hypot(p.x - q.x, p.z - q.z);
          if (d < minDist) minDist = d;
        }
      }
      if (minDist < 15) nearParallel += 1;
    }
  }

  // Grade budget.
  let overGradeLen = 0;
  let totalLen = 0;
  for (const edge of genEdges) {
    const pts = edge.points;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d < 0.01) continue;
      totalLen += d;
      if (Math.abs(b.y - a.y) / d > edge.maxGrade * 1.05) overGradeLen += d;
    }
  }
  const gradePct = totalLen > 0 ? (overGradeLen / totalLen) * 100 : 0;

  // Components.
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
    adj.get(e.to)?.push(e.from);
  }
  const visited = new Set<string>();
  let components = 0;
  for (const n of nodes) {
    if (visited.has(n.id)) continue;
    components += 1;
    const queue = [n.id];
    visited.add(n.id);
    while (queue.length > 0) {
      const cur = queue.pop()!;
      for (const next of adj.get(cur) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
  }

  const tTotal = performance.now() - t0;
  const ok = (cond: boolean): string => (cond ? '✓' : '✗');

  console.log(`\n=== Seed ${seed} ===`);
  console.log(`  build time:     ${tBuild.toFixed(0)} ms (total ${tTotal.toFixed(0)} ms)`);
  console.log(`  edges:          ${edges.length}   nodes: ${nodes.length}`);
  console.log(`  components:     ${components} ${ok(components === 1)}`);
  console.log(`  garages:        ${network.garages.length}`);
  console.log(`  kinks:          ${kinkCount} (worst ${worstKink.toFixed(1)}°) ${ok(kinkCount === 0)}`);
  console.log(`  D1 embankment:  ${d1.toFixed(3)} m   ${d1At}`);
  console.log(`  D2 cut depth:   ${d2.toFixed(3)} m   ${d2At}`);
  console.log(`  D3 centre gap:  ${d3.toFixed(3)} m   ${d3At}`);
  console.log(`  countryFill:    ${countryFill.toFixed(3)} m   ${countryFillAt}`);
  console.log(`  inSpan:         ${inSpan.toFixed(3)} m (bridge deck / tunnel base height)`);
  console.log(`  closePairs:     ${closePairs} ${ok(closePairs === 0)}`);
  console.log(`  nearParallel:   ${nearParallel} ${ok(nearParallel === 0)}`);
  console.log(`  grade over:     ${gradePct.toFixed(2)}% ${ok(gradePct < 0.5)}`);
  console.log(`  tunnels:        ${network.tunnelSpans.length}   overpasses: ${network.overpassSpans.length}   bridges: ${network.bridgeSpans.length}`);
}
