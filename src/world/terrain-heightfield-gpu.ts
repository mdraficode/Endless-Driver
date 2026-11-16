/**
 * Phase 11.0d — WebGPU compute rasterisation of the base heightfield.
 *
 * The base heightfield (noise fBm + domain warp + ridges + volcano + floor + spawn pad +
 * city plateau) is the expensive, purely functional half of the world height. This module
 * evaluates it on the GPU as a TSL compute pass over a 2-D grid and reads the heights
 * back; the CPU keeps the identical function (`naturalHeightAt` / `worldBaseHeightAt`)
 * as the fallback for non-WebGPU backends.
 *
 * What moves to the GPU and what does not:
 * - GPU: the base heightfield only (mirrors `worldBaseHeightAt` to ≤ 1 cm on a 512² grid —
 *   the 11.0d acceptance).
 * - CPU: the carve (road union, garage ramps/aisles, pits) — it is data-driven by the road
 *   network and stays on the CPU until 11.3/11.5. Both base sources (CPU sampler and GPU
 *   read-back) flow through the same `carveFromBase`, so the carve output is identical
 *   for either.
 *
 * Determinism: the kernel mirrors the CPU's OpenSimplex2S lattice hash in exact 32-bit
 * integer math (the CPU emulates the reference's 64-bit primes in 32-bit halves; the
 * WGSL port does the same with u32 limbs), so the noise values agree to float32
 * rounding (~1e-5 m) rather than to a different hash. Same grid in, same heights out,
 * on every WebGPU device.
 *
 * Scheduling: the compute pass is recorded through `renderer.compute()` and submitted
 * with the frame's render, so a read-back is only issued from the NEXT frame's poll —
 * WebGPU submission order then guarantees the copy reads the fresh pass. Any failure or
 * a one-second stall falls back to CPU rasterisation for that job; the game never depends
 * on the GPU path.
 */
import { StorageBufferAttribute, type WebGPURenderer } from 'three/webgpu';
import {
  Fn,
  bitcast,
  floor,
  float,
  int,
  instanceIndex,
  mod,
  select,
  smoothstep,
  sqrt,
  storage,
  uint,
} from 'three/tsl';

import type { CityPlateau, HeightfieldBaseSpec } from './world-terrain';
import { OS2S_GRADIENTS_2D, OS2S_TERRAIN_SCALE } from './noise';

export type { HeightfieldBaseSpec };

type TSLAny = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- TSL node graph values.

// bitcast() returns a BitcastNode whose TS type omits the operator methods (they exist at
// runtime); the cast keeps the graph values flowing as TSLAny like the rest of the kernel.
// NOTE: TSL bitcast targets use TSL type names ('uint'/'int'), not WGSL names — a WGSL name
// breaks the node's type resolution downstream (generates `iundefined` in the WGSL).
const toU32 = (v: TSLAny): TSLAny => bitcast(v, 'uint') as TSLAny;
const toI32 = (v: TSLAny): TSLAny => bitcast(v, 'int') as TSLAny;

type ComputeNodeLike = Extract<
  Parameters<WebGPURenderer['compute']>[0],
  { readonly isComputeNode: boolean }
>;

// --- config buffer layout (Float32Array, one float per index) -----------------
const CFG = {
  originX: 0,
  originZ: 1,
  pitch: 2,
  count: 3,
  hillWavelength: 4,
  hillAmplitude: 5,
  elevAmplitude: 6,
  elevWavelength: 7,
  elevWarp: 8,
  elevFadeInner: 9,
  elevFadeOuter: 10,
  elevFadeCX: 11,
  elevFadeCZ: 12,
  volcanoX: 13,
  volcanoZ: 14,
  volcanoRadius: 15,
  volcanoHeight: 16,
  floorMeters: 17,
  padFlatR: 18,
  padBlendR: 19,
  plateauX: 20,
  plateauZ: 21,
  plateauFlatR: 22,
  plateauBlendR: 23,
  cityElevation: 24,
} as const;
const CONFIG_FLOATS = 25;

// --- OpenSimplex2S constants (mirrored from noise.ts) -------------------------
const SKEW = 0.366025403784439;
const UNSKEW = -0.21132486540518713;
const C_LAT = 1 + 2 * UNSKEW; // 1/sqrt(3)
// The four lattice-offset combinations (precomputed like the CPU's literal constants).
const U1 = UNSKEW + 1;
const U2 = 3 * UNSKEW + 1;
const U3 = 3 * UNSKEW + 2;

// The 64-bit primes/multiplier as u32 bit patterns (noise.ts splits them the same way).
const PX_LO = 0x9270c86f;
const PX_HI = 0x5205402b;
const PY_LO = 0x003817b5;
const PY_HI = 0x598cd327;
const M_LO = 0xeec546f5;
const M_HI = 0x53a3f72d;

// --- exact-integer hash ports (u32 limbs, same math as noise.ts) ---------------

/** Signed high 32 bits of a·b (both u32), 16-bit limb decomposition — exact in u32. */
function mulHi32S(a: TSLAny, b: TSLAny): TSLAny {
  const aLo = a.bitAnd(uint(0xffff));
  const aHi = a.shiftRight(uint(16));
  const bLo = b.bitAnd(uint(0xffff));
  const bHi = b.shiftRight(uint(16));
  const p0 = aLo.mul(bLo);
  const p1 = aHi.mul(bLo);
  const p2 = aLo.mul(bHi);
  const p3 = aHi.mul(bHi);
  const lo = p1.bitAnd(uint(0xffff)).add(p2.bitAnd(uint(0xffff)));
  const t = p0.shiftRight(uint(16)).add(lo.bitAnd(uint(0xffff)));
  return bitcast(
    p3
      .add(p1.shiftRight(uint(16)))
      .add(p2.shiftRight(uint(16)))
      .add(lo.shiftRight(uint(16)))
      .add(t.shiftRight(uint(16))),
    'int',
  );
}

/** int32 × u64 product, low 64 bits as [lo, hi] (Java `(long)a * p` semantics). */
function mul64Lo(a: TSLAny, pLo: TSLAny, pHi: TSLAny): { lo: TSLAny; hi: TSLAny } {
  const aU = toU32(a);
  const pLoI = toI32(pLo);
  const pHiI = toI32(pHi);
  const hi = select(
    a.lessThan(int(0)),
    mulHi32S(aU, pLo).add(a.mul(pHiI)).sub(pLoI),
    mulHi32S(aU, pLo).add(a.mul(pHiI)),
  );
  return { lo: a.mul(pLoI), hi };
}

/** The reference 2D lattice hash, 32-bit-emulated (returns the 0..127 pair index). */
function os2sHash2D(seed: TSLAny, xsb: TSLAny, ysb: TSLAny): TSLAny {
  const x = mul64Lo(xsb, uint(PX_LO), uint(PX_HI));
  const y = mul64Lo(ysb, uint(PY_LO), uint(PY_HI));
  const seedU = toU32(seed);
  const hLo = toI32(seedU.bitXor(toU32(x.lo)).bitXor(toU32(y.lo)));
  // The seeds are < 2^31, so the seed's high half is 0 (same as the CPU).
  const hHi = toI32(toU32(x.hi).bitXor(toU32(y.hi)));
  const mLo = toI32(uint(M_LO));
  const mHi = toI32(uint(M_HI));
  const l1 = hHi.mul(mLo);
  const l2 = hLo.mul(mHi);
  const newLo = hLo.mul(mLo);
  const newHi = mulHi32S(toU32(hLo), uint(M_LO)).add(l1.add(l2));
  // ARITHMETIC shift: for a negative 64-bit hash the top six bits sign-extend (Java >>).
  const top6 = newHi.shiftRight(int(26));
  const hLoX = toI32(toU32(newLo).bitXor(toU32(top6)));
  return toU32(hLoX).shiftRight(uint(1)).bitAnd(uint(127));
}

// --- the noise field (mirrors noise.ts / terrain-height.ts) --------------------

function createKernelNodes(grads: TSLAny) {
  const SKEW_F = float(SKEW);
  const UNSKEW_F = float(UNSKEW);
  const C_F = float(C_LAT);

  /** One vertex contribution (value-only, support-guarded — the CPU hot path). */
  const v = (seed: TSLAny, lx: TSLAny, ly: TSLAny, dx: TSLAny, dy: TSLAny): TSLAny => {
    const a = float(2.0 / 3.0).sub(dx.mul(dx).add(dy.mul(dy)));
    const pair = os2sHash2D(seed, lx, ly);
    const gi = toI32(pair.mul(uint(2)));
    const gx = grads.element(gi);
    const gy = grads.element(gi.add(int(1)));
    const gd = gx.mul(dx).add(gy.mul(dy));
    const a2 = a.mul(a);
    return select(a.lessThanEqual(float(0)), float(0), a2.mul(a2).mul(gd));
  };

  /** OpenSimplex2S 2D value (mirrors `openSimplex2S2DValue`). */
  const os2sValue = (seed: TSLAny, X: TSLAny, Z: TSLAny): TSLAny => {
    const s = SKEW_F.mul(X.add(Z));
    const xs = X.add(s);
    const zs = Z.add(s);
    const xsbF = floor(xs);
    const ysbF = floor(zs);
    // Lattice coords are INT: the 64-bit hash operates on integer bit patterns, so a
    // bitcast must see an int — bitcasting a float would reinterpret the IEEE-754 bits.
    const xsb = int(xsbF);
    const ysb = int(ysbF);
    const xi = xs.sub(xsbF);
    const yi = zs.sub(ysbF);
    const t = xi.add(yi).mul(UNSKEW_F);
    const dx0 = xi.add(t);
    const dy0 = yi.add(t);
    const value = v(seed, xsb, ysb, dx0, dy0).add(
      v(seed, xsb.add(int(1)), ysb.add(int(1)), dx0.sub(C_F), dy0.sub(C_F)),
    );
    const xmyi = xi.sub(yi);
    const branchA = select(
      xi.add(xmyi).greaterThan(float(1)),
      v(seed, xsb.add(int(2)), ysb.add(int(1)), dx0.sub(float(U3)), dy0.sub(float(U2))),
      v(seed, xsb, ysb.add(int(1)), dx0.sub(UNSKEW_F), dy0.sub(float(U1))),
    );
    const branchB = select(
      yi.sub(xmyi).greaterThan(float(1)),
      v(seed, xsb.add(int(1)), ysb.add(int(2)), dx0.sub(float(U2)), dy0.sub(float(U3))),
      v(seed, xsb.add(int(1)), ysb, dx0.sub(float(U1)), dy0.sub(UNSKEW_F)),
    );
    const branchC = select(
      xi.add(xmyi).lessThan(float(0)),
      v(seed, xsb.sub(int(1)), ysb, dx0.add(float(U1)), dy0.add(UNSKEW_F)),
      v(seed, xsb.add(int(1)), ysb, dx0.sub(float(U1)), dy0.sub(UNSKEW_F)),
    );
    const branchD = select(
      yi.lessThan(xmyi),
      v(seed, xsb, ysb.sub(int(1)), dx0.add(UNSKEW_F), dy0.add(float(U1))),
      v(seed, xsb, ysb.add(int(1)), dx0.sub(UNSKEW_F), dy0.sub(float(U1))),
    );
    return value.add(select(t.lessThan(UNSKEW_F), branchA.add(branchB), branchC.add(branchD)));
  };

  /** `terrainOctave` = OS2S_TERRAIN_SCALE × os2s at (x/cell, z/cell). */
  const terrainOctave = (x: TSLAny, z: TSLAny, cell: TSLAny, seed: TSLAny): TSLAny =>
    float(OS2S_TERRAIN_SCALE).mul(os2sValue(seed, x.div(cell), z.div(cell)));

  /**
   * `fbm` — five octaves, amplitude 0.55, cell halving, seed stepped by 101 per octave
   * (mirrors terrain-height.ts exactly). Unrolled at the TS level: each octave is a
   * separate node-graph branch with a compile-time seed offset, so the per-octave hash
   * input is a literal — no runtime loop index needed.
   */
  const fbm = (x: TSLAny, z: TSLAny, baseCell: TSLAny, seed: TSLAny): TSLAny => {
    let sum: TSLAny = float(0);
    let amplitude: TSLAny = float(0.55);
    let cell: TSLAny = baseCell;
    for (let octave = 0; octave < 5; octave += 1) {
      sum = sum.add(amplitude.mul(terrainOctave(x, z, cell, seed.add(int(octave * 101)))));
      cell = cell.mul(float(0.5));
      amplitude = amplitude.mul(float(0.55));
    }
    return sum;
  };

  /** `countryElevationAt` (mirrors terrain-height.ts, value path). */
  const countryElevationAt = (x: TSLAny, z: TSLAny, cfg: TSLAny, seed: TSLAny): TSLAny => {
    const wl = cfg.element(CFG.elevWavelength);
    const dCity = sqrt(
      x
        .sub(cfg.element(CFG.elevFadeCX))
        .mul(x.sub(cfg.element(CFG.elevFadeCX)))
        .add(z.sub(cfg.element(CFG.elevFadeCZ)).mul(z.sub(cfg.element(CFG.elevFadeCZ)))),
    );
    const cityFade = float(1).sub(
      smoothstep(cfg.element(CFG.elevFadeInner), cfg.element(CFG.elevFadeOuter), dCity),
    );
    const strength = float(1).sub(cityFade).mul(cfg.element(CFG.elevAmplitude));
    const body = (): TSLAny => {
      const warpX = fbm(x, z, wl.mul(float(0.8)), seed.add(int(505))).mul(
        cfg.element(CFG.elevWarp),
      );
      const warpZ = fbm(
        x.add(float(4471.2)),
        z.sub(float(2903.7)),
        wl.mul(float(0.8)),
        seed.add(int(606)),
      ).mul(cfg.element(CFG.elevWarp));
      const warped = fbm(x.add(warpX), z.add(warpZ), wl, seed.add(int(707)))
        .mul(float(0.5))
        .add(float(0.5));
      const shaped = warped.mul(warped).mul(float(3).sub(warped.mul(float(2))));
      const gorge = terrainOctave(
        x.sub(float(913.4)),
        z.add(float(1757.1)),
        wl.mul(float(0.42)),
        seed.add(int(808)),
      );
      const gorgeCut = smoothstep(float(0.42), float(0.18), gorge).mul(
        smoothstep(float(0.02), float(0.3), warped),
      );
      const relief = shaped.mul(float(1).sub(gorgeCut.mul(float(0.62))));
      return relief.sub(float(0.42)).mul(strength).mul(float(1.8));
    };
    // The early-out (strength ≤ 0.01 → 0) as a select; the amplitude gate is a CPU-side
    // node-graph branch (config constant).
    return select(strength.lessThanEqual(float(0.01)) as TSLAny, float(0), body());
  };

  /** `rawHeightOf` (mirrors terrain-height.ts). */
  const rawHeight = (x: TSLAny, z: TSLAny, cfg: TSLAny, seed: TSLAny): TSLAny => {
    const hillWl = cfg.element(CFG.hillWavelength);
    const hillAmp = cfg.element(CFG.hillAmplitude);
    let height = fbm(x, z, hillWl, seed)
      .mul(hillAmp)
      .add(
        fbm(x.add(float(3917.3)), z.sub(float(2718.1)), hillWl.mul(float(2.7)), seed.add(int(77)))
          .mul(hillAmp)
          .mul(float(1.6)),
      );
    height = height.add(countryElevationAt(x, z, cfg, seed));
    const rBroadRaw = terrainOctave(x, z, float(210), seed.add(int(303)));
    const rFineRaw = terrainOctave(
      x.sub(float(1173.9)),
      z.add(float(941.2)),
      float(96),
      seed.add(int(404)),
    );
    const ridgeBroad = float(1).sub(rBroadRaw.abs());
    const ridgeFine = float(1).sub(rFineRaw.abs());
    height = height
      .add(ridgeBroad.mul(ridgeBroad).mul(float(6.5)))
      .add(ridgeFine.mul(ridgeFine).mul(float(2.1)));
    const dx = x.sub(cfg.element(CFG.volcanoX));
    const dz = z.sub(cfg.element(CFG.volcanoZ));
    const distance = sqrt(dx.mul(dx).add(dz.mul(dz)));
    const t = distance.div(cfg.element(CFG.volcanoRadius)).min(float(1));
    const cone = float(1)
      .sub(t)
      .mul(float(1).sub(t))
      .mul(float(1).add(t.mul(float(2))));
    return height.add(cone.mul(cfg.element(CFG.volcanoHeight).add(ridgeBroad.mul(float(26)))));
  };

  /**
   * `worldBaseHeightAt` (mirrors world-terrain.ts): raw height + floor + spawn pad,
   * then the plateau blend.
   */
  const worldBaseAt = (x: TSLAny, z: TSLAny, cfg: TSLAny, seed: TSLAny): TSLAny => {
    let height = rawHeight(x, z, cfg, seed);
    height = height.max(cfg.element(CFG.floorMeters));
    const dOrigin = sqrt(x.mul(x).add(z.mul(z)));
    const pad = smoothstep(cfg.element(CFG.padFlatR), cfg.element(CFG.padBlendR), dOrigin);
    const natural = height.mul(pad);
    const pdx = x.sub(cfg.element(CFG.plateauX));
    const pdz = z.sub(cfg.element(CFG.plateauZ));
    const pdist = sqrt(pdx.mul(pdx).add(pdz.mul(pdz)));
    const flat = cfg.element(CFG.plateauFlatR);
    const blend = cfg.element(CFG.plateauBlendR);
    const t2 = pdist.sub(flat).div(blend.sub(flat));
    const smooth = t2.mul(t2).mul(float(3).sub(t2.mul(float(2))));
    const cityElev = cfg.element(CFG.cityElevation);
    const blended = cityElev.add(natural.sub(cityElev).mul(smooth));
    return select(
      pdist.lessThanEqual(flat) as TSLAny,
      cityElev,
      select(pdist.greaterThanEqual(blend) as TSLAny, natural, blended),
    );
  };

  return { worldBaseAt };
}

// --- the rasteriser ------------------------------------------------------------

interface GPUJob {
  readonly resolve: (heights: Float32Array) => void;
  readonly reject: (error: unknown) => void;
  readonly dueFrame: number;
  readonly requestedAtMs: number;
  readonly count: number;
}

/**
 * GPU rasteriser for `HeightfieldBaseSpec` grids. Usage:
 *   1. `configure(renderer, spec)` once (WebGPU backends only);
 *   2. `request(originX, originZ, pitchMeters, count)` when a grid is wanted;
 *   3. `poll()` once per frame (drives the next-frame read-backs).
 */
export class HeightfieldRasterizer {
  #renderer: WebGPURenderer | null = null;
  #spec: HeightfieldBaseSpec | null = null;
  #node: ComputeNodeLike | null = null;
  #count = 0;
  #cfgAttr: StorageBufferAttribute | null = null;
  #seedAttr: StorageBufferAttribute | null = null;
  #gradsAttr: StorageBufferAttribute | null = null;
  #outAttr: StorageBufferAttribute | null = null;
  #queue: GPUJob[] = [];
  #frame = 0;
  #ready = false;
  #lastMs = 0;
  /** Cumulative dispatch→read-back time (ms), for the 11.0d speedup evidence. */
  #cumulativeMs = 0;
  /** Jobs rasterised by the GPU so far. */
  rasterizedJobs = 0;

  get ready(): boolean {
    return this.#ready;
  }

  get lastMs(): number {
    return this.#lastMs;
  }

  get cumulativeMs(): number {
    return this.#cumulativeMs;
  }

  configure(renderer: WebGPURenderer, spec: HeightfieldBaseSpec): void {
    this.#renderer = renderer;
    this.#spec = spec;
    this.#cfgAttr = new StorageBufferAttribute(new Float32Array(CONFIG_FLOATS), CONFIG_FLOATS);
    const seedAttr = new StorageBufferAttribute(new Int32Array(1), 1);
    seedAttr.array[0] = spec.config.seed;
    this.#seedAttr = seedAttr;
    const grads = new Float32Array(OS2S_GRADIENTS_2D.length * 2);
    for (let k = 0; k < OS2S_GRADIENTS_2D.length; k += 1) {
      grads[k * 2] = OS2S_GRADIENTS_2D[k]![0];
      grads[k * 2 + 1] = OS2S_GRADIENTS_2D[k]![1];
    }
    this.#gradsAttr = new StorageBufferAttribute(grads, 2);
    const cfg = this.#cfgAttr;
    const c = spec.config;
    cfg.array[CFG.hillWavelength] = c.hillWavelengthMeters;
    cfg.array[CFG.hillAmplitude] = c.hillAmplitudeMeters;
    cfg.array[CFG.elevAmplitude] = c.elevationAmplitudeMeters;
    cfg.array[CFG.elevWavelength] = c.elevationWavelengthMeters;
    cfg.array[CFG.elevWarp] = c.elevationWarpMeters;
    cfg.array[CFG.elevFadeInner] = c.elevationFadeInnerMeters;
    cfg.array[CFG.elevFadeOuter] = c.elevationFadeOuterMeters;
    cfg.array[CFG.elevFadeCX] = c.elevationFadeCenter[0];
    cfg.array[CFG.elevFadeCZ] = c.elevationFadeCenter[1];
    cfg.array[CFG.volcanoX] = c.volcano.position[0];
    cfg.array[CFG.volcanoZ] = c.volcano.position[1];
    cfg.array[CFG.volcanoRadius] = c.volcano.radiusMeters;
    cfg.array[CFG.volcanoHeight] = c.volcano.heightMeters;
    cfg.array[CFG.floorMeters] = c.floorMeters;
    cfg.array[CFG.padFlatR] = c.spawnPad.flatRadiusMeters;
    cfg.array[CFG.padBlendR] = c.spawnPad.blendRadiusMeters;
    cfg.array[CFG.plateauX] = spec.plateau.x;
    cfg.array[CFG.plateauZ] = spec.plateau.z;
    cfg.array[CFG.plateauFlatR] = spec.plateau.flatRadiusMeters;
    cfg.array[CFG.plateauBlendR] = spec.plateau.blendRadiusMeters;
    cfg.array[CFG.cityElevation] = spec.cityElevation;
    cfg.needsUpdate = true;
    this.#ready = true;
  }

  /**
   * Rasterise a `count`×`count` grid at `pitchMeters` spacing from (originX, originZ).
   * Resolves on a LATER frame (the compute pass is submitted with this frame's render).
   * Fails fast (→ CPU fallback) when the device is lost or the read-back stalls.
   */
  request(
    originX: number,
    originZ: number,
    pitchMeters: number,
    count: number,
  ): Promise<Float32Array> {
    return new Promise<Float32Array>((resolve, reject) => {
      if (this.#renderer === null || this.#spec === null || !this.#ready) {
        reject(new Error('heightfield rasteriser not configured'));
        return;
      }
      const cfg = this.#cfgAttr!.array;
      cfg[CFG.originX] = originX;
      cfg[CFG.originZ] = originZ;
      cfg[CFG.pitch] = pitchMeters;
      cfg[CFG.count] = count;
      this.#cfgAttr!.needsUpdate = true;
      const node = this.#buildNode(count);
      this.#renderer.compute([node]);
      this.#queue.push({
        resolve,
        reject,
        dueFrame: this.#frame + 1,
        requestedAtMs: performance.now(),
        count,
      });
    });
  }

  /** Call once per frame: issues the read-backs whose compute pass was submitted last frame. */
  poll(): void {
    this.#frame += 1;
    if (this.#queue.length === 0) return;
    const ready: GPUJob[] = [];
    this.#queue = this.#queue.filter((job) => {
      const stalled = performance.now() - job.requestedAtMs > 1000;
      if (job.dueFrame > this.#frame || stalled) {
        if (stalled) job.reject(new Error('heightfield read-back stalled'));
        return !stalled; // a not-due job stays queued; a stalled one is dropped
      }
      ready.push(job);
      return false;
    });
    for (const job of ready) {
      this.#readBack(job).catch(job.reject);
    }
  }

  #buildNode(count: number): ComputeNodeLike {
    if (this.#node !== null && this.#count === count) {
      return this.#node;
    }
    if (this.#node !== null) {
      this.#node.dispose();
      this.#node = null;
    }
    this.#count = count;
    this.#outAttr = new StorageBufferAttribute(new Float32Array(count * count), 1);
    const cfgNode = storage(this.#cfgAttr!, 'float', CONFIG_FLOATS).toReadOnly();
    const seedNode = storage(this.#seedAttr!, 'int', 1).toReadOnly().element(int(0));
    const gradsNode = storage(this.#gradsAttr!, 'float', OS2S_GRADIENTS_2D.length * 2).toReadOnly();
    const outNode = storage(this.#outAttr!, 'float', count * count);
    const { worldBaseAt } = createKernelNodes(gradsNode);
    this.#node = Fn(() => {
      const i = instanceIndex;
      const idx = float(i);
      const countF = cfgNode.element(int(CFG.count));
      const col = floor(mod(idx, countF));
      const row = floor(idx.div(countF));
      const x = cfgNode.element(int(CFG.originX)).add(col.mul(cfgNode.element(int(CFG.pitch))));
      const z = cfgNode.element(int(CFG.originZ)).add(row.mul(cfgNode.element(int(CFG.pitch))));
      outNode.element(i).assign(worldBaseAt(x, z, cfgNode, seedNode));
    })()
      .compute(count * count, [256])
      .setName('TerrainHeightfield.rasterize');
    return this.#node;
  }

  async #readBack(job: GPUJob): Promise<void> {
    const renderer = this.#renderer as unknown as {
      getArrayBufferAsync: (
        attribute: StorageBufferAttribute,
        target: null,
        offset: number,
        count: number,
      ) => Promise<ArrayBuffer>;
    };
    const byteLength = job.count * job.count * 4;
    const arrayBuffer = await renderer.getArrayBufferAsync(this.#outAttr!, null, 0, byteLength);
    const jobMs = performance.now() - job.requestedAtMs;
    this.#cumulativeMs += jobMs;
    this.#lastMs = jobMs;
    this.rasterizedJobs += 1;
    job.resolve(new Float32Array(arrayBuffer));
  }

  dispose(): void {
    this.#node?.dispose();
    this.#node = null;
    for (const job of this.#queue) {
      job.reject(new Error('rasteriser disposed'));
    }
    this.#queue = [];
    this.#cfgAttr?.dispose();
    this.#seedAttr?.dispose();
    this.#gradsAttr?.dispose();
    this.#outAttr?.dispose();
    this.#cfgAttr = null;
    this.#seedAttr = null;
    this.#gradsAttr = null;
    this.#outAttr = null;
    this.#ready = false;
    this.#renderer = null;
    this.#spec = null;
  }
}

/** Convenience: the base spec of a world sampler, when it carries one. */
export function baseSpecOf(sampler: {
  readonly baseSpec?: HeightfieldBaseSpec;
  readonly plateau?: CityPlateau;
}): HeightfieldBaseSpec | null {
  return sampler.baseSpec ?? null;
}
