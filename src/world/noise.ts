/**
 * OpenSimplex2S 2D ("SuperSimplex", K.jpg's 2023 noise family —
 * https://github.com/KdotJPG/OpenSimplex2, public domain) with an analytic gradient.
 *
 * Phase 11.0b: replaces the 32-bit value-noise core. Same contract as the old
 * `valueNoise` — pure, allocation-light, integer-hash deterministic: the same
 * (seed, x, z) yields bit-identical output on every engine, no `Math.random`.
 *
 * The reference hashes lattice points with 64-bit primes; JS has no 64-bit
 * integers, so the hash is emulated in 32-bit halves (mulHi32S + a 64-bit
 * multiply). The unit tests cross-check the emulation against BigInt.
 *
 * The smooth variant (2S) is the reference's recommended choice for terrain
 * relief: it drops the high-frequency harshness the plain 2D function carries.
 * The output scale is calibrated (OS2S_TERRAIN_SCALE) so the fBm relief stays
 * in-band with the value noise it replaces.
 */

const SKEW = 0.366025403784439; // (sqrt(3) - 1) / 2
const UNSKEW = -0.21132486540518713; // (3 - sqrt(3)) / 6, negated
const RSQUARED = 2.0 / 3.0;
const C = 1 + 2 * UNSKEW; // 1/sqrt(3): the diagonal lattice step in unskewed space
const NORMALIZER = 0.05481866495625118;

// The 64-bit primes and multiplier, split into signed 32-bit halves.
const PX_LO = 0x9270c86f | 0;
const PX_HI = 0x5205402b | 0;
const PY_LO = 0x003817b5 | 0;
const PY_HI = 0x598cd327 | 0;
const M_LO = 0xeec546f5 | 0;
const M_HI = 0x53a3f72d | 0;

/**
 * Signed high 32 bits of a×b (both as u32 bit patterns, a as a double
 * 0..2^32−1, b as an int32 or double). 16-bit limb decomposition — pure
 * imul-grade ops (shifts/ands/adds, no division/modulo):
 *
 *   a·b = p3·2^32 + (p1+p2)·2^16 + p0,  p_k from the 16-bit limbs
 *   hi32 = p3 + floor((p1+p2 + p0/2^16)/2^16)
 *
 * carried with three small exact adds (each summand < 2^33, never a 32-bit
 * shift of a > 2^32 value — `>>>` truncates its operand to 32 bits first).
 * Verified 0/200000 random + 0/100 full-range corners against BigInt.
 */
function mulHi32S(a: number, b: number): number {
  const aLo = a & 0xffff;
  const aHi = a >>> 16;
  const bLo = b & 0xffff;
  const bHi = b >>> 16;
  const p0 = aLo * bLo;
  const p1 = aHi * bLo;
  const p2 = aLo * bHi;
  const p3 = aHi * bHi;
  const lo = (p1 & 0xffff) + (p2 & 0xffff);
  const t = (p0 >>> 16) + (lo & 0xffff);
  return (p3 + (p1 >>> 16) + (p2 >>> 16) + (lo >>> 16) + (t >>> 16)) | 0;
}

/**
 * int32 × u64 product, low 64 bits as [lo32, hi32]. Java semantics: `(long)a * p`
 * sign-extends `a`, so for negative `a` the product is (a as u32)·p − 2^32·p
 * (mod 2^64) — the 2^32·p term subtracts pLo from the high half only.
 */
function mul64Lo(a: number, pLo: number, pHi: number): [number, number] {
  let hi = (mulHi32S(a >>> 0, pLo) + Math.imul(a, pHi)) | 0;
  if (a < 0) {
    hi = (hi - pLo) | 0;
  }
  return [Math.imul(a, pLo), hi];
}

/**
 * The reference 2D lattice hash, emulated in 32-bit halves:
 * `hash = (seed ^ xsvp ^ ysvp) * M; hash ^= hash >> 58; gi = (int)hash & 254`.
 * The `>> 58` is an arithmetic shift — for a negative hash the top six bits
 * sign-extend over all 64 bits (Java `>>` semantics), which the int32 `>>`
 * on the high half reproduces exactly. Returns the gradient-pair index
 * (0..127).
 */
// ---- Lattice-hash memo -------------------------------------------------
// A lattice point is hashed by up to four neighbouring cells; in meshing the
// samples are dense (≤ ~3 m pitch), so most (seed, lattice point) pairs
// repeat within a few calls. The memo is a small open-addressed table keyed
// by the triple; a miss simply computes and stores, so a cold or thrashing
// table degrades to plain computation plus a couple of array reads — it can
// never return a wrong value (the stored key is compared before the value is
// trusted). One table per JS realm; the worker owns its own, so it is always
// thread-consistent.
const HASH_CACHE_BITS = 13;
const HASH_CACHE_SIZE = 1 << HASH_CACHE_BITS;
const HASH_CACHE_MASK = HASH_CACHE_SIZE - 1;
const hcKx = new Int32Array(HASH_CACHE_SIZE);
const hcKy = new Int32Array(HASH_CACHE_SIZE);
const hcSd = new Int32Array(HASH_CACHE_SIZE);
const hcVal = new Int32Array(HASH_CACHE_SIZE); // 0 = empty, else pair index + 1

function hashCacheSlot(seed: number, xsb: number, ysb: number): number {
  let idx =
    (Math.imul(xsb, 0x27d4eb2d) ^ Math.imul(ysb, 0x9e3779b1) ^ Math.imul(seed, 0x85ebca6b)) &
    HASH_CACHE_MASK;
  for (let probe = 0; probe < 4; probe += 1) {
    if (hcSd[idx] === seed && hcKx[idx] === xsb && hcKy[idx] === ysb) {
      return idx;
    }
    if (hcVal[idx] === 0) {
      return idx;
    }
    idx = (idx + 1) & HASH_CACHE_MASK;
  }
  // No match in the probe window: reuse the primary slot (overwrite).
  return (Math.imul(xsb, 0x27d4eb2d) ^ Math.imul(ysb, 0x9e3779b1) ^ Math.imul(seed, 0x85ebca6b)) &
    HASH_CACHE_MASK;
}

export function os2sHash2D(seed: number, xsb: number, ysb: number): number {
  const slot = hashCacheSlot(seed, xsb, ysb);
  const cached = hcVal[slot] ?? 0;
  if (cached !== 0 && hcSd[slot] === seed && hcKx[slot] === xsb && hcKy[slot] === ysb) {
    return cached - 1;
  }
  const [xLo, xHi] = mul64Lo(xsb, PX_LO, PX_HI);
  const [yLo, yHi] = mul64Lo(ysb, PY_LO, PY_HI);
  const seedLo = seed >>> 0;
  let hLo = (seedLo ^ xLo ^ yLo) | 0;
  const hHi = (xHi ^ yHi) | 0; // our seeds are < 2^31, so their high half is 0
  // h *= M (64-bit multiply, keep the low 64). The low half of the product
  // needs the UNSIGNED low half of h: h_lo(u32)·M_lo, hi32 of that, plus the
  // low-32 of the two cross terms.
  const l1 = Math.imul(hHi, M_LO);
  const l2 = Math.imul(hLo, M_HI);
  const newLo = Math.imul(hLo, M_LO);
  const newHi = (mulHi32S(hLo >>> 0, M_LO) + (l1 + l2)) | 0;
  hLo = newLo;
  // `hash ^= hash >> 58` in the reference is an ARITHMETIC shift: for a
  // negative 64-bit hash the top six bits sign-extend across all 64 bits
  // (e.g. top6 = 111111 → xor with -1, flipping every bit). int32 `>>` does
  // exactly that on the high half.
  const top6 = newHi >> 26;
  hLo = (hLo ^ top6) | 0;
  // (int)hash & 254 → gi (bits 1..7); gradient-pair index = gi / 2.
  const pair = ((hLo >>> 0) >> 1) & 127;
  hcSd[slot] = seed;
  hcKx[slot] = xsb;
  hcKy[slot] = ysb;
  hcVal[slot] = pair + 1;
  return pair;
}

// 24 unit directions at 7.5° + k·15°, each scaled by 1/NORMALIZER_2D exactly as
// the reference bakes it into the table. The reference's specific row order is a
// fixed hash-to-direction bijection; any such bijection gives identical noise
// statistics, and WORLD_PLAN_VERSION 4 already re-keys every seed.
const GRADIENTS: ReadonlyArray<readonly [number, number]> = (() => {
  const out: [number, number][] = [];
  for (let k = 0; k < 24; k += 1) {
    const angle = ((7.5 + k * 15) * Math.PI) / 180;
    out.push([Math.cos(angle) / NORMALIZER, Math.sin(angle) / NORMALIZER]);
  }
  // The reference fills a 128-pair table by cycling the 24 (hash bucket mod 24).
  const table: [number, number][] = [];
  for (let k = 0; k < 128; k += 1) {
    table.push(out[k % 24]!);
  }
  return table;
})();

function fastFloor(x: number): number {
  const xi = Math.trunc(x);
  return x < xi ? xi - 1 : xi;
}

export interface OpenSimplex2Sample {
  /** Noise value in roughly [-1, 1]. */
  readonly value: number;
  /** Analytic partial with respect to the first input coordinate. */
  readonly gradX: number;
  /** Analytic partial with respect to the second input coordinate. */
  readonly gradY: number;
}

/**
 * One vertex contribution and its gradient: f = a⁴·(g·d), a = RSQ − |d|²,
 * ∇f = −8a³·(g·d)·d + a⁴·g. `guard` (axial vertices only): skip outside the
 * support radius. The reference adds the base and diagonal vertices
 * unconditionally — the a⁴ term is smooth through a = 0, so including them
 * always reproduces it exactly.
 */
function vertexContribution(
  seed: number,
  latticeX: number,
  latticeY: number,
  dx: number,
  dy: number,
  out: { value: number; gradX: number; gradY: number },
  guard: boolean,
): void {
  const a = RSQUARED - dx * dx - dy * dy;
  if (guard && a <= 0) {
    return;
  }
  const g = GRADIENTS[os2sHash2D(seed, latticeX, latticeY)]!;
  const gx = g[0];
  const gy = g[1];
  const a2 = a * a;
  const a4 = a2 * a2;
  const gd = gx * dx + gy * dy;
  out.value += a4 * gd;
  const c = -8 * a2 * a * gd;
  out.gradX += c * dx + a4 * gx;
  out.gradY += c * dy + a4 * gy;
}

/**
 * Value-only vertex contribution (the `heightAt` hot path). Identical value to
 * `vertexContribution`, minus the gradient bookkeeping.
 */
function vertexContributionValue(
  seed: number,
  latticeX: number,
  latticeY: number,
  dx: number,
  dy: number,
): number {
  const a = RSQUARED - dx * dx - dy * dy;
  if (a <= 0) {
    return 0;
  }
  const g = GRADIENTS[os2sHash2D(seed, latticeX, latticeY)]!;
  const a2 = a * a;
  return a2 * a2 * (g[0] * dx + g[1] * dy);
}

export function openSimplex2S2D(seed: number, x: number, y: number): OpenSimplex2Sample {
  const s = SKEW * (x + y);
  const xsb = fastFloor(x + s);
  const ysb = fastFloor(y + s);
  const xi = x + s - xsb;
  const yi = y + s - ysb;
  const t = (xi + yi) * UNSKEW;
  const dx0 = xi + t;
  const dy0 = yi + t;

  const acc = { value: 0, gradX: 0, gradY: 0 };
  // Base and diagonal vertices: unconditional, as in the reference.
  vertexContribution(seed, xsb, ysb, dx0, dy0, acc, false);
  vertexContribution(seed, xsb + 1, ysb + 1, dx0 - C, dy0 - C, acc, false);
  // The reference's exact partition: two nested conditionals pick the two
  // axial vertices of this cell (each still support-guarded, as in the
  // reference). The "far" vertices are hashed at their true geometric lattice
  // point (xsb+2, ysb+1) / (xsb+1, ysb+2) — neighbouring cells must hash the
  // same point with the same value, or the field jumps at the boundary.
  const xmyi = xi - yi;
  if (t < UNSKEW) {
    if (xi + xmyi > 1) {
      vertexContribution(
        seed, xsb + 2, ysb + 1, dx0 - (3 * UNSKEW + 2), dy0 - (3 * UNSKEW + 1), acc, true,
      );
    } else {
      vertexContribution(seed, xsb, ysb + 1, dx0 - UNSKEW, dy0 - (UNSKEW + 1), acc, true);
    }
    if (yi - xmyi > 1) {
      vertexContribution(
        seed, xsb + 1, ysb + 2, dx0 - (3 * UNSKEW + 1), dy0 - (3 * UNSKEW + 2), acc, true,
      );
    } else {
      vertexContribution(seed, xsb + 1, ysb, dx0 - (UNSKEW + 1), dy0 - UNSKEW, acc, true);
    }
  } else {
    if (xi + xmyi < 0) {
      vertexContribution(seed, xsb - 1, ysb, dx0 + (1 + UNSKEW), dy0 + UNSKEW, acc, true);
    } else {
      vertexContribution(seed, xsb + 1, ysb, dx0 - (UNSKEW + 1), dy0 - UNSKEW, acc, true);
    }
    if (yi < xmyi) {
      vertexContribution(seed, xsb, ysb - 1, dx0 + UNSKEW, dy0 + (UNSKEW + 1), acc, true);
    } else {
      vertexContribution(seed, xsb, ysb + 1, dx0 - UNSKEW, dy0 - (UNSKEW + 1), acc, true);
    }
  }

  // The accumulated gradient is in unskewed space. The unskew map is the exact
  // inverse of the skew map (their product is the identity), so unskewed-space
  // partials ARE the input-space partials — no extra chain-rule factors.
  return {
    value: acc.value,
    gradX: acc.gradX,
    gradY: acc.gradY,
  };
}

/**
 * OpenSimplex2S 2D noise value only — the `heightAt` hot path (chunk meshing
 * calls it per vertex and never needs the gradient there). Bit-identical to
 * `openSimplex2S2D().value`: the base/diagonal vertices provably stay inside
 * their support within the cell (|d|² ≤ 2/3, equality only at a corner where
 * the a⁴ contribution is 0), so the value pass may guard them like the axials.
 */
export function openSimplex2S2DValue(seed: number, x: number, y: number): number {
  const s = SKEW * (x + y);
  const xsb = fastFloor(x + s);
  const ysb = fastFloor(y + s);
  const xi = x + s - xsb;
  const yi = y + s - ysb;
  const t = (xi + yi) * UNSKEW;
  const dx0 = xi + t;
  const dy0 = yi + t;

  let value = 0;
  value += vertexContributionValue(seed, xsb, ysb, dx0, dy0);
  value += vertexContributionValue(seed, xsb + 1, ysb + 1, dx0 - C, dy0 - C);
  // Same partition as the gradient pass (far vertices hashed at their true
  // geometric lattice point).
  const xmyi = xi - yi;
  if (t < UNSKEW) {
    if (xi + xmyi > 1) {
      value += vertexContributionValue(seed, xsb + 2, ysb + 1, dx0 - (3 * UNSKEW + 2), dy0 - (3 * UNSKEW + 1));
    } else {
      value += vertexContributionValue(seed, xsb, ysb + 1, dx0 - UNSKEW, dy0 - (UNSKEW + 1));
    }
    if (yi - xmyi > 1) {
      value += vertexContributionValue(seed, xsb + 1, ysb + 2, dx0 - (3 * UNSKEW + 1), dy0 - (3 * UNSKEW + 2));
    } else {
      value += vertexContributionValue(seed, xsb + 1, ysb, dx0 - (UNSKEW + 1), dy0 - UNSKEW);
    }
  } else {
    if (xi + xmyi < 0) {
      value += vertexContributionValue(seed, xsb - 1, ysb, dx0 + (1 + UNSKEW), dy0 + UNSKEW);
    } else {
      value += vertexContributionValue(seed, xsb + 1, ysb, dx0 - (UNSKEW + 1), dy0 - UNSKEW);
    }
    if (yi < xmyi) {
      value += vertexContributionValue(seed, xsb, ysb - 1, dx0 + UNSKEW, dy0 + (UNSKEW + 1));
    } else {
      value += vertexContributionValue(seed, xsb, ysb + 1, dx0 - UNSKEW, dy0 - (UNSKEW + 1));
    }
  }
  return value;
}

/**
 * Scale that keeps the fBm relief in-band with the value noise it replaces.
 * Measured 2026-11-13: std of the terrain's 5-octave fBm (amplitude
 * 0.55 × 0.55^o, base cell 4 m halved per octave, seed 111) over a
 * ±1000 m grid at 12.5 m spacing — old value-noise fBm 0.29876 vs raw
 * OpenSimplex2S fBm 0.27386 → ratio 1.091. Single-octave cross-check
 * (same window): 0.45488 / 0.41928 = 1.085. Frozen at Phase 11.0b
 * calibration; re-measure if the octave structure changes.
 */
export const OS2S_TERRAIN_SCALE = 1.091;

/**
 * The terrain's per-octave noise: OpenSimplex2S sampled at (x/cell, z/cell),
 * scaled to the value noise's band. Drop-in for the old `valueNoise`.
 * Value-only pass — this is the per-vertex meshing hot path.
 */
export function terrainOctave(x: number, z: number, cell: number, seed: number): number {
  return OS2S_TERRAIN_SCALE * openSimplex2S2DValue(seed, x / cell, z / cell);
}

/** The terrain's per-octave noise with its analytic gradient. */
export function terrainOctaveGrad(
  x: number,
  z: number,
  cell: number,
  seed: number,
): { value: number; gradX: number; gradZ: number } {
  const s = openSimplex2S2D(seed, x / cell, z / cell);
  const inv = OS2S_TERRAIN_SCALE / cell;
  return { value: OS2S_TERRAIN_SCALE * s.value, gradX: s.gradX * inv, gradZ: s.gradY * inv };
}
