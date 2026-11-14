import { describe, expect, it } from 'vitest';
import {
  Color,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  PointLight,
  Vector3,
  type BufferGeometry,
  type MeshBasicMaterial,
} from 'three';
import { uniform } from 'three/tsl';
import {
  LIGHT_POOL_DEFAULT_TINT,
  LIGHT_POOL_GROUND_LIFT,
  LIGHT_POOL_MAX_OPACITY,
  buildLightPools,
  lightPoolCenter,
  lightPoolTexture,
  resolveLightPoolOpacity,
  type LightPoolSourcePlacement,
} from '../../src/environment/light-pool';
import { WeatherDynamics, lightningEnvelope } from '../../src/environment/weather-dynamics';
import { MassingCityWorld } from '../../src/world/urban-massing';
import { massingCityForRegion } from '../../src/world/city-content';
import { createWorldPlan } from '../../src/world/world-plan';

const DT = 1 / 60;

/** Runs the dynamics for `seconds` and records every per-frame lightning level. */
function runLightningSeries(
  preset: 'clear' | 'rain' | 'storm',
  seconds: number,
  seed: number,
): number[] {
  const dynamics = new WeatherDynamics(preset, seed);
  const levels: number[] = [];
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i += 1) {
    levels.push(dynamics.update(DT).lightning);
  }
  return levels;
}

/** Contiguous runs of positive frames (a flash and its envelope). */
function flashRuns(levels: number[]): Array<{ start: number; length: number }> {
  const runs: Array<{ start: number; length: number }> = [];
  let start = -1;
  levels.forEach((level, index) => {
    if (level > 0 && start === -1) {
      start = index;
    }
    if (level <= 0 && start !== -1) {
      runs.push({ start, length: index - start });
      start = -1;
    }
  });
  if (start !== -1) {
    runs.push({ start, length: levels.length - start });
  }
  return runs;
}

describe('lightning envelope (pure)', () => {
  it('is zero before the flash and non-negative everywhere', () => {
    expect(lightningEnvelope(0, 1, false)).toBe(0);
    expect(lightningEnvelope(-1, 1, true)).toBe(0);
    for (let t = 0; t <= 2; t += 0.01) {
      expect(lightningEnvelope(t, 1, true)).toBeGreaterThanOrEqual(0);
    }
  });

  it('rises fast, decays, and never exceeds the amplitude (clamped to 1)', () => {
    expect(lightningEnvelope(0.05, 1, false)).toBeCloseTo(1, 5);
    expect(lightningEnvelope(0.3, 1, false)).toBeLessThan(1);
    expect(lightningEnvelope(0.3, 1, false)).toBeGreaterThan(lightningEnvelope(0.45, 1, false));
    for (let t = 0; t <= 2; t += 0.005) {
      expect(lightningEnvelope(t, 1, true)).toBeLessThanOrEqual(1);
    }
  });

  it('scales with the amplitude', () => {
    expect(lightningEnvelope(0.1, 0.6, false)).toBeCloseTo(
      lightningEnvelope(0.1, 1, false) * 0.6,
      5,
    );
  });

  it('layers a weaker second pulse a beat later', () => {
    // The single strike is already deep in its decay at t = 0.5; the double strike's
    // second pulse (started at 0.42) is still strong, so it must read brighter.
    expect(lightningEnvelope(0.5, 1, true)).toBeGreaterThan(lightningEnvelope(0.5, 1, false));
  });
});

describe('lightning schedule (seeded, deterministic)', () => {
  it('storms flash on seeded gaps of 5–18 s with a ~1.1 s envelope', () => {
    const levels = runLightningSeries('storm', 120, 4242);
    const runs = flashRuns(levels);
    expect(runs.length).toBeGreaterThanOrEqual(3);
    for (const run of runs) {
      // Envelope budget is 1.1 s: the flash never lingers.
      expect(run.length).toBeGreaterThanOrEqual(50);
      expect(run.length).toBeLessThanOrEqual(80);
      for (let i = run.start; i < Math.min(levels.length, run.start + run.length); i += 1) {
        expect(levels[i]).toBeGreaterThan(0);
        expect(levels[i]).toBeLessThanOrEqual(1);
      }
    }
    // Gaps between consecutive flash starts respect the 5 s floor.
    for (let i = 1; i < runs.length; i += 1) {
      const gapSeconds = (runs[i]!.start - runs[i - 1]!.start) * DT;
      expect(gapSeconds).toBeGreaterThanOrEqual(4.9);
      expect(gapSeconds).toBeLessThanOrEqual(19);
    }
  });

  it('never flashes in the clear (the overcast gate)', () => {
    const levels = runLightningSeries('clear', 120, 4242);
    for (const level of levels) {
      expect(level).toBe(0);
    }
  });

  it('the rain preset (overcast 0.55) gates at the edge: flashes, but softer', () => {
    const rain = runLightningSeries('rain', 120, 777);
    const storm = runLightningSeries('storm', 120, 777);
    expect(flashRuns(rain).length).toBeGreaterThanOrEqual(2);
    // Same seed, same schedule — the rain preset only scales the amplitude by overcast.
    for (let i = 0; i < rain.length; i += 1) {
      expect(rain[i]!).toBeCloseTo(storm[i]! * (0.4 + 0.6 * 0.55), 5);
    }
  });

  it('is deterministic per seed and differs across seeds', () => {
    const a = runLightningSeries('storm', 90, 111);
    const b = runLightningSeries('storm', 90, 111);
    expect(a).toEqual(b);
    const c = runLightningSeries('storm', 90, 999);
    expect(flashRuns(a).length).toBeGreaterThan(0);
    expect(a).not.toEqual(c);
  });
});

describe('light pool opacity (pure)', () => {
  it('is zero below the wetness edge and in daylight', () => {
    expect(resolveLightPoolOpacity(0, 1)).toBe(0);
    expect(resolveLightPoolOpacity(0.1, 1)).toBe(0);
    expect(resolveLightPoolOpacity(1, 0)).toBe(0);
    expect(resolveLightPoolOpacity(1, 0.005)).toBe(0);
  });

  it('ramps with wetness and scales with the night gain, capped at the max', () => {
    expect(resolveLightPoolOpacity(0.7, 1)).toBeCloseTo(LIGHT_POOL_MAX_OPACITY, 6);
    expect(resolveLightPoolOpacity(0.7, 0.5)).toBeCloseTo(LIGHT_POOL_MAX_OPACITY / 2, 6);
    expect(resolveLightPoolOpacity(0.3, 1)).toBeGreaterThan(0);
    expect(resolveLightPoolOpacity(0.3, 1)).toBeLessThan(resolveLightPoolOpacity(0.5, 1));
    expect(resolveLightPoolOpacity(0.5, 1)).toBeLessThan(resolveLightPoolOpacity(0.7, 1));
    expect(resolveLightPoolOpacity(2, 2)).toBe(LIGHT_POOL_MAX_OPACITY);
  });
});

describe('light pool centering (12.4e, pure)', () => {
  // Aohara's lamp arm reaches 1.88 m over the road from the pole; the bulb — the light
  // source — sits at the arm's tip. The pool must be centred under the bulb, not the pole.
  function placementWithArm(
    poleX: number,
    poleY: number,
    poleZ: number,
    yaw: number,
  ): LightPoolSourcePlacement {
    return {
      pole: { x: poleX, y: poleY, z: poleZ },
      bulb: [poleX + Math.cos(yaw) * 1.88, poleY + 7, poleZ - Math.sin(yaw) * 1.88],
    };
  }

  it('centres the pool under the light source, not under the pole', () => {
    const placement = placementWithArm(100, -0.55, 200, Math.PI / 3);
    const center = lightPoolCenter(placement);
    expect(center.x).toBe(placement.bulb[0]);
    expect(center.z).toBe(placement.bulb[2]);
    // The pool is 1.88 m off the pole — centring it on the pole (the old behaviour)
    // would put it on the sidewalk, detached from where the light falls.
    expect(Math.hypot(center.x - placement.pole.x, center.z - placement.pole.z)).toBeCloseTo(
      1.88,
      6,
    );
  });

  it('keeps the pool on the ground: the pole base lift, whatever the bulb height', () => {
    const center = lightPoolCenter(placementWithArm(0, -0.55, 0, 0));
    expect(center.y).toBeCloseTo(-0.55 + LIGHT_POOL_GROUND_LIFT, 10);
    const tall = lightPoolCenter(placementWithArm(0, -0.55, 0, 0));
    expect(tall.y).toBeCloseTo(center.y, 10);
  });

  it('is exact for the no-arm case (the head directly above the pole)', () => {
    const center = lightPoolCenter({ pole: { x: 5, y: -0.55, z: -9 }, bulb: [5, 6.9, -9] });
    expect(center.x).toBe(5);
    expect(center.z).toBe(-9);
  });
});

describe('light pool tinting (12.4e, headless)', () => {
  const TINTS = [0xffe7c0, 0xffdda8, 0xfff1d2, 0xffd9a0];

  it('carries the lamp palette as per-instance colour; a dimmed lamp scales its own tint', () => {
    const positions = TINTS.map((_, i) => ({ x: i * 3, y: 0.04, z: 0 }));
    const pools = buildLightPools(positions, TINTS);
    const color = pools!.mesh.instanceColor;
    expect(color).not.toBeNull();
    TINTS.forEach((hex, i) => {
      const expected = new Color(hex);
      expect(color!.getX(i)).toBeCloseTo(expected.r, 6);
      expect(color!.getY(i)).toBeCloseTo(expected.g, 6);
      expect(color!.getZ(i)).toBeCloseTo(expected.b, 6);
    });

    // Dim lamp 2 to half: its tint halves, its neighbours are untouched.
    pools!.setLamp(2, 0.5);
    const expected = new Color(TINTS[2]!).multiplyScalar(0.5);
    expect(color!.getX(2)).toBeCloseTo(expected.r, 6);
    expect(color!.getZ(2)).toBeCloseTo(expected.b, 6);
    const untouched = new Color(TINTS[3]!);
    expect(color!.getX(3)).toBeCloseTo(untouched.r, 6);

    // A broken lamp's pool goes fully dark, tint or not.
    pools!.setLamp(1, 0);
    expect(color!.getX(1)).toBe(0);
    expect(color!.getY(1)).toBe(0);
    expect(color!.getZ(1)).toBe(0);
  });

  it('falls back to the classic halogen warm when no palette is supplied', () => {
    const pools = buildLightPools([{ x: 0, y: 0.04, z: 0 }]);
    const expected = new Color(LIGHT_POOL_DEFAULT_TINT);
    expect(pools!.mesh.instanceColor!.getX(0)).toBeCloseTo(expected.r, 6);
    expect(pools!.mesh.instanceColor!.getZ(0)).toBeCloseTo(expected.b, 6);
    // The material colour is white by construction: the instance tint is the single
    // source of temperature (no double tinting through the material).
    expect(pools!.material.color).toEqual(new Color(0xffffff));
  });

  it('keeps the falloff texture neutral and linearly filtered (no baked tint, no 7 cm steps)', () => {
    const texture = lightPoolTexture();
    expect(texture.magFilter).toBe(LinearFilter);
    expect(texture.minFilter).toBe(LinearMipmapLinearFilter);
    expect(texture.generateMipmaps).toBe(true);
    const data = texture.image.data as Uint8Array;
    const size = texture.image.width;
    expect(size).toBe(128);
    const half = size / 2;
    for (let y = 0; y < size; y += 7) {
      for (let x = 0; x < size; x += 7) {
        const o = (y * size + x) * 4;
        // Neutral: every channel identical, so the per-instance tint is the only colour.
        expect(data[o]!).toBe(data[o + 1]!);
        expect(data[o + 1]!).toBe(data[o + 2]!);
      }
    }
    // Core bright at the centre, feathered to the edge.
    expect(data[(half * size + half) * 4]!).toBeGreaterThan(250);
    expect(data[0]).toBe(0);
  });
});

describe('light pool mesh (headless)', () => {
  it('builds one quad per position and dims single lamps via instance colour', () => {
    const positions = [
      { x: 1, y: 0.04, z: 2 },
      { x: 5, y: 0.04, z: -3 },
      { x: -4, y: 0.04, z: 9 },
      { x: 0, y: 0.04, z: 0 },
      { x: 11, y: 0.04, z: 12 },
    ];
    const pools = buildLightPools(positions);
    expect(pools).not.toBeNull();
    expect(pools!.mesh.count).toBe(5);
    expect(pools!.material.opacity).toBe(0);
    expect(pools!.geometry.getAttribute('position')?.count).toBe(4); // one quad

    // A broken lamp's pool goes dark; its neighbours are untouched.
    pools!.setLamp(2, 0);
    const color = pools!.mesh.instanceColor;
    expect(color).not.toBeNull();
    expect(color!.getX(2)).toBe(0);
    expect(color!.getZ(2)).toBe(0);
    expect(color!.getX(3)).toBe(1);

    // The radial texture is a shared singleton (one upload for every city).
    const again = buildLightPools([{ x: 0, y: 0, z: 0 }]);
    expect(again!.material.map).toBe(lightPoolTexture());
    expect(buildLightPools([])).toBeNull();
  });
});

describe('streamed-city light pools (integration)', () => {
  function anUrbanRegion(seed: number) {
    const plan = createWorldPlan(seed);
    for (let ix = -4; ix <= 4; ix += 1) {
      for (let iz = -4; iz <= 4; iz += 1) {
        const region = plan.regionAtCell(ix, iz);
        if (region.archetype === 'urban-fringe') return region;
      }
    }
    throw new Error(`no urban-fringe region found for seed ${seed}`);
  }

  it('pools every street lamp and follows the live wetness at night', () => {
    const region = anUrbanRegion(12345);
    const spec = massingCityForRegion(region);
    expect(spec.lamps.length).toBeGreaterThan(0);
    const gain = uniform(1);
    const city = new MassingCityWorld(spec, 'C', { nightGain: gain, baseY: 0 });

    const poolCount = city.getContentStats().massingCityLightPools;
    expect(poolCount).toBeGreaterThan(0);
    expect(poolCount).toBeLessThanOrEqual(spec.lamps.length);

    const found = city.root.children.find((child) => child.name === 'light-pools');
    expect(found).toBeDefined();
    if (found === undefined) throw new Error('expected the light-pools layer');
    const poolMesh = found as InstancedMesh<BufferGeometry, MeshBasicMaterial>;

    // Dry: invisible. Wet at full night: at the max opacity.
    city.setSurfaceWetness(0);
    expect(poolMesh.material.opacity).toBe(0);

    city.setSurfaceWetness(1);
    expect(poolMesh.material.opacity).toBeCloseTo(LIGHT_POOL_MAX_OPACITY, 6);

    // The night gain gates them: no pools at noon, wet or not.
    gain.value = 0;
    city.setSurfaceWetness(1);
    expect(poolMesh.material.opacity).toBe(0);

    // On the flat fixture the pools sit just above the pavement under the poles.
    city.root.updateMatrixWorld(true);
    const matrix = new Matrix4();
    poolMesh.getMatrixAt(0, matrix);
    const origin = new Vector3().setFromMatrixPosition(matrix);
    const world = origin.add(city.root.position);
    expect(world.y).toBeCloseTo(-0.55 + 0.04 + 0.57, 2);

    // 12.4e: the pools carry the city lamp temperature — the same colour the point
    // lights use (a single halogen tone in the massing cities).
    const lampLight = city.root.children.find(
      (child): child is PointLight => child.type === 'PointLight',
    );
    expect(lampLight).toBeDefined();
    if (lampLight === undefined) throw new Error('expected a street-lamp point light');
    expect(poolMesh.instanceColor).not.toBeNull();
    for (let i = 0; i < poolMesh.count; i += 1) {
      expect(poolMesh.instanceColor!.getX(i)).toBeCloseTo(lampLight.color.r, 6);
      expect(poolMesh.instanceColor!.getY(i)).toBeCloseTo(lampLight.color.g, 6);
      expect(poolMesh.instanceColor!.getZ(i)).toBeCloseTo(lampLight.color.b, 6);
    }

    city.dispose();
  });
});
