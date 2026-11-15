// 11.0c measurement: per-seed count band + NN distance CV (global and
// local-density-stratified), new (Bridson slot mesh) vs baseline (stratified jitter).
import { terrainConfigForTier } from '../src/config/terrain';
import { ROAD_NETWORK_CONFIG } from '../src/config/roads';
import { createWorldTerrainSampler } from '../src/world/world-terrain';
import {
  generateChunkVegetation,
  generateChunkVegetationStratified,
  type VegetationPlacement,
} from '../src/world/vegetation-placement';

const WINDOW: Array<[number, number]> = [];
for (let cz = -9; cz <= -7; cz += 1) for (let cx = -5; cx <= -3; cx += 1) WINDOW.push([cx, cz]);

function nnDistances(pts: VegetationPlacement[]): number[] {
  const n = pts.length;
  const nn: number[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    let best = Infinity;
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      const d = Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.z - pts[j]!.z);
      if (d < best) best = d;
    }
    nn[i] = best;
  }
  return nn;
}

function cv(values: number[]): { mean: number; cv: number } {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const varr = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return { mean, cv: Math.sqrt(varr) / mean };
}

/**
 * Local-density-stratified NN CV: stratify each plant by how many neighbours
 * stand within `radius` of it (quartile buckets: sparse / mid / dense) and
 * average the per-bucket NN CVs. This removes the shared inhomogeneity of the
 * density field (identical for both algorithms — same noise, same cells) so
 * the comparison isolates the scatter's own evenness.
 */
function stratifiedCv(pts: VegetationPlacement[], radius = 20): number {
  const n = pts.length;
  if (n < 60) return Number.NaN;
  const local = new Array<number>(n);
  const r2 = radius * radius;
  for (let i = 0; i < n; i += 1) {
    let c = 0;
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      const dx = pts[i]!.x - pts[j]!.x;
      const dz = pts[i]!.z - pts[j]!.z;
      if (dx * dx + dz * dz < r2) c += 1;
    }
    local[i] = c;
  }
  const sorted = [...local].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(n * 0.25)] ?? 0;
  const q3 = sorted[Math.floor(n * 0.75)] ?? 0;
  const bucketOf = (c: number) => (c < q1 ? 0 : c > q3 ? 2 : 1);
  const nn = nnDistances(pts);
  const buckets: number[][] = [[], [], []];
  for (let i = 0; i < n; i += 1) buckets[bucketOf(local[i]!)]!.push(nn[i]!);
  const cvs = buckets.filter((b) => b.length >= 20).map((b) => cv(b).cv);
  return cvs.length > 0 ? cvs.reduce((a, b) => a + b, 0) / cvs.length : Number.NaN;
}

let gCountMin = Infinity,
  gCountMax = -Infinity;
let gCvMin = Infinity,
  gCvMax = -Infinity,
  gStratMin = Infinity,
  gStratMax = -Infinity;

for (const seed of [20260001, 20260002, 20260003, 20260004, 20260005]) {
  const sampler = createWorldTerrainSampler(terrainConfigForTier('C', seed), ROAD_NETWORK_CONFIG);
  const t0 = performance.now();
  const a: VegetationPlacement[] = [];
  const b: VegetationPlacement[] = [];
  for (const [cx, cz] of WINDOW) {
    a.push(...generateChunkVegetation(sampler, cx, cz));
    b.push(...generateChunkVegetationStratified(sampler, cx, cz));
  }
  const ms = performance.now() - t0;
  const sa = cv(nnDistances(a));
  const sb = cv(nnDistances(b));
  const ca = stratifiedCv(a);
  const cb = stratifiedCv(b);
  const countRatio = a.length / Math.max(1, b.length);
  const cvRatio = sa.cv / sb.cv;
  const stratRatio = ca / cb;
  gCountMin = Math.min(gCountMin, countRatio);
  gCountMax = Math.max(gCountMax, countRatio);
  gCvMin = Math.min(gCvMin, cvRatio);
  gCvMax = Math.max(gCvMax, cvRatio);
  gStratMin = Math.min(gStratMin, stratRatio);
  gStratMax = Math.max(gStratMax, stratRatio);
  console.log(
    `seed ${seed}: new=${a.length} baseline=${b.length} ratio=${countRatio.toFixed(3)} | ` +
      `CV new=${sa.cv.toFixed(3)} baseline=${sb.cv.toFixed(3)} ratio=${cvRatio.toFixed(3)} | ` +
      `stratCV new=${ca.toFixed(3)} baseline=${cb.toFixed(3)} ratio=${stratRatio.toFixed(3)} | ` +
      `meanNN new=${sa.mean.toFixed(1)} baseline=${sb.mean.toFixed(1)} | ${ms.toFixed(0)}ms (9 chunks)`,
  );
}
console.log(
  `\n5-seed ranges: count [${gCountMin.toFixed(3)}, ${gCountMax.toFixed(3)}] (band 0.80-1.20) | ` +
    `globalCV ratio [${gCvMin.toFixed(3)}, ${gCvMax.toFixed(3)}] | ` +
    `stratCV ratio [${gStratMin.toFixed(3)}, ${gStratMax.toFixed(3)}] (spec <0.35)`,
);
