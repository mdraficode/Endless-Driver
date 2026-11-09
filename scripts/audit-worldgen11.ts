/**
 * Phase 11 acceptance audit.
 *
 * usage: npx tsx scripts/audit-worldgen11.ts <seed1> [seed2 ...]
 *
 * Metrics (generated regions only - the hand-authored Aohara kit is out of scope):
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
import { createWorldPlan, terrainSeedFor } from '../src/world/world-plan';
import { buildRoadLayout } from '../src/world/road-layout';
import { createWorldTerrainSampler } from '../src/world/world-terrain';
import { createTerrainSampler } from '../src/world/terrain-height';
import { homeCityAnchor } from '../src/world/city-content';
import { terrainConfigForTier } from '../src/config/terrain';
import type { RoadNetwork } from '../src/world/road-network';

const seeds = process.argv.slice(2);
if (seeds.length === 0) {
  console.error('usage: npx tsx scripts/audit-worldgen11.ts <seed1> [seed2 ...]');
  process.exit(1);
}

const key = (x: number, z: number): string =>
  `${Math.round(x * 10) / 10}:${Math.round(z * 10) / 10}`;

for (const seedArg of seeds) {
  const seed = Number(seedArg);
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
  // Same world the engine builds (Application.ts): the generated home-city anchor,
  // not the hand-placed default plateau. (Omitting it audits a hybrid the game
  // never produces — Phase 11.0a: seed 2 split into 2 components there.)
  const sampler = createWorldTerrainSampler(terrainConfig, layout.config, {
    x: anchor.x,
    z: anchor.z,
    flatRadiusMeters: anchor.flatRadiusMeters,
    blendRadiusMeters: anchor.blendRadiusMeters,
  });
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
  for (const span of network.overpassSpans) {
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
  const segMinDist = (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    cx: number,
    cz: number,
    dx: number,
    dz: number,
  ): number => {
    const abx = bx - ax;
    const abz = bz - az;
    const cdx = dx - cx;
    const cdz = dz - cz;
    const denom = abx * cdx + abz * cdz;
    const t =
      Math.abs(denom) < 1e-9
        ? 0
        : Math.max(0, Math.min(1, ((cx - ax) * abx + (cz - az) * abz) / (abx * abx + abz * abz)));
    const px = ax + abx * t;
    const pz = az + abz * t;
    return Math.hypot(cx - px, cz - pz);
  };
  for (let i = 0; i < genEdges.length; i++) {
    const e1 = genEdges[i]!;
    const w1 = e1.halfWidthMeters + e1.shoulderMeters;
    for (let j = i + 1; j < genEdges.length; j++) {
      const e2 = genEdges[j]!;
      const w2 = e2.halfWidthMeters + e2.shoulderMeters;
      const limit = w1 + w2;
      let min = Infinity;
      for (let a = 0; a < e1.points.length - 1; a += 1) {
        const p0 = e1.points[a]!;
        const p1 = e1.points[a + 1]!;
        for (let b = 0; b < e2.points.length - 1; b += 1) {
          const q0 = e2.points[b]!;
          const q1 = e2.points[b + 1]!;
          const d = segMinDist(p0.x, p0.z, p1.x, p1.z, q0.x, q0.z, q1.x, q1.z);
          if (d < min) min = d;
          if (min < limit) break;
        }
        if (min < limit) break;
      }
      if (min < limit) closePairs += 1;
    }
  }

  // nearParallel: two nearly-parallel edges within 15 m (11.1d lattice check).
  let nearParallel = 0;
  for (let i = 0; i < genEdges.length; i += 1) {
    const e1 = genEdges[i]!;
    const a1 = e1.points[0]!;
    const b1 = e1.points[e1.points.length - 1]!;
    const l1 = Math.hypot(b1.x - a1.x, b1.z - a1.z);
    if (l1 < 40) continue;
    const u1x = (b1.x - a1.x) / l1;
    const u1z = (b1.z - a1.z) / l1;
    for (let j = i + 1; j < genEdges.length; j += 1) {
      const e2 = genEdges[j]!;
      const a2 = e2.points[0]!;
      const b2 = e2.points[e2.points.length - 1]!;
      const l2 = Math.hypot(b2.x - a2.x, b2.z - a2.z);
      if (l2 < 40) continue;
      const u2x = (b2.x - a2.x) / l2;
      const u2z = (b2.z - a2.z) / l2;
      if (Math.abs(u1x * u2x + u1z * u2z) < 0.985) continue; // ~11° cone
      // min distance between the two chords
      let min = Infinity;
      for (const p of e1.points) {
        for (const q of e2.points) {
          const d = Math.hypot(p.x - q.x, p.z - q.z);
          if (d < min) min = d;
        }
      }
      if (min < 15) nearParallel += 1;
    }
  }

  // Grade over: arc-length fraction above maxGrade * 1.05.
  let overLen = 0;
  let totalLen = 0;
  for (const edge of genEdges) {
    const cap = edge.maxGrade * 1.05;
    for (let i = 1; i < edge.points.length; i += 1) {
      const a = edge.points[i - 1]!;
      const b = edge.points[i]!;
      const run = Math.hypot(b.x - a.x, b.z - a.z);
      if (run < 0.5) continue;
      totalLen += run;
      if (Math.abs(b.y - a.y) / run > cap) overLen += run;
    }
  }

  // Phase 11.0a — grade-constrained routing stats: routed edge count/length, per-class
  // worst realised grade on the solved profile, and total rural length (meander budget:
  // +<=30 % vs the pre-routing chord layout).
  const routedSet = new Set(network.routedEdgeIds ?? []);
  let routedLen = 0;
  let ruralLen = 0;
  const classMaxGrade = new Map<string, { max: number; cap: number; over: number }>();
  for (const edge of genEdges) {
    let len = 0;
    for (let i = 1; i < edge.points.length; i += 1) {
      const a = edge.points[i - 1]!;
      const b = edge.points[i]!;
      const run = Math.hypot(b.x - a.x, b.z - a.z);
      len += run;
      if (run < 0.5) continue;
      const g = Math.abs(b.y - a.y) / run;
      const cls = classMaxGrade.get(edge.roadClass) ?? { max: 0, cap: edge.maxGrade, over: 0 };
      if (g > cls.max) cls.max = g;
      if (g > cls.cap) cls.over += 1;
      classMaxGrade.set(edge.roadClass, cls);
    }
    if (edge.roadClass === 'rural') ruralLen += len;
    if (routedSet.has(edge.id)) routedLen += len;
  }

  // Components over the generated nodes.
  const parent = new Map<string, string>();
  for (const n of nodes) parent.set(n.id, n.id);
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (const e of edges) {
    const ra = find(e.from);
    const rb = find(e.to);
    if (ra !== rb) parent.set(ra, rb);
  }
  const comps = new Set(nodes.map((n) => find(n.id))).size;

  const overpasses = network.overpassSpans.length;
  const bridges = network.bridgeSpans.length;
  const tunnels = network.tunnelSpans.length;

  console.log(`\nseed ${seed}  (build ${(tBuild / 1000).toFixed(2)} s)`);
  console.log(`  components:     ${comps} ${comps === 1 ? '✓' : '✗'}`);
  console.log(`  garages:        ${network.garages.length}`);
  console.log(
    `  kinks:          ${kinkCount} (worst ${worstKink.toFixed(1)}°) ${kinkCount === 0 ? '✓' : '✗'}`,
  );
  console.log(`  D1 embankment:  ${d1.toFixed(3)} m   ${d1At}`);
  console.log(`  D2 ramp slot:   ${d2.toFixed(3)} m   ${d2At}`);
  console.log(`  D3 centre gap:  ${d3.toFixed(3)} m   ${d3At}`);
  console.log(`  countryFill:    ${countryFill.toFixed(3)} m   ${countryFillAt}`);
  console.log(`  inSpan:         ${inSpan.toFixed(3)} m`);
  console.log(`  closePairs:     ${closePairs} ${closePairs === 0 ? '✓' : '✗'}`);
  console.log(`  nearParallel:   ${nearParallel} ${nearParallel === 0 ? '✓' : '✗'}`);
  console.log(
    `  grade over:     ${totalLen > 0 ? ((overLen / totalLen) * 100).toFixed(2) : '0.00'}%`,
  );
  console.log(
    `  spans:          tunnels ${tunnels} | overpasses ${overpasses} | bridges ${bridges}`,
  );
  console.log(`  edges:          ${edges.length} (generated ${genEdges.length})`);
  const gradeLine = [...classMaxGrade.entries()]
    .filter(
      ([cls]) =>
        cls === 'rural' || cls === 'highway' || cls === 'urban-arterial' || cls === 'city-access',
    )
    .map(
      ([cls, v]) =>
        `${cls} ${v.max.toFixed(3)}/${v.cap.toFixed(2)}${v.over > 0 ? ` OVER:${v.over}` : ''}`,
    )
    .join('  ');
  console.log(
    `  routed:         ${(network.routedEdgeIds ?? []).length} edges, ${(routedLen / 1000).toFixed(2)} km`,
  );
  console.log(`  rural length:   ${(ruralLen / 1000).toFixed(2)} km`);
  console.log(`  max grade:      ${gradeLine || 'n/a'}`);
}
